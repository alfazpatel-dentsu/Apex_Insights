export type EmailAutomationKey =
  | 'taskOverdue'
  | 'taskAssigned'
  | 'accessGranted'
  | 'accessRequested';

export interface EmailAutomationSettings {
  fromEmail: string;
  fromName: string;
  appBaseUrl: string;
  enabled: Record<EmailAutomationKey, boolean>;
  updatedAt?: string;
  updatedBy?: string;
}

export const EMAIL_AUTOMATIONS_DOC = 'settings/emailAutomations';

export const DEFAULT_EMAIL_AUTOMATIONS: EmailAutomationSettings = {
  fromEmail: 'aztec_alerts@dentsu.com',
  fromName: 'AZTEC Alerts',
  appBaseUrl: 'https://azteccontrolcenter.dentsu.com',
  enabled: {
    taskOverdue: true,
    taskAssigned: true,
    accessGranted: true,
    accessRequested: true,
  },
};

export const EMAIL_AUTOMATION_META: Record<
  EmailAutomationKey,
  { title: string; description: string; recipients: string }
> = {
  taskOverdue: {
    title: 'Task overdue',
    description: 'When an action item becomes Overdue (live) or is still past due (daily sweep).',
    recipients: 'Task assignee',
  },
  taskAssigned: {
    title: 'Task assigned',
    description: 'When a new action item is created or the assignee changes.',
    recipients: 'Task assignee',
  },
  accessGranted: {
    title: 'Access granted',
    description: 'When an admin approves a Pending registration.',
    recipients: 'Approved user',
  },
  accessRequested: {
    title: 'Access requested',
    description: 'When someone registers and waits for approval.',
    recipients: 'All Admin users',
  },
};
