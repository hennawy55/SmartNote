const SHEET_NAME = "Data";
const TOKEN = "hanna";
const DATABASE_NAME = "SMART_REAL_ESTATE_NOTEBOOK_V1";

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 3).setValues([["Name", "Data", "UpdatedAt"]]);
  }
  return sheet;
}

function output_(value, callback) {
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + JSON.stringify(value) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorized_(token) {
  return typeof token === "string" && token === TOKEN;
}

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const callback = params.callback || "";
  if (!authorized_(params.token)) return output_({ error: "unauthorized" }, callback);

  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];

  if (params.action === "list") {
    return output_({ spaces: rows.map(row => String(row[0])).filter(Boolean) }, callback);
  }

  if (params.action === "load") {
    const row = rows.find(item => String(item[0]) === params.name);
    if (!row) return output_({ error: "not_found" }, callback);
    try {
      return output_({ name: String(row[0]), data: JSON.parse(row[1]) }, callback);
    } catch (error) {
      return output_({ error: "invalid_saved_data" }, callback);
    }
  }

  return output_({ error: "invalid_action" }, callback);
}

function doPost(e) {
  let request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (error) {
    return output_({ error: "invalid_json" });
  }

  if (!authorized_(request.token)) return output_({ error: "unauthorized" });
  if (!["save", "delete"].includes(request.action)) return output_({ error: "invalid_action" });
  const name = typeof request.name === "string" ? request.name.trim() : "";
  if (!name || name.length > 100) return output_({ error: "invalid_name" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    const rows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
    const index = rows.findIndex(row => String(row[0]) === name);

    if (request.action === "delete") {
      if (index >= 0) sheet.deleteRow(index + 2);
      return output_({ ok: true, deleted: index >= 0, name: name });
    }

    if (!request.data || !Array.isArray(request.data.spaces)) {
      return output_({ error: "invalid_data" });
    }
    const json = JSON.stringify(request.data);
    if (json.length > 45000) return output_({ error: "data_too_large" });

    const targetRow = index < 0 ? lastRow + 1 : index + 2;
    const range = sheet.getRange(targetRow, 1, 1, 3);
    range.setNumberFormat("@");
    range.setValues([[name, json, new Date().toISOString()]]);
    return output_({ ok: true, name: name });
  } finally {
    lock.releaseLock();
  }
}
