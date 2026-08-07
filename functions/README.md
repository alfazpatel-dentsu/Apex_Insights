# Action Items → Google Sheets (Cloud Functions)

Live mirror of Firestore `actionItems/{id}` into a Google Sheet via:

`Firestore onWrite` → **1st gen** Cloud Function → Sheets API

> Uses **1st gen** Functions (same as `acceptInvite`) so deploy works with Editor
> without Eventarc / Cloud Run invoker Owner permissions.
> Codebase name: `action-items-sheets` (does not touch `acceptInvite`).

## Prerequisites

1. Google Sheet tab **ActionItems** (auto-created if missing)
2. Service account `ction-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com` shared on the Sheet as **Editor**
3. Secret `SHEETS_SERVICE_ACCOUNT_JSON` already set
4. Compute SA has **Secret Manager Secret Accessor** (already done)

## Deploy

```bash
cd ~/studio
git pull origin cursor/sheets-sync-v1-functions-f139   # or main after merge
cd functions && npm ci && npm run build && cd ..

# Deploy ONLY this codebase (won't delete acceptInvite)
firebase deploy --only functions:action-items-sheets
```

If prompted about deleting `acceptInvite`, choose **No**.

Expected functions:

| Function | Purpose |
|----------|---------|
| `mirrorActionItemToSheet` | Live upsert/delete on every `actionItems` write |
| `backfillActionItemsSheet` | Callable — Admin-only full Sheet rebuild |

```bash
firebase functions:list
```

## Backfill

Admin → **Backfill Action Items to Sheet**

## Verify

1. Create / edit / delete an action item → Sheet row updates (key = `id`)
2. Logs: `firebase functions:log --only mirrorActionItemToSheet`
