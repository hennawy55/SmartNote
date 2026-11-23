/**
 * SmartNote multi-user backend for Google Apps Script.
 * Configure BOOTSTRAP_KEY in Project Settings > Script properties before deployment.
 */
const USERS_SHEET = "Users";
const SESSIONS_SHEET = "Sessions";
const PART_SIZE = 49900;
const SESSION_DAYS = 30;
const HASH_ROUNDS = 12000;

function doGet() {
  return json_({ ok: true, service: "SmartNote API", version: 2 });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e && e.postData && e.postData.contents || "{}"); }
  catch (_) { return json_({ error: "invalid_json" }); }
  try {
    const action = String(req.action || "");
    if (action === "bootstrap") return bootstrap_(req);
    if (action === "login") return login_(req);
    if (action === "logout") return logout_(req);
    if (action === "me") return withSession_(req.token, function (user) { return { ok: true, user: publicUser_(user), data: readDatabase_(user.row) }; });
    if (action === "load") return withSession_(req.token, function (user) { return { ok: true, data: readDatabase_(user.row) }; });
    if (action === "save") return withSession_(req.token, function (user) {
      if (!req.data || typeof req.data !== "object" || Array.isArray(req.data)) throw new Error("invalid_data");
      writeDatabase_(user.row, JSON.stringify(req.data));
      return { ok: true, saved: true };
    });
    if (action === "admin_list") return withAdmin_(req.token, function () { return { ok: true, users: listUsers_() }; });
    if (action === "admin_create") return withAdmin_(req.token, function () { return { ok: true, user: createUser_(req) }; });
    if (action === "admin_status") return withAdmin_(req.token, function () { return { ok: true, updated: setUserStatus_(req.userId, req.status) }; });
    if (action === "admin_role") return withAdmin_(req.token, function (admin) { return { ok: true, updated: setUserRole_(req.userId, req.role, admin.values[0]) }; });
    if (action === "admin_reset_password") return withAdmin_(req.token, function () { resetPassword_(req.userId, req.password); return { ok: true }; });
    if (action === "admin_delete") return withAdmin_(req.token, function () { deleteUser_(req.userId); return { ok: true }; });
    throw new Error("invalid_action");
  } catch (err) {
    return json_({ error: safeError_(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeError_(err) {
  const msg = String(err && err.message || "server_error");
  return /^(invalid_|unauthorized$|forbidden$|inactive_user$|username_exists$|bootstrap_disabled$|bootstrap_already_used$|weak_password$|user_not_found$|cannot_disable_self$|cannot_delete_self$|database_too_large$|database_not_configured$|server_error$)/.test(msg) ? msg : "server_error";
}
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("database_not_configured");
  return SpreadsheetApp.openById(id);
}

/** Run manually once after setting SPREADSHEET_ID. Creates tables without deleting data. */
function setupSmartNoteDatabase() {
  const ss = book_();
  const specs = [
    { name: USERS_SHEET, headers: ["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","DatabaseJSON"] },
    { name: SESSIONS_SHEET, headers: ["TokenHash","UserID","ExpiresAt","CreatedAt","LastSeenAt","DeviceLabel"] }
  ];
  specs.forEach(spec => {
    let sh = ss.getSheetByName(spec.name);
    if (!sh) sh = ss.insertSheet(spec.name);
    const existing = sh.getRange(1, 1, 1, spec.headers.length).getDisplayValues()[0];
    if (sh.getLastRow() === 0 || existing.every(v => !v)) sh.getRange(1, 1, 1, spec.headers.length).setValues([spec.headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, spec.headers.length).setFontWeight("bold");
  });
  ss.getSheetByName(USERS_SHEET).getRange("H:H").setNumberFormat("@");
  return { ok: true, spreadsheetId: ss.getId(), sheets: specs.map(s => s.name) };
}
function sheet_(name, headers) {
  const ss = book_(); let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}
function users_() {
  const sh = sheet_(USERS_SHEET, ["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","DatabaseJSON"]);
  return sh;
}
function sessions_() { return sheet_(SESSIONS_SHEET, ["TokenHash","UserID","ExpiresAt","CreatedAt","LastSeenAt","DeviceLabel"]); }
function randomHex_(n) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + "|" + Date.now() + "|" + Math.random());
  return bytes.slice(0, n).map(b => ("0" + ((b + 256) % 256).toString(16)).slice(-2)).join("");
}
function hashPassword_(password, salt) {
  let value = salt + "|" + password;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    value = Utilities.base64EncodeWebSafe(bytes);
  }
  return value;
}
function validPassword_(p) { return typeof p === "string" && p.length >= 10 && p.length <= 128; }
function findUser_(username) {
  const sh = users_(), values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][1]).toLowerCase() === String(username).toLowerCase()) return { row: i + 1, values: values[i] };
  return null;
}
function publicUser_(u) { return { id: String(u.values[0]), username: String(u.values[1]), role: String(u.values[4]), status: String(u.values[5]) }; }
function bootstrap_(req) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty("BOOTSTRAP_KEY");
  if (!key) throw new Error("bootstrap_disabled");
  if (props.getProperty("BOOTSTRAP_USED") === "1") throw new Error("bootstrap_already_used");
  if (!req.bootstrapKey || req.bootstrapKey !== key) throw new Error("unauthorized");
  const username = cleanUsername_(req.username);
  if (!validPassword_(req.password)) throw new Error("weak_password");
  if (findUser_(username)) throw new Error("username_exists");
  const user = insertUser_(username, req.password, "admin");
  props.setProperty("BOOTSTRAP_USED", "1");
  props.deleteProperty("BOOTSTRAP_KEY");
  return json_({ ok: true, user: publicUser_(user) });
}
function cleanUsername_(v) {
  const s = String(v || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(s)) throw new Error("invalid_username");
  return s;
}
function insertUser_(username, password, role) {
  const sh = users_(), salt = randomHex_(16), row = sh.getLastRow() + 1, id = Utilities.getUuid();
  sh.getRange(row, 1, 1, 7).setValues([[id, username, hashPassword_(password, salt), salt, role, "active", new Date().toISOString()]]);
  sh.getRange(row, 8).setNumberFormat("@").setValue("{}");
  return { row: row, values: sh.getRange(row, 1, 1, 8).getValues()[0] };
}
function login_(req) {
  const username = cleanUsername_(req.username), found = findUser_(username);
  if (!found || String(found.values[5]) !== "active" || hashPassword_(String(req.password || ""), String(found.values[3])) !== String(found.values[2])) throw new Error("unauthorized");
  const token = randomHex_(32), sh = sessions_(), now = new Date(), expiry = new Date(now.getTime() + SESSION_DAYS * 86400000);
  const tokenHash = hashToken_(token), expiresAt = expiry.toISOString();
  sh.appendRow([tokenHash, String(found.values[0]), expiresAt, now.toISOString()]);
  cacheSession_(tokenHash, found, expiresAt);
  return json_({ ok: true, token: token, user: publicUser_(found), data: readDatabase_(found.row) });
}
function sessionCacheKey_(tokenHash) { return "smartnote_session_" + tokenHash; }
function cacheSession_(tokenHash, user, expiresAt) {
  const seconds = Math.max(1, Math.min(21600, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
  // Never put password hashes or salts in the shared script cache.
  const safeUser = { row: user.row, values: [String(user.values[0]), String(user.values[1]), "", "", String(user.values[4]), String(user.values[5]), String(user.values[6] || "")] };
  if (seconds > 0) CacheService.getScriptCache().put(sessionCacheKey_(tokenHash), JSON.stringify({ user: safeUser, expiresAt: expiresAt }), seconds);
}
function clearSessionCache_(tokenHash) {
  if (tokenHash) CacheService.getScriptCache().remove(sessionCacheKey_(tokenHash));
}
function hashToken_(token) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8)); }
function sessionUser_(token) {
  if (!token || typeof token !== "string" || token.length < 32) throw new Error("unauthorized");
  const wanted = hashToken_(token), now = Date.now(), cache = CacheService.getScriptCache();
  const cached = cache.get(sessionCacheKey_(wanted));
  if (cached) {
    try {
      const item = JSON.parse(cached);
      if (Date.parse(item.expiresAt) > now && item.user && String(item.user.values[5]) === "active") return item.user;
      clearSessionCache_(wanted);
    } catch (_) { clearSessionCache_(wanted); }
  }
  const sh = sessions_(), rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) !== wanted) continue;
    if (Date.parse(rows[i][2]) <= now) { sh.deleteRow(i + 1); clearSessionCache_(wanted); throw new Error("unauthorized"); }
    const u = findUserById_(String(rows[i][1]));
    if (!u || String(u.values[5]) !== "active") { clearSessionCache_(wanted); throw new Error("inactive_user"); }
    cacheSession_(wanted, u, String(rows[i][2]));
    return u;
  }
  throw new Error("unauthorized");
}
function findUserById_(id) {
  const sh = users_(), rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) return { row: i + 1, values: rows[i] };
  return null;
}
function withSession_(token, fn) { return json_(fn(sessionUser_(token))); }
function withAdmin_(token, fn) { const u = sessionUser_(token); if (String(u.values[4]) !== "admin") throw new Error("forbidden"); return json_(fn(u)); }
function logout_(req) {
  const sh = sessions_(), rows = sh.getDataRange().getValues(), wanted = hashToken_(String(req.token || ""));
  for (let i = rows.length - 1; i >= 1; i--) if (String(rows[i][0]) === wanted) sh.deleteRow(i + 1);
  return json_({ ok: true });
}
function splitSafe_(text) {
  const parts = []; let start = 0;
  while (start < text.length) {
    let end = Math.min(start + PART_SIZE, text.length);
    if (end < text.length && end > start && /[\uD800-\uDBFF]/.test(text.charAt(end - 1)) && /[\uDC00-\uDFFF]/.test(text.charAt(end))) end--;
    parts.push(text.slice(start, end)); start = end;
  }
  return parts.length ? parts : [""];
}
function readDatabase_(row) {
  const sh = users_(), lastCol = sh.getLastColumn();
  if (lastCol < 8) return {};
  const cells = sh.getRange(row, 8, 1, lastCol - 7).getDisplayValues()[0];
  const joined = cells.map(String).join("").replace(/\s+$/, "");
  try { return JSON.parse(joined || "{}"); } catch (_) { throw new Error("invalid_saved_data"); }
}
function writeDatabase_(row, json) {
  const parts = splitSafe_(json);
  if (parts.length > 100) throw new Error("database_too_large");
  const sh = users_(), oldWidth = Math.max(1, sh.getLastColumn() - 7), width = Math.max(oldWidth, parts.length);
  const values = [Array(width).fill("")];
  for (let i = 0; i < parts.length; i++) values[0][i] = parts[i];
  sh.getRange(row, 8, 1, width).setNumberFormat("@").setValues(values);
  sh.getRange(row, 7).setValue(new Date().toISOString());
}
function listUsers_() {
  const sh = users_(), rows = sh.getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({ id: String(r[0]), username: String(r[1]), role: String(r[4]), status: String(r[5]), updatedAt: String(r[6]), row: i + 2 }));
}
function createUser_(req) {
  const username = cleanUsername_(req.username);
  if (!validPassword_(req.password)) throw new Error("weak_password");
  if (findUser_(username)) throw new Error("username_exists");
  return publicUser_(insertUser_(username, req.password, "user"));
}
function setUserStatus_(id, status) {
  if (!["active", "disabled"].includes(status)) throw new Error("invalid_status");
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  u.values[5] = status; users_().getRange(u.row, 6).setValue(status); if (status !== "active") revokeUserSessions_(id); return true;
}
function resetPassword_(id, password) {
  if (!validPassword_(password)) throw new Error("weak_password");
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  const salt = randomHex_(16), sh = users_();
  sh.getRange(u.row, 3, 1, 2).setValues([[hashPassword_(password, salt), salt]]);
  revokeUserSessions_(id);
}
function revokeUserSessions_(id) {
  const sh = sessions_(), rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (String(rows[i][1]) === String(id)) { clearSessionCache_(String(rows[i][0])); sh.deleteRow(i + 1); }
}
function deleteUser_(id) {
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  users_().deleteRow(u.row); revokeUserSessions_(id);
}

function setUserRole_(id, role, adminId) {
  if (!["admin", "user"].includes(role)) throw new Error("invalid_role");
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  if (String(id) === String(adminId)) throw new Error("cannot_change_own_role");
  users_().getRange(u.row, 5).setValue(role);
  revokeUserSessions_(id);
  return true;
}
