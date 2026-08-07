import {initializeApp} from "firebase-admin/app";
import * as functions from "firebase-functions/v1";
import {defineString} from "firebase-functions/params";
import {logger} from "firebase-functions";
import {actionItemToRow, ActionItemDoc} from "./action-item-row";
import {
  deleteActionItemRow,
  getSheetsClient,
  upsertActionItemRow,
  SheetsSyncConfig,
} from "./sheets";

/**
 * 1st gen Firestore trigger only (no HTTPS callable).
 * Callables need invoker IAM (Owner). Backfill is done from the Admin UI by
 * touching actionItems docs so this trigger runs for each row.
 */

initializeApp();

const sheetsSpreadsheetId = defineString("SHEETS_SPREADSHEET_ID", {
  default: "1NnLAuCjA4ZeaH116jzbVVajkYX3lytxbZVxOGocLWSs",
  description: "Google Sheet ID from the spreadsheet URL",
});

const sheetsTabName = defineString("SHEETS_TAB_NAME", {
  default: "ActionItems",
  description: "Tab/sheet name that holds action item rows",
});

/** Base64 of the Sheets writer service-account JSON (single line, no Secret Manager). */
const sheetsServiceAccountJsonB64 = defineString("SHEETS_SERVICE_ACCOUNT_JSON_B64", {
  description: "Base64-encoded Google service account JSON for Sheets API",
});

function syncConfig(): SheetsSyncConfig {
  const spreadsheetId = sheetsSpreadsheetId.value()?.trim();
  // Strip whitespace/newlines/quotes — .env pastes often wrap and break base64
  const b64 = (sheetsServiceAccountJsonB64.value() || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, "");

  if (!spreadsheetId) {
    throw new Error("SHEETS_SPREADSHEET_ID is not set");
  }
  if (!b64) {
    throw new Error(
      "SHEETS_SERVICE_ACCOUNT_JSON_B64 is not set — add it to functions/.env.vdc200007-ppclientcentre-prod"
    );
  }

  let serviceAccountJson: string;
  try {
    serviceAccountJson = Buffer.from(b64, "base64").toString("utf8").trim();
  } catch {
    throw new Error("SHEETS_SERVICE_ACCOUNT_JSON_B64 could not be base64-decoded");
  }

  try {
    const parsed = JSON.parse(serviceAccountJson) as {client_email?: string; private_key?: string};
    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error("decoded JSON missing client_email or private_key");
    }
  } catch (e: unknown) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(
      `SHEETS_SERVICE_ACCOUNT_JSON_B64 is not valid service-account JSON after decode (${hint}). ` +
        `Regenerate with: base64 -w 0 key.json  and put on ONE line in .env with no quotes.`
    );
  }

  return {
    spreadsheetId,
    sheetName: sheetsTabName.value() || "ActionItems",
    serviceAccountJson,
  };
}

/** Live sync: create/update/delete on actionItems/{id} → Google Sheets. */
export const mirrorActionItemToSheet = functions
  .region("us-central1")
  .runWith({
    timeoutSeconds: 120,
    memory: "256MB",
  })
  .firestore.document("actionItems/{id}")
  .onWrite(async (change, context) => {
    const id = context.params.id as string;
    const config = syncConfig();
    const sheets = await getSheetsClient(config);

    if (!change.after.exists) {
      const removed = await deleteActionItemRow(sheets, config, id);
      logger.info("actionItems delete mirrored to Sheets", {id, removed});
      return;
    }

    const data = change.after.data() as ActionItemDoc;
    const row = actionItemToRow(id, data);
    const result = await upsertActionItemRow(sheets, config, row);
    logger.info("actionItems upsert mirrored to Sheets", {id, result});
  });
