import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
const ITER=600000,DAYS=30,BOOTSTRAP=Deno.env.get("SMARTNOTE_BOOTSTRAP_SECRET")||"";
const cors={"Access-Control-Allow-Origin":"https://frosty-disk-43a7.hanna-adelzkk.workers.dev","Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-smartnote-session, x-smartnote-bootstrap","Access-Control-Allow-Methods":"POST, OPTIONS"};
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
 return out(200,{ok:true,token,expiresAt:expires,user});
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out(405,{ok:false,error:"method_not_allowed"});
 try{
  const b=await req.json(),action=typeof b.action==="string"?b.action:"";
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
  if(action==="me")return out(200,{ok:true,user:auth.p,expiresAt:auth.s.expires_at});
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
   const {data:target}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"&&status==="disabled"){const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin").eq("status","active");if((count||0)<=1)return out(400,{ok:false,error:"last_active_admin"});}
   const {error}=await db.from("profiles").update({status}).eq("id",id);if(error)return out(500,{ok:false,error:"status_update_failed"});
   if(status==="disabled"){
    const {error:revokeError}=await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",id).is("revoked_at",null);
    if(revokeError){console.error("STATUS SESSION REVOKE ERROR:",revokeError);return out(500,{ok:false,error:"status_updated_session_revoke_failed",status_updated:true});}
   }
   await audit(auth.p.id,"admin_set_status",id,{status});return out(200,{ok:true});
  }
  if(action==="admin_set_role"){
   const id=typeof b.userId==="string"?b.userId:"",role=b.role;if(!id||!["admin","leader","user"].includes(role))return out(400,{ok:false,error:"invalid_role"});
   const {data:target}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"&&role!=="admin"){const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin").eq("status","active");if((count||0)<=1)return out(400,{ok:false,error:"last_active_admin"});}
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
   const {data:target}=await db.from("profiles").select("id,role").eq("id",id).maybeSingle();if(!target)return out(404,{ok:false,error:"user_not_found"});
   if(target.role==="admin"){const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("role","admin");if((count||0)<=1)return out(400,{ok:false,error:"last_admin"});}
   await db.from("auth_sessions").update({revoked_at:new Date().toISOString()}).eq("user_id",id).is("revoked_at",null);
   const {error}=await db.from("profiles").delete().eq("id",id);if(error)return out(500,{ok:false,error:"delete_failed"});
   await audit(auth.p.id,"admin_delete_user",id);return out(200,{ok:true});
  }
  return out(400,{ok:false,error:"unknown_action"});
 }catch(_){return out(500,{ok:false,error:"internal_error"});}
});