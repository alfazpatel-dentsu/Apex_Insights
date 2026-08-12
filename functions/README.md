# Action Items → Google Sheets + Email Automations (Cloud Functions)

1st gen Cloud Functions in codebase `action-items-sheets`:

| Function | Purpose |
|----------|---------|
| `mirrorActionItemToSheet` | Live upsert/delete on every `actionItems` write → Google Sheets |
| `backfillActionItemsSheet` | Callable — Admin-only full Sheet rebuild |
| `onActionItemEmailAutomations` | Emails for **task overdue** / **task assigned** |
| `onUserEmailAutomations` | Emails for **access requested** / **access granted** |
| `sweepOverdueActionItemEmails` | Daily overdue sweep (03:30 UTC) |
| `sendTestAlertEmail` | Callable — Admin test email from shared mailbox |

> Uses **1st gen** Functions (same as `acceptInvite`) so deploy works with Editor
> without Eventarc / Cloud Run invoker Owner permissions.

---

## Email automations (from `aztec_alerts@dentsu.com`)

All product alert emails are sent via SMTP as:

**From:** `AZTEC Alerts <aztec_alerts@dentsu.com>`

CTA links use the Firebase Hosting custom domain:

**https://azteccontrolcenter.dentsu.com**

### Automations

| Key | Trigger | Recipient |
|-----|---------|-----------|
| `taskOverdue` | `actionItems` status → `Overdue` (plus daily sweep) | Assignee (matched by display name or email) |
| `taskAssigned` | New action item or assignee change | Assignee |
| `accessRequested` | New user with `status: Pending` | All Admin users |
| `accessGranted` | Pending user approved (`User Registered`) | That user |

Toggles live in Firestore `settings/emailAutomations` (UI: **Automations** page) and in mail audit log `mailLog/{dedupeKey}`.

### SMTP setup (Google Workspace mailbox)

1. Ensure mailbox **aztec_alerts@dentsu.com** exists in Google Workspace.
2. Create an **App Password** (or SMTP relay credentials) for that mailbox.
3. Set the Functions secret (once per project):

```bash
firebase functions:secrets:set SMTP_PASS
# paste the app password when prompted
```

4. Optional params (defaults are already correct):

```bash
firebase functions:config:set   # or use params at deploy time
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=aztec_alerts@dentsu.com
# EMAIL_FROM_NAME=AZTEC Alerts
# APP_BASE_URL=https://azteccontrolcenter.dentsu.com
```

5. Grant the Functions runtime SA **Secret Manager Secret Accessor** on `SMTP_PASS` (same as Sheets secret).

6. Deploy:

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions:action-items-sheets
```

If prompted about deleting `acceptInvite`, choose **No**.

7. In the app (Admin → **Automations**), send a **Test email** and confirm it arrives From `aztec_alerts@dentsu.com`.

### Auth password-reset emails

Invite / reset emails from Firebase Auth (`sendPasswordResetEmail`) are separate from these alerts. To also brand those with `aztec_alerts@dentsu.com`, configure **Firebase Authentication → Templates → SMTP settings** in the Firebase console with the same mailbox. Product alert emails above do **not** depend on that.

---

## Sheets sync prerequisites

1. Google Sheet tab **ActionItems** (auto-created if missing)
2. Service account `ction-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com` shared on the Sheet as **Editor**
3. Secret `SHEETS_SERVICE_ACCOUNT_JSON` already set
4. Compute SA has **Secret Manager Secret Accessor** (already done)

## Deploy

```bash
cd ~/studio
git pull
cd functions && npm ci && npm run build && cd ..

# Deploy ONLY this codebase (won't delete acceptInvite)
firebase deploy --only functions:action-items-sheets
```

```bash
firebase functions:list
```

## Backfill Sheets

Admin → **Backfill Action Items to Sheet**

## Verify emails

1. Approve a Pending user → Access granted email
2. Mark/create an overdue action item → Overdue email to assignee
3. Logs: `firebase functions:log --only onActionItemEmailAutomations,onUserEmailAutomations`
