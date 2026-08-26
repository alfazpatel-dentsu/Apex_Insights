export type EmailAutomationKey =
  | 'accessAwaiting'
  | 'accessRequested'
  | 'accessGranted'
  | 'taskAssigned'
  | 'taskDueSoon'
  | 'taskOverdue'
  | 'taskOverdueDaily'
  | 'passwordReset'
  | 'userInvited';

export interface EmailAutomationSettings {
  fromEmail: string;
  fromName: string;
  appBaseUrl: string;
  teamsWebhookUrl?: string;
  /** Always CC'd on automations where `ccEnabled[key]` is true (never on password reset). */
  defaultCcEmails?: string[];
  /** Per-automation override. Missing key means use the default for that type. */
  ccEnabled?: Partial<Record<EmailAutomationKey, boolean>>;
  enabled: Record<EmailAutomationKey, boolean>;
  updatedAt?: string;
  updatedBy?: string;
}

export const EMAIL_AUTOMATIONS_DOC = 'settings/emailAutomations';

export const DEFAULT_CC_ENABLED: Record<EmailAutomationKey, boolean> = {
  accessAwaiting: true,
  accessRequested: true,
  accessGranted: true,
  taskAssigned: true,
  taskDueSoon: true,
  taskOverdue: true,
  taskOverdueDaily: true,
  passwordReset: false,
  userInvited: false,
};

export const DEFAULT_EMAIL_AUTOMATIONS: EmailAutomationSettings = {
  fromEmail: 'aztec_alerts@dentsu.com',
  fromName: 'AZTEC Alerts',
  appBaseUrl: 'https://azteccontrolcenter.dentsu.com',
  teamsWebhookUrl: '',
  defaultCcEmails: [],
  ccEnabled: {...DEFAULT_CC_ENABLED},
  enabled: {
    accessAwaiting: true,
    accessRequested: true,
    accessGranted: true,
    taskAssigned: true,
    taskDueSoon: true,
    taskOverdue: true,
    taskOverdueDaily: true,
    passwordReset: true,
    userInvited: true,
  },
};

export const EMAIL_AUTOMATION_META: Record<
  EmailAutomationKey,
  { title: string; description: string; recipients: string; allowsCc: boolean }
> = {
  accessAwaiting: {
    title: 'Registration — approval awaiting',
    description: 'When someone registers, they get a confirmation that their request is waiting for an admin.',
    recipients: 'The person who registered',
    allowsCc: true,
  },
  accessRequested: {
    title: 'Registration — approval required',
    description: 'When someone registers and waits for approval, every Admin is notified to review the request.',
    recipients: 'All Admin users',
    allowsCc: true,
  },
  accessGranted: {
    title: 'User access approved',
    description: 'When an admin approves a pending registration.',
    recipients: 'The approved user',
    allowsCc: true,
  },
  taskAssigned: {
    title: 'Action item assigned',
    description: 'When a task is created or someone new is added to Assigned To. Each assignee with an email gets their own copy.',
    recipients: 'Every assignee with an email',
    allowsCc: true,
  },
  taskDueSoon: {
    title: 'Action item about to overdue',
    description: 'Daily (morning IST): tasks due tomorrow. Skips Completed, On-Hold, and Observation.',
    recipients: 'Every assignee with an email',
    allowsCc: true,
  },
  taskOverdue: {
    title: 'Action item overdue (due date)',
    description: 'Daily (morning IST): tasks whose due date is today. Skips Completed, On-Hold, and Observation.',
    recipients: 'Every assignee with an email',
    allowsCc: true,
  },
  taskOverdueDaily: {
    title: 'Action item overdue (daily reminder)',
    description: 'Every morning after the due date until the task is Completed, On-Hold, or Observation.',
    recipients: 'Every assignee with an email',
    allowsCc: true,
  },
  passwordReset: {
    title: 'Forgot password',
    description: 'Sign-in → Forgot password. Branded email with a link to the app reset-password page. Never CCs anyone (the link is private).',
    recipients: 'That user only',
    allowsCc: false,
  },
  userInvited: {
    title: 'User invited',
    description: 'When an admin invites a teammate. Includes a set-password link to the app.',
    recipients: 'The invited user',
    allowsCc: false,
  },
};

export const EMAIL_AUTOMATION_KEYS = Object.keys(EMAIL_AUTOMATION_META) as EmailAutomationKey[];

export interface TeamNotification {
  id: string;
  userId: string;
  email?: string;
  type: EmailAutomationKey | 'test' | 'mom';
  title: string;
  body: string;
  href?: string;
  read: boolean;
  createdAt?: { seconds: number; nanoseconds: number } | string;
}
