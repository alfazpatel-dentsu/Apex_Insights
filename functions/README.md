# Action Items → Google Sheets (Cloud Functions)

`Firestore onWrite` → **1st gen** Cloud Function → Sheets API

Uses codebase `action-items-sheets` (does not touch `acceptInvite`).

## Why no Secret Manager?

Org IAM blocks `secretmanager.secrets.setIamPolicy` without Owner.
The Sheets service-account JSON is stored as a **base64 function param** in
`functions/.env.vdc200007-ppclientcentre-prod` (gitignored) instead.

## One-time: add the SA key as base64

```bash
# Download a NEW JSON key for ction-items-sheets-sync@... (rotate if exposed)
# Then:
base64 -w 0 /path/to/sa-key.json
# copy the single-line output
```

Edit (or create) `functions/.env.vdc200007-ppclientcentre-prod`:

```
SHEETS_SPREADSHEET_ID=1NnLAuCjA4ZeaH116jzbVVajkYX3lytxbZVxOGocLWSs
SHEETS_TAB_NAME=ActionItems
SHEETS_SERVICE_ACCOUNT_JSON_B64=paste_base64_here
```

Then delete the local JSON key file.

Sheet must stay shared with  
`ction-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com` as **Editor**.

## Deploy

```bash
cd ~/studio
git fetch origin && git checkout cursor/sheets-sync-v1-functions-f139
# ensure .env.vdc200007-ppclientcentre-prod has the B64 line (above)

cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions
```

If asked to delete `acceptInvite` → **No**.

| Function | Purpose |
|----------|---------|
| `mirrorActionItemToSheet` | Live upsert/delete |
| `backfillActionItemsSheet` | Admin full rebuild |

```bash
firebase functions:list
```

## Backfill

Admin → **Backfill Action Items to Sheet**
