import type { EmailAutomationKey } from '@/lib/email-automations';
import type { EmailContent } from '@/lib/email-templates';
import {
  accessAwaitingEmail,
  accessGrantedEmail,
  accessRequestedEmail,
  passwordResetEmail,
  taskAssignedEmail,
  taskDueSoonEmail,
  taskOverdueEmail,
  userInvitedEmail,
} from '@/lib/email-templates';

const SAMPLE_BASE = 'https://azteccontrolcenter.dentsu.com';
const SAMPLE_RESET = `${SAMPLE_BASE}/reset-password?oobCode=sample&mode=reset`;
const SAMPLE_INVITE = `${SAMPLE_BASE}/reset-password?oobCode=sample&mode=invite`;

const TASK = {
  recipientName: 'Priya Sharma',
  taskName: 'Share Q2 media mix recommendation',
  dueDate: '2026-08-28',
  section: 'OPERATIONS',
  priority: 'High',
  clientName: 'Sample Client',
  appBaseUrl: SAMPLE_BASE,
};

export function sampleEmailFor(key: EmailAutomationKey): EmailContent {
  switch (key) {
    case 'accessAwaiting':
      return accessAwaitingEmail({ recipientName: 'Priya Sharma', appBaseUrl: SAMPLE_BASE });
    case 'accessRequested':
      return accessRequestedEmail({
        requesterName: 'Priya Sharma',
        requesterEmail: 'priya.sharma@dentsu.com',
        appBaseUrl: SAMPLE_BASE,
      });
    case 'accessGranted':
      return accessGrantedEmail({
        recipientName: 'Priya Sharma',
        role: 'EM/CSM',
        appBaseUrl: SAMPLE_BASE,
      });
    case 'taskAssigned':
      return taskAssignedEmail(TASK);
    case 'taskDueSoon':
      return taskDueSoonEmail(TASK);
    case 'taskOverdue':
      return taskOverdueEmail({ ...TASK, variant: 'dueToday' });
    case 'taskOverdueDaily':
      return taskOverdueEmail({ ...TASK, variant: 'stillOverdue', daysOverdue: 3 });
    case 'passwordReset':
      return passwordResetEmail({
        recipientName: 'Priya Sharma',
        resetLink: SAMPLE_RESET,
        appBaseUrl: SAMPLE_BASE,
      });
    case 'userInvited':
      return userInvitedEmail({
        recipientName: 'Priya Sharma',
        resetLink: SAMPLE_INVITE,
        role: 'EM/CSM',
        appBaseUrl: SAMPLE_BASE,
      });
  }
}
