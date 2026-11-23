/**
 * SmartNote multi-user backend for Google Apps Script.
 * Configure BOOTSTRAP_KEY in Project Settings > Script properties before deployment.
 */
const USERS_SHEET = "Users";
const SESSIONS_SHEET = "Sessions";
const PART_SIZE = 49900;
const SESSION_DAYS = 30;
const HASH_ROUNDS = 12000;
const UPGRADE_SHEETS = {
  Assignments: ["AssignmentID","Title","Description","Status","Priority","DueAt","CreatedAt","AssignedAt","UpdatedAt","CreatedBy","CreatedByName","OwnerLeaderID","OwnerLeaderName","AssigneeID","AssigneeName","ArchivedAt","ViewedAt","Type","ClientName","ClientPhone"],
  AssignmentActivity: ["ActivityID","AssignmentID","ActorID","ActorName","Action","DetailsJSON","CreatedAt"],
  ReassignmentRequests: ["RequestID","AssignmentID","FromUserID","FromUserName","ToUserID","ToUserName","Reason","Status","RequestedAt","ReviewedAt","ReviewedByID","ReviewedByName"],
  AssignmentNotes: ["NoteID","AssignmentID","AuthorID","AuthorName","Visibility","Body","CreatedAt","UpdatedAt"],
  Notifications: ["NotificationID","UserID","AssignmentID","Type","Title","Body","IsRead","CreatedAt","ReadAt"]
};

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
    if (action === "change_password") return withSession_(req.token, function (user) { return { ok: true, changed: changeOwnPassword_(user, req.oldPassword, req.newPassword) }; });
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
    if (action === "assignment_list") return withSession_(req.token, function (user) { return { ok: true, assignments: listAssignments_(user) }; });
    if (action === "assignment_create") return withSession_(req.token, function (user) { return { ok: true, assignment: createAssignment_(user, req) }; });
    if (action === "assignment_reassign") return withSession_(req.token, function (user) { return { ok: true, assignment: reassignAssignment_(user, req) }; });
    if (action === "assignment_update") return withSession_(req.token, function (user) { return { ok: true, assignment: updateAssignment_(user, req) }; });
    if (action === "assignment_status") return withSession_(req.token, function (user) { return { ok: true, assignment: updateAssignmentStatus_(user, req) }; });
    if (action === "assignment_archive") return withSession_(req.token, function (user) { return { ok: true, archived: archiveAssignment_(user, req.assignmentId, true) }; });
    if (action === "assignment_restore") return withSession_(req.token, function (user) { return { ok: true, restored: archiveAssignment_(user, req.assignmentId, false) }; });
    if (action === "reassignment_request") return withSession_(req.token, function (user) { return { ok: true, request: requestReassignment_(user, req) }; });
    if (action === "reassignment_review") return withSession_(req.token, function (user) { return { ok: true, request: reviewReassignment_(user, req) }; });
    if (action === "assignment_note_add") return withSession_(req.token, function (user) { return { ok: true, note: addAssignmentNote_(user, req) }; });
    if (action === "assignment_detail") return withSession_(req.token, function (user) { return { ok: true, assignment: assignmentDetail_(user, req.assignmentId) }; });
    if (action === "notification_list") return withSession_(req.token, function (user) { return { ok: true, notifications: listNotifications_(user) }; });
    if (action === "notification_read") return withSession_(req.token, function (user) { return { ok: true, read: markNotificationRead_(user, req.notificationId) }; });
    if (action === "leader_users") return withSession_(req.token, function (user) { return { ok: true, users: listAssignableUsers_(user) }; });
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
  return /^(invalid_|same_assignee$|request_pending$|request_not_pending$|cannot_change_own_role$|unauthorized$|forbidden$|inactive_user$|username_exists$|bootstrap_disabled$|bootstrap_already_used$|weak_password$|user_not_found$|cannot_disable_self$|cannot_delete_self$|database_too_large$|database_not_configured$|server_error$)/.test(msg) ? msg : "server_error";
}
function book_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("database_not_configured");
  return SpreadsheetApp.openById(id);
}

/** Run manually once after setting SPREADSHEET_ID. Creates tables without deleting data. */
function setupSmartNoteDatabase() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty("SPREADSHEET_ID"), ss;
  if (id) ss = SpreadsheetApp.openById(id);
  else { ss = SpreadsheetApp.create("SmartNote Upgrade Database"); id = ss.getId(); props.setProperty("SPREADSHEET_ID", id); }
  const specs = [
    { name: USERS_SHEET, headers: ["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","MustChangePassword","DatabaseJSON"] },
    { name: SESSIONS_SHEET, headers: ["TokenHash","UserID","ExpiresAt","CreatedAt","LastSeenAt","DeviceLabel"] },
    ...Object.keys(UPGRADE_SHEETS).map(name => ({name, headers: UPGRADE_SHEETS[name]}))
  ];
  specs.forEach(spec => {
    let sh = ss.getSheetByName(spec.name);
    if (!sh) sh = ss.insertSheet(spec.name);
    if (spec.name === USERS_SHEET) migrateUsersSheetSchema_(sh);
    const existing = sh.getLastRow() ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), spec.headers.length)).getDisplayValues()[0] : [];
    spec.headers.forEach((header,i) => { if (!existing[i]) sh.getRange(1,i+1).setValue(header); else if (existing[i] !== header) throw new Error("schema_mismatch_"+spec.name); });
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, spec.headers.length).setFontWeight("bold");
  });
  ss.getSheetByName(USERS_SHEET).getRange("I:ZZ").setNumberFormat("@");
  createDefaultAdmin_();
  return { ok: true, spreadsheetId: ss.getId(), spreadsheetUrl:ss.getUrl(), sheets: specs.map(s => s.name) };
}
function createDefaultAdmin_() {
  const sh=users_();
  if(sh.getLastRow()>1) return false;
  const salt=randomHex_(16), row=sh.getLastRow()+1;
  sh.getRange(row,1,9).setValues([[Utilities.getUuid(),"admin",hashPassword_("1234567890",salt),salt,"admin","active",new Date().toISOString(),true,"{}"]]);
  return true;
}
/** Migrate old Users columns without discarding account data. */
function migrateUsersSheetSchema_(sh) {
  const lastRow=sh.getLastRow(), lastCol=Math.max(sh.getLastColumn(),9);
  if(!lastRow)return;
  const headers=sh.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const desired=["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","MustChangePassword","DatabaseJSON"];
  if(desired.every((h,i)=>headers[i]===h))return;
  if(headers[7]!=="DatabaseJSON"||headers[8]!=="MustChangePassword") {
    if(headers[7]==="MustChangePassword"&&headers[8]==="DatabaseJSON")return;
    throw new Error("schema_mismatch_Users");
  }
  const rows=lastRow>1?sh.getRange(2,1,lastRow-1,lastCol).getValues():[];
  sh.getRange(1,1,1,9).setValues([desired]);
  rows.forEach((r,i)=>{
    const flag=r[8], hasFlag=flag===true||flag===false||String(flag).toUpperCase()==="TRUE"||String(flag).toUpperCase()==="FALSE";
    const mustChange=hasFlag&&(flag===true||String(flag).toUpperCase()==="TRUE");
    const chunks=[String(r[7]==null?"":r[7])];
    for(let c=8;c<r.length;c++){if(c===8&&hasFlag)continue;if(r[c]!==""&&r[c]!=null)chunks.push(String(r[c]));}
    const json=chunks.join("").replace(/\s+$/,"");
    try{JSON.parse(json||"{}");}catch(e){throw new Error("migration_invalid_saved_data_row_"+(i+2));}
    const parts=splitSafe_(json||"{}");if(parts.length>100)throw new Error("database_too_large");
    sh.getRange(i+2,8).setValue(mustChange);
    const width=Math.max(1,parts.length);
    sh.getRange(i+2,9,1,width).setNumberFormat("@").setValues([parts.concat(Array(width-parts.length).fill(""))]);
    const clearStart=9+width;if(lastCol>=clearStart)sh.getRange(i+2,clearStart,1,lastCol-clearStart+1).clearContent();
  });
  sh.getRange(1,1,1,9).setFontWeight("bold");
}
function setupSmartNoteUpgrade() {
  const result=setupSmartNoteDatabase();
  Logger.log("SmartNote Upgrade database: "+result.spreadsheetUrl);
  Logger.log("First login: username admin; temporary password 1234567890. Change it immediately.");
  return result;
}
function sheet_(name, headers) {
  const ss = book_(); let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}
function users_() {
  const sh = sheet_(USERS_SHEET, ["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","MustChangePassword","DatabaseJSON"]);
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
function publicUser_(u) { return { id: String(u.values[0]), username: String(u.values[1]), role: String(u.values[4]), status: String(u.values[5]), mustChangePassword: u.values[7] === true || String(u.values[7]).toUpperCase() === "TRUE" }; }
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
/**
 * Run manually from the Apps Script editor once the database sheets are initialized.
 * Prompts for the first administrator and refuses to run if an account already exists.
 */
function createFirstAdminFromPrompt() {
  const ui = SpreadsheetApp.getUi();
  const sh = users_();
  if (sh.getLastRow() > 1) {
    ui.alert("SmartNote", "يوجد مستخدمون بالفعل. لن يتم إنشاء مدير أول جديد.", ui.ButtonSet.OK);
    return;
  }
  const usernamePrompt = ui.prompt("إنشاء مدير SmartNote", "أدخل اسم المستخدم (3-40 حرفاً إنجليزياً أو أرقاماً):", ui.ButtonSet.OK_CANCEL);
  if (usernamePrompt.getSelectedButton() !== ui.Button.OK) return;
  const passwordPrompt = ui.prompt("إنشاء كلمة مرور المدير", "أدخل كلمة مرور لا تقل عن 10 أحرف:", ui.ButtonSet.OK_CANCEL);
  if (passwordPrompt.getSelectedButton() !== ui.Button.OK) return;
  const username = cleanUsername_(usernamePrompt.getResponseText());
  const password = passwordPrompt.getResponseText();
  if (!validPassword_(password)) {
    ui.alert("كلمة المرور يجب أن تكون من 10 إلى 128 حرفاً.");
    return;
  }
  const created = insertUser_(username, password, "admin");
  ui.alert("تم إنشاء المدير بنجاح: " + publicUser_(created).username);
}
function cleanUsername_(v) {
  const s = String(v || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(s)) throw new Error("invalid_username");
  return s;
}
function insertUser_(username, password, role) {
  const sh = users_(), salt = randomHex_(16), row = sh.getLastRow() + 1, id = Utilities.getUuid();
  sh.getRange(row, 1, 1, 9).setValues([[id, username, hashPassword_(password, salt), salt, role, "active", new Date().toISOString(), false, "{}"]]);
  return { row: row, values: sh.getRange(row, 1, 1, 9).getValues()[0] };
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
  const safeUser = { row: user.row, values: [String(user.values[0]), String(user.values[1]), "", "", String(user.values[4]), String(user.values[5]), String(user.values[6] || ""), String(user.values[7] || false), ""] };
  if (seconds > 0) CacheService.getScriptCache().put(sessionCacheKey_(tokenHash), JSON.stringify({ user: safeUser, expiresAt: expiresAt }), seconds);
}
function clearSessionCache_(tokenHash) {
  if (tokenHash) CacheService.getScriptCache().remove(sessionCacheKey_(tokenHash));
}
function hashToken_(token) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8)); }
function sessionUser_(token) {
  if (!token || typeof token !== "string" || token.length < 32) throw new Error("unauthorized");
  const wanted = hashToken_(token);
  const sh = sessions_();
  const match = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1)
    .createTextFinder(wanted).matchEntireCell(true).findNext();
  if (!match) throw new Error("unauthorized");
  const row = match.getRow();
  const record = sh.getRange(row, 1, 1, 4).getValues()[0];
  if (Date.parse(record[2]) <= Date.now()) {
    sh.deleteRow(row);
    throw new Error("unauthorized");
  }
  const user = findUserById_(String(record[1]));
  if (!user || String(user.values[5]) !== "active") throw new Error("inactive_user");
  return user;
}
function findUserById_(id) {
  const sh = users_();
  const match = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = match.getRow();
  return { row: row, values: sh.getRange(row, 1, 1, 9).getValues()[0] };
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
  const sh=users_(),lastCol=sh.getLastColumn();
  if(lastCol<9)return {};
  const cells=sh.getRange(row,9,1,lastCol-8).getDisplayValues()[0];
  const joined=cells.map(String).join("").replace(/\\s+$/,"");
  try{return JSON.parse(joined||"{}");}catch(_){throw new Error("invalid_saved_data");}
}
function writeDatabase_(row,json) {
  const parts=splitSafe_(json);
  if(parts.length>100)throw new Error("database_too_large");
  const sh=users_(),startCol=9;
  const oldWidth=Math.max(1,sh.getLastColumn()-startCol+1),width=Math.max(oldWidth,parts.length);
  const values=[Array(width).fill("")];
  for(let i=0;i<parts.length;i++)values[0][i]=parts[i];
  sh.getRange(row,startCol,1,width).setNumberFormat("@").setValues(values);
  sh.getRange(row,7).setValue(new Date().toISOString());
}
function listUsers_() {
  const sh = users_(), rows = sh.getDataRange().getValues();
  return rows.slice(1).map((r, i) => ({ id: String(r[0]), username: String(r[1]), role: String(r[4]), status: String(r[5]), updatedAt: String(r[6]), row: i + 2 }));
}
function createUser_(req) {
  const username = cleanUsername_(req.username);
  if (!validPassword_(req.password)) throw new Error("weak_password");
  if (findUser_(username)) throw new Error("username_exists");
  return publicUser_(insertUser_(username, req.password, ["admin","leader","user"].includes(req.role) ? req.role : "user"));
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
function changeOwnPassword_(u,oldPassword,newPassword){
 if(!validPassword_(newPassword))throw new Error("weak_password");
 if(hashPassword_(String(oldPassword||""),String(u.values[3]))!==String(u.values[2]))throw new Error("unauthorized");
 const salt=randomHex_(16);users_().getRange(u.row,3,1,2).setValues([[hashPassword_(newPassword,salt),salt]]);users_().getRange(u.row,8).setValue(false);users_().getRange(u.row,7).setValue(new Date().toISOString());return true;
}
function revokeUserSessions_(id) {
  const sh = sessions_(), rows = sh.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) if (String(rows[i][1]) === String(id)) { clearSessionCache_(String(rows[i][0])); sh.deleteRow(i + 1); }
}
function deleteUser_(id) {
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  users_().deleteRow(u.row); revokeUserSessions_(id);
}


/* Assignment workflow */
function assignmentSheet_(){const sh=sheet_("Assignments",UPGRADE_SHEETS.Assignments),headers=sh.getLastRow()?sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0]:[];UPGRADE_SHEETS.Assignments.forEach((name,i)=>{if(!headers[i])sh.getRange(1,i+1).setValue(name);else if(headers[i]!==name)throw new Error("schema_mismatch_Assignments");});sh.getRange(1,1,1,UPGRADE_SHEETS.Assignments.length).setFontWeight("bold");return sh;}
function activitySheet_(){return sheet_("AssignmentActivity",UPGRADE_SHEETS.AssignmentActivity);}
function requestSheet_(){return sheet_("ReassignmentRequests",UPGRADE_SHEETS.ReassignmentRequests);}
function notesSheet_(){return sheet_("AssignmentNotes",UPGRADE_SHEETS.AssignmentNotes);}
function notificationSheet_(){return sheet_("Notifications",UPGRADE_SHEETS.Notifications);}
function rowObject_(headers,row){const o={};headers.forEach((h,i)=>o[h]=row[i]);return o;}
function assignmentRows_(){const sh=assignmentSheet_(),v=sh.getDataRange().getValues();return v.length<2?[]:v.slice(1).map((r,i)=>({row:i+2,data:rowObject_(UPGRADE_SHEETS.Assignments,r)}));}
function assignmentById_(id){const x=assignmentRows_().find(x=>String(x.data.AssignmentID)===String(id));return x||null;}
function isAdmin_(u){return String(u.values[4])==="admin";}
function isLeader_(u){return String(u.values[4])==="leader";}
function canManageAssignment_(u,a){return isAdmin_(u)||String(a.OwnerLeaderID)===String(u.values[0]);}
function canSeeAssignment_(u,a){return canManageAssignment_(u,a)||String(a.AssigneeID)===String(u.values[0]);}
function assertAssignmentAccess_(u,a,manage){if(!a||(!canSeeAssignment_(u,a))||(manage&&!canManageAssignment_(u,a)))throw new Error("forbidden");}
function activity_(id,u,action,details){activitySheet_().appendRow([Utilities.getUuid(),id,String(u.values[0]),String(u.values[1]),action,JSON.stringify(details||{}),new Date().toISOString()]);}
function notify_(userId,assignmentId,type,title,body){if(!userId)return;notificationSheet_().appendRow([Utilities.getUuid(),userId,assignmentId||"",type,title,body,false,new Date().toISOString(),""]);}
function assignmentPublic_(a){return {id:String(a.AssignmentID),title:String(a.Title||""),description:String(a.Description||""),type:String(a.Type||"task"),clientName:String(a.ClientName||""),clientPhone:String(a.ClientPhone||""),status:String(a.Status||"new"),priority:String(a.Priority||"normal"),dueAt:String(a.DueAt||""),createdAt:String(a.CreatedAt||""),assignedAt:String(a.AssignedAt||""),updatedAt:String(a.UpdatedAt||""),createdBy:String(a.CreatedBy||""),createdByName:String(a.CreatedByName||""),ownerLeaderId:String(a.OwnerLeaderID||""),ownerLeaderName:String(a.OwnerLeaderName||""),assigneeId:String(a.AssigneeID||""),assigneeName:String(a.AssigneeName||""),archivedAt:String(a.ArchivedAt||""),viewedAt:String(a.ViewedAt||"")};}
function listAssignments_(u){return assignmentRows_().filter(x=>canSeeAssignment_(u,x.data)).map(x=>assignmentPublic_(x.data));}
function listAssignableUsers_(u){return listUsers_().filter(x=>x.status==="active"&&x.id!==String(u.values[0])&&(!isLeader_(u)||x.role!=="admin")).map(x=>({id:x.id,username:x.username,role:x.role}));}
function createAssignment_(u,req){
 if(!isAdmin_(u)&&!isLeader_(u))throw new Error("forbidden");
 const type=req.assignmentType==="client"?"client":"task",clientName=String(req.clientName||"").trim(),clientPhone=String(req.clientPhone||"").trim();
 const title=(type==="client"?clientName:String(req.title||"").trim());if(!title||title.length>180)throw new Error("invalid_title");
 if(type==="client"&&!clientName)throw new Error("invalid_client_name");
 const target=findUserById_(String(req.assigneeId||""));if(!target||String(target.values[5])!=="active"||(isLeader_(u)&&String(target.values[4])==="admin"))throw new Error("user_not_found");
 const id=Utilities.getUuid(),now=new Date().toISOString();
 const ownerId=String(u.values[0]),ownerName=String(u.values[1]);
 const a={AssignmentID:id,Title:title,Description:String(req.description||"").slice(0,5000),Status:"new",Priority:["low","normal","high","urgent"].includes(req.priority)?req.priority:"normal",DueAt:String(req.dueAt||""),CreatedAt:now,AssignedAt:now,UpdatedAt:now,CreatedBy:String(u.values[0]),CreatedByName:String(u.values[1]),OwnerLeaderID:ownerId,OwnerLeaderName:ownerName,AssigneeID:String(target.values[0]),AssigneeName:String(target.values[1]),ArchivedAt:"",ViewedAt:"",Type:type,ClientName:type==="client"?clientName:"",ClientPhone:type==="client"?clientPhone:""};
 assignmentSheet_().appendRow(UPGRADE_SHEETS.Assignments.map(k=>a[k]));activity_(id,u,"created",{assignee:a.AssigneeName});notify_(a.AssigneeID,id,"assigned","متابعة جديدة",title+" — تم إسناد متابعة إليك");
 return assignmentPublic_(a);
}
function reassignAssignment_(u,req){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,true);
 if(!isAdmin_(u)&&!isLeader_(u))throw new Error("forbidden");
 const target=findUserById_(String(req.toUserId||""));
 if(!target||String(target.values[5])!=="active"||String(target.values[0])===String(u.values[0])||(isLeader_(u)&&String(target.values[4])==="admin"))throw new Error("user_not_found");
 if(String(target.values[0])===String(a.AssigneeID))throw new Error("same_assignee");
 const previous=a.AssigneeName,previousId=a.AssigneeID,now=new Date().toISOString();a.AssigneeID=String(target.values[0]);a.AssigneeName=String(target.values[1]);a.AssignedAt=now;a.UpdatedAt=now;a.ViewedAt="";if(a.Status==="viewed")a.Status="new";
 assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);
 activity_(a.AssignmentID,u,"reassigned",{from:previous,to:a.AssigneeName,reason:String(req.reason||"").slice(0,1000)});
 notify_(a.AssigneeID,a.AssignmentID,"assigned","متابعة جديدة",a.Title+" — تم إسناد متابعة إليك");
 notify_(String(previousId||""),a.AssignmentID,"reassigned","تم إعادة إسناد المتابعة",a.Title+" — تم إسنادها إلى "+a.AssigneeName);
 return assignmentPublic_(a);
}
function updateAssignment_(u,req){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,true);
 const sh=assignmentSheet_(),patch=req.patch||{},allowed=["Title","Description","Priority","DueAt"];
 allowed.forEach(k=>{if(Object.prototype.hasOwnProperty.call(patch,k)){if(k==="Title"&&!String(patch[k]).trim())throw new Error("invalid_title");a[k]=String(patch[k]).slice(0,k==="Description"?5000:180);}});
 a.UpdatedAt=new Date().toISOString();sh.getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);activity_(a.AssignmentID,u,"updated",patch);return assignmentPublic_(a);
}
function updateAssignmentStatus_(u,req){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,false);
 const status=String(req.status||"");if(!["new","viewed","in_progress","paused","completed","cancelled"].includes(status))throw new Error("invalid_status");
 a.Status=status;a.UpdatedAt=new Date().toISOString();if(!a.ViewedAt&&String(u.values[0])===String(a.AssigneeID)){a.ViewedAt=a.UpdatedAt;activity_(a.AssignmentID,u,"viewed",{});}
 assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);activity_(a.AssignmentID,u,"status_changed",{status:status});if(status==="completed"){notify_(a.OwnerLeaderID,a.AssignmentID,"completed","تم إغلاق المتابعة",a.Title+" — تم إغلاقها");}return assignmentPublic_(a);
}
function archiveAssignment_(u,id,archive){const x=assignmentById_(id);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,true);x.data.ArchivedAt=archive?new Date().toISOString():"";x.data.UpdatedAt=new Date().toISOString();assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>x.data[k])]);activity_(id,u,archive?"archived":"restored",{});return true;}
function requestReassignment_(u,req){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,false);
 if(String(a.AssigneeID)!==String(u.values[0]))throw new Error("forbidden");
 const target=findUserById_(String(req.toUserId||"")),reason=String(req.reason||"").trim();if(!target||String(target.values[5])!=="active")throw new Error("user_not_found");if(!reason)throw new Error("invalid_reason");
 const pending=requestSheet_().getDataRange().getValues().slice(1).some(r=>String(r[1])===String(a.AssignmentID)&&String(r[7])==="pending");if(pending)throw new Error("request_pending");
 const now=new Date().toISOString(),id=Utilities.getUuid();requestSheet_().appendRow([id,a.AssignmentID,String(u.values[0]),String(u.values[1]),String(target.values[0]),String(target.values[1]),reason,"pending",now,"","",""]);
 activity_(a.AssignmentID,u,"reassignment_requested",{to:target.values[1],reason});notify_(a.OwnerLeaderID,a.AssignmentID,"reassignment_request","طلب إعادة إسناد",a.Title+" — "+reason);return {id:id,status:"pending"};
}
function reviewReassignment_(u,req){
 const id=String(req.requestId||""),sh=requestSheet_(),rows=sh.getDataRange().getValues();let row=-1,r;
 for(let i=1;i<rows.length;i++)if(String(rows[i][0])===id){row=i+1;r=rows[i];break;}
 if(row<0)throw new Error("user_not_found");const x=assignmentById_(r[1]);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,true);
 if(String(x.data.OwnerLeaderID)!==String(u.values[0])&&!isAdmin_(u))throw new Error("forbidden");if(String(r[7])!=="pending")throw new Error("request_not_pending");
 const approve=req.approve===true,now=new Date().toISOString();sh.getRange(row,8,1,5).setValues([[approve?"approved":"rejected",now,String(u.values[0]),String(u.values[1]),""]]);
 if(approve){const target=findUserById_(String(r[4]));if(!target||String(target.values[5])!=="active")throw new Error("user_not_found");x.data.AssigneeID=String(target.values[0]);x.data.AssigneeName=String(target.values[1]);x.data.OwnerLeaderID=String(target.values[0]);x.data.OwnerLeaderName=String(target.values[1]);x.data.AssignedAt=now;x.data.UpdatedAt=now;assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>x.data[k])]);notify_(x.data.AssigneeID,x.data.AssignmentID,"assigned","متابعة محولة إليك",x.data.Title);}
 activity_(x.data.AssignmentID,u,approve?"reassignment_approved":"reassignment_rejected",{requestId:id});notify_(r[2],x.data.AssignmentID,"reassignment_result",approve?"تمت الموافقة على النقل":"تم رفض النقل",x.data.Title);return {id:id,status:approve?"approved":"rejected"};
}
function addAssignmentNote_(u,req){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,false);
 const visibility=req.visibility==="shared"?"shared":"private",body=String(req.body||"").trim();if(!body)throw new Error("invalid_note");
 if(visibility==="shared"&&!canManageAssignment_(u,x.data)&&String(u.values[0])!==String(x.data.AssigneeID))throw new Error("forbidden");
 const now=new Date().toISOString(),id=Utilities.getUuid();notesSheet_().appendRow([id,x.data.AssignmentID,String(u.values[0]),String(u.values[1]),visibility,body,now,now]);activity_(x.data.AssignmentID,u,"note_added",{visibility:visibility});return {id:id,visibility:visibility,body:body,createdAt:now};
}
function assignmentDetail_(u,id){
 const x=assignmentById_(id);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,false);
 if(!x.data.ViewedAt&&String(x.data.AssigneeID)===String(u.values[0])){x.data.ViewedAt=new Date().toISOString();if(x.data.Status==="new")x.data.Status="viewed";x.data.UpdatedAt=x.data.ViewedAt;assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>x.data[k])]);activity_(id,u,"viewed",{});}
 const notes=notesSheet_().getDataRange().getValues().slice(1).filter(r=>String(r[1])===String(id)&&(String(r[4])==="shared"||String(r[2])===String(u.values[0]))).map(r=>({id:r[0],authorId:r[2],authorName:r[3],visibility:r[4],body:r[5],createdAt:r[6]}));
 const activity=activitySheet_().getDataRange().getValues().slice(1).filter(r=>String(r[1])===String(id)).map(r=>({actorName:r[3],action:r[4],details:(()=>{try{return JSON.parse(r[5]||"{}")}catch(e){return {}}})(),createdAt:r[6]}));
 const requests=requestSheet_().getDataRange().getValues().slice(1).filter(r=>String(r[1])===String(id)&&(isAdmin_(u)||String(r[2])===String(u.values[0])||String(x.data.OwnerLeaderID)===String(u.values[0]))).map(r=>({id:r[0],fromUserName:r[3],toUserName:r[5],reason:r[6],status:r[7],requestedAt:r[8]}));
 return { ...assignmentPublic_(x.data),notes:notes,activity:activity,requests:requests };
}
function listNotifications_(u){return notificationSheet_().getDataRange().getValues().slice(1).filter(r=>String(r[1])===String(u.values[0])).map(r=>({id:r[0],assignmentId:r[2],type:r[3],title:r[4],body:r[5],isRead:r[6]===true||String(r[6])==="TRUE",createdAt:r[7]})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));}
function markNotificationRead_(u,id){const sh=notificationSheet_(),rows=sh.getDataRange().getValues();for(let i=1;i<rows.length;i++)if(String(rows[i][0])===String(id)&&String(rows[i][1])===String(u.values[0])){sh.getRange(i+1,7).setValue(true);sh.getRange(i+1,9).setValue(new Date().toISOString());return true;}throw new Error("user_not_found");}

function setUserRole_(id, role, adminId) {
  if (!["admin", "leader", "user"].includes(role)) throw new Error("invalid_role");
  const u = findUserById_(String(id)); if (!u) throw new Error("user_not_found");
  if (String(id) === String(adminId)) throw new Error("cannot_change_own_role");
  users_().getRange(u.row, 5).setValue(role);
  revokeUserSessions_(id);
  return true;
}
