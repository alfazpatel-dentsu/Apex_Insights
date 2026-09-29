import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import {beforeUserCreated, beforeUserSignedIn} from "firebase-functions/v2/identity";
import {HttpsError} from "firebase-functions/v2/https";
import {defineSecret, defineString} from "firebase-functions/params";
import {logger} from "firebase-functions";
import {actionItemToRow, ActionItemDoc} from "./action-item-row";
import {
  deleteActionItemRow,
  getSheetsClient,
  replaceAllActionItemRows,
  upsertActionItemRow,
  SheetsSyncConfig,
} from "./sheets";

/**
 * 1st gen Functions (same generation as existing acceptInvite).
 * Avoids 2nd gen Eventarc / Cloud Run invoker IAM that requires Owner.
 *
 * Names differ from the failed 2nd gen deploy so we don't collide with
 * any half-created Cloud Run services.
 */

initializeApp();

const PLATFORM_ADMIN_EMAILS = new Set([
  "alfaz.patel@dentsu.com",
  "hasnain.rasiwalla1@dentsu.com",
  "mehul.kulkarni@dentsu.com",
]);
const AGENCIES = new Set(["sokrati", "iprospect"]);
const PAGE_PERMISSIONS = new Set([
  "snapshot", "sales", "tracker", "spends", "dashboard", "forecast", "wbr", "actions", "admin",
]);

function requirePlatformAdmin(context: functions.https.CallableContext): void {
  const email = context.auth?.token.email?.toLowerCase();
  if (!email || !PLATFORM_ADMIN_EMAILS.has(email)) {
    throw new functions.https.HttpsError("permission-denied", "Platform administrator access is required.");
  }
}

/**
 * Approves or updates one agency membership. User access is intentionally
 * page-based; the membership role is a neutral internal value only.
 */
export const manageUserAgencyAccess = functions
  .region("us-central1")
  .https.onCall(async (data, context) => {
    requirePlatformAdmin(context);
    const uid = typeof data?.uid === "string" ? data.uid.trim() : "";
    const agency = typeof data?.agency === "string" ? data.agency.trim() : "";
    const status = data?.status === "disabled" ? "disabled" : "active";
    const permissions = Array.isArray(data?.permissions)
      ? [...new Set(data.permissions.filter((value: unknown): value is string =>
        typeof value === "string" && PAGE_PERMISSIONS.has(value)))]
      : [];
    if (!uid || !AGENCIES.has(agency)) {
      throw new functions.https.HttpsError("invalid-argument", "A valid user and agency are required.");
    }

    const db = getFirestore();
    const ref = db.doc(`users/${uid}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new functions.https.HttpsError("not-found", "User profile not found.");
    const current = snapshot.data() || {};
    const memberships = {...(current.memberships || {})};
    memberships[agency] = {status, role: "User", permissions};

    const nextStatus = status === "active" ? "User Registered" : current.status;
    await ref.update({
      memberships,
      status: nextStatus,
      // Retained during the UI migration for existing route guards.
      permissions,
      accessUpdatedAt: new Date().toISOString(),
      accessUpdatedBy: context.auth?.token.email || "",
    });
    await db.collection("accessAuditLog").add({
      userId: uid,
      agency,
      status,
      permissions,
      changedBy: context.auth?.token.email || "",
      changedAt: new Date().toISOString(),
    });
    return {uid, agency, status, permissions};
  });

/**
 * Enforce the registration policy at Firebase Authentication's boundary.
 * Client-side validation can be bypassed by calling the Auth API directly.
 *
 * This is a blocking function, so rejected accounts are never created in
 * Firebase Authentication and cannot leave orphaned IDs in the console.
 */
function assertAllowedWorkAccount(email: string | undefined): void {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  if (!/^[^@]+@(dentsu|iprospect)\.com$/.test(normalizedEmail)) {
    throw new HttpsError(
      "permission-denied",
      "Only @dentsu.com and @iprospect.com accounts can access this application."
    );
  }
}

export const enforceDentsuAccounts = beforeUserCreated((event) => {
  assertAllowedWorkAccount(event.data?.email);
  return;
});

/** Also deny sign-in for unauthorized accounts created before this trigger deployed. */
export const enforceDentsuSignIn = beforeUserSignedIn((event) => {
  assertAllowedWorkAccount(event.data?.email);
  return;
});

export {
  onActionItemEmailAutomations,
  onUserEmailAutomations,
  sweepOverdueActionItemEmails,
  onMailJobCreated,
} from "./email/triggers";

const sheetsSpreadsheetId = defineString("SHEETS_SPREADSHEET_ID", {
  default: "1NnLAuCjA4ZeaH116jzbVVajkYX3lytxbZVxOGocLWSs",
  description: "Google Sheet ID from the spreadsheet URL",
});

const sheetsTabName = defineString("SHEETS_TAB_NAME", {
  default: "ActionItems",
  description: "Tab/sheet name that holds action item rows",
});

const sheetsServiceAccountJson = defineSecret("SHEETS_SERVICE_ACCOUNT_JSON");

function syncConfig(): SheetsSyncConfig {
  const spreadsheetId = sheetsSpreadsheetId.value()?.trim();
  const serviceAccountJson = sheetsServiceAccountJson.value()?.trim();
  if (!spreadsheetId) {
    throw new Error("SHEETS_SPREADSHEET_ID is not set");
  }
  if (!serviceAccountJson) {
    throw new Error("SHEETS_SERVICE_ACCOUNT_JSON secret is not set");
  }
  return {
    spreadsheetId,
    sheetName: sheetsTabName.value() || "ActionItems",
    serviceAccountJson,
  };
}

const regional = functions.region("us-central1");

/** Live sync: create/update/delete on actionItems/{id} → Google Sheets. */
export const mirrorActionItemToSheet = regional
  .runWith({
    secrets: [sheetsServiceAccountJson],
    timeoutSeconds: 120,
    memory: "256MB",
  })
  .firestore.document("actionItems/{id}")
  .onWrite(async (change, context) => {
    const id = context.params.id as string;
    const config = syncConfig();
    const sheets = await getSheetsClient(config);

    if (!change.after.exists) {
      const removed = await deleteActionItemRow(sheets, config, id);
      logger.info("actionItems delete mirrored to Sheets", {id, removed});
      return;
    }

    const data = change.after.data() as ActionItemDoc;
    const row = actionItemToRow(id, data);
    const result = await upsertActionItemRow(sheets, config, row);
    logger.info("actionItems upsert mirrored to Sheets", {id, result});
  });

/** Admin-only full Sheet rebuild from Firestore. */
export const backfillActionItemsSheet = regional
  .runWith({
    secrets: [sheetsServiceAccountJson],
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .https.onCall(async (_data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required");
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${context.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (role !== "Admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin role required");
    }

    try {
      const config = syncConfig();
      const sheets = await getSheetsClient(config);
      const snap = await db.collection("actionItems").get();
      const rows = snap.docs.map((doc) =>
        actionItemToRow(doc.id, doc.data() as ActionItemDoc)
      );
      const written = await replaceAllActionItemRows(sheets, config, rows);
      logger.info("actionItems backfill complete", {written});
      return {written, spreadsheetId: config.spreadsheetId, sheetName: config.sheetName};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("actionItems backfill failed", {message, err});
      throw new functions.https.HttpsError(
        "failed-precondition",
        message.slice(0, 400) || "Sheets backfill failed"
      );
    }
  });
