import {initializeApp} from "firebase-admin/app";

/**
 * 1st gen Functions (same generation as existing acceptInvite).
 * Codebase name remains `action-items-sheets` so deploy does not create a new
 * codebase. Google Sheets live-sync is no longer exported from this file.
 */

initializeApp();

export {
  onActionItemEmailAutomations,
  onUserEmailAutomations,
  sweepOverdueActionItemEmails,
  sendTestAlertEmail,
  requestPasswordResetEmail,
} from "./email/triggers";
