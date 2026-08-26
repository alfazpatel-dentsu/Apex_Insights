import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {logger} from "firebase-functions";
import {
  EmailAutomationSettings,
  graphCredentialsConfigured,
  MS_GRAPH_CLIENT_ID,
  MS_GRAPH_CLIENT_SECRET,
  MS_GRAPH_SENDER,
  MS_GRAPH_TENANT_ID,
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

let cachedToken: {value: string; expiresAtMs: number} | null = null;

async function getGraphAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.value;
  }

  const tenant = MS_GRAPH_TENANT_ID.value()?.trim();
  const clientId = MS_GRAPH_CLIENT_ID.value()?.trim();
  const clientSecret = MS_GRAPH_CLIENT_SECRET.value()?.trim();
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials are not configured");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !json.access_token) {
    throw new Error(
      `Graph token failed: ${json.error || res.status} ${json.error_description || ""}`.trim()
    );
  }

  const expiresInSec = Number(json.expires_in || 3600);
  cachedToken = {
    value: json.access_token,
    expiresAtMs: now + expiresInSec * 1000,
  };
  return json.access_token;
}

async function graphSendMail(params: {
  sender: string;
  fromName: string;
  recipients: string[];
  content: EmailContent;
}): Promise<void> {
  const token = await getGraphAccessToken();
  const sender = encodeURIComponent(params.sender);
  const url = `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`;

  const payload = {
    message: {
      subject: params.content.subject,
      body: {
        contentType: "HTML",
        content: params.content.html || params.content.text,
      },
      toRecipients: params.recipients.map((address) => ({
        emailAddress: {address},
      })),
      from: {
        emailAddress: {
          address: params.sender,
          name: params.fromName,
        },
      },
      replyTo: [
        {
          emailAddress: {
            address: params.sender,
            name: params.fromName,
          },
        },
      ],
    },
    saveToSentItems: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph sendMail failed (${res.status}): ${text.slice(0, 400)}`);
  }
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

  if (!graphCredentialsConfigured()) {
    logger.error("Microsoft Graph credentials missing — cannot send alert email", {
      dedupeKey: options.dedupeKey,
    });
    return {sent: false, skipped: "graph-not-configured"};
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
      provider: "microsoft-graph",
      createdAt: FieldValue.serverTimestamp(),
      meta: options.meta || {},
    });
  } catch {
    return {sent: false, skipped: "already-sent"};
  }

  const sender =
    MS_GRAPH_SENDER.value()?.trim() ||
    options.settings.fromEmail ||
    "aztec_alerts@dentsu.com";

  try {
    await graphSendMail({
      sender,
      fromName: options.settings.fromName || "AZTEC Alerts",
      recipients,
      content: options.content,
    });

    await logRef.set(
      {
        status: "sent",
        sentAt: FieldValue.serverTimestamp(),
      },
      {merge: true}
    );

    logger.info("Alert email sent via Microsoft Graph", {
      dedupeKey: options.dedupeKey,
      to: recipients,
      from: sender,
    });

    return {sent: true};
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
