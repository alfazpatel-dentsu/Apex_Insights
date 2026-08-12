import {getFirestore} from "firebase-admin/firestore";
import {defineSecret, defineString} from "firebase-functions/params";

export const SMTP_HOST = defineString("SMTP_HOST", {
  default: "smtp.gmail.com",
  description: "SMTP host for aztec_alerts@dentsu.com (Google Workspace)",
});

export const SMTP_PORT = defineString("SMTP_PORT", {
  default: "587",
  description: "SMTP port (587 STARTTLS recommended)",
});

export const SMTP_USER = defineString("SMTP_USER", {
  default: "aztec_alerts@dentsu.com",
  description: "Shared mailbox used as SMTP auth user / From address",
});

export const SMTP_PASS = defineSecret("SMTP_PASS");

export const EMAIL_FROM_NAME = defineString("EMAIL_FROM_NAME", {
  default: "AZTEC Alerts",
  description: "Display name on outbound alert emails",
});

export const APP_BASE_URL = defineString("APP_BASE_URL", {
  default: "https://azteccontrolcenter.dentsu.com",
  description: "Public app URL used in email CTAs (custom Hosting domain)",
});

export type EmailAutomationKey =
  | "taskOverdue"
  | "taskAssigned"
  | "accessGranted"
  | "accessRequested";

export interface EmailAutomationSettings {
  fromEmail: string;
  fromName: string;
  appBaseUrl: string;
  enabled: Record<EmailAutomationKey, boolean>;
}

export const DEFAULT_EMAIL_AUTOMATIONS: EmailAutomationSettings = {
  fromEmail: "aztec_alerts@dentsu.com",
  fromName: "AZTEC Alerts",
  appBaseUrl: "https://azteccontrolcenter.dentsu.com",
  enabled: {
    taskOverdue: true,
    taskAssigned: true,
    accessGranted: true,
    accessRequested: true,
  },
};

export const EMAIL_SETTINGS_PATH = "settings/emailAutomations";

/** Merge Firestore settings with env defaults. */
export async function loadEmailAutomationSettings(): Promise<EmailAutomationSettings> {
  const defaults: EmailAutomationSettings = {
    ...DEFAULT_EMAIL_AUTOMATIONS,
    fromEmail: SMTP_USER.value()?.trim() || DEFAULT_EMAIL_AUTOMATIONS.fromEmail,
    fromName: EMAIL_FROM_NAME.value()?.trim() || DEFAULT_EMAIL_AUTOMATIONS.fromName,
    appBaseUrl: (APP_BASE_URL.value()?.trim() || DEFAULT_EMAIL_AUTOMATIONS.appBaseUrl).replace(/\/$/, ""),
    enabled: {...DEFAULT_EMAIL_AUTOMATIONS.enabled},
  };

  try {
    const snap = await getFirestore().doc(EMAIL_SETTINGS_PATH).get();
    if (!snap.exists) return defaults;
    const data = snap.data() || {};
    const enabled = {
      ...defaults.enabled,
      ...(typeof data.enabled === "object" && data.enabled ? data.enabled : {}),
    } as Record<EmailAutomationKey, boolean>;
    return {
      fromEmail: String(data.fromEmail || defaults.fromEmail).trim() || defaults.fromEmail,
      fromName: String(data.fromName || defaults.fromName).trim() || defaults.fromName,
      appBaseUrl: String(data.appBaseUrl || defaults.appBaseUrl).trim().replace(/\/$/, "") || defaults.appBaseUrl,
      enabled,
    };
  } catch {
    return defaults;
  }
}

export function isAutomationEnabled(
  settings: EmailAutomationSettings,
  key: EmailAutomationKey
): boolean {
  return settings.enabled?.[key] !== false;
}
