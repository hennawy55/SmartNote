import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
const ITER=600000,DAYS=30,BOOTSTRAP=Deno.env.get("SMARTNOTE_BOOTSTRAP_SECRET")||"";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-smartnote-session, x-smartnote-bootstrap","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
const unhex=(s:string)=>new Uint8Array((s.match(/.{2}/g)||[]).map(x=>parseInt(x,16)));
const random=(n:number)=>{const b=crypto.getRandomValues(new Uint8Array(n));return hex(b);};
const hash=async(s:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))));
async function derive(password:string,salt:string,iterations=ITER){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unhex(salt),iterations},k,256)));}
function equal(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
const uname=(v:unknown)=>typeof v==="string"?v.trim().toLowerCase():"";
const validName=(s:string)=>/^[a-z0-9_.-]{3,40}$/.test(s);
const validPassword=(s:unknown):s is string=>typeof s==="string"&&s.length>=10&&s.length<=256;
async function audit(actor:string|null,action:string,target:string,details:Record<string,unknown>={}){await db.from("audit_log").insert({actor_id:actor,actor_name:"",action,target_id:target,details,outcome:"success"});}
async function createAccount(username:string,password:string,role="user",mustChange=true){
 const key=uname(username);if(!validName(key)||!validPassword(password)||!["admin","leader","user"].includes(role))return {error:"invalid_account_data"};
 const id=crypto.randomUUID(),salt=random(16),passwordHash=await derive(password,salt);
 const {error:pe}=await db.from("profiles").insert({id,username:key,role,status:"active",must_change_password:mustChange});
 if (pe) {
  console.error("PROFILE INSERT ERROR:", pe);
  return { error: pe.code === "23505" ? "username_exists" : "profile_create_failed" };
}
 const {error:ae}=await db.from("auth_accounts").insert({user_id:id,username_key:key,password_hash:passwordHash,password_salt:salt,password_iterations:ITER});
 if(ae){await db.from("profiles").delete().eq("id",id);return {error:"account_create_failed"};}
 return {id,username:key,role,status:"active",must_change_password:mustChange};
}
async function session(req:Request){
 const token=req.headers.get("x-smartnote-session")||"";
 if(!/^[a-f0-9]{64}$/i.test(token))return null;
 const {data:s,error:se}=await db.from("auth_sessions").select("id,user_id,expires_at").eq("token_hash",await hash(token)).is("revoked_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(se){console.error("SESSION LOOKUP ERROR:",se);throw new Error("session_lookup_failed");}
 if(!s)return null;
 const {data:p,error:pe}=await db.from("profiles").select("id,username,role,status,must_change_password").eq("id",s.user_id).maybeSingle();
 if(pe){console.error("PROFILE LOOKUP ERROR:",pe);throw new Error("profile_lookup_failed");}
 if(!p||p.status!=="active")return null;
 const {error:ue}=await db.from("auth_sessions").update({last_seen_at:new Date().toISOString()}).eq("id",s.id);
 if(ue){console.error("SESSION TOUCH ERROR:",ue);throw new Error("session_update_failed");}
 return {s,p};
}

async function readNotebook(userId:string){
 const tables=["workspaces","projects","units","notes","clients","tasks"] as const;
 const results:any[]=await Promise.all([
  ...tables.map(t=>db.from(t).select("data").eq("user_id",userId)),
  db.from("task_notification_dismissals").select("notification_key").eq("user_id",userId)
 ]);
 for(let i=0;i<results.length;i++){if(results[i].error){console.error("NOTEBOOK LOAD ERROR:",tables[i]||"dismissals",results[i].error);throw new Error("database_load_failed");}}
 const data:Record<string,unknown>={};
 tables.forEach((t,i)=>{data[t]=((results[i].data||[]) as Array<{data:unknown}>).map(row=>row.data)});
 data.taskNotificationDismissals=((results[6].data||[]) as Array<{notification_key:string}>).map(row=>row.notification_key);
 return data;
}

async function login(u:string,pw:string){
 const key=uname(u);
 if(!validName(key)||typeof pw!=="string"||pw.length<1||pw.length>256)return out(400,{ok:false,error:"invalid_credentials"});
 const now=Date.now();
 const {data:attempt,error:attemptError}=await db.from("auth_login_attempts").select("*").eq("username_key",key).maybeSingle();
 if(attemptError){console.error("LOGIN ATTEMPT LOOKUP ERROR:",attemptError);return out(500,{ok:false,error:"login_unavailable"});}
 if(attempt?.locked_until&&Date.parse(attempt.locked_until)>now)return out(429,{ok:false,error:"too_many_attempts"});
 const {data:a,error:accountError}=await db.from("auth_accounts").select("*").eq("username_key",key).maybeSingle();
 if(accountError){console.error("ACCOUNT LOOKUP ERROR:",accountError);return out(500,{ok:false,error:"login_unavailable"});}
 const candidate=await derive(pw,a?.password_salt||"4a9c2e7b8d1f6035a4c9e2b7d8f10365",a?.password_iterations||ITER);
 if(!a||!equal(candidate,a.password_hash)){
  const {data:rateData,error:rateError}=await db.rpc("record_smartnote_login_failure",{p_username_key:key});
  if(rateError||!Array.isArray(rateData)||!rateData[0]){
   console.error("LOGIN RATE LIMIT RPC ERROR:",rateError||"empty_result");
   return out(500,{ok:false,error:"login_unavailable"});
  }
  const locked=!!rateData[0].locked_until&&Date.parse(rateData[0].locked_until)>Date.now();
  return out(locked?429:401,{ok:false,error:locked?"too_many_attempts":"invalid_credentials"});
 }
 const {data:user,error:profileError}=await db.from("profiles").select("id,username,role,status,must_change_password").eq("id",a.user_id).maybeSingle();
 if(profileError){console.error("LOGIN PROFILE LOOKUP ERROR:",profileError);return out(500,{ok:false,error:"login_unavailable"});}
 if(!user||user.status!=="active")return out(403,{ok:false,error:"account_disabled"});
 const {error:clearError}=await db.from("auth_login_attempts").delete().eq("username_key",key);
 if(clearError){console.error("LOGIN ATTEMPT RESET ERROR:",clearError);return out(500,{ok:false,error:"login_unavailable"});}
 const token=random(32),expires=new Date(now+DAYS*86400000).toISOString();
 const {error:sessionError}=await db.from("auth_sessions").insert({user_id:a.user_id,token_hash:await hash(token),expires_at:expires});
 if(sessionError){console.error("SESSION CREATE ERROR:",sessionError);return out(500,{ok:false,error:"session_create_failed"});}
 return out(200,{ok:true,token,expiresAt:expires,user,data:await readNotebook(a.user_id)});
}

function assignmentPublic(a:any){return {id:a.id,title:a.title,description:a.description,type:a.assignment_type,clientName:a.client_name,clientPhone:a.client_phone,status:a.status,priority:a.priority,dueAt:a.due_at,createdAt:a.created_at,assignedAt:a.assigned_at,updatedAt:a.updated_at,createdBy:a.created_by,createdByName:a.created_by_name,ownerLeaderId:a.owner_leader_id,ownerLeaderName:a.owner_leader_name,assigneeId:a.assignee_id,assigneeName:a.assignee_name,archivedAt:a.archived_at,viewedAt:a.viewed_at};}
async function assignmentActivity(id:string,user:any,action:string,details:any={}){const {error}=await db.from("assignment_activity").insert({assignment_id:id,actor_id:user.id,actor_name:user.username,action,details});if(error)throw error;}
async function assignmentNotify(userId:string,id:string,type:string,title:string,body:string){const {error}=await db.from("notifications").insert({user_id:userId,assignment_id:id,type,title,body});if(error)throw error;}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out(405,{ok:false,error:"method_not_allowed"});
 try{
  const b=await req.json();let action=typeof b.action==="string"?b.action:"";
  const aliases:Record<string,string>={admin_list:"admin_list_users",admin_create:"admin_create_user",admin_status:"admin_set_status",admin_role:"admin_set_role",admin_delete:"admin_delete_user"};action=aliases[action]||action;if(action==="admin_reset_password"&&b.newPassword===undefined)b.newPassword=b.password;
  if(action==="login")return await login(b.username,b.password);
  if(action==="bootstrap_admin"){
   const supplied=req.headers.get("x-smartnote-bootstrap")||"";
   if(!BOOTSTRAP||!equal(supplied,BOOTSTRAP))return out(403,{ok:false,error:"bootstrap_forbidden"});
   const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin");
   if((count||0)>0)return out(409,{ok:false,error:"admin_already_exists"});
   const result=await createAccount(b.username,b.password,"admin",true);
   if(result.error)return out(400,{ok:false,error:result.error});
   await audit(result.id,"bootstrap_admin_created",result.id);
   return out(201,{ok:true,user:result,notice:"Remove SMARTNOTE_BOOTSTRAP_SECRET from Edge Function secrets after successful bootstrap."});
  }
  const auth=await session(req);if(!auth)return out(401,{ok:false,error:"session_invalid"});
  if(action==="me")return out(200,{ok:true,user:auth.p,expiresAt:auth.s.expires_at,data:await readNotebook(auth.p.id)});
  if(action==="load")return out(200,{ok:true,data:await readNotebook(auth.p.id)});
  if(action==="save"){if(!b.data||typeof b.data!=="object"||Array.isArray(b.data))return out(400,{ok:false,error:"invalid_database_payload"});const {error}=await db.rpc("replace_smartnote_database",{p_user_id:auth.p.id,p_data:b.data});if(error){console.error("NOTEBOOK SAVE ERROR:",error);return out(500,{ok:false,error:"database_save_failed"});}return out(200,{ok:true,saved:true});}
  if(action==="logout"){
   const {error}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("id",auth.s.id);
   if(error){console.error("LOGOUT ERROR:",error);return out(500,{ok:false,error:"logout_failed"});}
   return out(200,{ok:true});
  }
  if(action==="change_password"){
   const old=typeof b.currentPassword==="string"?b.currentPassword:"",next=b.newPassword;
   if(!validPassword(next))return out(400,{ok:false,error:"weak_password"});
   const {data:a,error:lookupError}=await db.from("auth_accounts").select("password_hash,password_salt,password_iterations").eq("user_id",auth.p.id).maybeSingle();
   if(lookupError){console.error("CHANGE PASSWORD LOOKUP ERROR:",lookupError);return out(500,{ok:false,error:"password_change_failed"});}
   if(!a||!equal(await derive(old,a.password_salt,a.password_iterations),a.password_hash))return out(401,{ok:false,error:"invalid_credentials"});
   const salt=random(16);
   const {error:passwordError}=await db.from("auth_accounts").update({password_hash:await derive(next,salt),password_salt:salt,password_iterations:ITER,password_changed_at:new Date().toISOString()}).eq("user_id",auth.p.id);
   if(passwordError){console.error("PASSWORD UPDATE ERROR:",passwordError);return out(500,{ok:false,error:"password_change_failed"});}
   const {error:profileError}=await db.from("profiles").update({must_change_password:false}).eq("id",auth.p.id);
   if(profileError){console.error("PASSWORD PROFILE UPDATE ERROR:",profileError);return out(500,{ok:false,error:"password_changed_profile_update_failed",password_changed:true,reauthenticate:true});}
   const {error:revokeError}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",auth.p.id).is("revoked_at",null);
   if(revokeError){console.error("PASSWORD SESSION REVOKE ERROR:",revokeError);return out(500,{ok:false,error:"password_changed_session_revoke_failed",password_changed:true,reauthenticate:true});}
   return out(200,{ok:true,reauthenticate:true});
  }
  if(auth.p.role!=="admin")return out(403,{ok:false,error:"admin_required"});
  if(action==="admin_audit_list"){
   const {data,error}=await db.from("audit_log").select("*").order("created_at",{ascending:false}).limit(200);
   if(error){console.error("AUDIT LIST ERROR:",error);return out(500,{ok:false,error:"audit_list_failed"});}
   return out(200,{ok:true,entries:(data||[]).map((x:any)=>({id:x.id,actorName:x.actor_name,action:x.action,targetId:x.target_id,details:x.details,createdAt:x.created_at,outcome:x.outcome}))});
  }
  if(action==="admin_list_users"){
   const {data,error}=await db.from("profiles").select("id,username,role,status,must_change_password,created_at,updated_at").order("created_at",{ascending:false});
   if(error)return out(500,{ok:false,error:"list_failed"});return out(200,{ok:true,users:data});
  }
  if(action==="admin_create_user"){
   const result=await createAccount(b.username,b.password,b.role||"user",true);if(result.error)return out(400,{ok:false,error:result.error});
   await audit(auth.p.id,"admin_create_user",result.id,{username:result.username,role:result.role});return out(201,{ok:true,user:result});
  }
  if(action==="admin_set_status"){
   const id=typeof b.userId==="string"?b.userId:"",status=b.status;
   if(!id||!["active","disabled"].includes(status))return out(400,{ok:false,error:"invalid_status"});
   if(id===auth.p.id&&status==="disabled")return out(400,{ok:false,error:"cannot_disable_self"});
   const {data:target,error:targetError}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(targetError){console.error("STATUS TARGET LOOKUP ERROR:",targetError);return out(500,{ok:false,error:"status_update_failed"});}if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"&&status==="disabled"){const {count,error:countError}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin").eq("status","active");if(countError){console.error("ACTIVE ADMIN COUNT ERROR:",countError);return out(500,{ok:false,error:"status_update_failed"});}if((count||0)<=1)return out(400,{ok:false,error:"last_active_admin"});}
   const {error}=await db.from("profiles").update({status}).eq("id",id);if(error)return out(500,{ok:false,error:"status_update_failed"});
   if(status==="disabled"){
    const {error:revokeError}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",id).is("revoked_at",null);
    if(revokeError){console.error("STATUS SESSION REVOKE ERROR:",revokeError);return out(500,{ok:false,error:"status_updated_session_revoke_failed",status_updated:true});}
   }
   await audit(auth.p.id,"admin_set_status",id,{status});return out(200,{ok:true});
  }
  if(action==="admin_set_role"){
   const id=typeof b.userId==="string"?b.userId:"",role=b.role;if(!id||!["admin","leader","user"].includes(role))return out(400,{ok:false,error:"invalid_role"});
   const {data:target,error:targetError}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(targetError){console.error("ROLE TARGET LOOKUP ERROR:",targetError);return out(500,{ok:false,error:"role_update_failed"});}if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"&&role!=="admin"){const {count,error:countError}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin").eq("status","active");if(countError){console.error("ACTIVE ADMIN COUNT ERROR:",countError);return out(500,{ok:false,error:"role_update_failed"});}if((count||0)<=1)return out(400,{ok:false,error:"last_active_admin"});}
   const {error}=await db.from("profiles").update({role}).eq("id",id);if(error)return out(500,{ok:false,error:"role_update_failed"});
   await audit(auth.p.id,"admin_set_role",id,{role});return out(200,{ok:true});
  }
  if(action==="admin_reset_password"){
   const id=typeof b.userId==="string"?b.userId:"",pw=b.newPassword;if(!id||!validPassword(pw))return out(400,{ok:false,error:"weak_password_or_user"});
   const {data:target}=await db.from("profiles").select("id").eq("id",id).maybeSingle();if(!target)return out(404,{ok:false,error:"user_not_found"});
   const salt=random(16),{error}=await db.from("auth_accounts").update({password_hash:await derive(pw,salt),password_salt:salt,password_iterations:ITER,password_changed_at:new Date().toISOString()}).eq("user_id",id);
   if(error)return out(500,{ok:false,error:"password_reset_failed"});
   const {error:profileError}=await db.from("profiles").update({must_change_password:true}).eq("id",id);
   if(profileError){console.error("RESET PASSWORD PROFILE ERROR:",profileError);return out(500,{ok:false,error:"password_reset_profile_update_failed",password_reset:true});}
   const {error:revokeError}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",id).is("revoked_at",null);
   if(revokeError){console.error("RESET PASSWORD SESSION REVOKE ERROR:",revokeError);return out(500,{ok:false,error:"password_reset_session_revoke_failed",password_reset:true});}
   await audit(auth.p.id,"admin_reset_password",id);return out(200,{ok:true});
  }
  if(action==="admin_delete_user"){
   const id=typeof b.userId==="string"?b.userId:"";if(!id||id===auth.p.id)return out(400,{ok:false,error:"invalid_user"});
   const {data:target,error:targetError}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(targetError){console.error("DELETE TARGET LOOKUP ERROR:",targetError);return out(500,{ok:false,error:"delete_failed"});}if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"){const {count,error:countError}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin");if(countError){console.error("ADMIN COUNT ERROR:",countError);return out(500,{ok:false,error:"delete_failed"});}if((count||0)<=1)return out(400,{ok:false,error:"last_admin"});}
   const {error:revokeError}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",id).is("revoked_at",null);
   if(revokeError){console.error("DELETE SESSION REVOKE ERROR:",revokeError);return out(500,{ok:false,error:"delete_failed"});}
   const {error}=await db.from("profiles").delete().eq("id",id);if(error)return out(500,{ok:false,error:"delete_failed"});
   await audit(auth.p.id,"admin_delete_user",id);return out(200,{ok:true});
  }

  if(action==="assignment_list"||action==="assignment_archived_list"){
   const q=db.from("assignments").select("*").order("updated_at",{ascending:false});
   const {data,error}=await q;
   if(error)throw error;
   const rows=(data||[]).filter((a:any)=>auth.p.role==="admin"||a.assignee_id===auth.p.id||a.owner_leader_id===auth.p.id);
   const archived=action==="assignment_archived_list";
   return out(200,{ok:true,assignments:rows.filter((a:any)=>!!a.archived_at===archived).map(assignmentPublic)});
  }
  if(action==="leader_users"){
   if(!["admin","leader"].includes(auth.p.role))return out(403,{ok:false,error:"forbidden"});
   const {data,error}=await db.from("profiles").select("id,username,role,status").eq("status","active").order("username");
   if(error)throw error;
   return out(200,{ok:true,users:(data||[]).filter((u:any)=>u.id!==auth.p.id&&(auth.p.role==="admin"||u.role!=="admin"))});
  }
  if(action==="assignment_create"){
   if(!["admin","leader"].includes(auth.p.role))return out(403,{ok:false,error:"forbidden"});
   const assigneeId=String(b.assigneeId||"");
   const {data:target,error:te}=await db.from("profiles").select("id,username,role,status").eq("id",assigneeId).maybeSingle();
   if(te)throw te;if(!target||target.status!=="active"||target.id===auth.p.id||(auth.p.role!=="admin"&&target.role==="admin"))return out(400,{ok:false,error:"invalid_assignee"});
   const type=b.assignmentType==="client"?"client":"task",title=String(type==="client"?(b.clientName||b.title||""):b.title||"").trim();
   if(!title||title.length>180)return out(400,{ok:false,error:"invalid_title"});
   const priority=["low","normal","high","urgent"].includes(b.priority)?b.priority:"normal";
   const dueAt=b.dueAt?new Date(b.dueAt).toISOString():null;
   const row={title,description:String(b.description||"").slice(0,5000),status:"new",priority,due_at:dueAt,created_by:auth.p.id,created_by_name:auth.p.username,owner_leader_id:auth.p.id,owner_leader_name:auth.p.username,assignee_id:target.id,assignee_name:target.username,assignment_type:type,client_name:type==="client"?title:"",client_phone:type==="client"?String(b.clientPhone||"").slice(0,30):""};
   const {data:a,error}=await db.from("assignments").insert(row).select("*").single();if(error)throw error;
   await assignmentActivity(a.id,auth.p,"created",{assignee:target.username});await assignmentNotify(target.id,a.id,"assigned","متابعة جديدة",title+" — تم إسناد متابعة إليك");
   return out(201,{ok:true,assignment:assignmentPublic(a)});
  }
  if(action==="assignment_detail"||action==="assignment_history"||action==="assignment_status"||action==="assignment_archive"||action==="assignment_restore"||action==="assignment_reassign"||action==="assignment_update"||action==="assignment_note_add"||action==="assignment_targets"||action==="reassignment_targets"||action==="reassignment_request"||action==="reassignment_review"){
   const id=String(b.assignmentId||"");
   const {data:a,error:ae}=await db.from("assignments").select("*").eq("id",id).maybeSingle();
   if(ae)throw ae;if(!a)return out(404,{ok:false,error:"assignment_not_found"});
   const manager=auth.p.role==="admin"||a.owner_leader_id===auth.p.id;
   const visible=auth.p.role==="admin"||a.owner_leader_id===auth.p.id||a.assignee_id===auth.p.id;
   if(!visible)return out(403,{ok:false,error:"forbidden"});
   const publicA=assignmentPublic(a);
   if(action==="assignment_detail"){
    if(a.assignee_id===auth.p.id&&!a.viewed_at){const now=new Date().toISOString();await db.from("assignments").update({viewed_at:now,status:a.status==="new"?"viewed":a.status,updated_at:now}).eq("id",id);await assignmentActivity(id,auth.p,"viewed",{});}
    const [{data:notes,error:ne},{data:requests,error:re}]=await Promise.all([
     db.from("assignment_notes").select("*").eq("assignment_id",id).order("created_at"),
     db.from("reassignment_requests").select("*").eq("assignment_id",id).order("requested_at",{ascending:false})
    ]);if(ne)throw ne;if(re)throw re;
    return out(200,{ok:true,assignment:{...publicA,notes:(notes||[]).filter((n:any)=>n.visibility==="shared"||n.author_id===auth.p.id).map((n:any)=>({id:n.id,authorName:n.author_name,visibility:n.visibility,body:n.body,createdAt:n.created_at})),requests:manager?(requests||[]).map((x:any)=>({id:x.id,fromUserName:x.from_user_name,toUserName:x.to_user_name,reason:x.reason,status:x.status,requestedAt:x.requested_at})):[]}});
   }
   if(action==="assignment_history"){
    const {data,error}=await db.from("assignment_activity").select("*").eq("assignment_id",id).order("created_at",{ascending:false}).limit(200);if(error)throw error;
    return out(200,{ok:true,history:(data||[]).reverse().map((x:any)=>({actorName:x.actor_name,action:x.action,details:x.details,createdAt:x.created_at}))});
   }
   if(action==="assignment_targets"||action==="reassignment_targets"){
    if(action==="assignment_targets"&&!manager)return out(403,{ok:false,error:"forbidden"});
    if(action==="reassignment_targets"&&a.assignee_id!==auth.p.id)return out(403,{ok:false,error:"forbidden"});
    if(!["admin","leader"].includes(auth.p.role))return out(403,{ok:false,error:"forbidden"});
    const {data,error}=await db.from("profiles").select("id,username,role").eq("status","active").order("username");if(error)throw error;
    return out(200,{ok:true,users:(data||[]).filter((u:any)=>u.id!==auth.p.id&&u.id!==String(b.excludeUserId||"")&&(auth.p.role==="admin"||u.role!=="admin"))});
   }
   if(action==="assignment_status"){
    if(a.assignee_id!==auth.p.id&&!manager)return out(403,{ok:false,error:"forbidden"});
    if(!["new","viewed","in_progress","paused","completed","cancelled"].includes(b.status))return out(400,{ok:false,error:"invalid_status"});
    const now=new Date().toISOString(),patch:any={status:b.status,updated_at:now};if(a.assignee_id===auth.p.id&&!a.viewed_at)patch.viewed_at=now;
    const {error}=await db.from("assignments").update(patch).eq("id",id);if(error)throw error;
    await assignmentActivity(id,auth.p,"status_changed",{status:b.status});
    if(b.status==="completed")await assignmentNotify(a.owner_leader_id,id,"completed","تم إغلاق المتابعة",a.title+" — تم إغلاقها");
    return out(200,{ok:true,assignment:{...publicA,status:b.status,updatedAt:now}});
   }
   if(action==="assignment_archive"||action==="assignment_restore"){
    if(!manager)return out(403,{ok:false,error:"forbidden"});
    const now=new Date().toISOString(),archived=action==="assignment_archive";
    const {error}=await db.from("assignments").update({archived_at:archived?now:null,updated_at:now}).eq("id",id);if(error)throw error;
    await assignmentActivity(id,auth.p,archived?"archived":"restored",{});
    return out(200,{ok:true,archived});
   }
   if(action==="assignment_update"){
    if(!manager)return out(403,{ok:false,error:"forbidden"});
    const p=b.patch||{},patch:any={updated_at:new Date().toISOString()};
    if(p.title!==undefined){if(!String(p.title).trim())return out(400,{ok:false,error:"invalid_title"});patch.title=String(p.title).slice(0,180);}
    if(p.description!==undefined)patch.description=String(p.description).slice(0,5000);
    if(p.priority!==undefined){if(!["low","normal","high","urgent"].includes(p.priority))return out(400,{ok:false,error:"invalid_priority"});patch.priority=p.priority;}
    if(p.dueAt!==undefined)patch.due_at=p.dueAt?new Date(p.dueAt).toISOString():null;
    const {error}=await db.from("assignments").update(patch).eq("id",id);if(error)throw error;
    await assignmentActivity(id,auth.p,"updated",p);return out(200,{ok:true,updated:true});
   }
   if(action==="assignment_reassign"){
    if(!manager)return out(403,{ok:false,error:"forbidden"});
    const {data:t,error:te}=await db.from("profiles").select("id,username,role,status").eq("id",String(b.toUserId||"")).maybeSingle();if(te)throw te;
    if(!t||t.status!=="active"||t.id===auth.p.id||t.id===a.assignee_id||(auth.p.role!=="admin"&&t.role==="admin"))return out(400,{ok:false,error:"invalid_assignee"});
    const now=new Date().toISOString();const {error}=await db.from("assignments").update({assignee_id:t.id,assignee_name:t.username,assigned_at:now,updated_at:now,viewed_at:null,status:a.status==="viewed"?"new":a.status}).eq("id",id);if(error)throw error;
    await assignmentActivity(id,auth.p,"reassigned",{from:a.assignee_name,to:t.username});await assignmentNotify(t.id,id,"assigned","متابعة جديدة",a.title+" — تم إسناد متابعة إليك");
    return out(200,{ok:true,assignment:{...publicA,assigneeId:t.id,assigneeName:t.username}});
   }
   if(action==="assignment_note_add"){
    const body=String(b.body||"").trim();if(!body||body.length>5000)return out(400,{ok:false,error:"invalid_note"});
    const visibility=b.visibility==="shared"?"shared":"private";
    const {data:n,error}=await db.from("assignment_notes").insert({assignment_id:id,author_id:auth.p.id,author_name:auth.p.username,visibility,body}).select("*").single();if(error)throw error;
    await assignmentActivity(id,auth.p,"note_added",{visibility});return out(201,{ok:true,note:{id:n.id,visibility:n.visibility,body:n.body,createdAt:n.created_at}});
   }
   if(action==="reassignment_request"){
    if(a.assignee_id!==auth.p.id)return out(403,{ok:false,error:"forbidden"});
    const reason=String(b.reason||"").trim();if(!reason)return out(400,{ok:false,error:"invalid_reason"});
    const {count,error:ce}=await db.from("reassignment_requests").select("id",{count:"exact",head:true}).eq("assignment_id",id).eq("status","pending");if(ce)throw ce;if((count||0)>0)return out(409,{ok:false,error:"request_pending"});
    const {data:t,error:te}=await db.from("profiles").select("id,username,role,status").eq("id",String(b.toUserId||"")).maybeSingle();if(te)throw te;
    if(!t||t.status!=="active"||t.id===auth.p.id||t.role==="admin")return out(400,{ok:false,error:"invalid_assignee"});
    const {data:q,error}=await db.from("reassignment_requests").insert({assignment_id:id,from_user_id:auth.p.id,from_user_name:auth.p.username,to_user_id:t.id,to_user_name:t.username,reason}).select("*").single();if(error)throw error;
    await assignmentActivity(id,auth.p,"reassignment_requested",{to:t.username,reason});await assignmentNotify(a.owner_leader_id,id,"reassignment_request","طلب إعادة إسناد",a.title+" — "+reason);
    return out(201,{ok:true,request:{id:q.id,status:q.status}});
   }
   if(action==="reassignment_review"){
    if(!manager)return out(403,{ok:false,error:"forbidden"});
    const {data:q,error:qe}=await db.from("reassignment_requests").select("*").eq("id",String(b.requestId||"")).eq("assignment_id",id).maybeSingle();if(qe)throw qe;
    if(!q||q.status!=="pending")return out(409,{ok:false,error:"request_not_pending"});
    if(q.from_user_id!==a.assignee_id){await db.from("reassignment_requests").update({status:"stale"}).eq("id",q.id);return out(409,{ok:false,error:"request_stale"});}
    const approve=b.approve===true;const now=new Date().toISOString();
    if(approve){const {data:t,error:te}=await db.from("profiles").select("id,username,status").eq("id",q.to_user_id).maybeSingle();if(te)throw te;if(!t||t.status!=="active")return out(400,{ok:false,error:"invalid_assignee"});const {error}=await db.from("assignments").update({assignee_id:t.id,assignee_name:t.username,assigned_at:now,updated_at:now,viewed_at:null,status:a.status==="viewed"?"new":a.status}).eq("id",id);if(error)throw error;}
    const {error}=await db.from("reassignment_requests").update({status:approve?"approved":"rejected",reviewed_at:now,reviewed_by_id:auth.p.id,reviewed_by_name:auth.p.username}).eq("id",q.id);if(error)throw error;
    await assignmentActivity(id,auth.p,approve?"reassignment_approved":"reassignment_rejected",{requestId:q.id});
    if(approve)await assignmentNotify(q.to_user_id,id,"assigned","متابعة محولة إليك",a.title);
    await assignmentNotify(q.from_user_id,id,"reassignment_result",approve?"تمت الموافقة على النقل":"تم رفض النقل",a.title);
    return out(200,{ok:true,request:{id:q.id,status:approve?"approved":"rejected"}});
   }
  }
  if(action==="notification_list"){
   const {data,error}=await db.from("notifications").select("*").eq("user_id",auth.p.id).order("created_at",{ascending:false}).limit(100);if(error)throw error;
   const {count}=await db.from("notifications").select("id",{count:"exact",head:true}).eq("user_id",auth.p.id).eq("is_read",false);
   return out(200,{ok:true,notifications:(data||[]).map((n:any)=>({id:n.id,assignmentId:n.assignment_id,type:n.type,title:n.title,body:n.body,isRead:n.is_read,createdAt:n.created_at})),unreadCount:count||0,totalCount:(data||[]).length,hasMore:false,nextCursor:""});
  }
  if(action==="notification_read"){
   const {error}=await db.from("notifications").update({is_read:true,read_at:new Date().toISOString()}).eq("id",String(b.notificationId||"")).eq("user_id",auth.p.id);if(error)throw error;
   return out(200,{ok:true,read:true});
  }

  return out(400,{ok:false,error:"unknown_action"});
 }catch(_){return out(500,{ok:false,error:"internal_error"});}
});