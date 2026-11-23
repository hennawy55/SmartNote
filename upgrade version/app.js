(() => {
  'use strict';
  const API_URL='https://script.google.com/macros/s/AKfycbxtsY2dd-ZKo3z01WeykRYNT9hCjx3LRHs237hkF7Ov0seOI5cfARlSxfUvY6aGVzi-/exec';
  const SESSION_KEY='smartnote-auth-session-v2';
  const DATABASE_NAME='SMARTNOTE_USER_DATABASE_V2';
  let authToken='', currentUser=null;
  const TYPES=['workspaces','projects','units','notes','clients','tasks'];
  const LABELS={workspaces:'مساحة عمل',projects:'مشروع',units:'وحدة',notes:'ملاحظة',clients:'عميل',tasks:'متابعة'};
  const TITLES={dashboard:['الرئيسية','ملخص سريع لكل بياناتك العقارية'],workspaces:['مساحات العمل','نظم بياناتك في مجموعات مستقلة'],projects:['المشاريع','قاعدة موحدة لكل المشروعات'],units:['الوحدات','تفاصيل الوحدات وأسعارها'],notes:['الملاحظات الذكية','كل المعلومات التي سجلتها'],clients:['العملاء','بيانات العملاء واحتياجاتهم'] ,tasks:['المتابعات','المهام والمواعيد القادمة']};
  const QUICK_ACTIONS={workspaces:['workspace','مساحة جديدة'],projects:['project','مشروع جديد'],units:['unit','وحدة جديدة'],notes:['note','ملاحظة جديدة'],clients:['client','عميل جديد'],tasks:['task','متابعة جديدة']};
  const emptyDB=()=>({version:1,workspaces:[],projects:[],units:[],notes:[],clients:[],tasks:[]});
  let db=emptyDB(), editing=null, isReady=false, saveQueue=Promise.resolve(), syncInFlight=false, writesInProgress=0, localRevision=0;
  const localDataKey=()=>`smartnote-local-db-v1:${encodeURIComponent(currentUser?.username||'')}`;
  const pendingSyncKey=()=>`smartnote-pending-sync-v1:${encodeURIComponent(currentUser?.username||'')}`;
  function cacheLocalDatabase(state=db,pending=false){if(!currentUser?.username)return;try{localStorage.setItem(localDataKey(),JSON.stringify(cloudPayload(state)));if(pending)localStorage.setItem(pendingSyncKey(),'1')}catch(error){toast('تعذر حفظ نسخة محلية: '+error.message)}}
  function readLocalDatabase(){try{const raw=localStorage.getItem(localDataKey());return raw?normalizeDatabase(JSON.parse(raw)):null}catch{return null}}
  function hasPendingSync(){try{return localStorage.getItem(pendingSyncKey())==='1'}catch{return false}}
  function clearPendingSync(){try{localStorage.removeItem(pendingSyncKey())}catch{}}
  const notifiedTaskReminders=new Set(),taskAlerts=[],browserNotifications=new Map();
  const NOTIFICATION_STATE_KEY='smart-real-estate-task-notifications-v1';
  let notificationsSnoozedUntil=0,notificationAudio=null,serviceWorkerRegistration=null;
  function persist(){renderAll()}
  function uid(){return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function dateLabel(v){if(!v)return 'بدون تاريخ';try{return new Date(v).toLocaleDateString(document.documentElement.lang==='en'?'en-US':'ar-EG',{year:'numeric',month:'short',day:'numeric'})}catch{return v}}
  function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
  function refreshNotificationButton(){const button=document.getElementById('enableNotifications');const isEnglish=document.documentElement.lang==='en';if(window.smartNoteNativeNotifications?.isNative){button.textContent=isEnglish?'Phone notifications':'إشعارات الهاتف';button.disabled=false}else if(!('Notification'in window)){button.textContent=isEnglish?'In-app alerts only':'تنبيهات داخل التطبيق فقط';button.disabled=true}else if(Notification.permission==='granted'){button.textContent=isEnglish?'Browser notifications enabled':'إشعارات المتصفح مفعلة';button.disabled=true}else if(Notification.permission==='denied'){button.textContent=isEnglish?'Enable browser notifications in Settings':'فعّل إشعارات المتصفح من الإعدادات';button.disabled=true}refreshSnoozeButton()}
  async function enableNotifications(){unlockNotificationAudio();if(window.smartNoteNativeNotifications?.isNative){try{const granted=await window.smartNoteNativeNotifications.requestPermission();refreshNotificationButton();if(!granted){toast('لم يتم السماح بإشعارات الهاتف. يمكنك تفعيلها من إعدادات التطبيق.');return}await syncNativeTaskReminders();toast('تم تفعيل إشعارات الهاتف وجدولة مواعيد المتابعات');checkTaskNotifications()}catch(err){toast('تعذر تفعيل إشعارات الهاتف: '+err.message)}return}if(!('Notification'in window)){toast('هذا المتصفح لا يدعم إشعارات النظام؛ ستظل التنبيهات داخل التطبيق متاحة');return}const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),isInstalled=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(isIOS&&!isInstalled){toast('لإشعارات iPhone وiPad، أضف التطبيق إلى الشاشة الرئيسية وافتحه منها، ثم فعّل الإشعارات');return}if(!window.isSecureContext||!('serviceWorker'in navigator)){toast('إشعارات النظام تتطلب فتح التطبيق عبر HTTPS مع دعم Service Worker');return}try{const permissionRequest=Notification.permission==='default'?Notification.requestPermission():Promise.resolve(Notification.permission),permission=await permissionRequest;refreshNotificationButton();if(permission!=='granted'){toast('لم يتم السماح بإشعارات النظام؛ ستظل التنبيهات داخل التطبيق متاحة');return}serviceWorkerRegistration=await navigator.serviceWorker.ready;if(typeof serviceWorkerRegistration.showNotification!=='function'){toast('هذا المتصفح لا يدعم إشعارات Service Worker؛ ستظل التنبيهات داخل التطبيق متاحة');return}toast('تم تفعيل إشعارات المتصفح والتنبيهات داخل التطبيق');checkTaskNotifications()}catch(err){toast('تعذر تفعيل إشعارات المتصفح: '+err.message)}}
  function refreshSnoozeButton(){const remaining=notificationsSnoozedUntil-Date.now(),label=remaining>0?`تفعيل التنبيهات الآن (${Math.ceil(remaining/60000)} د)`:'إيقاف التنبيهات ساعة';for(const id of ['dashboardSnoozeNotifications','notificationSnoozeToggle']){const button=document.getElementById(id);if(button){button.disabled=false;button.textContent=label}}const status=document.getElementById('notificationStatus');if(status){status.hidden=remaining<=0;status.textContent=remaining>0?`التنبيهات متوقفة مؤقتاً؛ يمكنك إعادة تفعيلها الآن أو ستعود تلقائياً بعد ${Math.ceil(remaining/60000)} دقيقة.`:''}}
  function unlockNotificationAudio(){if(notificationAudio){if(notificationAudio.state==='suspended')notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'));return}const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;try{notificationAudio=new AudioContextClass();if(notificationAudio.state==='suspended')notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'))}catch(err){toast('تعذر تفعيل صوت التنبيه: '+err.message)}}
  function playNotificationSound(){if(!notificationAudio)return false;if(notificationAudio.state==='suspended'){notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'));return false}if(notificationAudio.state!=='running')return false;try{const now=notificationAudio.currentTime;[659,880,1175].forEach((frequency,index)=>{const oscillator=notificationAudio.createOscillator(),gain=notificationAudio.createGain(),start=now+index*.09;oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.13,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.18);oscillator.connect(gain);gain.connect(notificationAudio.destination);oscillator.start(start);oscillator.stop(start+.2)});return true}catch(err){toast('تعذر تشغيل نغمة التنبيه: '+err.message);return false}}
  function taskDueTimestamp(task){if(!task.dueDate)return NaN;const [year,month,day]=task.dueDate.split('-').map(Number),[hour,minute]=(task.dueTime||'09:00').split(':').map(Number);return new Date(year,month-1,day,hour,minute||0).getTime()}
  function persistTaskAlertState(){try{localStorage.setItem(NOTIFICATION_STATE_KEY,JSON.stringify({alerts:taskAlerts.map(({key,taskId,title,body,taskTitle,createdAt})=>({key,taskId,title,body,taskTitle:taskTitle||get('tasks',taskId)?.title||'',createdAt})),notified:[...notifiedTaskReminders],snoozedUntil:notificationsSnoozedUntil}))}catch(err){toast('تعذر حفظ حالة التنبيهات على هذا الجهاز: '+err.message)}}
  function taskAlertTitleKey(title){return String(title||'').trim().toLocaleLowerCase('ar-EG')}
  function restoreTaskAlertState(){try{const saved=localStorage.getItem(NOTIFICATION_STATE_KEY);if(!saved)return;const state=JSON.parse(saved);if(!state||typeof state!=='object')throw new Error('بيانات التنبيهات المحفوظة غير صالحة');if(Array.isArray(state.notified))state.notified.filter(key=>typeof key==='string').forEach(key=>notifiedTaskReminders.add(key));if(Array.isArray(state.alerts)){const latestByTitle=new Map();state.alerts.filter(alert=>alert&&typeof alert.key==='string'&&typeof alert.taskId==='string'&&typeof alert.title==='string'&&typeof alert.body==='string').forEach(alert=>{alert.taskTitle=alert.taskTitle||get('tasks',alert.taskId)?.title||'';const titleKey=taskAlertTitleKey(alert.taskTitle||alert.body),previous=latestByTitle.get(titleKey);if(!previous||(alert.createdAt||0)>=(previous.createdAt||0))latestByTitle.set(titleKey,alert)});taskAlerts.push(...latestByTitle.values())}notificationsSnoozedUntil=Number.isFinite(state.snoozedUntil)?state.snoozedUntil:0;persistTaskAlertState();renderTaskAlerts()}catch(err){toast('تعذر استعادة التنبيهات المحفوظة: '+err.message)}}
  function renderTaskAlerts(){
    const list=document.getElementById('taskAlerts'),count=document.getElementById('notificationCount'),panelCount=document.getElementById('notificationPanelCount'),bell=document.getElementById('notificationBell');
    count.textContent=String(taskAlerts.length);count.hidden=taskAlerts.length===0;panelCount.textContent=`(${taskAlerts.length})`;bell.setAttribute('aria-label',`الإشعارات: ${taskAlerts.length}`);
    list.innerHTML=taskAlerts.length?taskAlerts.map(alert=>`<article class="task-alert" role="alert" aria-labelledby="alert-title-${esc(alert.key)}"><h3 id="alert-title-${esc(alert.key)}">${esc(alert.title)}</h3><p>${esc(alert.body)}</p><div class="task-alert-actions"><button type="button" class="btn primary" data-alert-action="show" data-alert-key="${esc(alert.key)}">إظهار المتابعة</button><button type="button" class="btn" data-alert-action="dismiss" data-alert-key="${esc(alert.key)}">إخفاء</button></div></article>`).join(''):'<div class="notification-empty">لا توجد إشعارات حالياً</div>';
    if(!list.dataset.alertActionsBound){
      list.dataset.alertActionsBound='1';
      list.addEventListener('click',event=>{
        const target=event.target instanceof Element?event.target:null;
        const button=target?.closest('button[data-alert-action]');
        if(!button||!list.contains(button))return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        const action=button.getAttribute('data-alert-action'),key=button.getAttribute('data-alert-key');
        if(!key)return;
        try{
          if(action==='show')showAlertTask(key);
          else if(action==='dismiss'){const removed=removeTaskAlert(key);if(removed)toast('تم إخفاء الإشعار')}
        }catch(error){toast('تعذر تنفيذ الإجراء: '+(error?.message||'خطأ غير معروف'))}
      },true);
    }
    refreshSnoozeButton();
  }
  function closeBrowserNotification(key){const notification=browserNotifications.get(key);if(notification){browserNotifications.delete(key);try{const result=notification.close();if(result?.catch)result.catch(err=>toast('تعذر إغلاق إشعار النظام: '+err.message))}catch(err){toast('تعذر إغلاق إشعار النظام: '+err.message)}return}if(!serviceWorkerRegistration||typeof serviceWorkerRegistration.getNotifications!=='function')return;try{serviceWorkerRegistration.getNotifications({tag:key}).then(notifications=>notifications.forEach(item=>item.close())).catch(err=>toast('تعذر إغلاق إشعار النظام: '+err.message))}catch(err){toast('تعذر إغلاق إشعار النظام: '+err.message)}}
  function recordTaskAlertDismissal(key){if(!isReady)return;const dismissed=new Set(db.taskNotificationDismissals||[]);if(dismissed.has(key))return;dismissed.add(key);db.taskNotificationDismissals=[...dismissed];localRevision++;saveDatabase(db).catch(err=>toast('تعذر مزامنة إخفاء الإشعار: '+err.message))}
  function removeTaskAlert(key){const index=taskAlerts.findIndex(alert=>alert.key===key);if(index<0)return null;const [alert]=taskAlerts.splice(index,1);recordTaskAlertDismissal(key);closeBrowserNotification(key);persistTaskAlertState();renderTaskAlerts();return alert}
  function showAlertTask(key){
    const alert=taskAlerts.find(item=>item.key===key);
    if(!alert)return;
    if(!get('tasks',alert.taskId)){toast('لم تعد هذه المتابعة موجودة');return}
    removeTaskAlert(key);
    document.getElementById('notificationPanel').hidden=true;
    document.getElementById('notificationBell').setAttribute('aria-expanded','false');
    showView('tasks');
    openForm('task',alert.taskId);
  }
  function toggleTaskAlertSnooze(){if(notificationsSnoozedUntil>Date.now()){notificationsSnoozedUntil=0;persistTaskAlertState();refreshSnoozeButton();toast('تمت إعادة تفعيل التنبيهات');checkTaskNotifications();return}notificationsSnoozedUntil=Date.now()+60*60*1000;taskAlerts.forEach(alert=>closeBrowserNotification(alert.key));persistTaskAlertState();refreshSnoozeButton();toast('تم إيقاف التنبيهات لمدة ساعة')}
  async function sendSystemTaskNotification(alert){if(window.smartNoteNativeNotifications?.isNative){return}if(!('Notification'in window)||Notification.permission!=='granted')return;if(!serviceWorkerRegistration&&'serviceWorker'in navigator)serviceWorkerRegistration=await navigator.serviceWorker.ready;if(!serviceWorkerRegistration||typeof serviceWorkerRegistration.showNotification!=='function')throw new Error('إشعارات النظام غير مدعومة أو Service Worker غير جاهز');const taskTitle=get('tasks',alert.taskId)?.title||alert.body,tag=`task-title:${encodeURIComponent(taskAlertTitleKey(taskTitle))}`,options={body:`${alert.title}: ${alert.body}`,tag,data:{taskId:alert.taskId,key:alert.key}};try{await serviceWorkerRegistration.showNotification('دفتر العقارات الذكي',options)}catch(err){options.tag=alert.key;await serviceWorkerRegistration.showNotification(alert.title,options)}browserNotifications.set(alert.key,{close:()=>serviceWorkerRegistration.getNotifications({tag:options.tag}).then(notifications=>notifications.forEach(notification=>notification.close()))})}
  function sendTaskNotification(task,type,title,body){const key=`${task.id}:${type}:${type==='due'?taskDueTimestamp(task):task.startedAt}`;if(notifiedTaskReminders.has(key)||notificationsSnoozedUntil>Date.now())return;notifiedTaskReminders.add(key);const titleKey=taskAlertTitleKey(task.title);taskAlerts.filter(alert=>taskAlertTitleKey(alert.taskTitle||get('tasks',alert.taskId)?.title||alert.body)===titleKey).forEach(alert=>{closeBrowserNotification(alert.key);taskAlerts.splice(taskAlerts.indexOf(alert),1)});const alert={key,taskId:task.id,title,body,taskTitle:task.title,createdAt:Date.now()};taskAlerts.push(alert);if(!window.smartNoteNativeNotifications?.isNative&&'Notification'in window&&Notification.permission==='granted')sendSystemTaskNotification(alert).catch(err=>toast('تعذر إرسال إشعار النظام: '+err.message));persistTaskAlertState();renderTaskAlerts();if(!document.hidden)playNotificationSound()}
  function checkTaskNotifications(){const now=Date.now();refreshSnoozeButton();if(!isReady||notificationsSnoozedUntil>now)return;for(const task of db.tasks){if(task.status==='مكتملة')continue;const due=taskDueTimestamp(task);if(task.status!=='قيد التنفيذ'&&Number.isFinite(due)&&now>=due)sendTaskNotification(task,'due','المتابعة ما زالت معلقة',`حان موعد المتابعة: ${task.title}`);if(task.status==='قيد التنفيذ'&&task.startedAt&&now-Date.parse(task.startedAt)>=60*60*1000)sendTaskNotification(task,'in_progress','هل ما زلت تعمل على المتابعة؟',`مرّت ساعة على بدء: ${task.title}. افتح المتابعة وغيّر حالتها إلى مكتملة إذا انتهيت.`)}}
  function get(type,id){return db[type]?.find(x=>x.id===id)}
  function syncNativeTaskReminders(){if(!window.smartNoteNativeNotifications?.isNative||!isReady)return Promise.resolve();return window.smartNoteNativeNotifications.syncTaskReminders(db.tasks).catch(err=>toast('تعذر جدولة تذكيرات الهاتف: '+err.message))}
  function nameOf(type,id){return get(type,id)?.name||'غير مرتبط'}
  function setConnection(ok,msg){document.getElementById('connectionDot').classList.toggle('online',!!ok);document.getElementById('connectionText').textContent=ok?'متصل بقاعدة البيانات':'غير متصل';document.getElementById('connectionHint').textContent=msg||(ok?'تم الاتصال بـ Google Sheets.':'يلزم الاتصال بالإنترنت وقاعدة البيانات.')}
  function showGate(message){document.getElementById('onlineGateMessage').textContent=message;document.getElementById('onlineGate').style.display='flex'}
  function hideGate(){document.getElementById('onlineGate').style.display='none'}
  function updateQuickAdd(view){const button=document.getElementById('quickAdd'),action=QUICK_ACTIONS[view];button.dataset.quickAddType=action?.[0]||'';button.innerHTML=`<i data-lucide="plus"></i> ${action?.[1]||'إضافة جديدة'}`;if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  let currentView='dashboard',exitPromptArmed=false,exitPromptTimer=0;
  function showView(view){currentView=view;exitPromptArmed=false;document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));const el=document.getElementById('view-'+view)||document.getElementById(view==='searchResults'?'searchResults':'view-dashboard');el.classList.add('active');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.getElementById('pageHeading').textContent=(TITLES[view]||['نتائج البحث','بحث شامل'])[0];document.getElementById('pageSub').textContent=(TITLES[view]||['نتائج البحث','بحث شامل'])[1];updateQuickAdd(view)}
  const appShell=document.querySelector('.app'),sidebarToggle=document.getElementById('sidebarToggle'),SIDEBAR_STATE_KEY='aqarSidebarCollapsed';
  function setSidebarCollapsed(collapsed){appShell.classList.toggle('sidebar-collapsed',collapsed);const language=document.documentElement.lang,icon=collapsed?'panel-left-open':'panel-left-close',label=language==='en'?(collapsed?'Expand sidebar':'Collapse sidebar'):(collapsed?'توسيع الشريط الجانبي':'طي الشريط الجانبي');sidebarToggle.innerHTML=`<i data-lucide="${icon}"></i>`;sidebarToggle.setAttribute('aria-label',label);sidebarToggle.title=label;try{localStorage.setItem(SIDEBAR_STATE_KEY,collapsed?'1':'0')}catch{}if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  sidebarToggle.onclick=()=>setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));try{setSidebarCollapsed(localStorage.getItem(SIDEBAR_STATE_KEY)==='1')}catch{setSidebarCollapsed(false)}
  window.addEventListener('app-language-change',()=>{setSidebarCollapsed(appShell.classList.contains('sidebar-collapsed'));refreshNotificationButton()});
  document.addEventListener('click',e=>{const recordView=e.target.closest('[data-record-view]');if(recordView){showRecord(recordView.dataset.recordView,recordView.dataset.id);return}const v=e.target.closest('[data-view]');if(v){showView(v.dataset.view);return}const a=e.target.closest('[data-add]');if(a)openForm(a.dataset.add);const edit=e.target.closest('[data-edit]');if(edit)openForm(edit.dataset.edit,edit.dataset.id);const status=e.target.closest('[data-task-status]');if(status){changeTaskStatus(status.dataset.id,status.dataset.taskStatus,status);return}const del=e.target.closest('[data-delete]');if(del)deleteItem(del.dataset.delete,del.dataset.id)});
  const schemas={
    workspace:[['name','اسم المساحة','text',true],['description','وصف مختصر','textarea'],['color','لون المساحة','color']],
    project:[['name','اسم المشروع','text',true],['developer','المطور العقاري','text'],['workspaceId','مساحة العمل','workspace'],['location','المنطقة / الموقع','text'],['type','نوع المشروع','select:سكني,تجاري,إداري,ساحلي,متعدد الاستخدامات'],['delivery','موعد التسليم','text'],['payment','أنظمة السداد','textarea'],['commission','العمولة','text'],['mapUrl','رابط الموقع على الخريطة','url'],['description','تفاصيل ومعلومات المشروع','textarea']],
    unit:[['name','اسم أو كود الوحدة','text',true],['projectId','المشروع','project',true],['type','نوع الوحدة','select:شقة,فيلا,تاون هاوس,توين هاوس,دوبلكس,محل,مكتب,عيادة,أخرى'],['area','المساحة بالمتر','number'],['floor','الدور','text'],['bedrooms','عدد الغرف','number'],['price','السعر','number'],['downPayment','المقدم','number'],['installments','تفاصيل الأقساط','textarea'],['delivery','التسليم','text'],['status','الحالة','select:متاحة,محجوزة,مباعة,غير محدد'],['details','تفاصيل إضافية','textarea']],
    note:[['title','عنوان الملاحظة','text',true],['content','المحتوى','textarea',true],['workspaceId','مساحة العمل','workspace'],['projectId','المشروع المرتبط','project'],['unitId','الوحدة المرتبطة','unit'],['clientId','العميل المرتبط','client'],['tags','التصنيفات (افصل بينها بفاصلة)','text']],
    client:[['name','اسم العميل','text',true],['phone','رقم الهاتف','tel'],['budget','الميزانية','text'],['area','المنطقة المطلوبة','text'],['unitType','نوع الوحدة المطلوبة','text'],['status','حالة العميل','select:جديد,مهتم,متابعة,تعاقد,غير مهتم'],['notes','ملاحظات','textarea']],
    task:[['title','عنوان المتابعة','text',true],['dueDate','تاريخ المتابعة','date'],['dueTime','الوقت','time'],['status','الحالة','select:معلقة,قيد التنفيذ,مكتملة'],['priority','الأولوية','select:عادية,مهمة,عاجلة'],['clientId','العميل','client'],['projectId','المشروع','project'],['unitId','الوحدة','unit'],['details','التفاصيل','textarea']]
  };
  const TYPE_MAP={workspace:'workspaces',project:'projects',unit:'units',note:'notes',client:'clients',task:'tasks'};
  function optionsFor(type){return db[TYPE_MAP[type]||type]||[]}
  function fieldHTML(f,val=''){const [key,label,type,required]=f;let input='';if(['workspace','project','unit','client'].includes(type)){const arr=optionsFor(type);input=`<select name="${key}"><option value="">بدون تحديد</option>${arr.map(x=>`<option value="${esc(x.id)}" ${val===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`}else if(type.startsWith('select:')){const opts=type.slice(7).split(',');input=`<select name="${key}"><option value="">اختر...</option>${opts.map(x=>`<option value="${esc(x)}" ${val===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`}else if(type==='textarea'){input=`<textarea name="${key}" ${required?'required':''}>${esc(val)}</textarea>`}else{input=`<input name="${key}" type="${type}" value="${esc(val)}" ${required?'required':''} ${type==='color'?'':''}>`}return `<div class="field ${type==='textarea'?'full':''}"><label>${esc(label)}${required?' *':''}</label>${input}</div>`}
  function openForm(type,id=null){const schema=schemas[type];if(!schema)return;const collection=TYPE_MAP[type],old=id?get(collection,id):{};editing={type,id};document.getElementById('modalTitle').textContent=(id?'تعديل ':'إضافة ')+LABELS[collection];document.getElementById('formFields').innerHTML=schema.map(f=>fieldHTML(f,old?.[f[0]]??(f[0]==='color'?'#5b8cff':''))).join('');document.getElementById('modalBackdrop').classList.add('show')}
  function closeForm(){document.getElementById('modalBackdrop').classList.remove('show');editing=null}
  let viewedRecord=null;
  const EXTRA_LABELS={id:'معرّف السجل',createdAt:'تاريخ الإنشاء',updatedAt:'آخر تحديث',startedAt:'تاريخ بدء المتابعة',color:'اللون',mapUrl:'رابط الموقع',commission:'العمولة',installments:'تفاصيل الأقساط'};
  function detailValue(value,key,type){
    if(value===null||value===undefined||value==='')return '<span class="detail-empty">—</span>';
    if(type&&TYPE_MAP[type]){const linked=get(TYPE_MAP[type],value);return esc(linked?.name||linked?.title||value)}
    if(Array.isArray(value))return esc(value.join('، '));
    if(typeof value==='object')return esc(JSON.stringify(value));
    if(type==='color'||key==='color'){const color=String(value),safeColor=/^#[\da-f]{3,8}$/i.test(color)?color:'#777777';return `<span class="detail-color"><i style="background:${safeColor}"></i>${esc(color)}</span>`}
    if((type?.startsWith('select:')||['status','priority'].includes(key))&&window.appTranslate)return esc(window.appTranslate(value));
    if(type==='url'||key==='mapUrl'){
      try{const url=new URL(String(value),location.href);if(['http:','https:'].includes(url.protocol))return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(value)}</a>`}catch{}
    }
    if(['createdAt','updatedAt','startedAt'].includes(key)){const date=new Date(value);if(!Number.isNaN(date.getTime()))return esc(date.toLocaleString(document.documentElement.lang==='en'?'en-US':'ar-EG'))}
    return esc(value);
  }
  function showRecord(type,id){
    const resolvedType=TYPE_MAP[type]?type:Object.keys(TYPE_MAP).find(key=>TYPE_MAP[key]===type),collection=TYPE_MAP[resolvedType],record=collection&&get(collection,id),schema=schemas[resolvedType];if(!record||!schema)return;
    viewedRecord={type:resolvedType,id};document.getElementById('detailTitle').textContent=record.name||record.title||LABELS[collection]||'تفاصيل السجل';
    const fields=schema.map(([key,label,inputType])=>({key,label,value:record[key],inputType}));
    Object.keys(record).filter(key=>!['id','createdAt','updatedAt'].includes(key)&&!schema.some(field=>field[0]===key)).forEach(key=>fields.push({key,label:EXTRA_LABELS[key]||key,value:record[key]}));
    document.getElementById('detailFields').innerHTML=fields.map(field=>`<div class="detail-field"><dt>${esc(field.label)}</dt><dd>${detailValue(field.value,field.key,field.inputType)}</dd></div>`).join('');
    document.getElementById('detailBackdrop').classList.add('show');if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function closeRecord(){document.getElementById('detailBackdrop').classList.remove('show');viewedRecord=null}
  document.getElementById('detailClose').onclick=closeRecord;document.getElementById('detailDismiss').onclick=closeRecord;document.getElementById('detailBackdrop').addEventListener('click',event=>{if(event.target.id==='detailBackdrop')closeRecord()});
  document.getElementById('detailEdit').onclick=()=>{if(!viewedRecord)return;const {type,id}=viewedRecord;closeRecord();openForm(type,id)};
  let confirmResolver=null;
  function confirmInApp(message){document.getElementById('confirmMessage').textContent=message;document.getElementById('confirmBackdrop').classList.add('show');return new Promise(resolve=>{confirmResolver=resolve})}
  function finishConfirm(result){document.getElementById('confirmBackdrop').classList.remove('show');if(confirmResolver){confirmResolver(result);confirmResolver=null}}
  document.getElementById('confirmAccept').onclick=()=>finishConfirm(true);document.getElementById('confirmCancel').onclick=()=>finishConfirm(false);document.getElementById('cancelConfirmClose').onclick=()=>finishConfirm(false);document.getElementById('confirmBackdrop').addEventListener('click',event=>{if(event.target.id==='confirmBackdrop')finishConfirm(false)});
  document.getElementById('closeModal').onclick=closeForm;document.getElementById('cancelModal').onclick=closeForm;document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeForm()});
  document.getElementById('entityForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!editing)return;if(!isReady){toast('يلزم تسجيل الدخول أولاً');return}
    const submit=e.target.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='جاري الحفظ...';
    try{
      const {type,id}=editing,collection=TYPE_MAP[type],old=id?get(collection,id):{};
      const data=Object.fromEntries(new FormData(e.target).entries());if(type==='note')data.tags=(data.tags||'').split(',').map(x=>x.trim()).filter(Boolean);
      const now=new Date().toISOString(),record={...old,...data,id:id||uid(),createdAt:old?.createdAt||now,updatedAt:now};if(type==='task'){record.status=data.status||old?.status||'معلقة';record.startedAt=record.status==='قيد التنفيذ'?(old?.status===record.status?(old.startedAt||old.updatedAt||now):now):null}if(type==='workspace'&&!record.color)record.color='#5b8cff';
      const next={...db,[collection]:id?db[collection].map(x=>x.id===id?record:x):[record,...db[collection]]};
      const result=await saveDatabase(next);db=next;localRevision++;cacheLocalDatabase(db,!navigator.onLine||!!result?.queued);renderAll();syncNativeTaskReminders();closeForm();toast(navigator.onLine&&!result?.queued?'تم حفظ البيانات على Google Sheets':'تم الحفظ على الجهاز وستتم المزامنة عند عودة الإنترنت');
    }catch(err){toast('فشل الحفظ: '+err.message)}finally{submit.disabled=false;submit.textContent='حفظ البيانات'}
  });
  async function deleteItem(type,id){
    const collection=TYPE_MAP[type]||type;if(!await confirmInApp('هل تريد حذف هذا السجل نهائياً من قاعدة البيانات؟'))return;
    if(!isReady){toast('يلزم تسجيل الدخول أولاً');return}
    const next={...db,[collection]:db[collection].filter(x=>x.id!==id)};
    try{const result=await saveDatabase(next);db=next;localRevision++;cacheLocalDatabase(db,!navigator.onLine||!!result?.queued);renderAll();syncNativeTaskReminders();toast(navigator.onLine&&!result?.queued?'تم حذف السجل من Google Sheets':'تم الحذف محلياً وستتم المزامنة عند عودة الإنترنت')}catch(err){toast('فشل الحذف: '+err.message)}
  }
  async function changeTaskStatus(id,status,button){
    if(!isReady){toast('يلزم تسجيل الدخول أولاً');return}
    const task=get('tasks',id);if(!task)return;
    const nextStatus=status==='قيد التنفيذ'?'مكتملة':status==='معلقة'?'قيد التنفيذ':null;
    if(!nextStatus)return;
    const currentStatus=task.status==='قيد التنفيذ'?'قيد التنفيذ':task.status==='مكتملة'?'مكتملة':'معلقة';
    if(currentStatus!==status){toast('تم تحديث حالة المتابعة على جهاز آخر؛ انتظر المزامنة ثم حاول مرة أخرى');return}
    button.disabled=true;
    const now=new Date().toISOString(),record={...task,status:nextStatus,updatedAt:now,startedAt:nextStatus==='قيد التنفيذ'?now:null};
    const next={...db,tasks:db.tasks.map(item=>item.id===id?record:item)};
    try{const result=await saveDatabase(next);db=next;localRevision++;cacheLocalDatabase(db,!navigator.onLine||!!result?.queued);renderAll();syncNativeTaskReminders();toast(!navigator.onLine||result?.queued?'تم الحفظ محلياً وستتم المزامنة عند عودة الإنترنت':(nextStatus==='قيد التنفيذ'?'بدأت المتابعة':'تم إنهاء المتابعة'))}
    catch(err){button.disabled=false;toast('فشل تغيير حالة المتابعة: '+err.message)}
  }
  function emptyHTML(title,sub){return `<div class="empty"><b>${esc(title)}</b>${esc(sub)}</div>`}
  function actions(type,item){const statusAction=type==='task'&&item.status!=='مكتملة'?`<button class="btn small primary" data-task-status="${esc(item.status==='قيد التنفيذ'?'قيد التنفيذ':'معلقة')}" data-id="${esc(item.id)}">${item.status==='قيد التنفيذ'?'إنهاء':'بدء'}</button>`:'';return `<div class="card-actions"><button class="btn small" data-record-view="${type}" data-id="${esc(item.id)}"><i data-lucide="eye"></i> عرض</button><button class="btn small" data-edit="${type}" data-id="${esc(item.id)}">تعديل</button>${statusAction}<button class="btn small danger" data-delete="${type}" data-id="${esc(item.id)}">حذف</button></div>`}
  function renderAll(){renderDashboard();renderWorkspaces();renderProjects();renderUnits();renderNotes();renderClients();renderTasks();refreshFilters();if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  window.addEventListener('app-language-change',renderAll);
  function renderDashboard(){for(const [id,key] of [['statSpaces','workspaces'],['statProjects','projects'],['statUnits','units'],['statNotes','notes']])document.getElementById(id).textContent=db[key].length;renderRecentActions();const spaces=db.workspaces.slice(0,5);document.getElementById('dashboardSpaces').innerHTML=spaces.length?spaces.map(s=>`<div class="list-item"><div class="workspace-row"><span class="workspace-color" style="background:${esc(s.color||'#5b8cff')}"></span><strong>${esc(s.name)}</strong></div><span class="pill">${db.projects.filter(p=>p.workspaceId===s.id).length} مشاريع</span></div>`).join(''):emptyHTML('لا توجد مساحات عمل','أنشئ مساحة لتنظيم مشروعاتك.');const tasks=sortedTasks(db.tasks.filter(t=>t.status!=='مكتملة')).slice(0,5);document.getElementById('dashboardTasks').innerHTML=tasks.length?tasks.map(taskCard).join(''):emptyHTML('لا توجد متابعات مفتوحة','أضف متابعة جديدة لتظهر هنا حسب أولويتها.')}
  function renderRecentActions(){const entries=TYPES.flatMap(collection=>db[collection].map(record=>{const created=record.createdAt||'',updated=record.updatedAt||created;return{record,collection,updatedAt:updated,sortTime:Date.parse(updated)||Date.parse(created)||0,isUpdate:!!created&&!!record.updatedAt&&record.updatedAt!==created}})).sort((a,b)=>b.sortTime-a.sortTime).slice(0,6);const host=document.getElementById('dashboardActivity');host.innerHTML=entries.length?entries.map(({record,collection,updatedAt,isUpdate})=>{const entity=window.appTranslate(LABELS[collection]),description=document.documentElement.lang==='en'?`${isUpdate?'Updated':'Added'} ${entity.toLowerCase()}`:`${isUpdate?'تعديل':'إضافة'} ${LABELS[collection]}`;return`<div class="list-item"><div><strong>${esc(record.name||record.title||'بدون عنوان')}</strong><small>${esc(description)}</small></div><span class="pill">${dateLabel(updatedAt)}</span></div>`}).join(''):emptyHTML('لا توجد إجراءات بعد','أضف أو عدّل سجلًا ليظهر هنا.')}
  function renderWorkspaces(){const el=document.getElementById('workspaceList');el.innerHTML=db.workspaces.length?db.workspaces.map(s=>`<article class="entity-card"><div class="workspace-row"><span class="workspace-color" style="background:${esc(s.color||'#5b8cff')}"></span><h3>${esc(s.name)}</h3></div><p>${esc(s.description||'لا يوجد وصف')}</p><div class="entity-meta"><span class="pill">${db.projects.filter(x=>x.workspaceId===s.id).length} مشروع</span><span class="pill">${db.notes.filter(x=>x.workspaceId===s.id).length} ملاحظة</span></div>${actions('workspace',s)}</article>`).join(''):emptyHTML('ابدأ بإنشاء مساحة عمل','مثلاً: الساحل الشمالي، القاهرة، معلومات عامة.')}
  function renderProjects(){const q=(document.getElementById('projectFilter')?.value||'').toLowerCase(),w=document.getElementById('projectWorkspaceFilter')?.value||'';const arr=db.projects.filter(p=>(!w||p.workspaceId===w)&&JSON.stringify(p).toLowerCase().includes(q));document.getElementById('projectList').innerHTML=arr.length?arr.map(p=>`<article class="entity-card"><h3>${esc(p.name)}</h3><p>${esc([p.developer,p.location,p.type?window.appTranslate(p.type):''].filter(Boolean).join(' • ')||'لا توجد تفاصيل إضافية')}</p><div class="entity-meta"><span class="pill">${esc(nameOf('workspaces',p.workspaceId))}</span><span class="pill">${db.units.filter(u=>u.projectId===p.id).length} وحدات</span>${p.delivery?`<span class="pill amber">تسليم ${esc(p.delivery)}</span>`:''}</div>${p.payment?`<p class="spaced-copy">${esc(p.payment.slice(0,130))}</p>`:''}${actions('project',p)}</article>`).join(''):emptyHTML('لا توجد مشاريع مطابقة','أضف مشروعاً جديداً أو غيّر كلمات البحث.')}
  function renderUnits(){const q=(document.getElementById('unitFilter')?.value||'').toLowerCase(),p=document.getElementById('unitProjectFilter')?.value||'';const arr=db.units.filter(u=>(!p||u.projectId===p)&&JSON.stringify(u).toLowerCase().includes(q));document.getElementById('unitList').innerHTML=arr.length?arr.map(u=>`<article class="entity-card"><h3>${esc(u.name)}</h3><p>${esc(nameOf('projects',u.projectId))} • ${esc(u.type?window.appTranslate(u.type):'وحدة')}</p><div class="entity-meta">${u.area?`<span class="pill">${esc(u.area)} م²</span>`:''}${u.floor?`<span class="pill">الدور ${esc(u.floor)}</span>`:''}${u.price?`<span class="pill green">${Number(u.price).toLocaleString('en-US')} جنيه</span>`:''}<span class="pill">${esc(u.status||'غير محدد')}</span></div>${actions('unit',u)}</article>`).join(''):emptyHTML('لا توجد وحدات مسجلة','أضف وحدة واربطها بأحد المشاريع.')}
  function renderNotes(){const q=(document.getElementById('noteFilter')?.value||'').toLowerCase(),w=document.getElementById('noteWorkspaceFilter')?.value||'';const arr=[...db.notes].filter(n=>(!w||n.workspaceId===w)&&JSON.stringify(n).toLowerCase().includes(q)).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''));document.getElementById('noteList').innerHTML=arr.length?arr.map(n=>`<article class="entity-card"><h3>${esc(n.title)}</h3><p>${esc([nameOf('projects',n.projectId),nameOf('units',n.unitId),nameOf('clients',n.clientId)].filter(x=>x!=='غير مرتبط').join(' • ')||'ملاحظة عامة')}</p><div class="note-body">${esc(n.content||'')}</div>${n.tags?.length?`<div class="note-tags">${n.tags.map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}<div class="entity-meta spaced-meta"><span class="pill">${dateLabel(n.updatedAt)}</span><span class="pill">${esc(nameOf('workspaces',n.workspaceId))}</span></div>${actions('note',n)}</article>`).join(''):emptyHTML('دفتر الملاحظات فارغ','سجل معلومة سريعة واربطها بمشروع أو وحدة أو عميل.')}
  function renderClients(){const el=document.getElementById('clientList');el.innerHTML=db.clients.length?db.clients.map(c=>`<article class="entity-card"><h3>${esc(c.name)}</h3><p>${esc(c.phone||'لا يوجد رقم هاتف')} • ${esc(c.area||'منطقة غير محددة')}</p><div class="entity-meta"><span class="pill">${esc(c.status||'جديد')}</span>${c.budget?`<span class="pill green">${esc(c.budget)}</span>`:''}</div>${c.notes?`<p class="spaced-copy">${esc(c.notes.slice(0,120))}</p>`:''}${actions('client',c)}</article>`).join(''):emptyHTML('لا يوجد عملاء','أضف بيانات العملاء واحتياجاتهم.')}
  function taskPriorityRank(task){return {'عاجلة':0,'مهمة':1,'عادية':2}[task.priority]??3}
  function sortedTasks(tasks){return [...tasks].sort((a,b)=>taskPriorityRank(a)-taskPriorityRank(b)||(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||(a.dueTime||'').localeCompare(b.dueTime||''))}
  function taskCard(t){return `<article class="entity-card"><h3>${esc(t.title)}</h3><p>${esc([nameOf('clients',t.clientId),nameOf('projects',t.projectId)].filter(x=>x!=='غير مرتبط').join(' • ')||'متابعة عامة')}</p><div class="entity-meta"><span class="pill ${t.status==='مكتملة'?'green':t.status==='قيد التنفيذ'?'amber':'red'}">${esc(t.status||'معلقة')}</span><span class="pill ${t.priority==='عاجلة'?'red':t.priority==='مهمة'?'amber':''}">${esc(t.priority||'عادية')}</span><span class="pill">${dateLabel(t.dueDate)} ${esc(t.dueTime||'')}</span></div>${t.details?`<p class="spaced-copy">${esc(t.details.slice(0,110))}</p>`:''}${actions('task',t)}</article>`}
  function renderTasks(){const search=(document.getElementById('taskSearch')?.value||'').trim().toLowerCase(),priority=document.getElementById('taskPriorityFilter')?.value||'',from=document.getElementById('taskDateFrom')?.value||'',to=document.getElementById('taskDateTo')?.value||'',groups=[['معلقة','taskPendingList','taskPendingCount'],['قيد التنفيذ','taskInProgressList','taskInProgressCount'],['مكتملة','taskCompletedList','taskCompletedCount']];for(const [status,listId,countId] of groups){const tasks=sortedTasks(db.tasks.filter(task=>{const taskStatus=task.status==='مكتملة'?'مكتملة':task.status==='قيد التنفيذ'?'قيد التنفيذ':'معلقة',dueDate=task.dueDate||'';return taskStatus===status&&(!search||JSON.stringify(task).toLowerCase().includes(search))&&(!priority||task.priority===priority)&&(!from&&!to||!!dueDate&&(!from||dueDate>=from)&&(!to||dueDate<=to))}));document.getElementById(countId).textContent=String(tasks.length);document.getElementById(listId).innerHTML=tasks.length?tasks.map(taskCard).join(''):emptyHTML('لا توجد متابعات مطابقة','غيّر الفلاتر أو أضف متابعة جديدة.')}}
  function refreshFilters(){const fill=(id,arr,first)=>{const el=document.getElementById(id);if(!el)return;const val=el.value;el.innerHTML=`<option value="">${first}</option>`+arr.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');el.value=val};fill('projectWorkspaceFilter',db.workspaces,'كل المساحات');fill('unitProjectFilter',db.projects,'كل المشاريع');fill('noteWorkspaceFilter',db.workspaces,'كل المساحات')}
  ['projectFilter','projectWorkspaceFilter','unitFilter','unitProjectFilter','noteFilter','noteWorkspaceFilter'].forEach(id=>document.getElementById(id).addEventListener('input',()=>({projectFilter:renderProjects,projectWorkspaceFilter:renderProjects,unitFilter:renderUnits,unitProjectFilter:renderUnits,noteFilter:renderNotes,noteWorkspaceFilter:renderNotes})[id]()));
  ['taskSearch','taskPriorityFilter','taskDateFrom','taskDateTo'].forEach(id=>document.getElementById(id).addEventListener('input',renderTasks));
  document.getElementById('quickAdd').onclick=event=>{const type=event.currentTarget.dataset.quickAddType;if(type)openForm(type);else document.getElementById('quickAddBackdrop').classList.add('show')};document.getElementById('quickAddClose').onclick=()=>document.getElementById('quickAddBackdrop').classList.remove('show');document.getElementById('quickAddBackdrop').addEventListener('click',event=>{if(event.target.id==='quickAddBackdrop')event.currentTarget.classList.remove('show');const button=event.target.closest('[data-quick-type]');if(button){event.currentTarget.classList.remove('show');openForm(button.dataset.quickType)}});
  document.getElementById('globalSearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchAll(e.target.value)});
  function searchAll(q){q=q.trim().toLowerCase();if(!q)return;const results=[];for(const type of TYPES)for(const x of db[type])if(JSON.stringify(x).toLowerCase().includes(q))results.push({type,item:x});document.getElementById('searchCaption').textContent=`${results.length} نتيجة عن: ${q}`;document.getElementById('searchList').innerHTML=results.length?results.map(({type,item})=>`<article class="entity-card"><div class="entity-meta"><span class="pill">${LABELS[type]}</span></div><h3 class="spaced-title">${esc(item.name||item.title||'بدون عنوان')}</h3><p>${esc(item.content||item.description||item.location||item.phone||'')}</p><div class="card-actions"><button class="btn small" data-record-view="${type}" data-id="${esc(item.id)}"><i data-lucide="eye"></i> عرض</button><button class="btn small" data-view="${type}">فتح القسم</button></div></article>`).join(''):emptyHTML('لا توجد نتائج','جرّب كلمات بحث أخرى.');document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));document.getElementById('searchResults').classList.add('active');document.getElementById('pageHeading').textContent='نتائج البحث';document.getElementById('pageSub').textContent='بحث شامل في قاعدة بياناتك';updateQuickAdd('');if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  async function apiPost(payload){
    const response=await fetch(API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,token:authToken})});
    const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{throw new Error('لم تصل استجابة صالحة من Google Apps Script؛ تحقق من نشر Web App')}
    if(result.error)throw new Error(result.error);if(result.ok===false)throw new Error('تعذر تنفيذ العملية');return result;
  }
  function cloudPayload(state){return {...state,spaces:state.workspaces||[]}}
  async function saveDatabase(nextState){
    const snapshot=cloudPayload(nextState);
    cacheLocalDatabase(snapshot,true);
    if(!navigator.onLine||!authToken)return {queued:true};
    writesInProgress++;
    saveQueue=saveQueue.catch(()=>{}).then(()=>apiPost({action:'save',data:snapshot}));
    try{const result=await saveQueue;clearPendingSync();cacheLocalDatabase(snapshot,false);return result}catch(error){cacheLocalDatabase(snapshot,true);return {queued:true,error}}finally{writesInProgress--}
  }
  function normalizeDatabase(data){const d=data&&typeof data==='object'?data:{};return {...emptyDB(),...d,workspaces:Array.isArray(d.workspaces)?d.workspaces:(Array.isArray(d.spaces)?d.spaces:[]),tasks:Array.isArray(d.tasks)?d.tasks.map(task=>task.status==='قيد التنفيذ'&&!task.startedAt?{...task,startedAt:task.updatedAt||task.createdAt||null}:task):[]};}
  async function syncCloud(){
    if(!isReady||!authToken||!navigator.onLine||document.hidden||editing||writesInProgress||syncInFlight)return;
    syncInFlight=true;const revision=localRevision;
    try{
      if(hasPendingSync()){await apiPost({action:'save',data:cloudPayload(db)});clearPendingSync();cacheLocalDatabase(db,false)}
      const result=await apiPost({action:'load'});
      const remote=normalizeDatabase(result.data||{});
      if(revision!==localRevision||editing||writesInProgress)return;
      const dismissed=new Set([...(db.taskNotificationDismissals||[]),...(remote.taskNotificationDismissals||[])]);remote.taskNotificationDismissals=[...dismissed];
      if(JSON.stringify(cloudPayload(remote))!==JSON.stringify(cloudPayload(db))){db=remote;cacheLocalDatabase(db,false);renderAll();syncNativeTaskReminders()}
      const removed=taskAlerts.filter(alert=>dismissed.has(alert.key));if(removed.length){removed.forEach(alert=>closeBrowserNotification(alert.key));for(let i=taskAlerts.length-1;i>=0;i--)if(dismissed.has(taskAlerts[i].key))taskAlerts.splice(i,1);persistTaskAlertState();renderTaskAlerts()}
      setConnection(true,'مزامنة تلقائية كل 5 ثوانٍ.');
    }catch(err){setConnection(false,'تعذر تحديث البيانات: '+err.message)}
    finally{syncInFlight=false}
  }
  function showLogin(message=''){
    isReady=false;document.getElementById('onlineGate').style.display='none';
    let gate=document.getElementById('loginGate');
    if(!gate){
      gate=document.createElement('div');gate.id='loginGate';gate.className='online-gate login-gate';gate.style.zIndex='10000';
      gate.innerHTML='<div class="online-gate-card login-card"><div class="login-brand"><span class="login-brand-mark"><i data-lucide="building-2"></i></span><span><strong>SmartNote</strong><small>دفتر العقارات الذكي</small></span></div><div class="login-heading"><h2 class="online-gate-title">مرحباً بعودتك</h2><p class="online-gate-message">سجّل الدخول للوصول إلى بياناتك ومساحات عملك.</p></div><form id="loginForm" class="login-form"><label class="login-field"><span>اسم المستخدم</span><span class="login-input-wrap"><i data-lucide="user-round"></i><input id="loginUsername" autocomplete="username" placeholder="أدخل اسم المستخدم" required minlength="3"></span></label><label class="login-field"><span>كلمة المرور</span><span class="login-input-wrap"><i data-lucide="lock-keyhole"></i><input id="loginPassword" type="password" autocomplete="current-password" placeholder="أدخل كلمة المرور" required></span></label><p id="loginError" class="login-error" role="alert"></p><button class="btn primary login-submit" type="submit"><span>تسجيل الدخول</span><i data-lucide="arrow-left"></i></button></form><p class="login-footnote"><i data-lucide="shield-check"></i> بياناتك محفوظة بشكل مستقل وآمن</p></div>';
      document.body.appendChild(gate);
      document.getElementById('loginForm').addEventListener('submit',async e=>{
        e.preventDefault();const button=e.currentTarget.querySelector('button[type=submit]'),username=document.getElementById('loginUsername').value.trim(),password=document.getElementById('loginPassword').value;
        button.disabled=true;button.classList.add('is-loading');document.getElementById('loginError').textContent='جارٍ التحقق من بيانات الدخول...';
        try{const result=await apiPost({action:'login',username,password});authToken=result.token;currentUser=result.user;localStorage.setItem(SESSION_KEY,JSON.stringify({token:authToken,user:currentUser}));await afterLogin(result.data||{})}
        catch(err){if(err.message==='unauthorized'||err.message==='inactive_user'){authToken='';currentUser=null;localStorage.removeItem(SESSION_KEY);document.getElementById('loginError').textContent='اسم المستخدم أو كلمة المرور غير صحيحة'}else{document.getElementById('loginError').textContent='تعذر الاتصال بالخادم: '+err.message}}
        finally{button.disabled=false;button.classList.remove('is-loading')}
      });
      if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
    }
    gate.style.display='flex';document.getElementById('loginError').textContent=message;
  }
  async function afterLogin(preloadedData){
    if(currentUser?.mustChangePassword){const oldPassword=prompt(document.documentElement.lang==='en'?'Temporary password:':'أدخل كلمة المرور المؤقتة:');const newPassword=prompt(document.documentElement.lang==='en'?'Choose a new password (at least 10 characters):':'اختر كلمة مرور جديدة (10 أحرف على الأقل):');if(!oldPassword||!newPassword||newPassword.length<10){authToken='';currentUser=null;localStorage.removeItem(SESSION_KEY);showLogin(document.documentElement.lang==='en'?'Password change is required to continue.':'يجب تغيير كلمة المرور للمتابعة.');return}try{await apiPost({action:'change_password',oldPassword,newPassword});currentUser.mustChangePassword=false;localStorage.setItem(SESSION_KEY,JSON.stringify({token:authToken,user:currentUser}));toast(document.documentElement.lang==='en'?'Password updated.':'تم تغيير كلمة المرور بنجاح')}catch(error){authToken='';currentUser=null;localStorage.removeItem(SESSION_KEY);showLogin(document.documentElement.lang==='en'?'Could not change password. Sign in again.':'تعذر تغيير كلمة المرور. سجل الدخول مرة أخرى.');return}}
    const result=preloadedData&&typeof preloadedData==='object'?{data:preloadedData}:await apiPost({action:'load'});db=normalizeDatabase(result.data||{});isReady=true;localRevision=0;cacheLocalDatabase(db,false);renderAll();syncNativeTaskReminders();// Login gate is created only for manual login; keep automatic session restore safe.
    document.getElementById('loginGate')?.style.setProperty('display','none');hideGate();setConnection(true,'تم تسجيل الدخول؛ المزامنة كل 5 ثوانٍ.');
    if(currentUser?.role==='admin') addAdminButton();
    if(!document.getElementById('assignmentCenterButton')){const ab=document.createElement('button');ab.id='assignmentCenterButton';ab.className='btn small';ab.textContent=currentUser?.role==='admin'||currentUser?.role==='leader'?'لوحة التوزيع':'المهام المسندة';ab.onclick=openAssignmentCenter;document.querySelector('.top-actions').prepend(ab)}
    if(!document.getElementById('logoutButton')){const b=document.createElement('button');b.id='logoutButton';b.className='btn small';b.textContent=window.appTranslate?.('تسجيل الخروج')||(document.documentElement.lang==='en'?'Sign out':'تسجيل الخروج');b.onclick=async()=>{try{await apiPost({action:'logout'})}catch(_){}authToken='';currentUser=null;isReady=false;localStorage.removeItem(SESSION_KEY);showLogin('تم تسجيل الخروج.');document.getElementById('adminUsersButton')?.remove();b.remove()};document.querySelector('.top-actions').prepend(b)}

  }
  window.addEventListener('app-language-change',()=>{const button=document.getElementById('logoutButton');if(button)button.textContent=window.appTranslate?.('تسجيل الخروج')||(document.documentElement.lang==='en'?'Sign out':'تسجيل الخروج')});
  function addAdminButton(){
    if(document.getElementById('adminUsersButton'))return;
    const b=document.createElement('button');b.id='adminUsersButton';b.className='btn small';b.textContent='إدارة المستخدمين';b.onclick=openAdminPanel;document.querySelector('.top-actions').prepend(b);
  }
  async function openAdminPanel(){
    try{
      const data=await apiPost({action:'admin_list'});let panel=document.getElementById('adminPanel');
      if(!panel){
        panel=document.createElement('div');panel.id='adminPanel';panel.className='online-gate admin-gate';panel.style.zIndex='10001';
        panel.innerHTML='<section class="admin-shell"><header class="admin-header"><div><span class="admin-eyebrow">SMARTNOTE CONTROL CENTER</span><h2><i data-lucide="users-round"></i> إدارة المستخدمين</h2><p>إنشاء الحسابات والتحكم في الصلاحيات وكلمات المرور.</p></div><button class="btn icon-btn" id="closeAdminPanel" type="button" aria-label="إغلاق"><i data-lucide="x"></i></button></header><form id="createUserForm" class="admin-create-form"><div class="admin-create-title"><i data-lucide="user-plus"></i><strong>إضافة مستخدم جديد</strong></div><label><span>اسم المستخدم</span><input id="newUsername" class="filter-input" placeholder="مثال: ahmed123" required minlength="3" autocomplete="off"></label><label><span>كلمة المرور</span><input id="newPassword" class="filter-input" type="password" placeholder="10 أحرف على الأقل" required minlength="10" autocomplete="new-password"></label><label><span>الصلاحية</span><select id="newUserRole" class="filter-input"><option value="user">مستخدم</option><option value="leader">موزع</option><option value="admin">مدير</option></select></label><button class="btn primary" type="submit"><i data-lucide="plus"></i> إنشاء الحساب</button></form><div class="admin-list-heading"><div><h3>الحسابات المسجلة</h3><p id="adminUsersCount">إدارة حسابات النظام</p></div><span class="admin-count" id="adminCountBadge">0</span></div><div id="adminUsersList" class="admin-users-list"></div><footer class="admin-footer"><span>تغييرات الصلاحيات وكلمات المرور تُطبق فوراً.</span><button class="btn" id="adminDone" type="button">تم</button></footer></section>';
        document.body.appendChild(panel);
        panel.querySelector('#closeAdminPanel').onclick=()=>panel.style.display='none';
        panel.querySelector('#adminDone').onclick=()=>panel.style.display='none';
        panel.addEventListener('click',e=>{if(e.target===panel)panel.style.display='none'});
        panel.querySelector('#createUserForm').onsubmit=async e=>{
          e.preventDefault();const submit=panel.querySelector('#createUserForm button[type=submit]');submit.disabled=true;
          try{await apiPost({action:'admin_create',username:panel.querySelector('#newUsername').value.trim(),password:panel.querySelector('#newPassword').value,role:panel.querySelector('#newUserRole').value});panel.querySelector('#newUsername').value='';panel.querySelector('#newPassword').value='';toast('تم إنشاء المستخدم بنجاح');await openAdminPanel()}
          catch(err){toast(err.message==='username_exists'?'اسم المستخدم مستخدم بالفعل':err.message==='weak_password'?'كلمة المرور يجب ألا تقل عن 10 أحرف':err.message)}
          finally{submit.disabled=false}
        };
        panel.querySelector('#adminUsersList').addEventListener('click',async e=>{
          const button=e.target.closest('button[data-admin-action]');if(!button)return;
          const row=button.closest('[data-user-row]'),userId=row?.dataset.userRow;if(!userId)return;
          try{
            if(button.dataset.adminAction==='status'){await apiPost({action:'admin_status',userId,status:button.dataset.status});toast('تم تحديث حالة الحساب')}
            if(button.dataset.adminAction==='role'){await apiPost({action:'admin_role',userId,role:row.querySelector('[data-role-select]').value});toast('تم تحديث صلاحية المستخدم')}
            if(button.dataset.adminAction==='password'){const password=row.querySelector('[data-new-user-password]').value;if(password.length<10){toast('كلمة المرور يجب ألا تقل عن 10 أحرف');return}await apiPost({action:'admin_reset_password',userId,password});row.querySelector('[data-new-user-password]').value='';toast('تم تغيير كلمة المرور وإغلاق الجلسات السابقة')}
            await openAdminPanel();
          }catch(err){toast(err.message==='cannot_change_own_role'?'لا يمكن تغيير صلاحيتك من هذه الشاشة':err.message==='weak_password'?'كلمة المرور يجب ألا تقل عن 10 أحرف':err.message)}
        });
      }
      panel.querySelector('#adminUsersList').innerHTML=data.users.map(u=>'<article class="admin-user-card" data-user-row="'+esc(u.id)+'"><div class="admin-user-top"><div class="admin-avatar"><i data-lucide="user-round"></i></div><div class="admin-user-identity"><strong>'+esc(u.username)+'</strong><small>'+ (u.role==='admin'?'مدير النظام':u.role==='leader'?'موزع':'مستخدم') +' · '+(u.status==='active'?'نشط':'معطل')+'</small></div><span class="admin-status '+(u.status==='active'?'is-active':'is-disabled')+'">'+(u.status==='active'?'نشط':'معطل')+'</span></div><div class="admin-user-controls"><label><span>الصلاحية</span><select class="filter-input" data-role-select><option value="user" '+(u.role==='user'?'selected':'')+'>مستخدم</option><option value="leader" '+(u.role==='leader'?'selected':'')+'>موزع</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مدير</option></select></label><button class="btn small" data-admin-action="role" type="button">حفظ الصلاحية</button><button class="btn small" data-admin-action="status" data-status="'+(u.status==='active'?'disabled':'active')+'" type="button">'+(u.status==='active'?'تعطيل الحساب':'تفعيل الحساب')+'</button></div><div class="admin-password-row"><input class="filter-input" data-new-user-password type="password" minlength="10" placeholder="كلمة مرور جديدة (10 أحرف على الأقل)" autocomplete="new-password"><button class="btn small" data-admin-action="password" type="button"><i data-lucide="key-round"></i> تغيير كلمة المرور</button></div></article>').join('')||'<div class="admin-empty">لا يوجد مستخدمون حتى الآن.</div>';
      panel.querySelector('#adminUsersCount').textContent='إجمالي الحسابات: '+data.users.length;
      panel.querySelector('#adminCountBadge').textContent=String(data.users.length);
      panel.style.display='flex';if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
    }catch(err){toast('تعذر فتح إدارة المستخدمين: '+err.message)}
  }

  // Multi-user assignment center (separate from personal notebook records).
  const assignmentText=(ar,en)=>document.documentElement.lang==='en'?en:ar;
  async function openAssignmentCenter(){
    try{
      const [list,people,notices]=await Promise.all([
        apiPost({action:'assignment_list'}),
        (currentUser?.role==='admin'||currentUser?.role==='leader')?apiPost({action:'leader_users'}):Promise.resolve({users:[]}),
        apiPost({action:'notification_list'})
      ]);
      let modal=document.getElementById('assignmentCenter');
      if(!modal){
        modal=document.createElement('div');modal.id='assignmentCenter';modal.className='online-gate admin-gate';modal.style.zIndex='10002';
        modal.innerHTML='<section class="admin-shell" style="max-width:980px;max-height:92vh;overflow:auto"><header class="admin-header"><div><span class="admin-eyebrow">SMARTNOTE WORKFLOW</span><h2 id="assignmentCenterTitle"></h2><p id="assignmentCenterSubtitle"></p></div><button class="btn icon-btn" id="assignmentCenterClose" type="button" aria-label="Close"><i data-lucide="x"></i></button></header><div id="assignmentCreateArea"></div><div id="assignmentNotifications"></div><div id="assignmentCards" class="admin-users-list"></div></section>';
        document.body.appendChild(modal);modal.querySelector('#assignmentCenterClose').onclick=()=>modal.style.display='none';modal.addEventListener('click',e=>{if(e.target===modal)modal.style.display='none'});
      }
      const en=document.documentElement.lang==='en',t=(ar,eng)=>en?eng:ar;
      modal.querySelector('#assignmentCenterTitle').textContent=t('المهام المسندة','Assigned work');
      modal.querySelector('#assignmentCenterSubtitle').textContent=t('المتابعات المشتركة وسجل الإسناد والإشعارات','Shared assignments, delegation history and notifications');
      const createArea=modal.querySelector('#assignmentCreateArea');
      if(people.users.length){
        createArea.innerHTML='<form id="assignmentCreateForm" class="admin-create-form"><div class="admin-create-title"><i data-lucide="send"></i><strong>'+t('إسناد متابعة جديدة','Create an assignment')+'</strong></div><label><span>'+t('عنوان المتابعة','Title')+'</span><input class="filter-input" name="title" required maxlength="180"></label><label><span>'+t('التفاصيل','Description')+'</span><textarea class="filter-input" name="description" rows="2"></textarea></label><label><span>'+t('المسؤول','Assignee')+'</span><select class="filter-input" name="assigneeId">'+people.users.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+' · '+esc(u.role)+'</option>').join('')+'</select></label><label><span>'+t('الأولوية','Priority')+'</span><select class="filter-input" name="priority"><option value="normal">'+t('عادية','Normal')+'</option><option value="high">'+t('مرتفعة','High')+'</option><option value="urgent">'+t('عاجلة','Urgent')+'</option><option value="low">'+t('منخفضة','Low')+'</option></select></label><label><span>'+t('موعد التسليم','Due date')+'</span><input class="filter-input" type="datetime-local" name="dueAt"></label><button class="btn primary" type="submit">'+t('إسناد المتابعة','Assign')+'</button></form>';
        createArea.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const v=Object.fromEntries(new FormData(f).entries());try{await apiPost({action:'assignment_create',...v});toast(t('تم إسناد المتابعة','Assignment created'));await openAssignmentCenter()}catch(err){toast(err.message)}};
      }else createArea.innerHTML='';
      const unread=notices.notifications.filter(n=>!n.isRead);
      modal.querySelector('#assignmentNotifications').innerHTML=unread.length?'<div class="panel" style="margin:12px 0;padding:14px"><h3>'+t('الإشعارات الجديدة','New notifications')+'</h3>'+unread.map(n=>'<button class="btn small" data-notice="'+esc(n.id)+'" data-assignment="'+esc(n.assignmentId)+'" style="display:block;width:100%;text-align:start;margin:6px 0">'+esc(n.title)+' — '+esc(n.body)+'</button>').join('')+'</div>':'';
      modal.querySelector('#assignmentNotifications').onclick=async e=>{const b=e.target.closest('[data-notice]');if(!b)return;try{await apiPost({action:'notification_read',notificationId:b.dataset.notice});if(b.dataset.assignment){const d=await apiPost({action:'assignment_detail',assignmentId:b.dataset.assignment});showAssignmentDetails(d.assignment,modal)}await openAssignmentCenter()}catch(err){toast(err.message)}};
      const cards=modal.querySelector('#assignmentCards');
      cards.innerHTML=list.assignments.filter(a=>!a.archivedAt).map(a=>'<article class="admin-user-card" style="margin:10px 0"><div class="admin-user-top"><div class="admin-user-identity"><strong>'+esc(a.title)+'</strong><small>'+t('المسؤول الحالي: ','Assignee: ')+esc(a.assigneeName)+' · '+t('الحالة: ','Status: ')+esc(a.status)+'</small></div><span class="admin-status '+(a.status==='completed'?'is-active':'')+'">'+esc(a.priority)+'</span></div><p>'+esc(a.description)+'</p><small>'+t('تاريخ الإسناد: ','Assigned: ')+esc(a.assignedAt||'—')+' · '+t('آخر تحديث: ','Updated: ')+esc(a.updatedAt||'—')+'</small><div class="admin-user-controls"><button class="btn small" data-open-assignment="'+esc(a.id)+'">'+t('التفاصيل والسجل','Details & history')+'</button><select class="filter-input" data-status-for="'+esc(a.id)+'"><option value="new">new</option><option value="viewed">viewed</option><option value="in_progress">in_progress</option><option value="paused">paused</option><option value="completed">completed</option><option value="cancelled">cancelled</option></select><button class="btn small" data-save-status="'+esc(a.id)+'">'+t('تحديث الحالة','Update status')+'</button></div></article>').join('')||'<div class="admin-empty">'+t('لا توجد متابعات مسندة حالياً.','No assigned work yet.')+'</div>';
      cards.querySelectorAll('[data-status-for]').forEach(sel=>{const a=list.assignments.find(x=>x.id===sel.dataset.statusFor);if(a)sel.value=a.status});
      cards.onclick=async e=>{const detail=e.target.closest('[data-open-assignment]'),status=e.target.closest('[data-save-status]');try{if(detail){const d=await apiPost({action:'assignment_detail',assignmentId:detail.dataset.openAssignment});showAssignmentDetails(d.assignment,modal)}if(status){const id=status.dataset.saveStatus,st=cards.querySelector('[data-status-for="'+CSS.escape(id)+'"]').value;await apiPost({action:'assignment_status',assignmentId:id,status:st});toast(t('تم تحديث الحالة','Status updated'));await openAssignmentCenter()}}catch(err){toast(err.message)}};
      modal.style.display='flex';if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
    }catch(err){toast(t('تعذر تحميل المهام: ','Could not load assignments: ')+err.message)}
  }
  function showAssignmentDetails(a,modal){
    const en=document.documentElement.lang==='en',t=(ar,eng)=>en?eng:ar;
    const box=document.createElement('div');box.className='panel';box.style.cssText='margin:12px 0;padding:16px';
    box.innerHTML='<h3>'+esc(a.title)+'</h3><p>'+esc(a.description)+'</p><p>'+t('المنشئ: ','Created by: ')+esc(a.createdByName)+' · '+t('الموزع الحالي: ','Delegated by: ')+esc(a.ownerLeaderName)+' · '+t('المسؤول: ','Assignee: ')+esc(a.assigneeName)+'</p><h4>'+t('سجل الحركة','Activity history')+'</h4><div>'+((a.activity||[]).map(x=>'<p><small>'+esc(x.createdAt)+' — '+esc(x.actorName)+' — '+esc(x.action)+'</small></p>').join('')||'—')+'</div><h4>'+t('الملاحظات','Notes')+'</h4><div>'+((a.notes||[]).map(n=>'<p>'+esc(n.authorName)+' ('+esc(n.visibility)+'): '+esc(n.body)+'</p>').join('')||'—')+'</div><form id="assignmentNoteForm" class="admin-create-form"><label><span>'+t('إضافة ملاحظة','Add a note')+'</span><textarea class="filter-input" name="body" required></textarea></label><label><span>'+t('نوع الملاحظة','Visibility')+'</span><select class="filter-input" name="visibility"><option value="private">'+t('خاصة','Private')+'</option><option value="shared">'+t('مشتركة','Shared')+'</option></select></label><button class="btn primary" type="submit">'+t('حفظ الملاحظة','Save note')+'</button></form>';
    const prior=modal.querySelector('#assignmentDetailPane');if(prior)prior.remove();box.id='assignmentDetailPane';modal.querySelector('.admin-shell').appendChild(box);
    box.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await apiPost({action:'assignment_note_add',assignmentId:a.id,body:f.body.value,visibility:f.visibility.value});const d=await apiPost({action:'assignment_detail',assignmentId:a.id});showAssignmentDetails(d.assignment,modal)}catch(err){toast(err.message)}};
    if(a.assigneeId===currentUser?.id){const b=document.createElement('button');b.className='btn small';b.textContent=t('طلب إعادة إسناد','Request reassignment');b.onclick=async()=>{const users=await apiPost({action:'leader_users'});const target=users.users.find(x=>x.id!==currentUser.id);if(!target){toast(t('لا يوجد مستخدم آخر متاح','No other active user'));return}const reason=prompt(t('سبب طلب النقل','Reason for reassignment'));if(!reason)return;try{await apiPost({action:'reassignment_request',assignmentId:a.id,toUserId:target.id,reason});toast(t('تم إرسال الطلب للموزع للموافقة','Request sent for approval'))}catch(err){toast(err.message)}};box.appendChild(b)}
    if((currentUser?.role==='leader'||currentUser?.role==='admin')&&(a.ownerLeaderId===currentUser.id||currentUser.role==='admin'))(a.requests||[]).filter(r=>r.status==='pending').forEach(r=>{const line=document.createElement('div');line.className='admin-user-controls';line.innerHTML='<span>'+t('طلب من ','Request from ')+esc(r.fromUserName)+' '+t('إلى ','to ')+esc(r.toUserName)+' — '+esc(r.reason)+'</span><button class="btn small" data-review="yes">'+t('موافقة','Approve')+'</button><button class="btn small" data-review="no">'+t('رفض','Reject')+'</button>';line.onclick=async e=>{const b=e.target.closest('[data-review]');if(!b)return;try{await apiPost({action:'reassignment_review',requestId:r.id,approve:b.dataset.review==='yes'});toast(t('تم تسجيل القرار','Decision saved'));await openAssignmentCenter()}catch(err){toast(err.message)}};box.appendChild(line)})
  }

  async function initializeCloud(){
    const saved=localStorage.getItem(SESSION_KEY);
    if(!navigator.onLine){
      if(saved){try{const s=JSON.parse(saved);authToken=s.token||'';currentUser=s.user||null;const cached=readLocalDatabase();if(authToken&&currentUser&&cached){db=cached;isReady=true;renderAll();hideGate();setConnection(false,'أنت تعمل دون اتصال. ستتم المزامنة عند عودة الإنترنت.');return}}catch{}if(authToken&&currentUser){showLogin('لا توجد نسخة بيانات محفوظة لهذا الحساب على هذا الجهاز. اتصل بالإنترنت مرة واحدة لتحميل بياناتك.');return}showLogin('اتصل بالإنترنت لتسجيل الدخول.');return}
      showLogin('اتصل بالإنترنت لتسجيل الدخول.');return;
    }
    if(saved){
      try{
        const s=JSON.parse(saved);authToken=s.token||'';currentUser=s.user||null;
        if(authToken){
          const session=await apiPost({action:'me'});
          currentUser=session.user||currentUser;
          localStorage.setItem(SESSION_KEY,JSON.stringify({token:authToken,user:currentUser}));
          if(hasPendingSync()){const local=readLocalDatabase();if(local){db=local;await apiPost({action:'save',data:cloudPayload(db)});clearPendingSync();cacheLocalDatabase(db,false)}else clearPendingSync()}
          await afterLogin(hasPendingSync()?undefined:(session.data||{}));
          return;
        }
      }catch(err){
        if(err.message==='unauthorized'||err.message==='inactive_user'){
          authToken='';currentUser=null;localStorage.removeItem(SESSION_KEY);
        }else{
          // A temporary network/server error must never erase a valid locally stored session.
          const local=readLocalDatabase();
          if(authToken&&currentUser&&local){db=local;isReady=true;renderAll();hideGate();setConnection(false,'Offline mode: local data is available. Changes will sync when internet returns.');return;}
          setConnection(false,'تعذر الاتصال بالخادم. أعد المحاولة دون تسجيل خروجك.');
          showLogin('تعذر استعادة الجلسة حالياً بسبب الاتصال. أعد المحاولة، ولن تحتاج لإدخال كلمة المرور.');
          return;
        }
      }
    }
    showLogin();
  }
  document.getElementById('retryConnection').onclick=initializeCloud;
  document.getElementById('enableNotifications').onclick=enableNotifications;
  document.getElementById('dashboardSnoozeNotifications').onclick=toggleTaskAlertSnooze;
  document.getElementById('notificationSnoozeToggle').onclick=toggleTaskAlertSnooze;
  document.getElementById('notificationBell').onclick=()=>{const panel=document.getElementById('notificationPanel'),open=panel.hidden;panel.hidden=!open;document.getElementById('notificationBell').setAttribute('aria-expanded',String(open))};
  // Alert action handlers are attached directly in renderTaskAlerts for reliable Android WebView taps.
  document.addEventListener('click',event=>{if(!event.target.closest('.notification-center')){document.getElementById('notificationPanel').hidden=true;document.getElementById('notificationBell').setAttribute('aria-expanded','false')}});
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='OPEN_TASK_NOTIFICATION'&&typeof event.data.taskId==='string'){showView('tasks');if(get('tasks',event.data.taskId))openForm('task',event.data.taskId)}});
  window.addEventListener('smartnote-open-task',event=>{const taskId=event.detail?.taskId;if(typeof taskId==='string'){showView('tasks');if(get('tasks',taskId))openForm('task',taskId)}});
  function handleAppBack(){
    const modal=document.querySelector('.modal-backdrop.show');if(modal){modal.classList.remove('show');editing=null;return}
    const notificationPanel=document.getElementById('notificationPanel');if(notificationPanel&&!notificationPanel.hidden){notificationPanel.hidden=true;document.getElementById('notificationBell').setAttribute('aria-expanded','false');return}
    if(currentView!=='dashboard'){showView('dashboard');return}
    if(!exitPromptArmed){exitPromptArmed=true;toast(document.documentElement.lang==='en'?'Press Back again to exit the app.':'اضغط رجوع مرة أخرى للخروج من التطبيق.');clearTimeout(exitPromptTimer);exitPromptTimer=setTimeout(()=>exitPromptArmed=false,2500);return}
    exitPromptArmed=false;window.Capacitor?.Plugins?.App?.exitApp?.();
  }
  window.addEventListener('smartnote-back-button',handleAppBack);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'){handleAppBack()}});
  document.addEventListener('pointerdown',unlockNotificationAudio,{once:true});
  document.addEventListener('keydown',unlockNotificationAudio,{once:true});
  window.addEventListener('online',()=>{if(isReady&&authToken)syncCloud();else initializeCloud()});
  window.addEventListener('offline',()=>{setConnection(false,'انقطع اتصال الإنترنت. ستتم إعادة المزامنة تلقائياً عند عودة الاتصال.')});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncCloud();checkTaskNotifications()}});
  setInterval(syncCloud,5000);
  setInterval(checkTaskNotifications,15000);
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').then(registration=>{serviceWorkerRegistration=registration}).catch(err=>toast('تعذر تجهيز إشعارات الهاتف: '+err.message));
  if(window.lucide)window.lucide.createIcons({attrs:{"stroke-width":1.8}});restoreTaskAlertState();refreshNotificationButton();renderAll();initializeCloud();
})();
