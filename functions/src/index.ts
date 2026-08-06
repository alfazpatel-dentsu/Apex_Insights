import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {setGlobalOptions} from "firebase-functions/v2";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
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

initializeApp();

setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

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

/**
 * Live sync: any create/update/delete on actionItems/{id} mirrors to Google Sheets.
 */
export const syncActionItemToSheet = onDocumentWritten(
  {
    document: "actionItems/{id}",
    secrets: [sheetsServiceAccountJson],
  },
  async (event) => {
    const id = event.params.id as string;
    const config = syncConfig();
    const sheets = await getSheetsClient(config);

    const after = event.data?.after;
    if (!after?.exists) {
      const removed = await deleteActionItemRow(sheets, config, id);
      logger.info("actionItems delete mirrored to Sheets", {id, removed});
      return;
    }

    const data = after.data() as ActionItemDoc;
    const row = actionItemToRow(id, data);
    const result = await upsertActionItemRow(sheets, config, row);
    logger.info("actionItems upsert mirrored to Sheets", {id, result});
  }
);

/**
 * One-time / on-demand full rebuild of the Sheet from Firestore.
 * Call as an authenticated Admin user via Firebase callable.
 */
export const backfillActionItemsToSheet = onCall(
  {
    secrets: [sheetsServiceAccountJson],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (role !== "Admin") {
      throw new HttpsError("permission-denied", "Admin role required");
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
      // Surface actionable detail to Admins (callable otherwise collapses to "internal")
      throw new HttpsError(
        "failed-precondition",
        message.slice(0, 400) || "Sheets backfill failed"
      );
    }
  }
);
