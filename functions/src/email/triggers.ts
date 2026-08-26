import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import {logger} from "firebase-functions";
import {ActionItemDoc} from "../action-item-row";
import {ActionAssignee, assigneesFromItem, newlyAddedAssignees} from "../assignees";
import {
  isAutomationEnabled,
  loadEmailAutomationSettings,
} from "./config";
import {findUserByEmail, listAdminEmails, resolveUserEmail, sendAlertEmail} from "./mailer";
import {
  accessGrantedEmail,
  accessRequestedEmail,
  passwordResetEmail,
  taskAssignedEmail,
  taskOverdueEmail,
  testAlertEmail,
  userInvitedEmail,
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

function isNewInvite(before: UserDoc | undefined, after: UserDoc): boolean {
  if (after.status !== "Invite sent") return false;
  if (!before) return true;
  return before.status !== "Invite sent";
}

async function generateAuthLink(email: string, continueUrl: string): Promise<string> {
  return getAuth().generatePasswordResetLink(email, {url: continueUrl});
}

async function resolveAssigneeContact(person: ActionAssignee): Promise<{
  email: string | null;
  displayName: string;
}> {
  const name = (person.name || "").trim();
  const storedEmail = (person.email || "").trim().toLowerCase();
  if (storedEmail.includes("@")) {
    return {email: storedEmail, displayName: name || storedEmail.split("@")[0]};
  }
  if (person.userId) {
    const snap = await getFirestore().collection("users").doc(person.userId).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const email = String(data.email || "").trim().toLowerCase();
      const displayName = String(data.displayName || name || email).trim();
      if (email.includes("@")) return {email, displayName};
    }
  }
  if (name) return resolveUserEmail(name);
  return {email: null, displayName: name};
}

async function notifyTaskOverdue(id: string, data: ActionItemDoc): Promise<void> {
  const settings = await loadEmailAutomationSettings();
  if (!isAutomationEnabled(settings, "taskOverdue")) {
    logger.info("taskOverdue automation disabled", {id});
    return;
  }

  const people = assigneesFromItem(data);
  if (people.length === 0) {
    logger.warn("taskOverdue: no assignees", {id});
    return;
  }

  let teamsPosted = false;
  let emailed = 0;
  for (const person of people) {
    const resolved = await resolveAssigneeContact(person);
    if (!resolved.email) {
      logger.info("taskOverdue: skip assignee without email", {
        id,
        name: person.name,
        userId: person.userId,
      });
      continue;
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
      dedupeKey: `taskOverdue_${id}_${data.dueDate || "nodate"}_${resolved.email}`,
      meta: {type: "taskOverdue", actionItemId: id, assigneeEmail: resolved.email},
      notificationType: "taskOverdue",
      notificationHref: "/dashboard/actions",
      notifyTeams: !teamsPosted,
    });
    teamsPosted = true;
    emailed += 1;
  }
  if (emailed === 0) {
    logger.warn("taskOverdue: no assignee emails to send", {id});
  }
}

async function notifyTaskAssigned(
  id: string,
  after: ActionItemDoc,
  before?: ActionItemDoc
): Promise<void> {
  const settings = await loadEmailAutomationSettings();
  if (!isAutomationEnabled(settings, "taskAssigned")) {
    logger.info("taskAssigned automation disabled", {id});
    return;
  }

  const newcomers = newlyAddedAssignees(after, before);
  if (newcomers.length === 0) return;

  let teamsPosted = false;
  let emailed = 0;
  for (const person of newcomers) {
    const resolved = await resolveAssigneeContact(person);
    if (!resolved.email) {
      logger.info("taskAssigned: skip assignee without email (can notify when email is added)", {
        id,
        name: person.name,
        userId: person.userId,
      });
      continue;
    }
    const content = taskAssignedEmail({
      recipientName: resolved.displayName,
      taskName: after.taskName || "Untitled task",
      dueDate: after.dueDate,
      section: after.section,
      priority: after.priority,
      clientName: after.clientName,
      appBaseUrl: settings.appBaseUrl,
    });
    await sendAlertEmail({
      to: resolved.email,
      content,
      settings,
      dedupeKey: `taskAssigned_${id}_${resolved.email}`,
      meta: {type: "taskAssigned", actionItemId: id, assigneeEmail: resolved.email},
      notificationType: "taskAssigned",
      notificationHref: "/dashboard/actions",
      notifyTeams: !teamsPosted,
    });
    teamsPosted = true;
    emailed += 1;
  }
  if (emailed === 0) {
    logger.info("taskAssigned: nobody with an email yet", {id});
  }
}

/** Firestore trigger: overdue + assignment emails for action items. */
export const onActionItemEmailAutomations = functions
  .region("us-central1")
  .runWith({
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

    const newcomers = newlyAddedAssignees(after, before);
    if (newcomers.length > 0) {
      try {
        await notifyTaskAssigned(id, after, before);
      } catch (err) {
        logger.error("taskAssigned notify failed", {id, err});
      }
    }
  });

/** Firestore trigger: access requested / granted / invited. */
export const onUserEmailAutomations = functions
  .region("us-central1")
  .runWith({
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
            notificationType: "accessRequested",
            notificationHref: "/dashboard/admin",
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
      } else {
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
            notificationType: "accessGranted",
            notificationHref: "/",
          });
        } catch (err) {
          logger.error("accessGranted notify failed", {uid, err});
        }
      }
    }

    if (isNewInvite(before, after) && isAutomationEnabled(settings, "userInvited")) {
      const email = (after.email || "").trim().toLowerCase();
      if (!email) {
        logger.warn("userInvited: user has no email", {uid});
        return;
      }
      try {
        const resetLink = await generateAuthLink(email, settings.appBaseUrl);
        const content = userInvitedEmail({
          recipientName: after.displayName || email,
          resetLink,
          role: after.role,
          appBaseUrl: settings.appBaseUrl,
        });
        await sendAlertEmail({
          to: email,
          content,
          settings,
          dedupeKey: `userInvited_${uid}_${Date.now()}`,
          meta: {type: "userInvited", uid},
          notifyTeams: false,
        });
      } catch (err) {
        logger.error("userInvited notify failed", {uid, err});
      }
    }
  });

/**
 * Daily sweep: catch overdue items that may have been missed.
 * Runs 03:30 UTC ≈ 09:00 IST.
 */
export const sweepOverdueActionItemEmails = functions
  .region("us-central1")
  .runWith({
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

/**
 * HTTPS callables need functions.admin to set invoker IAM (Editors cannot).
 * Test / forgot-password / resend-invite are queued as Firestore mailJobs instead.
 */
export const onMailJobCreated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 60,
    memory: "256MB",
  })
  .firestore.document("mailJobs/{id}")
  .onCreate(async (snap) => {
    const id = snap.id;
    const data = snap.data() || {};
    const type = String(data.type || "");
    const email = String(data.email || "")
      .trim()
      .toLowerCase();

    const settings = await loadEmailAutomationSettings();
    const db = getFirestore();
    const jobRef = db.doc(`mailJobs/${id}`);

    try {
      if (type === "test") {
        if (!email) {
          await jobRef.set({status: "failed", error: "no-email"}, {merge: true});
          return;
        }
        const content = testAlertEmail({
          appBaseUrl: settings.appBaseUrl,
          fromEmail: settings.fromEmail,
        });
        const result = await sendAlertEmail({
          to: email,
          content,
          settings,
          dedupeKey: `test_${id}`,
          meta: {type: "test"},
          notificationType: "test",
          notificationHref: "/dashboard/admin",
        });
        await jobRef.set(
          {
            status: result.sent ? "sent" : result.skipped || "skipped",
            from: settings.fromEmail,
          },
          {merge: true}
        );
        return;
      }

      if (type !== "reset" && type !== "invite") {
        await jobRef.set({status: "ignored", error: "unknown-type"}, {merge: true});
        return;
      }

      const automationKey = type === "invite" ? "userInvited" : "passwordReset";
      if (!isAutomationEnabled(settings, automationKey)) {
        await jobRef.set({status: "skipped", error: "disabled"}, {merge: true});
        return;
      }
      if (!email || !email.includes("@")) {
        await jobRef.set({status: "skipped", error: "bad-email"}, {merge: true});
        return;
      }

      const user = await findUserByEmail(email);
      if (!user) {
        await jobRef.set({status: "skipped", error: "unknown-user"}, {merge: true});
        return;
      }

      const resetLink = await generateAuthLink(user.email, settings.appBaseUrl);
      const content =
        type === "invite"
          ? userInvitedEmail({
              recipientName: user.displayName,
              resetLink,
              role: user.role,
              appBaseUrl: settings.appBaseUrl,
            })
          : passwordResetEmail({
              recipientName: user.displayName,
              resetLink,
              appBaseUrl: settings.appBaseUrl,
            });

      const hourBucket = Math.floor(Date.now() / 3_600_000);
      const result = await sendAlertEmail({
        to: user.email,
        content,
        settings,
        dedupeKey:
          type === "invite"
            ? `userInvited_resend_${user.uid}_${id}`
            : `passwordReset_${user.uid}_${hourBucket}`,
        meta: {type: automationKey, uid: user.uid},
        notifyTeams: false,
      });

      await jobRef.set(
        {
          status: result.sent ? "sent" : result.skipped || "skipped",
          from: settings.fromEmail,
        },
        {merge: true}
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("onMailJobCreated failed", {id, type, message});
      await jobRef.set({status: "failed", error: message.slice(0, 400)}, {merge: true});
    }
  });

