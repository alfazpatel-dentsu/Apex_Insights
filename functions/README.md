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

All product alert emails are sent with **Microsoft Graph** (client credentials).  
This works with **Okta** — no mailbox password / SMTP AUTH is required.

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

### Setup for IT (Entra ID / Microsoft 365) — Option 2

Ask Identity / M365 admin to:

1. Confirm mailbox **`aztec_alerts@dentsu.com`** exists (shared or user mailbox).
2. In **Entra ID (Azure AD)** → **App registrations** → **New registration**  
   - Name example: `AZTEC Control Center Alerts`  
   - Accounts: this organizational directory only  
3. Note **Application (client) ID** and **Directory (tenant) ID**.
4. **Certificates & secrets** → **New client secret** → copy the **Value** once (this is `MS_GRAPH_CLIENT_SECRET`).
5. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → add **`Mail.Send`** → **Grant admin consent**.
6. (Recommended) Restrict the app so it can only send as this mailbox using an Exchange **Application Access Policy** (limits `Mail.Send` to `aztec_alerts@dentsu.com`).
7. Send these three values to the Firebase admin (securely):
   - Tenant ID  
   - Client ID  
   - Client secret  

### Setup in Firebase (after IT provides values)

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
# paste the Entra client secret when prompted
```

3. Grant the Functions runtime service account **Secret Manager Secret Accessor** on `MS_GRAPH_CLIENT_SECRET`.

4. Deploy:

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions:action-items-sheets,firestore:rules
```

If prompted about deleting `acceptInvite`, choose **No**.

5. In the app (Admin → **Automations**), send a **Test email** and confirm From `aztec_alerts@dentsu.com`.

### Auth password-reset emails

Invite / reset emails from Firebase Auth (`sendPasswordResetEmail`) are separate from these alerts. Branding those with `aztec_alerts@dentsu.com` needs Firebase Auth SMTP (or a custom invite flow) and is **not** covered by Graph automations above.

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
