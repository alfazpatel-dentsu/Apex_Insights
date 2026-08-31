import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import {logger} from "firebase-functions";
import {ActionItemDoc} from "../action-item-row";
import {ActionAssignee, assigneesFromItem, newlyAddedAssignees} from "../assignees";
import {
  ccEmailsFor,
  isAutomationEnabled,
  loadEmailAutomationSettings,
} from "./config";
import {addDaysYmd, daysBetweenYmd, isQuietActionStatus, parseDueYmd, todayYmdIst} from "./dates";
import {findUserByEmail, listAdminEmails, resolveUserEmail, sendAlertEmail} from "./mailer";
import {
  accessAwaitingEmail,
  accessGrantedEmail,
  accessRequestedEmail,
  passwordResetEmail,
  taskAssignedEmail,
  taskDueSoonEmail,
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

async function brandedPasswordLink(
  email: string,
  appBaseUrl: string,
  mode: "reset" | "invite"
): Promise<string> {
  const base = appBaseUrl.replace(/\/$/, "");
  const continueUrl = `${base}/reset-password`;
  let firebaseLink: string;
  try {
    firebaseLink = await getAuth().generatePasswordResetLink(email, {
      url: continueUrl,
    });
  } catch (err) {
    logger.warn("password link with continue URL failed; using default handler", {
      email,
      continueUrl,
      message: err instanceof Error ? err.message : String(err),
    });
    firebaseLink = await getAuth().generatePasswordResetLink(email);
  }
  try {
    const parsed = new URL(firebaseLink);
    const oobCode = parsed.searchParams.get("oobCode");
    if (oobCode) {
      return `${base}/reset-password?oobCode=${encodeURIComponent(oobCode)}&mode=${mode}`;
    }
  } catch {
    // keep Firebase link
  }
  return firebaseLink;
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

type TaskMailKind = "taskAssigned" | "taskDueSoon" | "taskOverdue" | "taskOverdueDaily";

async function sendTaskMailToAssignees(opts: {
  id: string;
  data: ActionItemDoc;
  kind: TaskMailKind;
  contentFor: (
    recipientName: string,
    appBaseUrl: string
  ) => ReturnType<typeof taskAssignedEmail>;
  dedupeFor: (email: string) => string;
  people?: ActionAssignee[];
}): Promise<number> {
  const settings = await loadEmailAutomationSettings();
  if (!isAutomationEnabled(settings, opts.kind)) {
    logger.info(`${opts.kind} automation disabled`, {id: opts.id});
    return 0;
  }

  const people = opts.people || assigneesFromItem(opts.data);
  const cc = ccEmailsFor(settings, opts.kind);
  let teamsPosted = false;
  let emailed = 0;

  for (const person of people) {
    const resolved = await resolveAssigneeContact(person);
    if (!resolved.email) {
      logger.info(`${opts.kind}: skip assignee without email`, {
        id: opts.id,
        name: person.name,
        userId: person.userId,
      });
      continue;
    }
    await sendAlertEmail({
      to: resolved.email,
      cc,
      content: opts.contentFor(resolved.displayName, settings.appBaseUrl),
      settings,
      dedupeKey: opts.dedupeFor(resolved.email),
      meta: {type: opts.kind, actionItemId: opts.id, assigneeEmail: resolved.email},
      notificationType: opts.kind,
      notificationHref: "/dashboard/actions",
      notifyTeams: !teamsPosted,
    });
    teamsPosted = true;
    emailed += 1;
  }
  return emailed;
}

async function notifyTaskOverdueToday(id: string, data: ActionItemDoc): Promise<void> {
  await sendTaskMailToAssignees({
    id,
    data,
    kind: "taskOverdue",
    contentFor: (recipientName, appBaseUrl) =>
      taskOverdueEmail({
        recipientName,
        taskName: data.taskName || "Untitled task",
        dueDate: data.dueDate,
        section: data.section,
        priority: data.priority,
        clientName: data.clientName,
        appBaseUrl,
        variant: "dueToday",
      }),
    dedupeFor: (email) => `taskOverdue_${id}_${data.dueDate || "nodate"}_${email}`,
  });
}

async function notifyTaskOverdueDaily(id: string, data: ActionItemDoc, todayYmd: string): Promise<void> {
  const dueYmd = parseDueYmd(data.dueDate);
  const days = dueYmd ? Math.max(1, daysBetweenYmd(dueYmd, todayYmd)) : 1;
  await sendTaskMailToAssignees({
    id,
    data,
    kind: "taskOverdueDaily",
    contentFor: (recipientName, appBaseUrl) =>
      taskOverdueEmail({
        recipientName,
        taskName: data.taskName || "Untitled task",
        dueDate: data.dueDate,
        section: data.section,
        priority: data.priority,
        clientName: data.clientName,
        appBaseUrl,
        variant: "stillOverdue",
        daysOverdue: days,
      }),
    dedupeFor: (email) => `taskOverdueDaily_${id}_${todayYmd}_${email}`,
  });
}

async function notifyTaskDueSoon(id: string, data: ActionItemDoc): Promise<void> {
  await sendTaskMailToAssignees({
    id,
    data,
    kind: "taskDueSoon",
    contentFor: (recipientName, appBaseUrl) =>
      taskDueSoonEmail({
        recipientName,
        taskName: data.taskName || "Untitled task",
        dueDate: data.dueDate,
        section: data.section,
        priority: data.priority,
        clientName: data.clientName,
        appBaseUrl,
      }),
    dedupeFor: (email) => `taskDueSoon_${id}_${data.dueDate || "nodate"}_${email}`,
  });
}

async function notifyTaskAssigned(
  id: string,
  after: ActionItemDoc,
  before?: ActionItemDoc
): Promise<void> {
  const newcomers = newlyAddedAssignees(after, before);
  if (newcomers.length === 0) return;
  await sendTaskMailToAssignees({
    id,
    data: after,
    kind: "taskAssigned",
    people: newcomers,
    contentFor: (recipientName, appBaseUrl) =>
      taskAssignedEmail({
        recipientName,
        taskName: after.taskName || "Untitled task",
        dueDate: after.dueDate,
        section: after.section,
        priority: after.priority,
        clientName: after.clientName,
        appBaseUrl,
      }),
    dedupeFor: (email) => `taskAssigned_${id}_${email}`,
  });
}

async function runDueSchedule(id: string, data: ActionItemDoc, todayYmd: string): Promise<void> {
  if (isQuietActionStatus(data.status)) return;
  const dueYmd = parseDueYmd(data.dueDate);
  if (!dueYmd) return;
  const tomorrow = addDaysYmd(todayYmd, 1);
  if (dueYmd === tomorrow) {
    await notifyTaskDueSoon(id, data);
  } else if (dueYmd === todayYmd) {
    await notifyTaskOverdueToday(id, data);
  } else if (dueYmd < todayYmd) {
    await notifyTaskOverdueDaily(id, data, todayYmd);
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
        await runDueSchedule(id, after, todayYmdIst());
      } catch (err) {
        logger.error("task overdue schedule on write failed", {id, err});
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

    if (isNewPendingRequest(before, after)) {
      const requesterEmail = (after.email || "").trim().toLowerCase();
      if (isAutomationEnabled(settings, "accessAwaiting") && requesterEmail) {
        try {
          const content = accessAwaitingEmail({
            recipientName: after.displayName || requesterEmail,
            appBaseUrl: settings.appBaseUrl,
          });
          await sendAlertEmail({
            to: requesterEmail,
            cc: ccEmailsFor(settings, "accessAwaiting"),
            content,
            settings,
            dedupeKey: `accessAwaiting_${uid}`,
            meta: {type: "accessAwaiting", uid},
            notificationType: "accessAwaiting",
            notificationHref: "/",
          });
        } catch (err) {
          logger.error("accessAwaiting notify failed", {uid, err});
        }
      }

      if (isAutomationEnabled(settings, "accessRequested")) {
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
              cc: ccEmailsFor(settings, "accessRequested"),
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
            cc: ccEmailsFor(settings, "accessGranted"),
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
      } else {
        try {
          const resetLink = await brandedPasswordLink(email, settings.appBaseUrl, "invite");
          const content = userInvitedEmail({
            recipientName: after.displayName || email,
            resetLink,
            role: after.role,
            appBaseUrl: settings.appBaseUrl,
          });
          await sendAlertEmail({
            to: email,
            cc: ccEmailsFor(settings, "userInvited"),
            content,
            settings,
            dedupeKey: `userInvited_${uid}`,
            meta: {type: "userInvited", uid},
            notifyTeams: false,
          });
        } catch (err) {
          logger.error("userInvited notify failed", {uid, err});
        }
      }
    }
  });

/**
 * Daily sweep (~09:00 IST): due tomorrow, due today, and still-overdue reminders.
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
    const todayYmd = todayYmdIst();
    const db = getFirestore();
    const snap = await db.collection("actionItems").get();
    let scannedDue = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as ActionItemDoc;
      if (isQuietActionStatus(data.status)) continue;
      if (!parseDueYmd(data.dueDate)) continue;
      scannedDue += 1;
      try {
        await runDueSchedule(doc.id, data, todayYmd);
      } catch (err) {
        logger.error("sweep due schedule failed", {id: doc.id, err});
      }
    }

    logger.info("sweepOverdueActionItemEmails complete", {scannedDue, scanned: snap.size, todayYmd});
    return null;
  });

/**
 * HTTPS callables need functions.admin to set invoker IAM (Editors cannot).
 * Test / forgot-password / resend-invite are queued as Firestore mailJobs instead.
 */
export const onMailJobCreated = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 120,
    memory: "512MB",
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

      if (type === "mom") {
        const emails = Array.isArray(data.emails)
          ? data.emails.map((e: unknown) => String(e || "").trim().toLowerCase()).filter((e: string) => e.includes("@"))
          : email
            ? [email]
            : [];
        const unique = [...new Set(emails)];
        const subject = String(data.subject || "AZTEC Weekly MoM").trim();
        const html = String(data.html || "");
        const text = String(data.text || "Open this email in HTML to view the Weekly MoM.");
        if (unique.length === 0 || !html) {
          await jobRef.set({status: "failed", error: "missing-recipients-or-html"}, {merge: true});
          return;
        }
        const result = await sendAlertEmail({
          to: unique,
          content: {subject, html, text},
          settings,
          dedupeKey: `mom_${id}`,
          meta: {type: "mom"},
          notificationType: "mom",
          notificationHref: "/dashboard/wbr",
          notifyTeams: false,
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
      // Account emails (invite + reset) always send; Notifications toggles do not block them.
      if (!email || !email.includes("@")) {
        await jobRef.set({status: "failed", error: "bad-email"}, {merge: true});
        return;
      }

      const user = await findUserByEmail(email);
      if (!user) {
        await jobRef.set({status: "skipped", error: "unknown-user"}, {merge: true});
        return;
      }

      const resetLink = await brandedPasswordLink(
        user.email,
        settings.appBaseUrl,
        type === "invite" ? "invite" : "reset"
      );
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
      const isResend = data.resend === true;
      const result = await sendAlertEmail({
        to: user.email,
        content,
        settings,
        dedupeKey:
          type === "invite"
            ? isResend
              ? `userInvited_resend_${user.uid}_${id}`
              : `userInvited_${user.uid}`
            : `passwordReset_${user.uid}_${hourBucket}`,
        meta: {type: automationKey, uid: user.uid},
        notifyTeams: false,
      });

      if (!result.sent && result.skipped === "graph-not-configured") {
        await jobRef.set(
          {status: "failed", error: "graph-not-configured"},
          {merge: true}
        );
        return;
      }

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

