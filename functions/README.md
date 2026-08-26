# Cloud Functions (email alerts)

1st gen Cloud Functions in codebase `action-items-sheets` (same generation as `acceptInvite`, so deploy works with Editor without Eventarc / Cloud Run invoker Owner permissions).

Google Sheets live-sync is **not deployed**. Mail uses Microsoft Graph from `aztec_alerts@dentsu.com`.

| Function | Purpose |
|----------|---------|
| `onActionItemEmailAutomations` | Emails + in-app alerts for **action overdue** / **action assigned** |
| `onUserEmailAutomations` | Emails for **access requested** / **access granted** / **user invited** |
| `sweepOverdueActionItemEmails` | Daily overdue sweep (03:30 UTC ≈ 09:00 IST) |
| `sendTestAlertEmail` | Callable — Admin test email from the shared mailbox |
| `requestPasswordResetEmail` | Callable — branded **forgot password** (public) and **resend invite** (Admin) |

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
| Client secret Value | `MS_GRAPH_CLIENT_SECRET` | Secret Manager only |
| Sender | `MS_GRAPH_SENDER` | already defaults to `aztec_alerts@dentsu.com` |

Do **not** paste the client secret into GitHub, chat, or application source.

#### Non-developer path (Google Cloud Shell in the browser)

You need: the three IT values, a Google account that can edit Firebase project **`vdc200007-ppclientcentre-prod`**, and ~15 minutes.

1. Merge PR **#52** into `main` on GitHub (or deploy from branch `cursor/email-team-notifications-ad75`).
2. Open [Google Cloud Shell](https://console.cloud.google.com/?cloudshell=true&project=vdc200007-ppclientcentre-prod) while logged into that project.
3. Run the commands in **Setup in Firebase** below. When `firebase functions:secrets:set` asks for a value, paste the client secret (it will not be shown on screen).
4. Sign in to Aztec Control Center as Admin → **Administration** → **Notifications** → **Send test email**.
5. Put a calendar reminder for **1 Aug 2027** to rotate the secret before 26 Aug 2027.

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

## Verify emails

1. Approve a Pending user → Access granted email + bell notification
2. Assign or mark an action item overdue → Assignee email + bell
3. Forgot password on `/` → branded reset from `aztec_alerts@dentsu.com`
4. Logs: `firebase functions:log --only onActionItemEmailAutomations,onUserEmailAutomations,requestPasswordResetEmail`

## Retired: Google Sheets action-item mirror

`mirrorActionItemToSheet` and `backfillActionItemsSheet` are no longer exported. Source files under `functions/src/sheets.ts` remain in git if anyone needs to restore later. Deploy no longer requires secret `SHEETS_SERVICE_ACCOUNT_JSON`.
