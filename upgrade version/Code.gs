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
  Notifications: ["NotificationID","UserID","AssignmentID","Type","Title","Body","IsRead","CreatedAt","ReadAt"],
  AuditLog: ["AuditID","ActorID","ActorName","Action","TargetID","DetailsJSON","CreatedAt","Outcome"],
  UserDatabaseMeta: ["UserID","Revision","UpdatedAt"]
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
    if (action === "change_password") return withSession_(req.token, function (user) { return { ok: true, changed: changeOwnPassword_(user, req.oldPassword, req.newPassword, req.token) }; });
    if (action === "me") return withSession_(req.token, function (user) { const snapshot=readDatabaseSnapshot_(String(user.values[0])); return { ok: true, user: publicUser_(user), data: snapshot.data, revision: snapshot.revision }; });
    if (action === "load") return withSession_(req.token, function (user) { const snapshot=readDatabaseSnapshot_(String(user.values[0])); return { ok: true, data: snapshot.data, revision: snapshot.revision }; });
    if (action === "save") return withSession_(req.token, function (user) {
      if (!req.data || typeof req.data !== "object" || Array.isArray(req.data)) throw new Error("invalid_data");
      const saved=writeDatabase_(String(user.values[0]), JSON.stringify(req.data), req.revision);
      return { ok: true, saved: true, revision: saved.revision };
    });
    if (action === "admin_list") return withAdmin_(req.token, function () { return { ok: true, users: listUsers_() }; });
    if (action === "admin_audit_list") return withAdmin_(req.token, function () { return {ok:true,entries:listAudit_()}; });
    if (action === "admin_create") return withAdmin_(req.token, function (admin) { return { ok: true, user: createUser_(req,admin) }; });
    if (action === "admin_status") return withAdmin_(req.token, function (admin) { return { ok: true, updated: setUserStatus_(req.userId, req.status,admin) }; });
    if (action === "admin_role") return withAdmin_(req.token, function (admin) { return { ok: true, updated: setUserRole_(req.userId, req.role, admin) }; });
    if (action === "admin_reset_password") return withAdmin_(req.token, function (admin) { resetPassword_(req.userId, req.password,admin); return { ok: true }; });
    if (action === "admin_delete") return withAdmin_(req.token, function (admin) { if(String(req.userId)===String(admin.values[0]))throw new Error("cannot_delete_self"); deleteUser_(req.userId,admin); return { ok: true }; });
    if (action === "assignment_list") return withSession_(req.token, function (user) { return { ok: true, assignments: listAssignments_(user) }; });
    if (action === "assignment_archived_list") return withSession_(req.token, function (user) { return {ok:true,assignments:listArchivedAssignments_(user)}; });
    if (action === "assignment_create") return withSession_(req.token, function (user) { return { ok: true, assignment: createAssignment_(user, req) }; });
    if (action === "assignment_reassign") return withSession_(req.token, function (user) { return { ok: true, assignment: reassignAssignment_(user, req) }; });
    if (action === "assignment_update") return withSession_(req.token, function (user) { return { ok: true, assignment: updateAssignment_(user, req) }; });
    if (action === "assignment_status") return withSession_(req.token, function (user) { return { ok: true, assignment: updateAssignmentStatus_(user, req) }; });
    if (action === "assignment_archive") return withSession_(req.token, function (user) { return { ok: true, archived: archiveAssignment_(user, req.assignmentId, true) }; });
    if (action === "assignment_restore") return withSession_(req.token, function (user) { return { ok: true, restored: archiveAssignment_(user, req.assignmentId, false) }; });
    if (action === "reassignment_request") return withSession_(req.token, function (user) { return { ok: true, request: requestReassignment_(user, req) }; });
    if (action === "reassignment_review") return withSession_(req.token, function (user) { return { ok: true, request: reviewReassignment_(user, req) }; });
    if (action === "assignment_note_add") return withSession_(req.token, function (user) { return { ok: true, note: addAssignmentNote_(user, req) }; });
    if (action === "assignment_detail") return withSession_(req.token, function (user) { return { ok: true, assignment: assignmentDetail_(user, req.assignmentId, false) }; });
    if (action === "assignment_history") return withSession_(req.token, function (user) { return { ok: true, history: assignmentHistory_(user, req.assignmentId) }; });
    if (action === "assignment_targets") return withSession_(req.token, function (user) { const x=assignmentById_(req.assignmentId); if(!x)throw new Error("user_not_found"); assertAssignmentAccess_(user,x.data,true); return {ok:true,users:listAssignableUsers_(user,req.excludeUserId)}; });
    if (action === "reassignment_targets") return withSession_(req.token, function (user) { const x=assignmentById_(req.assignmentId); if(!x)throw new Error("user_not_found"); assertAssignmentAccess_(user,x.data,false); if(String(x.data.AssigneeID)!==String(user.values[0]))throw new Error("forbidden"); return {ok:true,users:listAssignableUsers_(user,req.excludeUserId)}; });
    if (action === "notification_list") return withSession_(req.token, function (user) { const page=listNotifications_(user,req.cursor); return {ok:true,notifications:page.items,nextCursor:page.nextCursor,hasMore:page.hasMore,unreadCount:page.unreadCount,totalCount:page.totalCount}; });
    if (action === "notification_read") return withSession_(req.token, function (user) { return { ok: true, read: markNotificationRead_(user, req.notificationId) }; });
    if (action === "leader_users") return withSession_(req.token, function (user) { if(!isAdmin_(user)&&!isLeader_(user))throw new Error("forbidden"); return { ok: true, users: listAssignableUsers_(user, req.excludeUserId) }; });
    throw new Error("invalid_action");
  } catch (err) {
    return json_({ error: safeError_(err) });
  }
}

function audit_(actor,action,targetId,details,outcome) {
  try {
    const u=actor&&actor.values?actor:null;
    sheet_("AuditLog",UPGRADE_SHEETS.AuditLog).appendRow([Utilities.getUuid(),u?String(u.values[0]):"",u?String(u.values[1]):"",String(action||""),String(targetId||""),JSON.stringify(details||{}),new Date().toISOString(),String(outcome||"success")]);
  } catch(error) { console.error("Audit log write failed",error); }
}
function listAudit_() {
  const sh=sheet_("AuditLog",UPGRADE_SHEETS.AuditLog),last=sh.getLastRow();if(last<2)return [];
  const start=Math.max(2,last-199),rows=sh.getRange(start,1,last-start+1,8).getValues();
  return rows.reverse().map(r=>({id:r[0],actorName:r[2],action:r[3],targetId:r[4],details:(()=>{try{return JSON.parse(r[5]||"{}")}catch(_){return {}}})(),createdAt:r[6],outcome:r[7]}));
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function safeError_(err) {
  const msg=String(err&&err.message||"server_error");
  return /^(invalid_|data_conflict$|same_assignee$|request_pending$|request_not_pending$|request_stale$|cannot_change_own_role$|cannot_delete_self$|unauthorized$|forbidden$|inactive_user$|username_exists$|bootstrap_disabled$|bootstrap_already_used$|weak_password$|user_not_found$|cannot_disable_self$|database_too_large$|database_not_configured$|user_has_active_assignments$|user_has_pending_requests$|user_manages_active_assignments$|cannot_disable_self$|last_active_admin$|operation_in_progress$|too_many_attempts$|server_error$)/.test(msg)?"server_error"===msg?msg:msg:"server_error";
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
  const sh=users_();if(sh.getLastRow()>1)return false;
  const password=randomHex_(20),salt=randomHex_(16),row=sh.getLastRow()+1,props=PropertiesService.getScriptProperties();
  sh.getRange(row,1,1,9).setValues([[Utilities.getUuid(),"admin",hashPassword_(password,salt),salt,"admin","active",new Date().toISOString(),true,"{}"]]);
  props.setProperty("INITIAL_ADMIN_PASSWORD",password);
  audit_(null,"initial_admin_created","",{username:"admin",mustChangePassword:true},"success");
  return true;
}
function getInitialAdminCredentials(){
  const props=PropertiesService.getScriptProperties(),password=props.getProperty("INITIAL_ADMIN_PASSWORD");
  if(!password){Logger.log("No one-time initial administrator password is pending.");return null;}
  Logger.log("Username: admin");
  Logger.log("Temporary password: "+password);
  Logger.log("Change this password immediately after the first login.");
  return {username:"admin",temporaryPassword:password};
}
/** Migrate old Users columns without discarding account data. */
function migrateUsersSheetSchema_(sh) {
  const lastRow=sh.getLastRow(),lastCol=Math.max(sh.getLastColumn(),9);
  if(!lastRow)return;
  const headers=sh.getRange(1,1,1,lastCol).getDisplayValues()[0];
  const desired=["UserID","Username","PasswordHash","Salt","Role","Status","UpdatedAt","MustChangePassword","DatabaseJSON"];
  if(desired.every((h,i)=>headers[i]===h))return;
  if(headers[7]==="MustChangePassword"&&headers[8]==="DatabaseJSON")return;
  if(headers[7]!=="DatabaseJSON")throw new Error("schema_mismatch_Users");
  const backupName=("Users_backup_"+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyyMMdd_HHmmss")).slice(0,99);
  if(!book_().getSheetByName(backupName))sh.copyTo(book_()).setName(backupName);
  const rows=lastRow>1?sh.getRange(2,1,lastRow-1,lastCol).getValues():[];
  const hasFlagColumn=headers[8]==="MustChangePassword";
  // Prepare and validate every account payload before modifying the live sheet.
  const migrated=rows.map((r,i)=>{
    const flag=hasFlagColumn?r[8]:false,mustChange=flag===true||String(flag).toUpperCase()==="TRUE";
    const chunks=[String(r[7]==null?"":r[7])];
    for(let c=8;c<r.length;c++){if(hasFlagColumn&&c===8)continue;if(r[c]!==""&&r[c]!=null)chunks.push(String(r[c]));}
    const json=chunks.join("").replace(/\\s+$/,"");
    try{JSON.parse(json||"{}");}catch(e){throw new Error("migration_invalid_saved_data_row_"+(i+2));}
    const parts=splitSafe_(json||"{}");if(parts.length>100)throw new Error("database_too_large");
    return {mustChange:mustChange,parts:parts};
  });
  const width=Math.max(1,...migrated.map(x=>x.parts.length));
  if(migrated.length){
    sh.getRange(2,8,migrated.length,1).setValues(migrated.map(x=>[x.mustChange]));
    sh.getRange(2,9,migrated.length,width).setNumberFormat("@").setValues(migrated.map(x=>x.parts.concat(Array(width-x.parts.length).fill(""))));
    const clearStart=9+width;if(lastCol>=clearStart)sh.getRange(2,clearStart,migrated.length,lastCol-clearStart+1).clearContent();
  }
  sh.getRange(1,1,1,9).setValues([desired]);sh.getRange(1,1,1,9).setFontWeight("bold");
}
function setupSmartNoteUpgrade() {
  const result=setupSmartNoteDatabase();
  Logger.log("SmartNote Upgrade database: "+result.spreadsheetUrl);
  Logger.log("If this is a new database, run getInitialAdminCredentials() once in the Apps Script editor to retrieve the generated one-time password.");
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
  const sh=users_(),last=sh.getLastRow();if(last<2)return null;
  const values=sh.getRange(2,1,last-1,8).getValues();
  for(let i=0;i<values.length;i++)if(String(values[i][1]).toLowerCase()===String(username).toLowerCase())return {row:i+2,values:values[i].concat([""])};
  return null;
}
function publicUser_(u) { return { id: String(u.values[0]), username: String(u.values[1]), role: String(u.values[4]), status: String(u.values[5]), mustChangePassword: u.values[7] === true || String(u.values[7]).toUpperCase() === "TRUE" }; }
function bootstrap_(req) {
  return withScriptLock_(function(){
    const props=PropertiesService.getScriptProperties(),key=props.getProperty("BOOTSTRAP_KEY");
    if(!key)throw new Error("bootstrap_disabled");if(props.getProperty("BOOTSTRAP_USED")==="1")throw new Error("bootstrap_already_used");
    if(!req.bootstrapKey||req.bootstrapKey!==key)throw new Error("unauthorized");
    const username=cleanUsername_(req.username);if(!validPassword_(req.password))throw new Error("weak_password");if(findUser_(username))throw new Error("username_exists");
    const user=insertUser_(username,req.password,"admin");props.setProperty("BOOTSTRAP_USED","1");props.deleteProperty("BOOTSTRAP_KEY");
    return json_({ok:true,user:publicUser_(user)});
  });
}
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
  return { row: row, values: sh.getRange(row, 1, 1, 8).getValues()[0].concat([""]) };
}
function login_(req) {
  const username=cleanUsername_(req.username),cache=CacheService.getScriptCache(),attemptKey="smartnote_login_fail_"+hashToken_(username.toLowerCase()),attempts=Number(cache.get(attemptKey)||0);
  if(attempts>=5)throw new Error("too_many_attempts");
  const found=findUser_(username),valid=found&&String(found.values[5])==="active"&&hashPassword_(String(req.password||""),String(found.values[3]))===String(found.values[2]);
  if(!valid){cache.put(attemptKey,String(attempts+1),900);audit_(null,"login_failed",found?String(found.values[0]):"",{username:username}, "denied");throw new Error("unauthorized");}
  cache.remove(attemptKey);audit_(found,"login_success",String(found.values[0]),{deviceLabel:String(req.deviceLabel||"")},"success");
  const token=randomHex_(32),sh=sessions_(),now=new Date(),expiry=new Date(now.getTime()+SESSION_DAYS*86400000),tokenHash=hashToken_(token),expiresAt=expiry.toISOString();
  sh.appendRow([tokenHash,String(found.values[0]),expiresAt,now.toISOString(),now.toISOString(),String(req.deviceLabel||"")]);
  cacheSession_(tokenHash,found,expiresAt);
  const snapshot=readDatabaseSnapshot_(String(found.values[0]));
  return json_({ok:true,token:token,user:publicUser_(found),data:snapshot.data,revision:snapshot.revision});
}
function sessionCacheKey_(tokenHash) { return "smartnote_session_" + tokenHash; }
function cacheSession_(tokenHash, user, expiresAt) {
  const seconds = Math.max(1, Math.min(21600, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
  // Cache stable identity only; spreadsheet row numbers change when users are deleted.
  const safeUser = { values: [String(user.values[0]), String(user.values[1]), "", "", String(user.values[4]), String(user.values[5]), String(user.values[6] || ""), String(user.values[7] || false), ""] };
  if (seconds > 0) CacheService.getScriptCache().put(sessionCacheKey_(tokenHash), JSON.stringify({ user: safeUser, expiresAt: expiresAt, lastSeenAt: Date.now() }), seconds);
}
function touchSession_(tokenHash,entry,key){
  if(Date.now()-Number(entry.lastSeenAt||0)<300000)return;
  const sh=sessions_(),last=sh.getLastRow();if(last<2){CacheService.getScriptCache().remove(key);throw new Error("unauthorized");}
  const match=sh.getRange(2,1,last-1,1).createTextFinder(tokenHash).matchEntireCell(true).findNext();
  if(!match){CacheService.getScriptCache().remove(key);throw new Error("unauthorized");}
  const now=new Date().toISOString();sh.getRange(match.getRow(),5).setValue(now);entry.lastSeenAt=Date.now();
  const seconds=Math.max(1,Math.min(21600,Math.floor((Date.parse(entry.expiresAt)-Date.now())/1000)));
  CacheService.getScriptCache().put(key,JSON.stringify(entry),seconds);
}
function clearSessionCache_(tokenHash) {
  if (tokenHash) CacheService.getScriptCache().remove(sessionCacheKey_(tokenHash));
}
function hashToken_(token) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8)); }
function sessionUser_(token) {
  if (!token || typeof token !== "string" || token.length < 32) throw new Error("unauthorized");
  const wanted=hashToken_(token),cache=CacheService.getScriptCache(),key=sessionCacheKey_(wanted),cached=cache.get(key);
  if(cached){
    try{
      const entry=JSON.parse(cached),cachedId=String(entry.user&&entry.user.values&&entry.user.values[0]||"");
      if(entry.expiresAt&&Date.parse(entry.expiresAt)>Date.now()&&cachedId){
        const currentUser=findUserById_(cachedId);
        if(!currentUser||String(currentUser.values[5])!=="active"){cache.remove(key);throw new Error("inactive_user");}
        touchSession_(wanted,entry,key);
        cacheSession_(wanted,currentUser,String(entry.expiresAt));
        return currentUser;
      }
    }catch(error){cache.remove(key);if(error&&error.message==="inactive_user")throw error;}
  }
  const sh=sessions_(),last=sh.getLastRow();if(last<2)throw new Error("unauthorized");
  const match=sh.getRange(2,1,last-1,1).createTextFinder(wanted).matchEntireCell(true).findNext();
  if(!match)throw new Error("unauthorized");
  const row=match.getRow(),record=sh.getRange(row,1,1,4).getValues()[0],expiry=Date.parse(record[2]);
  if(!Number.isFinite(expiry)||expiry<=Date.now()){sh.deleteRow(row);cache.remove(key);throw new Error("unauthorized");}
  const user=findUserById_(String(record[1]));
  if(!user||String(user.values[5])!=="active"){cache.remove(key);throw new Error("inactive_user");}
  cacheSession_(wanted,user,String(record[2]));return user;
}
function findUserById_(id) {
  const sh = users_();
  const match = sh.getRange(2, 1, Math.max(1, sh.getLastRow() - 1), 1)
    .createTextFinder(String(id)).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = match.getRow();
  return { row: row, values: sh.getRange(row, 1, 1, 8).getValues()[0].concat([""]) };
}
function withScriptLock_(fn) { const lock=LockService.getScriptLock(); if(!lock.tryLock(15000))throw new Error("operation_in_progress"); try{return fn();}finally{lock.releaseLock();} }
function withSession_(token, fn) { return json_(fn(sessionUser_(token))); }
function withAdmin_(token, fn) { const u = sessionUser_(token); if (String(u.values[4]) !== "admin") throw new Error("forbidden"); return json_(fn(u)); }
function logout_(req) {
  const token=String(req.token||"");if(!token)return json_({ok:true});
  const sh=sessions_(),rows=sh.getDataRange().getValues(),wanted=hashToken_(token);
  for(let i=rows.length-1;i>=1;i--)if(String(rows[i][0])===wanted){clearSessionCache_(wanted);sh.deleteRow(i+1);}
  return json_({ok:true});
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
function databaseMeta_() {
  return sheet_("UserDatabaseMeta", UPGRADE_SHEETS.UserDatabaseMeta);
}
function databaseMetaRecord_(userId) {
  const sh=databaseMeta_(),last=sh.getLastRow();
  const match=last>=2?sh.getRange(2,1,last-1,1).createTextFinder(String(userId)).matchEntireCell(true).findNext():null;
  if(!match)return {sheet:sh,row:0,revision:0};
  const row=match.getRow(),revision=Number(sh.getRange(row,2).getValue())||0;
  return {sheet:sh,row:row,revision:revision};
}
function readDatabaseSnapshot_(userId) {
  return withScriptLock_(function(){
    const user=findUserById_(String(userId));if(!user)throw new Error("inactive_user");
    const sh=users_(),lastCol=sh.getLastColumn();let data={};
    if(lastCol>=9){
      const cells=sh.getRange(user.row,9,1,lastCol-8).getDisplayValues()[0];
      const joined=cells.map(String).join("").replace(/\\s+$/, "");
      try{data=JSON.parse(joined||"{}");}catch(_){throw new Error("invalid_saved_data");}
    }
    const meta=databaseMetaRecord_(userId);
    return {data:data,revision:meta.revision};
  });
}
function writeDatabase_(userId,json,expectedRevision) {
  return withScriptLock_(function(){
    const user=findUserById_(String(userId));if(!user)throw new Error("inactive_user");
    const meta=databaseMetaRecord_(userId);
    if(!Number.isInteger(Number(expectedRevision))||Number(expectedRevision)!==meta.revision)throw new Error("data_conflict");
    const parts=splitSafe_(json);if(parts.length>100)throw new Error("database_too_large");
    const sh=users_(),startCol=9,oldWidth=Math.max(1,sh.getLastColumn()-startCol+1),width=Math.max(oldWidth,parts.length),values=[Array(width).fill("")];
    for(let i=0;i<parts.length;i++)values[0][i]=parts[i];
    sh.getRange(user.row,startCol,1,width).setNumberFormat("@").setValues(values);
    const now=new Date().toISOString();sh.getRange(user.row,7).setValue(now);
    const nextRevision=meta.revision+1;
    if(meta.row)meta.sheet.getRange(meta.row,1,1,3).setValues([[String(userId),nextRevision,now]]);
    else meta.sheet.appendRow([String(userId),nextRevision,now]);
    return {revision:nextRevision};
  });
}
function listUsers_() {
  const sh=users_(),last=sh.getLastRow();if(last<2)return [];
  const rows=sh.getRange(2,1,last-1,8).getValues();
  return rows.map((r,i)=>({id:String(r[0]),username:String(r[1]),role:String(r[4]),status:String(r[5]),updatedAt:String(r[6]),row:i+2}));
}
function createUser_(req,actor) {
  return withScriptLock_(function(){
    const username=cleanUsername_(req.username);if(!validPassword_(req.password))throw new Error("weak_password");if(findUser_(username))throw new Error("username_exists");
    const created=insertUser_(username,req.password,["admin","leader","user"].includes(req.role)?req.role:"user");
    audit_(actor,"user_created",String(created.values[0]),{username:username,role:String(created.values[4])},"success");return publicUser_(created);
  });
}
function setUserStatus_(id,status,actor) {
  return withScriptLock_(function(){
    if(!["active","disabled"].includes(status))throw new Error("invalid_status");
    const u=findUserById_(String(id));if(!u)throw new Error("user_not_found");
    if(status==="disabled"&&actor&&String(actor.values[0])===String(id))throw new Error("cannot_disable_self");
    if(status==="disabled"&&isLastActiveAdmin_(id))throw new Error("last_active_admin");
    if(status==="disabled"){
      const active=assignmentRows_().some(x=>!String(x.data.ArchivedAt||"")&&(String(x.data.AssigneeID)===String(id)||String(x.data.OwnerLeaderID)===String(id)));
      if(active)throw new Error("user_has_active_assignments");
      const pending=requestSheet_().getDataRange().getValues().slice(1).some(r=>(String(r[2])===String(id)||String(r[4])===String(id))&&String(r[7])==="pending");
      if(pending)throw new Error("user_has_pending_requests");
    }
    users_().getRange(u.row,6).setValue(status);if(status!=="active")revokeUserSessions_(id);audit_(actor,"user_status_changed",id,{status:status},"success");return true;
  });
}
function resetPassword_(id,password,actor) {
  return withScriptLock_(function(){
    if(!validPassword_(password))throw new Error("weak_password");
    const u=findUserById_(String(id));if(!u)throw new Error("user_not_found");
    const salt=randomHex_(16),sh=users_();sh.getRange(u.row,3,1,2).setValues([[hashPassword_(password,salt),salt]]);
    sh.getRange(u.row,8).setValue(true);revokeUserSessions_(id);audit_(actor,"password_reset",id,{mustChangePassword:true},"success");
  });
}
function changeOwnPassword_(u,oldPassword,newPassword,currentToken){
 return withScriptLock_(function(){
  if(!validPassword_(newPassword))throw new Error("weak_password");
  const actual=findUserById_(String(u.values[0]));if(!actual)throw new Error("user_not_found");
  if(hashPassword_(String(oldPassword||""),String(actual.values[3]))!==String(actual.values[2]))throw new Error("unauthorized");
  const salt=randomHex_(16),sh=users_();sh.getRange(actual.row,3,1,2).setValues([[hashPassword_(newPassword,salt),salt]]);sh.getRange(actual.row,8).setValue(false);sh.getRange(actual.row,7).setValue(new Date().toISOString());if(String(actual.values[4])==="admin")PropertiesService.getScriptProperties().deleteProperty("INITIAL_ADMIN_PASSWORD");revokeUserSessionsExcept_(String(actual.values[0]),currentToken);clearSessionCache_(hashToken_(String(currentToken||"")));audit_(actual,"password_changed",String(actual.values[0]),{otherSessionsRevoked:true},"success");return true;
 });
}
function revokeUserSessions_(id) {
  const sh=sessions_(),rows=sh.getDataRange().getValues();
  for(let i=rows.length-1;i>=1;i--)if(String(rows[i][1])===String(id)){clearSessionCache_(String(rows[i][0]));sh.deleteRow(i+1);}
}
function revokeUserSessionsExcept_(id,keepToken) {
  const keepHash=hashToken_(String(keepToken||"")),sh=sessions_(),rows=sh.getDataRange().getValues();
  for(let i=rows.length-1;i>=1;i--)if(String(rows[i][1])===String(id)&&String(rows[i][0])!==keepHash){clearSessionCache_(String(rows[i][0]));sh.deleteRow(i+1);}
}
function deleteUser_(id,actor) {
  return withScriptLock_(function(){
    const u=findUserById_(String(id));if(!u)throw new Error("user_not_found");
    if(isLastActiveAdmin_(id))throw new Error("last_active_admin");
    const active=assignmentRows_().filter(x=>!String(x.data.ArchivedAt||"")&&(String(x.data.AssigneeID)===String(id)||String(x.data.OwnerLeaderID)===String(id)));
    if(active.length)throw new Error("user_has_active_assignments");
    const pending=requestSheet_().getDataRange().getValues().slice(1).some(r=>(String(r[2])===String(id)||String(r[4])===String(id))&&String(r[7])==="pending");
    if(pending)throw new Error("user_has_pending_requests");
    users_().deleteRow(u.row);revokeUserSessions_(id);audit_(actor,"user_deleted",id,{},"success");return true;
  });
}
function assignmentSheet_(){const sh=sheet_("Assignments",UPGRADE_SHEETS.Assignments),headers=sh.getLastRow()?sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getDisplayValues()[0]:[];UPGRADE_SHEETS.Assignments.forEach((name,i)=>{if(!headers[i])sh.getRange(1,i+1).setValue(name);else if(headers[i]!==name)throw new Error("schema_mismatch_Assignments");});sh.getRange(1,1,1,UPGRADE_SHEETS.Assignments.length).setFontWeight("bold");return sh;}
function activitySheet_(){return sheet_("AssignmentActivity",UPGRADE_SHEETS.AssignmentActivity);}
function requestSheet_(){return sheet_("ReassignmentRequests",UPGRADE_SHEETS.ReassignmentRequests);}
function notesSheet_(){return sheet_("AssignmentNotes",UPGRADE_SHEETS.AssignmentNotes);}
function notificationSheet_(){return sheet_("Notifications",UPGRADE_SHEETS.Notifications);}
function rowObject_(headers,row){const o={};headers.forEach((h,i)=>o[h]=row[i]);return o;}
function clearAssignmentCache_(){CacheService.getScriptCache().remove("smartnote_assignment_rows_v1");}
function assignmentRows_(){
 const cache=CacheService.getScriptCache(),key="smartnote_assignment_rows_v1",cached=cache.get(key);
 if(cached){try{return JSON.parse(cached)}catch(_){cache.remove(key)}}
 const sh=assignmentSheet_(),v=sh.getDataRange().getValues();
 const rows=v.length<2?[]:v.slice(1).map((r,i)=>({row:i+2,data:rowObject_(UPGRADE_SHEETS.Assignments,r)}));
 const serialized=JSON.stringify(rows);if(serialized.length<90000)cache.put(key,serialized,15);
 return rows;
}
function assignmentById_(id){
 const sh=assignmentSheet_(),last=sh.getLastRow();if(last<2)return null;
 const match=sh.getRange(2,1,last-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();
 if(!match)return null;const row=match.getRow(),values=sh.getRange(row,1,1,UPGRADE_SHEETS.Assignments.length).getValues()[0];
 return {row:row,data:rowObject_(UPGRADE_SHEETS.Assignments,values)};
}
function isAdmin_(u){return String(u.values[4])==="admin";}
function isLastActiveAdmin_(id){const admins=listUsers_().filter(u=>u.role==="admin"&&u.status==="active");return admins.length<=1&&admins.some(u=>u.id===String(id));}
function isLeader_(u){return String(u.values[4])==="leader";}
function canManageAssignment_(u,a){return isAdmin_(u)||String(a.OwnerLeaderID)===String(u.values[0]);}
function canSeeAssignment_(u,a){return canManageAssignment_(u,a)||String(a.AssigneeID)===String(u.values[0]);}
function assertAssignmentAccess_(u,a,manage){if(!a||(!canSeeAssignment_(u,a))||(manage&&!canManageAssignment_(u,a)))throw new Error("forbidden");}
function activity_(id,u,action,details){activitySheet_().appendRow([Utilities.getUuid(),id,String(u.values[0]),String(u.values[1]),action,JSON.stringify(details||{}),new Date().toISOString()]);}
function stalePendingReassignmentRequests_(assignmentId,actor){
 const sh=requestSheet_(),rows=sh.getDataRange().getValues(),now=new Date().toISOString();
 for(let i=1;i<rows.length;i++)if(String(rows[i][1])===String(assignmentId)&&String(rows[i][7])==="pending"){
   sh.getRange(i+1,8,1,5).setValues([["stale",now,String(actor.values[0]),String(actor.values[1]),"assignment_changed"]]);
   notify_(String(rows[i][2]),assignmentId,"reassignment_result","انتهى طلب إعادة الإسناد","تم تغيير مسؤول المتابعة قبل مراجعة الطلب.");
 }
}
function notify_(userId,assignmentId,type,title,body){if(!userId)return;notificationSheet_().appendRow([Utilities.getUuid(),userId,assignmentId||"",type,title,body,false,new Date().toISOString(),""]);}
function assignmentPublic_(a){const type=String(a.Type||"task"),clientName=String(a.ClientName||"");let title=String(a.Title||"");if(type==="client"){title=clientName||title.replace(/^متابعة عميل\s*:\s*/,"");}return {id:String(a.AssignmentID),title:title,description:String(a.Description||""),type:type,clientName:clientName,clientPhone:String(a.ClientPhone||""),status:String(a.Status||"new"),priority:String(a.Priority||"normal"),dueAt:String(a.DueAt||""),createdAt:String(a.CreatedAt||""),assignedAt:String(a.AssignedAt||""),updatedAt:String(a.UpdatedAt||""),createdBy:String(a.CreatedBy||""),createdByName:String(a.CreatedByName||""),ownerLeaderId:String(a.OwnerLeaderID||""),ownerLeaderName:String(a.OwnerLeaderName||""),assigneeId:String(a.AssigneeID||""),assigneeName:String(a.AssigneeName||""),archivedAt:String(a.ArchivedAt||""),viewedAt:String(a.ViewedAt||"")};}
function listAssignments_(u){return assignmentRows_().filter(x=>!String(x.data.ArchivedAt||"")&&canSeeAssignment_(u,x.data)).map(x=>assignmentPublic_(x.data));}
function listArchivedAssignments_(u){return assignmentRows_().filter(x=>String(x.data.ArchivedAt||"")&&canManageAssignment_(u,x.data)).map(x=>assignmentPublic_(x.data));}
function listAssignableUsers_(u,excludeId){const excluded=new Set([String(u.values[0]),String(excludeId||"")]);return listUsers_().filter(x=>x.status==="active"&&!excluded.has(x.id)&&(isAdmin_(u)||x.role!=="admin")).map(x=>({id:x.id,username:x.username,role:x.role}));}
function createAssignment_(u,req){
 return withScriptLock_(function(){
 if(!isAdmin_(u)&&!isLeader_(u))throw new Error("forbidden");
 const type=req.assignmentType==="client"?"client":"task",clientName=String(req.clientName||"").trim(),clientPhone=String(req.clientPhone||"").trim();
 const title=(type==="client"?clientName:String(req.title||"").trim());if(!title||title.length>180)throw new Error("invalid_title");
 if(type==="client"&&(!clientName||!clientPhone||clientPhone.length>30))throw new Error("invalid_client_phone");
 const target=findUserById_(String(req.assigneeId||""));if(!target||String(target.values[5])!=="active"||String(target.values[0])===String(u.values[0])||(isLeader_(u)&&String(target.values[4])==="admin"))throw new Error("user_not_found");
 const id=Utilities.getUuid(),now=new Date().toISOString(),ownerId=String(u.values[0]),ownerName=String(u.values[1]);
 const a={AssignmentID:id,Title:title,Description:String(req.description||"").slice(0,5000),Status:"new",Priority:["low","normal","high","urgent"].includes(req.priority)?req.priority:"normal",DueAt:String(req.dueAt||""),CreatedAt:now,AssignedAt:now,UpdatedAt:now,CreatedBy:ownerId,CreatedByName:ownerName,OwnerLeaderID:ownerId,OwnerLeaderName:ownerName,AssigneeID:String(target.values[0]),AssigneeName:String(target.values[1]),ArchivedAt:"",ViewedAt:"",Type:type,ClientName:type==="client"?clientName:"",ClientPhone:type==="client"?clientPhone:""};
 assignmentSheet_().appendRow(UPGRADE_SHEETS.Assignments.map(k=>a[k]));clearAssignmentCache_();activity_(id,u,"created",{assignee:a.AssigneeName});notify_(a.AssigneeID,id,"assigned","متابعة جديدة",title+" — تم إسناد متابعة إليك");
 return assignmentPublic_(a);
 });
}
function reassignAssignment_(u,req){
 return withScriptLock_(function(){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,true);
 if(!canManageAssignment_(u,a))throw new Error("forbidden");
 const target=findUserById_(String(req.toUserId||""));
 if(!target||String(target.values[5])!=="active"||String(target.values[0])===String(u.values[0])||(!isAdmin_(u)&&String(target.values[4])==="admin"))throw new Error("user_not_found");
 if(String(target.values[0])===String(a.AssigneeID))throw new Error("same_assignee");
 const previous=a.AssigneeName,previousId=a.AssigneeID,now=new Date().toISOString();a.AssigneeID=String(target.values[0]);a.AssigneeName=String(target.values[1]);a.AssignedAt=now;a.UpdatedAt=now;a.ViewedAt="";if(a.Status==="viewed")a.Status="new";
 assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);clearAssignmentCache_();stalePendingReassignmentRequests_(a.AssignmentID,u);
 activity_(a.AssignmentID,u,"reassigned",{from:previous,to:a.AssigneeName});notify_(a.AssigneeID,a.AssignmentID,"assigned","متابعة جديدة",a.Title+" — تم إسناد متابعة إليك");notify_(String(previousId||""),a.AssignmentID,"reassigned","تم إعادة إسناد المتابعة",a.Title+" — تم إسنادها إلى "+a.AssigneeName);
 return assignmentPublic_(a);
 });
}
function updateAssignment_(u,req){
 return withScriptLock_(function(){
  const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,true);
  const sh=assignmentSheet_(),patch=req.patch||{},allowed=["Title","Description","Priority","DueAt"];
  allowed.forEach(k=>{if(Object.prototype.hasOwnProperty.call(patch,k)){if(k==="Title"&&!String(patch[k]).trim())throw new Error("invalid_title");if(k==="Priority"&&!["low","normal","high","urgent"].includes(String(patch[k])))throw new Error("invalid_priority");a[k]=String(patch[k]).slice(0,k==="Description"?5000:180);}});
  a.UpdatedAt=new Date().toISOString();sh.getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);clearAssignmentCache_();activity_(a.AssignmentID,u,"updated",patch);return assignmentPublic_(a);
 });
}
function updateAssignmentStatus_(u,req){
 return withScriptLock_(function(){
  const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,false);
  const status=String(req.status||"");if(!["new","viewed","in_progress","paused","completed","cancelled"].includes(status))throw new Error("invalid_status");
  if(a.Status===status)return assignmentPublic_(a);
  a.Status=status;a.UpdatedAt=new Date().toISOString();if(!a.ViewedAt&&String(u.values[0])===String(a.AssigneeID)){a.ViewedAt=a.UpdatedAt;activity_(a.AssignmentID,u,"viewed",{});}
  assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>a[k])]);clearAssignmentCache_();activity_(a.AssignmentID,u,"status_changed",{status:status});
  if(status==="completed")notify_(a.OwnerLeaderID,a.AssignmentID,"completed","تم إغلاق المتابعة",a.Title+" — تم إغلاقها");
  return assignmentPublic_(a);
 });
}
function archiveAssignment_(u,id,archive){return withScriptLock_(function(){const x=assignmentById_(id);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,true);x.data.ArchivedAt=archive?new Date().toISOString():"";x.data.UpdatedAt=new Date().toISOString();assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>x.data[k])]);clearAssignmentCache_();activity_(id,u,archive?"archived":"restored",{});return true;});}
function requestReassignment_(u,req){
 return withScriptLock_(function(){
 const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");const a=x.data;assertAssignmentAccess_(u,a,false);
 if(String(a.AssigneeID)!==String(u.values[0]))throw new Error("forbidden");
 const target=findUserById_(String(req.toUserId||"")),reason=String(req.reason||"").trim();
 if(!target||String(target.values[5])!=="active"||String(target.values[4])==="admin")throw new Error("user_not_found");
 if(String(target.values[0])===String(u.values[0])||String(target.values[0])===String(a.AssigneeID))throw new Error("same_assignee");
 if(!reason)throw new Error("invalid_reason");
 const pending=requestSheet_().getDataRange().getValues().slice(1).some(r=>String(r[1])===String(a.AssignmentID)&&String(r[7])==="pending");if(pending)throw new Error("request_pending");
 const now=new Date().toISOString(),id=Utilities.getUuid();requestSheet_().appendRow([id,a.AssignmentID,String(u.values[0]),String(u.values[1]),String(target.values[0]),String(target.values[1]),reason,"pending",now,"","",""]);
 activity_(a.AssignmentID,u,"reassignment_requested",{to:target.values[1],reason});notify_(a.OwnerLeaderID,a.AssignmentID,"reassignment_request","طلب إعادة إسناد",a.Title+" — "+reason);return {id:id,status:"pending"};
 });
}
function reviewReassignment_(u,req){
 return withScriptLock_(function(){
 const id=String(req.requestId||""),sh=requestSheet_(),rows=sh.getDataRange().getValues();let row=-1,r;
 for(let i=1;i<rows.length;i++)if(String(rows[i][0])===id){row=i+1;r=rows[i];break;}
 if(row<0)throw new Error("user_not_found");const x=assignmentById_(r[1]);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,true);
 if(String(x.data.OwnerLeaderID)!==String(u.values[0])&&!isAdmin_(u))throw new Error("forbidden");
 if(String(r[7])!=="pending")throw new Error("request_not_pending");
 if(String(r[2])!==String(x.data.AssigneeID)){sh.getRange(row,8,1,5).setValues([["stale",new Date().toISOString(),String(u.values[0]),String(u.values[1]),"assignee_changed"]]);activity_(x.data.AssignmentID,u,"reassignment_stale",{requestId:id});notify_(String(r[2]),x.data.AssignmentID,"reassignment_result","انتهى طلب إعادة الإسناد","تغير المسؤول الحالي قبل مراجعة الطلب.");throw new Error("request_stale");}
 const approve=req.approve===true,now=new Date().toISOString();let target=null;
 if(approve){target=findUserById_(String(r[4]));if(!target||String(target.values[5])!=="active")throw new Error("user_not_found");}
 // Validate the target before mutating either sheet row.
 const originalAssignment=JSON.parse(JSON.stringify(x.data));
  if(approve){
   x.data.AssigneeID=String(target.values[0]);x.data.AssigneeName=String(target.values[1]);x.data.AssignedAt=now;x.data.UpdatedAt=now;x.data.ViewedAt="";
   if(x.data.Status==="viewed")x.data.Status="new";
   assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>x.data[k])]);clearAssignmentCache_();
  }
  try{sh.getRange(row,8,1,5).setValues([[approve?"approved":"rejected",now,String(u.values[0]),String(u.values[1]),""]]);}
  catch(writeError){if(approve){assignmentSheet_().getRange(x.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>originalAssignment[k])]);clearAssignmentCache_();}throw writeError;}
 activity_(x.data.AssignmentID,u,approve?"reassignment_approved":"reassignment_rejected",{requestId:id,to:approve?target.values[1]:""});
 if(approve)notify_(x.data.AssigneeID,x.data.AssignmentID,"assigned","متابعة محولة إليك",x.data.Title);
 notify_(r[2],x.data.AssignmentID,"reassignment_result",approve?"تمت الموافقة على النقل":"تم رفض النقل",x.data.Title);
 return {id:id,status:approve?"approved":"rejected"};
 });
}
function addAssignmentNote_(u,req){
 return withScriptLock_(function(){
  const x=assignmentById_(req.assignmentId);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,false);
  const visibility=req.visibility==="shared"?"shared":"private",body=String(req.body||"").trim();if(!body||body.length>5000)throw new Error("invalid_note");
  const now=new Date().toISOString(),id=Utilities.getUuid();notesSheet_().appendRow([id,x.data.AssignmentID,String(u.values[0]),String(u.values[1]),visibility,body,now,now]);activity_(x.data.AssignmentID,u,"note_added",{visibility:visibility});return {id:id,visibility:visibility,body:body,createdAt:now};
 });
}
function assignmentDetail_(u,id,includeHistory){
 let x=assignmentById_(id);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,false);
 if(!x.data.ViewedAt&&String(x.data.AssigneeID)===String(u.values[0])){
  const marked=withScriptLock_(function(){
   const current=assignmentById_(id);if(!current||current.data.ViewedAt||String(current.data.AssigneeID)!==String(u.values[0]))return false;
   current.data.ViewedAt=new Date().toISOString();if(current.data.Status==="new")current.data.Status="viewed";current.data.UpdatedAt=current.data.ViewedAt;
   assignmentSheet_().getRange(current.row,1,1,UPGRADE_SHEETS.Assignments.length).setValues([UPGRADE_SHEETS.Assignments.map(k=>current.data[k])]);clearAssignmentCache_();return true;
  });
  x=assignmentById_(id)||x;if(marked)activity_(id,u,"viewed",{});
 }
 const ns=notesSheet_(),nl=ns.getLastRow(),nb=Math.max(2,nl-1999),nr=nl>=2?ns.getRange(nb,1,nl-nb+1,8).getValues():[];
 const notes=nr.filter(r=>String(r[1])===String(id)&&(String(r[4])==="shared"||String(r[2])===String(u.values[0]))).map(r=>({id:r[0],authorId:r[2],authorName:r[3],visibility:r[4],body:r[5],createdAt:r[6]}));
 const rs=requestSheet_(),rl=rs.getLastRow(),rb=Math.max(2,rl-999),rr=rl>=2?rs.getRange(rb,1,rl-rb+1,12).getValues():[];
 const requests=rr.filter(r=>String(r[1])===String(id)&&(isAdmin_(u)||String(r[2])===String(u.values[0])||String(x.data.OwnerLeaderID)===String(u.values[0]))).map(r=>({id:r[0],fromUserName:r[3],toUserName:r[5],reason:r[6],status:r[7],requestedAt:r[8]}));
 const result={...assignmentPublic_(x.data),notes:notes,requests:requests};if(includeHistory)result.activity=assignmentHistoryData_(id);return result;
}
function assignmentHistory_(u,id){const x=assignmentById_(id);if(!x)throw new Error("user_not_found");assertAssignmentAccess_(u,x.data,false);return assignmentHistoryData_(id);}
function assignmentHistoryData_(id){
 const sh=activitySheet_(),last=sh.getLastRow();if(last<2)return [];
 const start=Math.max(2,last-4999),rows=sh.getRange(start,1,last-start+1,7).getValues();
 return rows.filter(r=>String(r[1])===String(id)).map(r=>({actorName:r[3],action:r[4],details:(()=>{try{return JSON.parse(r[5]||"{}")}catch(e){return {}}})(),createdAt:r[6]})).slice(-200);
}
function listNotifications_(u,cursor){
 const sh=notificationSheet_(),last=sh.getLastRow();if(last<2)return {items:[],nextCursor:"",hasMore:false};
 const start=Math.max(2,last-9999),rows=sh.getRange(start,1,last-start+1,9).getValues();
 let items=rows.filter(r=>String(r[1])===String(u.values[0])).map(r=>({id:String(r[0]),assignmentId:String(r[2]||""),type:String(r[3]||""),title:String(r[4]||""),body:String(r[5]||""),isRead:r[6]===true||String(r[6])==="TRUE",createdAt:String(r[7]||"")}));
 items.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
 const totalCount=items.length,unreadCount=items.filter(x=>!x.isRead).length;
 if(cursor){const parts=String(cursor).split("|"),time=parts[0]||"",id=parts.slice(1).join("|");items=items.filter(x=>x.createdAt<time||(x.createdAt===time&&x.id<id));}
 const hasMore=items.length>100,page=items.slice(0,100),lastItem=page[page.length-1];
 return {items:page,nextCursor:hasMore&&lastItem?lastItem.createdAt+"|"+lastItem.id:"",hasMore:hasMore,unreadCount:unreadCount,totalCount:totalCount};
}
function markNotificationRead_(u,id){
 const sh=notificationSheet_(),last=sh.getLastRow();if(last<2)throw new Error("user_not_found");
 const match=sh.getRange(2,1,last-1,1).createTextFinder(String(id)).matchEntireCell(true).findNext();if(!match)throw new Error("user_not_found");
 const row=match.getRow();if(String(sh.getRange(row,2).getValue())!==String(u.values[0]))throw new Error("user_not_found");
 sh.getRange(row,7).setValue(true);sh.getRange(row,9).setValue(new Date().toISOString());return true;
}
function setUserRole_(id,role,admin) {
 return withScriptLock_(function(){
  if(!["admin","leader","user"].includes(role))throw new Error("invalid_role");
  const u=findUserById_(String(id));if(!u)throw new Error("user_not_found");if(String(id)===String(admin.values[0]))throw new Error("cannot_change_own_role");
  if(role!=="admin"&&isLastActiveAdmin_(id))throw new Error("last_active_admin");
  const manages=assignmentRows_().some(x=>!String(x.data.ArchivedAt||"")&&String(x.data.OwnerLeaderID)===String(id));
  if(role==="user"&&manages)throw new Error("user_manages_active_assignments");
  users_().getRange(u.row,5).setValue(role);revokeUserSessions_(id);audit_(admin,"user_role_changed",id,{role:role},"success");return true;
 });
}