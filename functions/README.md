# Cloud Functions (email alerts)

1st gen Cloud Functions in codebase `action-items-sheets` (same generation as `acceptInvite`, so deploy works with Editor without Eventarc / Cloud Run invoker Owner permissions).

Google Sheets live-sync is **not deployed**. Mail uses Microsoft Graph from `aztec_alerts@dentsu.com`.

| Function | Purpose |
|----------|---------|
| `onActionItemEmailAutomations` | Emails + in-app alerts for **action overdue** / **action assigned** |
| `onUserEmailAutomations` | Emails for **access requested** / **access granted** / **user invited** |
| `sweepOverdueActionItemEmails` | Daily overdue sweep (03:30 UTC ≈ 09:00 IST) |
| `onMailJobCreated` | Test email, forgot password, and resend invite (Firestore job, no HTTPS invoker IAM) |

If prompted about deleting `acceptInvite` on deploy, choose **No**.

If prompted about deleting `mirrorActionItemToSheet` or `backfillActionItemsSheet`, choose **Yes**.

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
| `accessAwaiting` | New user `status: Pending` | That user |
| `accessRequested` | New user `status: Pending` | All Admin users |
| `accessGranted` | Pending user approved | That user |
| `taskAssigned` | New action item or new assignee | Each assignee with an email |
| `taskDueSoon` | Daily ~09:00 IST, due tomorrow | Each assignee with an email |
| `taskOverdue` | Daily ~09:00 IST, due today | Each assignee with an email |
| `taskOverdueDaily` | Daily ~09:00 IST, after due date | Each assignee with an email |
| `userInvited` | Admin invite | Invited user (set-password link on `/reset-password`) |
| `passwordReset` | Forgot password | That user only (never CC) |

Default CC addresses are stored on `settings/emailAutomations.defaultCcEmails` and applied to automations that have `ccEnabled[key] === true`. Quiet action statuses **Completed**, **On-Hold**, and **Observation** skip due/overdue mail.

MoM send is an admin-only Weekly Review action (`mailJobs` type `mom`), not a scheduled automation.

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
5. Grant send rights. Dentsu IT used **Exchange Online RBAC for Applications** scoped to `aztec_alerts@dentsu.com` (no tenant-wide Graph **Admin consent** required). That is the preferred model.
6. Send **Directory (tenant) ID**, **Application (client) ID**, and the client secret **Value** (plus expiry) to the person who deploys Firebase.

### After IT returns credentials (Dentsu, Aug 2026)

IT has provided App ID, client secret (expiry **26 Aug 2027**), Directory (tenant) ID, and confirmed:

- Permissions are via **Exo RBAC for Applications** (not Graph admin consent)
- The app is **scoped to `aztec_alerts@dentsu.com` only**

The app code already uses Graph client-credentials + `users/{mailbox}/sendMail`. Exo RBAC is compatible; **no code change is required**. Mail still will not send until the three values are stored in Firebase and Cloud Functions are deployed.

| IT gave you | Firebase name | Where it lives |
|-------------|---------------|----------------|
| Directory (tenant) ID | `MS_GRAPH_TENANT_ID` | `functions/.env` (never git) |
| App ID | `MS_GRAPH_CLIENT_ID` | `functions/.env` (never git) |
| Client secret Value | `MS_GRAPH_CLIENT_SECRET` | `functions/.env` (never git; Editors cannot use Secret Manager IAM) |
| Sender | `MS_GRAPH_SENDER` | already defaults to `aztec_alerts@dentsu.com` |

Do **not** paste the client secret into GitHub, chat, or application source.

#### Non-developer path (Google Cloud Shell in the browser)

You need: the three IT values, a Google account that can edit Firebase project **`vdc200007-ppclientcentre-prod`**, and ~15 minutes.

1. Merge PR **#52** into `main` on GitHub (or deploy from branch `cursor/email-team-notifications-ad75`).
2. Open [Google Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=vdc200007-ppclientcentre-prod) while logged into that project.
3. Put tenant ID, App ID, and client secret in gitignored `functions/.env` (see below). Do not commit that file.
4. Sign in to Aztec Control Center as Admin → **Administration** → **Notifications** → **Send test email**.
5. Put a calendar reminder for **1 Aug 2027** to rotate the secret before 26 Aug 2027.

### Setup in Firebase

1. Create `functions/.env` (do not commit):

```bash
MS_GRAPH_TENANT_ID=<tenant-id-from-IT>
MS_GRAPH_CLIENT_ID=<client-id-from-IT>
MS_GRAPH_CLIENT_SECRET=<client-secret-value-from-IT>
MS_GRAPH_SENDER=aztec_alerts@dentsu.com
EMAIL_FROM_NAME=AZTEC Alerts
APP_BASE_URL=https://azteccontrolcenter.dentsu.com
```

2. Deploy functions + rules (no Secret Manager IAM required):

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions:action-items-sheets,firestore:rules
```

3. In the app: **Administration → Notifications** → **Send test email**. Confirm From `aztec_alerts@dentsu.com`.

Optional: paste a Microsoft Teams incoming-webhook / workflow URL in that same panel so the team channel gets a card for operational alerts (never password-reset links).

---

## Verify emails

1. Approve a Pending user → Access granted email + bell notification
2. Assign or mark an action item overdue → Assignee email + bell
3. Forgot password on `/` → branded reset from `aztec_alerts@dentsu.com`
4. Logs: `firebase functions:log --only onActionItemEmailAutomations,onUserEmailAutomations,requestPasswordResetEmail`

## Retired: Google Sheets action-item mirror

`mirrorActionItemToSheet` and `backfillActionItemsSheet` are no longer exported. Source files under `functions/src/sheets.ts` remain in git if anyone needs to restore later. Deploy no longer requires secret `SHEETS_SERVICE_ACCOUNT_JSON`.
