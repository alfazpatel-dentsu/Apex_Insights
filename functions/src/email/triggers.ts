import {getFirestore} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import {logger} from "firebase-functions";
import {ActionItemDoc} from "../action-item-row";
import {
  isAutomationEnabled,
  loadEmailAutomationSettings,
  MS_GRAPH_CLIENT_SECRET,
} from "./config";
import {listAdminEmails, resolveUserEmail, sendAlertEmail} from "./mailer";
import {
  accessGrantedEmail,
  accessRequestedEmail,
  taskAssignedEmail,
  taskOverdueEmail,
} from "./templates";

interface UserDoc {
  email?: string;
  displayName?: string;
  role?: string;
  status?: string;
  permissions?: string[];
}

function wasApproved(before: UserDoc | undefined, after: UserDoc): boolean {
  const prev = before?.status || "";
  const next = after.status || "";
  if (next === "Pending" || next === "Invite sent") return false;
  // Pending → User Registered / approved, or empty → active with permissions
  if (prev === "Pending" && next && next !== "Pending") return true;
  const prevPerms = before?.permissions?.length || 0;
  const nextPerms = after.permissions?.length || 0;
  if (prev === "Pending" && nextPerms > 0 && prevPerms === 0) return true;
  return false;
}

function isNewPendingRequest(before: UserDoc | undefined, after: UserDoc): boolean {
  if (after.status !== "Pending") return false;
  if (!before) return true;
  return before.status !== "Pending";
}

async function notifyTaskOverdue(id: string, data: ActionItemDoc): Promise<void> {
  const settings = await loadEmailAutomationSettings();
  if (!isAutomationEnabled(settings, "taskOverdue")) {
    logger.info("taskOverdue automation disabled", {id});
    return;
  }

  const resolved = await resolveUserEmail(data.assignedTo);
  if (!resolved.email) {
    logger.warn("taskOverdue: could not resolve assignee email", {
      id,
      assignedTo: data.assignedTo,
    });
    return;
  }

  const content = taskOverdueEmail({
    recipientName: resolved.displayName,
    taskName: data.taskName || "Untitled task",
    dueDate: data.dueDate,
    section: data.section,
    priority: data.priority,
    clientName: data.clientName,
    appBaseUrl: settings.appBaseUrl,
  });

  await sendAlertEmail({
    to: resolved.email,
    content,
    settings,
    dedupeKey: `taskOverdue_${id}_${data.dueDate || "nodate"}`,
    meta: {type: "taskOverdue", actionItemId: id},
  });
}

async function notifyTaskAssigned(id: string, data: ActionItemDoc): Promise<void> {
  const settings = await loadEmailAutomationSettings();
  if (!isAutomationEnabled(settings, "taskAssigned")) {
    logger.info("taskAssigned automation disabled", {id});
    return;
  }

  const resolved = await resolveUserEmail(data.assignedTo);
  if (!resolved.email) {
    logger.warn("taskAssigned: could not resolve assignee email", {
      id,
      assignedTo: data.assignedTo,
    });
    return;
  }

  const content = taskAssignedEmail({
    recipientName: resolved.displayName,
    taskName: data.taskName || "Untitled task",
    dueDate: data.dueDate,
    section: data.section,
    priority: data.priority,
    clientName: data.clientName,
    appBaseUrl: settings.appBaseUrl,
  });

  const stamp = data.updatedAt || data.createdAt || "new";
  await sendAlertEmail({
    to: resolved.email,
    content,
    settings,
    dedupeKey: `taskAssigned_${id}_${(data.assignedTo || "").toLowerCase()}_${stamp}`,
    meta: {type: "taskAssigned", actionItemId: id},
  });
}

/** Firestore trigger: overdue + assignment emails for action items. */
export const onActionItemEmailAutomations = functions
  .region("us-central1")
  .runWith({
    secrets: [MS_GRAPH_CLIENT_SECRET],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .firestore.document("actionItems/{id}")
  .onWrite(async (change, context) => {
    const id = context.params.id as string;
    if (!change.after.exists) return;

    const after = change.after.data() as ActionItemDoc;
    const before = change.before.exists
      ? (change.before.data() as ActionItemDoc)
      : undefined;

    const becameOverdue =
      after.status === "Overdue" && (!before || before.status !== "Overdue");
    if (becameOverdue) {
      try {
        await notifyTaskOverdue(id, after);
      } catch (err) {
        logger.error("taskOverdue notify failed", {id, err});
      }
    }

    const assigneeChanged =
      !!after.assignedTo &&
      (!before || (before.assignedTo || "") !== (after.assignedTo || ""));
    const isCreate = !before;
    if ((isCreate || assigneeChanged) && after.assignedTo) {
      try {
        await notifyTaskAssigned(id, after);
      } catch (err) {
        logger.error("taskAssigned notify failed", {id, err});
      }
    }
  });

/** Firestore trigger: access requested / access granted. */
export const onUserEmailAutomations = functions
  .region("us-central1")
  .runWith({
    secrets: [MS_GRAPH_CLIENT_SECRET],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid as string;
    if (!change.after.exists) return;

    const after = change.after.data() as UserDoc;
    const before = change.before.exists
      ? (change.before.data() as UserDoc)
      : undefined;

    const settings = await loadEmailAutomationSettings();

    if (isNewPendingRequest(before, after) && isAutomationEnabled(settings, "accessRequested")) {
      try {
        const admins = await listAdminEmails();
        if (admins.length === 0) {
          logger.warn("accessRequested: no admin emails found", {uid});
        } else {
          const content = accessRequestedEmail({
            requesterName: after.displayName || "",
            requesterEmail: after.email || "",
            appBaseUrl: settings.appBaseUrl,
          });
          await sendAlertEmail({
            to: admins,
            content,
            settings,
            dedupeKey: `accessRequested_${uid}`,
            meta: {type: "accessRequested", uid},
          });
        }
      } catch (err) {
        logger.error("accessRequested notify failed", {uid, err});
      }
    }

    if (wasApproved(before, after) && isAutomationEnabled(settings, "accessGranted")) {
      const email = (after.email || "").trim().toLowerCase();
      if (!email) {
        logger.warn("accessGranted: user has no email", {uid});
        return;
      }
      try {
        const content = accessGrantedEmail({
          recipientName: after.displayName || email,
          role: after.role,
          appBaseUrl: settings.appBaseUrl,
        });
        await sendAlertEmail({
          to: email,
          content,
          settings,
          dedupeKey: `accessGranted_${uid}`,
          meta: {type: "accessGranted", uid},
        });
      } catch (err) {
        logger.error("accessGranted notify failed", {uid, err});
      }
    }
  });

/**
 * Daily sweep: catch overdue items that may have been missed
 * (e.g. status not yet flipped, or email failed earlier).
 * Runs 03:30 UTC ≈ 09:00 IST.
 */
export const sweepOverdueActionItemEmails = functions
  .region("us-central1")
  .runWith({
    secrets: [MS_GRAPH_CLIENT_SECRET],
    timeoutSeconds: 300,
    memory: "512MB",
  })
  .pubsub.schedule("30 3 * * *")
  .timeZone("UTC")
  .onRun(async () => {
    const settings = await loadEmailAutomationSettings();
    if (!isAutomationEnabled(settings, "taskOverdue")) {
      logger.info("sweepOverdue skipped — automation disabled");
      return null;
    }

    const db = getFirestore();
    const snap = await db.collection("actionItems").get();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let notified = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as ActionItemDoc;
      if (data.status === "Completed" || data.status === "Observation") continue;

      const isMarkedOverdue = data.status === "Overdue";
      let isPastDue = false;
      if (data.dueDate) {
        const due = new Date(data.dueDate);
        if (!Number.isNaN(due.getTime())) {
          due.setUTCHours(0, 0, 0, 0);
          isPastDue = due.getTime() < today.getTime();
        }
      }

      if (!isMarkedOverdue && !isPastDue) continue;

      try {
        await notifyTaskOverdue(doc.id, data);
        notified += 1;
      } catch (err) {
        logger.error("sweep overdue notify failed", {id: doc.id, err});
      }
    }

    logger.info("sweepOverdueActionItemEmails complete", {notified, scanned: snap.size});
    return null;
  });

/** Admin callable: send a test email from aztec_alerts@dentsu.com. */
export const sendTestAlertEmail = functions
  .region("us-central1")
  .runWith({
    secrets: [MS_GRAPH_CLIENT_SECRET],
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .https.onCall(async (data, context) => {
    if (!context.auth?.uid) {
      throw new functions.https.HttpsError("unauthenticated", "Sign in required");
    }

    const db = getFirestore();
    const userSnap = await db.doc(`users/${context.auth.uid}`).get();
    if (userSnap.data()?.role !== "Admin") {
      throw new functions.https.HttpsError("permission-denied", "Admin role required");
    }

    const settings = await loadEmailAutomationSettings();
    const to =
      (typeof data?.to === "string" && data.to.trim()) ||
      String(userSnap.data()?.email || context.auth.token.email || "").trim();

    if (!to) {
      throw new functions.https.HttpsError("invalid-argument", "No recipient email");
    }

    const content = accessGrantedEmail({
      recipientName: "Admin",
      role: "Test",
      appBaseUrl: settings.appBaseUrl,
    });
    content.subject = "[AZTEC] Test alert email";
    content.text = `This is a test message from ${settings.fromEmail}.\n\nApp: ${settings.appBaseUrl}\n`;
    content.html = content.html.replace("Access granted", "Test alert");

    const result = await sendAlertEmail({
      to,
      content,
      settings,
      dedupeKey: `test_${context.auth.uid}_${Date.now()}`,
      meta: {type: "test"},
    });

    if (!result.sent && result.skipped === "graph-not-configured") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Microsoft Graph is not configured. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and secret MS_GRAPH_CLIENT_SECRET, then redeploy."
      );
    }

    return {
      sent: result.sent,
      skipped: result.skipped || null,
      to,
      from: settings.fromEmail,
      appBaseUrl: settings.appBaseUrl,
    };
  });
