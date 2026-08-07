# Action Items → Google Sheets (Cloud Functions)

`Firestore onWrite` → **1st gen** `mirrorActionItemToSheet` → Sheets API

No HTTPS callable (Invoker IAM needs Owner). Admin **Backfill** touches
each `actionItems` doc in the browser so this trigger syncs every row.

Codebase: `action-items-sheets` (does not delete `acceptInvite`).

## Env (gitignored)

`functions/.env.vdc200007-ppclientcentre-prod`:

```
SHEETS_SPREADSHEET_ID=1NnLAuCjA4ZeaH116jzbVVajkYX3lytxbZVxOGocLWSs
SHEETS_TAB_NAME=ActionItems
SHEETS_SERVICE_ACCOUNT_JSON_B64=<base64 -w 0 sa-key.json>
```

Sheet shared with `ction-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com` as Editor.

## Deploy

```bash
cd functions && npm ci && npm run build && cd ..
firebase deploy --only functions
```

If asked to delete `acceptInvite` → **No**.  
If asked to delete `backfillActionItemsSheet` (old callable) → **Yes** (safe to remove).

```bash
firebase functions:list
# expect: acceptInvite, mirrorActionItemToSheet
```

## Backfill / verify

1. Admin → **Backfill Action Items to Sheet** (touches docs; Sheet fills over ~1–2 min)
2. Or create/edit one action item and confirm the Sheet row updates
3. Logs: `firebase functions:log --only mirrorActionItemToSheet`
