# Cloud Functions (Sheets sync + email alerts)

1st gen Cloud Functions in codebase `action-items-sheets` (same generation as `acceptInvite`, so deploy works with Editor without Eventarc / Cloud Run invoker Owner permissions).

| Function | Purpose |
|----------|---------|
| `mirrorActionItemToSheet` | Live upsert/delete on every `actionItems` write → Google Sheets |
| `backfillActionItemsSheet` | Callable — Admin-only full Sheet rebuild |
| `onActionItemEmailAutomations` | Emails + in-app alerts for **action overdue** / **action assigned** |
| `onUserEmailAutomations` | Emails for **access requested** / **access granted** / **user invited** |
| `sweepOverdueActionItemEmails` | Daily overdue sweep (03:30 UTC ≈ 09:00 IST) |
| `sendTestAlertEmail` | Callable — Admin test email from the shared mailbox |
| `requestPasswordResetEmail` | Callable — branded **forgot password** (public) and **resend invite** (Admin) |

If prompted about deleting `acceptInvite` on deploy, choose **No**.

---

## Email & team notifications (`aztec_alerts@dentsu.com`)

All product alert emails are sent with **Microsoft Graph** (Entra client credentials).  
This works with **Okta** — no mailbox password / SMTP AUTH is required.

**From:** `AZTEC Alerts <aztec_alerts@dentsu.com>`

CTA links use:

**https://azteccontrolcenter.dentsu.com**

In-app copies of the same alerts appear in the header bell (`notifications` collection).  
Optional Microsoft Teams channel posts use a workflow/incoming webhook URL saved in Administration.

### Automations

| Key | Trigger | Recipient |
|-----|---------|-----------|
| `taskOverdue` | Action item status → `Overdue` (plus daily sweep) | Assignee |
| `taskAssigned` | New action item or assignee change | Assignee |
| `accessRequested` | New user with `status: Pending` | All Admin users |
| `accessGranted` | Pending user approved | That user |
| `userInvited` | Admin invite (`status: Invite sent`) | Invited user (set-password link) |
| `passwordReset` | Forgot password on the sign-in page | That user (reset link) |

Toggles live in Firestore `settings/emailAutomations` (UI: **Administration → Notifications**). Mail audit log: `mailLog/{dedupeKey}`.

Forgot-password and invite emails use Firebase Auth `generatePasswordResetLink` but are **delivered** by Graph from the shared mailbox (not `noreply@...firebaseapp.com`).

### Setup for IT (Entra ID / Microsoft 365)

Ask Identity / M365 admin to:

1. Confirm mailbox **`aztec_alerts@dentsu.com`** exists (shared mailbox).
2. In **Entra ID** → **App registrations** → **New registration**  
   - Name example: `AZTEC Control Center Alerts`  
   - Accounts: this organizational directory only  
3. Note **Application (client) ID** and **Directory (tenant) ID**.
4. **Certificates & secrets** → **New client secret** → copy the **Value** once (`MS_GRAPH_CLIENT_SECRET`).
5. **API permissions** → **Microsoft Graph** → **Application permissions** → **`Mail.Send`** → **Grant admin consent**.
6. (Recommended) Restrict the app with an Exchange **Application Access Policy** so it can only send as `aztec_alerts@dentsu.com`.
7. Send Tenant ID, Client ID, and Client secret to the Firebase admin.

### After IT returns App ID + secret

IT typically sends **Application (client) ID** (App ID) and a **client secret Value** (plus expiry). That is **not enough to send mail yet**.

| IT gave you | Goes here | Commit to git? |
|-------------|-----------|----------------|
| App ID / Application (client) ID | `MS_GRAPH_CLIENT_ID` in `functions/.env` | No (`.env` is gitignored) |
| Client secret **Value** | Secret `MS_GRAPH_CLIENT_SECRET` | **Never** |
| Secret expiry (e.g. 26 Aug 2027) | Calendar reminder to rotate | n/a |
| **Directory (tenant) ID** | `MS_GRAPH_TENANT_ID` | Often still missing — ask IT |

Also confirm with IT (if they did not say so):

- Admin consent is granted for Microsoft Graph **`Mail.Send` (Application)**
- The app may send **only** as `aztec_alerts@dentsu.com` (Exchange Application Access Policy)
- Sender UPN is exactly `aztec_alerts@dentsu.com`

#### Follow-up you can send IT

```
Thanks — we have the App ID and client secret (expiry 26 Aug 2027).

To finish Graph Mail.Send for Aztec Control Center, please also send:

1. Directory (tenant) ID for this app registration
2. Confirmation that Mail.Send (Application) has admin consent
3. Confirmation the app is restricted to send only as aztec_alerts@dentsu.com
```

Do **not** paste the client secret into GitHub, chat, or application source. Store it only in Firebase Secret Manager.

### Setup in Firebase

1. Create `functions/.env` (do not commit):

```bash
MS_GRAPH_TENANT_ID=<tenant-id-from-IT>
MS_GRAPH_CLIENT_ID=<client-id-from-IT>
MS_GRAPH_SENDER=aztec_alerts@dentsu.com
EMAIL_FROM_NAME=AZTEC Alerts
APP_BASE_URL=https://azteccontrolcenter.dentsu.com
```

2. Store the client secret:

```bash
firebase functions:secrets:set MS_GRAPH_CLIENT_SECRET
```

3. Grant the Functions runtime service account **Secret Manager Secret Accessor** on `MS_GRAPH_CLIENT_SECRET`.

4. Deploy functions + rules:

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions:action-items-sheets,firestore:rules
```

5. In the app: **Administration → Notifications** → **Send test email**. Confirm From `aztec_alerts@dentsu.com`.

Optional: paste a Microsoft Teams incoming-webhook / workflow URL in that same panel so the team channel gets a card for operational alerts (never password-reset links).

---

## Sheets sync

### Prerequisites

1. Google Sheet tab **ActionItems** (auto-created if missing)
2. Service account `ction-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com` shared on the Sheet as **Editor**
3. Secret `SHEETS_SERVICE_ACCOUNT_JSON` already set
4. Compute SA has **Secret Manager Secret Accessor** (already done)

### Deploy

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions:action-items-sheets
```

```bash
firebase functions:list
```

### Backfill

Admin → **Backfill Action Items to Sheet**

### Verify Sheets

1. Create / edit / delete an action item → Sheet row updates (key = `id`)
2. Logs: `firebase functions:log --only mirrorActionItemToSheet`

### Verify emails

1. Approve a Pending user → Access granted email + bell notification
2. Assign or mark an action item overdue → Assignee email + bell
3. Forgot password on `/` → branded reset from `aztec_alerts@dentsu.com`
4. Logs: `firebase functions:log --only onActionItemEmailAutomations,onUserEmailAutomations,requestPasswordResetEmail`
