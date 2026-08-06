# Action Items → Google Sheets (Cloud Functions)

Live mirror of Firestore `actionItems/{id}` into a Google Sheet via:

`Firestore onWrite` → Cloud Function → Sheets API

## Prerequisites (you already did these)

1. Google Sheet with tab **ActionItems** and header row:
   `id | taskName | description | assignedTo | section | clientName | status | priority | dueDate | comment | createdAt | updatedAt`
2. Service account `action-items-sheets-sync@vdc200007-ppclientcentre-prod.iam.gserviceaccount.com`
3. Sheet shared with that SA as **Editor**
4. JSON key downloaded for that SA

## One-time setup before deploy

From the **repo root**, logged into Firebase CLI as a project owner/editor:

```bash
# 1) Spreadsheet + tab params (copy example env, fill Sheet ID)
cp functions/.env.example functions/.env
# Edit functions/.env — set SHEETS_SPREADSHEET_ID from the Sheet URL

# 2) Store the service account JSON as a secret (paste entire file contents when prompted)
firebase functions:secrets:set SHEETS_SERVICE_ACCOUNT_JSON
```

`functions/.env` is gitignored. Example:

```
SHEETS_SPREADSHEET_ID=1AbC...yourId...xyz
SHEETS_TAB_NAME=ActionItems
```

## Deploy

```bash
cd functions && npm install && npm run build && cd ..
firebase deploy --only functions
```

Deploys:

| Function | Purpose |
|----------|---------|
| `syncActionItemToSheet` | Live upsert/delete on every `actionItems` write |
| `backfillActionItemsToSheet` | Callable — Admin-only full Sheet rebuild |

## Backfill existing rows

After deploy, open **Administration** in the app and click **Backfill Action Items to Sheet** (Admin only).

Or from a signed-in Admin browser console:

```js
import { getFunctions, httpsCallable } from "firebase/functions";
const fn = httpsCallable(getFunctions(undefined, "us-central1"), "backfillActionItemsToSheet");
const res = await fn();
console.log(res.data); // { written, spreadsheetId, sheetName }
```

## Verify

1. Create / edit / delete an action item in the app
2. Confirm the Sheet row updates (matched by `id` in column A)
3. Check logs: `firebase functions:log --only syncActionItemToSheet`
