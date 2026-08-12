import nodemailer from "nodemailer";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  SMTP_HOST,
  SMTP_PASS,
  SMTP_PORT,
  SMTP_USER,
  EmailAutomationSettings,
} from "./config";
import {EmailContent} from "./templates";

export interface SendAlertOptions {
  to: string | string[];
  content: EmailContent;
  settings: EmailAutomationSettings;
  /** Dedup key — skip send if this mailLog doc already exists. */
  dedupeKey: string;
  meta?: Record<string, unknown>;
}

function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return [...new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export async function sendAlertEmail(options: SendAlertOptions): Promise<{
  sent: boolean;
  skipped?: string;
  messageId?: string;
}> {
  const recipients = normalizeRecipients(options.to);
  if (recipients.length === 0) {
    return {sent: false, skipped: "no-recipients"};
  }

  const pass = SMTP_PASS.value()?.trim();
  if (!pass) {
    logger.error("SMTP_PASS secret is empty — cannot send alert email", {
      dedupeKey: options.dedupeKey,
    });
    return {sent: false, skipped: "smtp-not-configured"};
  }

  const db = getFirestore();
  const logRef = db.collection("mailLog").doc(options.dedupeKey);
  const existing = await logRef.get();
  if (existing.exists) {
    return {sent: false, skipped: "already-sent"};
  }

  // Reserve the dedupe key before send to avoid duplicate blasts under concurrency.
  try {
    await logRef.create({
      status: "sending",
      to: recipients,
      subject: options.content.subject,
      from: options.settings.fromEmail,
      createdAt: FieldValue.serverTimestamp(),
      meta: options.meta || {},
    });
  } catch {
    return {sent: false, skipped: "already-sent"};
  }

  const host = SMTP_HOST.value()?.trim() || "smtp.office365.com";
  const port = Number(SMTP_PORT.value()?.trim() || "587");
  const user = SMTP_USER.value()?.trim() || options.settings.fromEmail;

  // Office 365: smtp.office365.com:587 with STARTTLS (not implicit SSL on 465).
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {user, pass},
  });

  try {
    const info = await transporter.sendMail({
      from: `"${options.settings.fromName}" <${options.settings.fromEmail}>`,
      to: recipients.join(", "),
      subject: options.content.subject,
      text: options.content.text,
      html: options.content.html,
      replyTo: options.settings.fromEmail,
    });

    await logRef.set(
      {
        status: "sent",
        messageId: info.messageId || null,
        sentAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    logger.info("Alert email sent", {
      dedupeKey: options.dedupeKey,
      to: recipients,
      messageId: info.messageId,
    });

    return {sent: true, messageId: info.messageId};
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await logRef.set(
      {
        status: "failed",
        error: message.slice(0, 500),
        failedAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );
    logger.error("Alert email failed", {
      dedupeKey: options.dedupeKey,
      message,
    });
    throw err;
  }
}

/** Resolve assignee free-text (name or email) to a user email. */
export async function resolveUserEmail(assignee: string | undefined | null): Promise<{
  email: string | null;
  displayName: string;
}> {
  const raw = (assignee || "").trim();
  if (!raw) return {email: null, displayName: ""};

  if (raw.includes("@")) {
    return {email: raw.toLowerCase(), displayName: raw.split("@")[0] || raw};
  }

  const db = getFirestore();
  const snap = await db.collection("users").get();
  const needle = raw.toLowerCase();
  for (const doc of snap.docs) {
    const data = doc.data();
    const displayName = String(data.displayName || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    if (displayName.toLowerCase() === needle && email) {
      return {email, displayName: displayName || email};
    }
  }

  return {email: null, displayName: raw};
}

export async function listAdminEmails(): Promise<string[]> {
  const snap = await getFirestore().collection("users").where("role", "==", "Admin").get();
  const emails: string[] = [];
  snap.forEach((doc) => {
    const email = String(doc.data().email || "").trim().toLowerCase();
    if (email) emails.push(email);
  });
  return [...new Set(emails)];
}
