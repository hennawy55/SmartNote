(() => {
  'use strict';
  const API_URL='https://script.google.com/macros/s/AKfycbzCwbwSosfOCsH83SJhh_a1IOFhjDi0FXpeNlDBt1UC6yOd2t8nOGN3_Z-wHJr3N2bBkQ/exec';
  const SESSION_KEY='smartnote-auth-session-v2';
  const DATABASE_NAME='SMARTNOTE_USER_DATABASE_V2';
  let authToken='', currentUser=null;
  const TYPES=['workspaces','projects','units','notes','clients','tasks'];
  const LABELS={workspaces:'مساحة عمل',projects:'مشروع',units:'وحدة',notes:'ملاحظة',clients:'عميل',tasks:'متابعة'};
  const TITLES={dashboard:['الرئيسية','ملخص سريع لكل بياناتك العقارية'],assigned:['المتابعات الموجهة','المهام المسندة إليك أو التي تدير توزيعها'],workspaces:['مساحات العمل','نظم بياناتك في مجموعات مستقلة'],projects:['المشاريع','قاعدة موحدة لكل المشروعات'],units:['الوحدات','تفاصيل الوحدات وأسعارها'],notes:['الملاحظات الذكية','كل المعلومات التي سجلتها'],clients:['العملاء','بيانات العملاء واحتياجاتهم'] ,tasks:['المتابعات','المهام والمواعيد القادمة']};
  const QUICK_ACTIONS={workspaces:['workspace','مساحة جديدة'],projects:['project','مشروع جديد'],units:['unit','وحدة جديدة'],notes:['note','ملاحظة جديدة'],clients:['client','عميل جديد'],tasks:['task','متابعة جديدة']};
  const emptyDB=()=>({version:1,workspaces:[],projects:[],units:[],notes:[],clients:[],tasks:[]});
  let db=emptyDB(), editing=null, isReady=false, saveQueue=Promise.resolve(), syncInFlight=false, writesInProgress=0, localRevision=0;
  let assignedItems=[],assignedArchivedItems=[],assignmentPeople=[],serverNotifications=[],serverNotificationCursor='',serverNotificationHasMore=false,serverNotificationUnreadCount=0,serverNotificationTotalCount=0;
  const localDataKey=()=>`smartnote-local-db-v1:${encodeURIComponent(currentUser?.username||'')}`;
  const pendingSyncKey=()=>`smartnote-pending-sync-v1:${encodeURIComponent(currentUser?.username||'')}`;
  function cacheLocalDatabase(state=db,pending=false){if(!currentUser?.username)return;try{localStorage.setItem(localDataKey(),JSON.stringify(cloudPayload(state)));if(pending)localStorage.setItem(pendingSyncKey(),'1')}catch(error){toast('تعذر حفظ نسخة محلية: '+error.message)}}
  function readLocalDatabase(){try{const raw=localStorage.getItem(localDataKey());return raw?normalizeDatabase(JSON.parse(raw)):null}catch{return null}}
  function hasPendingSync(){try{return localStorage.getItem(pendingSyncKey())==='1'}catch{return false}}
  function clearPendingSync(){try{localStorage.removeItem(pendingSyncKey())}catch{}}
  const notifiedTaskReminders=new Set(),taskAlerts=[],browserNotifications=new Map();
  const notificationStateKey=()=>`smart-real-estate-task-notifications-v1:${encodeURIComponent(currentUser?.username||'anonymous')}`;
  let notificationAudio=null,serviceWorkerRegistration=null;
  function persist(){renderAll()}
  function uid(){return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function dateLabel(v){if(!v)return 'بدون تاريخ';try{return new Date(v).toLocaleDateString(document.documentElement.lang==='en'?'en-US':'ar-EG',{year:'numeric',month:'short',day:'numeric'})}catch{return v}}
  function toast(msg){const t=document.getElementById('toast');t.textContent=window.appTranslate?.(msg)||msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
  let startupNotificationPermissionRequested=false;
  async function requestNotificationPermissionOnStartup(){
    if(startupNotificationPermissionRequested)return;startupNotificationPermissionRequested=true;
    try{
      if(window.smartNoteNativeNotifications?.isNative){if(window.smartNoteNativeNotifications.getPermissionStatus){const status=await window.smartNoteNativeNotifications.getPermissionStatus();if(status==='granted'||status?.granted)return}const granted=await window.smartNoteNativeNotifications.requestPermission();if(granted){await syncNativeTaskReminders();checkTaskNotifications()}return}
      if(!('Notification'in window)||Notification.permission==='denied'||!window.isSecureContext||!('serviceWorker'in navigator))return;
      if(Notification.permission==='granted'){serviceWorkerRegistration=await navigator.serviceWorker.ready;checkTaskNotifications();return}
      const permission=await Notification.requestPermission();if(permission==='granted'){serviceWorkerRegistration=await navigator.serviceWorker.ready;checkTaskNotifications()}
    }catch(error){console.warn('Notification permission request was unavailable:',error)}
  }
  function unlockNotificationAudio(){if(notificationAudio){if(notificationAudio.state==='suspended')notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'));return}const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;try{notificationAudio=new AudioContextClass();if(notificationAudio.state==='suspended')notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'))}catch(err){toast('تعذر تفعيل صوت التنبيه: '+err.message)}}
  function playNotificationSound(){if(!notificationAudio)return false;if(notificationAudio.state==='suspended'){notificationAudio.resume().catch(()=>toast('تعذر تشغيل صوت التنبيه في هذا المتصفح'));return false}if(notificationAudio.state!=='running')return false;try{const now=notificationAudio.currentTime;[659,880,1175].forEach((frequency,index)=>{const oscillator=notificationAudio.createOscillator(),gain=notificationAudio.createGain(),start=now+index*.09;oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.13,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.18);oscillator.connect(gain);gain.connect(notificationAudio.destination);oscillator.start(start);oscillator.stop(start+.2)});return true}catch(err){toast('تعذر تشغيل نغمة التنبيه: '+err.message);return false}}
  function taskDueTimestamp(task){if(!task.dueDate)return NaN;const [year,month,day]=task.dueDate.split('-').map(Number),[hour,minute]=(task.dueTime||'09:00').split(':').map(Number);return new Date(year,month-1,day,hour,minute||0).getTime()}
  function persistTaskAlertState(){try{localStorage.setItem(notificationStateKey(),JSON.stringify({alerts:taskAlerts.map(({key,taskId,title,body,taskTitle,createdAt,isRead})=>({key,taskId,title,body,taskTitle:taskTitle||get('tasks',taskId)?.title||'',createdAt,isRead:!!isRead})),notified:[...notifiedTaskReminders]}))}catch(err){toast('تعذر حفظ حالة التنبيهات على هذا الجهاز: '+err.message)}}
  function taskAlertTitleKey(title){return String(title||'').trim().toLocaleLowerCase('ar-EG')}
  function restoreTaskAlertState(){try{const saved=localStorage.getItem(notificationStateKey());if(!saved)return;const state=JSON.parse(saved);if(!state||typeof state!=='object')throw new Error('بيانات التنبيهات المحفوظة غير صالحة');if(Array.isArray(state.notified))state.notified.filter(key=>typeof key==='string').forEach(key=>notifiedTaskReminders.add(key));if(Array.isArray(state.alerts)){const latestByTitle=new Map();state.alerts.filter(alert=>alert&&typeof alert.key==='string'&&typeof alert.taskId==='string'&&typeof alert.title==='string'&&typeof alert.body==='string').forEach(alert=>{alert.taskTitle=alert.taskTitle||get('tasks',alert.taskId)?.title||'';const titleKey=taskAlertTitleKey(alert.taskTitle||alert.body),previous=latestByTitle.get(titleKey);if(!previous||(alert.createdAt||0)>=(previous.createdAt||0))latestByTitle.set(titleKey,alert)});taskAlerts.push(...latestByTitle.values())}persistTaskAlertState();renderTaskAlerts()}catch(err){toast('تعذر استعادة التنبيهات المحفوظة: '+err.message)}}
  function renderTaskAlerts(){if(isReady)refreshUnifiedNotifications();}
  function closeBrowserNotification(key){const notification=browserNotifications.get(key);if(notification){browserNotifications.delete(key);try{const result=notification.close();if(result?.catch)result.catch(err=>toast('تعذر إغلاق إشعار النظام: '+err.message))}catch(err){toast('تعذر إغلاق إشعار النظام: '+err.message)}return}if(!serviceWorkerRegistration||typeof serviceWorkerRegistration.getNotifications!=='function')return;try{serviceWorkerRegistration.getNotifications({tag:key}).then(notifications=>notifications.forEach(item=>item.close())).catch(err=>toast('تعذر إغلاق إشعار النظام: '+err.message))}catch(err){toast('تعذر إغلاق إشعار النظام: '+err.message)}}
  function recordTaskAlertDismissal(key){if(!isReady)return;const dismissed=new Set(db.taskNotificationDismissals||[]);if(dismissed.has(key))return;dismissed.add(key);db.taskNotificationDismissals=[...dismissed];localRevision++;saveDatabase(db).catch(err=>toast('تعذر مزامنة إخفاء الإشعار: '+err.message))}
  function removeTaskAlert(key){const index=taskAlerts.findIndex(alert=>alert.key===key);if(index<0)return null;const [alert]=taskAlerts.splice(index,1);recordTaskAlertDismissal(key);closeBrowserNotification(key);persistTaskAlertState();renderTaskAlerts();return alert}
  function showAlertTask(key){
    const alert=taskAlerts.find(item=>item.key===key);
    if(!alert)return;
    if(!get('tasks',alert.taskId)){toast('لم تعد هذه المتابعة موجودة');return}
    alert.isRead=true;closeBrowserNotification(key);persistTaskAlertState();renderTaskAlerts();
    document.getElementById('notificationPanel').hidden=true;
    document.getElementById('notificationBell').setAttribute('aria-expanded','false');
    showView('tasks');
    openForm('task',alert.taskId);
  }
  async function sendSystemTaskNotification(alert){if(window.smartNoteNativeNotifications?.isNative){return}if(!('Notification'in window)||Notification.permission!=='granted')return;if(!serviceWorkerRegistration&&'serviceWorker'in navigator)serviceWorkerRegistration=await navigator.serviceWorker.ready;if(!serviceWorkerRegistration||typeof serviceWorkerRegistration.showNotification!=='function')throw new Error('إشعارات النظام غير مدعومة أو Service Worker غير جاهز');const taskTitle=get('tasks',alert.taskId)?.title||alert.body,tag=`task-title:${encodeURIComponent(taskAlertTitleKey(taskTitle))}`,options={body:`${alert.title}: ${alert.body}`,tag,data:{taskId:alert.taskId,key:alert.key}};try{await serviceWorkerRegistration.showNotification('دفتر العقارات الذكي',options)}catch(err){options.tag=alert.key;await serviceWorkerRegistration.showNotification(alert.title,options)}browserNotifications.set(alert.key,{close:()=>serviceWorkerRegistration.getNotifications({tag:options.tag}).then(notifications=>notifications.forEach(notification=>notification.close()))})}
  function sendTaskNotification(task,type,title,body){const key=`${task.id}:${type}:${type==='due'?taskDueTimestamp(task):task.startedAt}`;if(notifiedTaskReminders.has(key))return;notifiedTaskReminders.add(key);const titleKey=taskAlertTitleKey(task.title);taskAlerts.filter(alert=>taskAlertTitleKey(alert.taskTitle||get('tasks',alert.taskId)?.title||alert.body)===titleKey).forEach(alert=>{closeBrowserNotification(alert.key);taskAlerts.splice(taskAlerts.indexOf(alert),1)});const alert={key,taskId:task.id,title,body,taskTitle:task.title,createdAt:Date.now(),isRead:false};taskAlerts.push(alert);if(!window.smartNoteNativeNotifications?.isNative&&'Notification'in window&&Notification.permission==='granted')sendSystemTaskNotification(alert).catch(err=>toast('تعذر إرسال إشعار النظام: '+err.message));persistTaskAlertState();renderTaskAlerts();if(!document.hidden)playNotificationSound()}
  function checkTaskNotifications(){const now=Date.now();if(!isReady||false)return;for(const task of db.tasks){if(task.status==='مكتملة')continue;const due=taskDueTimestamp(task);if(task.status!=='قيد التنفيذ'&&Number.isFinite(due)&&now>=due)sendTaskNotification(task,'due','المتابعة ما زالت معلقة',`حان موعد المتابعة: ${task.title}`);if(task.status==='قيد التنفيذ'&&task.startedAt&&now-Date.parse(task.startedAt)>=60*60*1000)sendTaskNotification(task,'in_progress','هل ما زلت تعمل على المتابعة؟',`مرّت ساعة على بدء: ${task.title}. افتح المتابعة وغيّر حالتها إلى مكتملة إذا انتهيت.`)}}
  function get(type,id){return db[type]?.find(x=>x.id===id)}
  function syncNativeTaskReminders(){if(!window.smartNoteNativeNotifications?.isNative||!isReady)return Promise.resolve();return window.smartNoteNativeNotifications.syncTaskReminders(db.tasks).catch(err=>toast('تعذر جدولة تذكيرات الهاتف: '+err.message))}
  function nameOf(type,id){return get(type,id)?.name||'غير مرتبط'}
  function setConnection(ok,msg){document.getElementById('connectionDot').classList.toggle('online',!!ok);document.getElementById('connectionText').textContent=ok?'متصل بقاعدة البيانات':'غير متصل';document.getElementById('connectionHint').textContent=msg||(ok?'تم الاتصال بـ Google Sheets.':'يلزم الاتصال بالإنترنت وقاعدة البيانات.')}
  function showGate(message){document.getElementById('onlineGateMessage').textContent=message;document.getElementById('onlineGate').style.display='flex'}
  function hideGate(){document.getElementById('onlineGate').style.display='none'}
  function updateQuickAdd(view){const button=document.getElementById('quickAdd'),action=QUICK_ACTIONS[view];button.hidden=view==='assigned';button.dataset.quickAddType=action?.[0]||'';button.innerHTML=`<i data-lucide="plus"></i> ${action?.[1]||'إضافة جديدة'}`;if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  let currentView='dashboard',exitPromptArmed=false,exitPromptTimer=0;
  function showView(view){currentView=view;exitPromptArmed=false;document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));const el=document.getElementById('view-'+view)||document.getElementById(view==='searchResults'?'searchResults':'view-dashboard');el.classList.add('active');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.getElementById('pageHeading').textContent=(TITLES[view]||['نتائج البحث','بحث شامل'])[0];document.getElementById('pageSub').textContent=(TITLES[view]||['نتائج البحث','بحث شامل'])[1];updateQuickAdd(view);if(view==='assigned')loadAssignedView()}
  const appShell=document.querySelector('.app'),sidebarToggle=document.getElementById('sidebarToggle'),SIDEBAR_STATE_KEY='aqarSidebarCollapsed';
  function setSidebarCollapsed(collapsed){appShell.classList.toggle('sidebar-collapsed',collapsed);const language=document.documentElement.lang,icon=collapsed?'panel-left-open':'panel-left-close',label=language==='en'?(collapsed?'Expand sidebar':'Collapse sidebar'):(collapsed?'توسيع الشريط الجانبي':'طي الشريط الجانبي');sidebarToggle.innerHTML=`<i data-lucide="${icon}"></i>`;sidebarToggle.setAttribute('aria-label',label);sidebarToggle.title=label;try{localStorage.setItem(SIDEBAR_STATE_KEY,collapsed?'1':'0')}catch{}if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
  sidebarToggle.onclick=()=>setSidebarCollapsed(!appShell.classList.contains('sidebar-collapsed'));try{setSidebarCollapsed(localStorage.getItem(SIDEBAR_STATE_KEY)==='1')}catch{setSidebarCollapsed(false)}
  window.addEventListener('app-language-change',()=>{setSidebarCollapsed(appShell.classList.contains('sidebar-collapsed'));refreshNotificationButton()});
  document.addEventListener('click',e=>{const assignmentOpen=e.target.closest('[data-assignment-open]');if(assignmentOpen){e.preventDefault();e.stopImmediatePropagation();openAssignedDetail(assignmentOpen.dataset.assignmentOpen);return}const recordView=e.target.closest('[data-record-view]');if(recordView){showRecord(recordView.dataset.recordView,recordView.dataset.id);return}const v=e.target.closest('[data-view]');if(v){showView(v.dataset.view);return}const a=e.target.closest('[data-add]');if(a)openForm(a.dataset.add);const edit=e.target.closest('[data-edit]');if(edit)openForm(edit.dataset.edit,edit.dataset.id);const status=e.target.closest('[data-task-status]');if(status){changeTaskStatus(status.dataset.id,status.dataset.taskStatus,status);return}const del=e.target.closest('[data-delete]');if(del)deleteItem(del.dataset.delete,del.dataset.id)});
  const schemas={
    workspace:[['name','اسم المساحة','text',true],['description','وصف مختصر','textarea'],['color','لون المساحة','color']],
    project:[['name','اسم المشروع','text',true],['developer','المطور العقاري','text'],['workspaceId','مساحة العمل','workspace'],['location','المنطقة / الموقع','text'],['type','نوع المشروع','select:سكني,تجاري,إداري,ساحلي,متعدد الاستخدامات'],['delivery','موعد المتابعة','text'],['payment','أنظمة السداد','textarea'],['commission','العمولة','text'],['mapUrl','رابط الموقع على الخريطة','url'],['description','تفاصيل ومعلومات المشروع','textarea']],
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
  function renderAll(){renderDashboard();renderWorkspaces();renderProjects();renderUnits();renderNotes();renderClients();renderTasks();refreshFilters();if(currentView==='assigned')renderAssignedView();if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}})}
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
  const assignmentRequestsInFlight=new Map();
  async function apiPost(payload){
    const guarded=['assignment_detail','assignment_create','assignment_update','assignment_status','assignment_reassign','reassignment_request','reassignment_review','assignment_note_add','assignment_archive','assignment_restore'];
    const key=guarded.includes(payload.action)?payload.action+':'+String(payload.assignmentId||payload.requestId||'global'):'';
    if(key&&assignmentRequestsInFlight.has(key))throw new Error('operation_in_progress');
    const request=(async()=>{
    const response=await fetch(API_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,token:authToken})});
    const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{throw new Error('لم تصل استجابة صالحة من Google Apps Script؛ تحقق من نشر Web App')}
    if(result.error)throw new Error(result.error);if(result.ok===false)throw new Error('تعذر تنفيذ العملية');return result;
    })();
    if(key)assignmentRequestsInFlight.set(key,request);
    try{return await request}finally{if(key&&assignmentRequestsInFlight.get(key)===request)assignmentRequestsInFlight.delete(key)}
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
    const result=preloadedData&&typeof preloadedData==='object'?{data:preloadedData}:await apiPost({action:'load'});db=normalizeDatabase(result.data||{});isReady=true;localRevision=0;cacheLocalDatabase(db,false);renderAll();syncNativeTaskReminders();
    const pendingTaskId=new URLSearchParams(window.location.search).get('openTask');
    if(pendingTaskId){if(get('tasks',pendingTaskId)){showView('tasks');openForm('task',pendingTaskId)}const cleanUrl=new URL(window.location.href);cleanUrl.searchParams.delete('openTask');window.history.replaceState({},'',cleanUrl.toString())}
    requestNotificationPermissionOnStartup();// Login gate is created only for manual login; keep automatic session restore safe.
    document.getElementById('loginGate')?.style.setProperty('display','none');hideGate();setConnection(true,'تم تسجيل الدخول؛ المزامنة كل 5 ثوانٍ.');
    const welcome=document.getElementById('welcomeUser');if(welcome){welcome.hidden=false;welcome.textContent=(document.documentElement.lang==='en'?'Welcome, ':'مرحباً، ')+(currentUser?.username||'')}
    if(currentUser?.role==='admin') addAdminButton();
    document.getElementById('assignedCreateButton')?.addEventListener('click',createAssignedFollowup);loadAssignedView();
    ['assignedSearch','assignedAssigneeFilter','assignedPriorityFilter','assignedDateFrom','assignedDateTo'].forEach(id=>document.getElementById(id)?.addEventListener(id==='assignedSearch'?'input':'change',renderAssignedView));
    const av=document.getElementById('view-assigned');if(av&&!av.dataset.bound){av.dataset.bound='1';av.addEventListener('click',async e=>{const o=e.target.closest('[data-assignment-open]'),s=e.target.closest('[data-assignment-save]');if(o)await openAssignedDetail(o.dataset.assignmentOpen);if(s){const id=s.dataset.assignmentSave,sel=av.querySelector('[data-assignment-status="'+CSS.escape(id)+'"]');try{await apiPost({action:'assignment_status',assignmentId:id,status:sel.value});toast(assignmentText('تم تحديث الحالة','Status updated'));await loadAssignedView()}catch(err){toast(err.message)}}})}
    refreshUnifiedNotifications();
    // Assignment navigation is integrated into the primary navigation.
    if(!document.getElementById('logoutButton')){const b=document.createElement('button');b.id='logoutButton';b.className='btn small';b.textContent=window.appTranslate?.('تسجيل الخروج')||(document.documentElement.lang==='en'?'Sign out':'تسجيل الخروج');b.onclick=async()=>{try{await apiPost({action:'logout'})}catch(_){}authToken='';currentUser=null;isReady=false;localStorage.removeItem(SESSION_KEY);showLogin('تم تسجيل الخروج.');document.getElementById('adminUsersButton')?.remove();b.remove()};document.querySelector('.top-actions').prepend(b)}

  }
  window.addEventListener('app-language-change',()=>{const button=document.getElementById('logoutButton');if(button)button.textContent=window.appTranslate?.('تسجيل الخروج')||(document.documentElement.lang==='en'?'Sign out':'تسجيل الخروج');const w=document.getElementById('welcomeUser');if(w&&currentUser)w.textContent=(document.documentElement.lang==='en'?'Welcome, ':'مرحباً، ')+currentUser.username;if(currentView==='assigned')loadAssignedView();refreshUnifiedNotifications()});
  function addAdminButton(){
    if(document.getElementById('adminUsersButton'))return;
    const b=document.createElement('button');b.id='adminUsersButton';b.className='btn small';b.textContent='إدارة المستخدمين';b.onclick=openAdminPanel;document.querySelector('.top-actions').prepend(b);
  }
  async function openAdminPanel(){
    try{
      const data=await apiPost({action:'admin_list'});let panel=document.getElementById('adminPanel');
      if(!panel){
        panel=document.createElement('div');panel.id='adminPanel';panel.className='online-gate admin-gate';panel.style.zIndex='10001';
        panel.innerHTML='<section class="admin-shell"><header class="admin-header"><div><span class="admin-eyebrow">SMARTNOTE CONTROL CENTER</span><h2><i data-lucide="users-round"></i> إدارة المستخدمين</h2><p>إنشاء الحسابات والتحكم في الصلاحيات وكلمات المرور.</p></div><button class="btn icon-btn" id="closeAdminPanel" type="button" aria-label="إغلاق"><i data-lucide="x"></i></button></header><form id="createUserForm" class="admin-create-form"><div class="admin-create-title"><i data-lucide="user-plus"></i><strong>إضافة مستخدم جديد</strong></div><label><span>اسم المستخدم</span><input id="newUsername" class="filter-input" placeholder="مثال: ahmed123" required minlength="3" autocomplete="off"></label><label><span>كلمة المرور</span><input id="newPassword" class="filter-input" type="password" placeholder="10 أحرف على الأقل" required minlength="10" autocomplete="new-password"></label><label><span>الصلاحية</span><select id="newUserRole" class="filter-input"><option value="user">مستخدم</option><option value="leader">موزع</option><option value="admin">مدير</option></select></label><button class="btn primary" type="submit"><i data-lucide="plus"></i> إنشاء الحساب</button></form><div class="admin-list-heading"><div><h3>الحسابات المسجلة</h3><p id="adminUsersCount">إدارة حسابات النظام</p></div><span class="admin-count" id="adminCountBadge">0</span></div><div id="adminUsersList" class="admin-users-list"></div><footer class="admin-footer"><span>تغييرات الصلاحيات وكلمات المرور تُطبق فوراً.</span><button class="btn small" id="adminAuditButton" type="button">سجل التدقيق</button><button class="btn" id="adminDone" type="button">تم</button></footer></section>';
        document.body.appendChild(panel);
        panel.querySelector('#closeAdminPanel').onclick=()=>panel.style.display='none';
        panel.querySelector('#adminDone').onclick=()=>panel.style.display='none';
        panel.querySelector('#adminAuditButton').onclick=async()=>{const button=panel.querySelector('#adminAuditButton');button.disabled=true;try{const result=await apiPost({action:'admin_audit_list'});const entries=(result.entries||[]).map(item=>'<article class="assignment-history-item"><b>'+esc(item.actorName||'System')+'</b><span>'+esc(window.appTranslate?.(item.action)||item.action)+'</span><small>'+esc(item.targetId||'—')+' · '+assignmentDate(item.createdAt)+'</small></article>').join('')||'<div class="empty-state">لا توجد أحداث مسجلة.</div>';showAssignmentPopup(assignmentText('سجل التدقيق','Audit log'),'<div class="assignment-history">'+entries+'</div>')}catch(error){toast(error.message)}finally{button.disabled=false}};
        panel.addEventListener('click',e=>{if(e.target===panel)panel.style.display='none'});
        panel.querySelector('#createUserForm').onsubmit=async e=>{
          e.preventDefault();const submit=panel.querySelector('#createUserForm button[type=submit]');submit.disabled=true;
          try{await apiPost({action:'admin_create',username:panel.querySelector('#newUsername').value.trim(),password:panel.querySelector('#newPassword').value,role:panel.querySelector('#newUserRole').value});panel.querySelector('#newUsername').value='';panel.querySelector('#newPassword').value='';toast('تم إنشاء المستخدم بنجاح');await openAdminPanel()}
          catch(err){toast(err.message==='username_exists'?'اسم المستخدم مستخدم بالفعل':err.message==='weak_password'?'كلمة المرور يجب ألا تقل عن 10 أحرف':err.message)}
          finally{submit.disabled=false}
        };
        panel.querySelector('#adminUsersList').addEventListener('click',async e=>{
          const button=e.target.closest('button[data-admin-action]');if(!button||button.disabled)return;
          const row=button.closest('[data-user-row]'),userId=row?.dataset.userRow;if(!userId)return;
          button.disabled=true;
          try{
            if(button.dataset.adminAction==='status'){await apiPost({action:'admin_status',userId,status:button.dataset.status});toast('تم تحديث حالة الحساب')}
            if(button.dataset.adminAction==='role'){await apiPost({action:'admin_role',userId,role:row.querySelector('[data-role-select]').value});toast('تم تحديث صلاحية المستخدم')}
            if(button.dataset.adminAction==='password'){const password=row.querySelector('[data-new-user-password]').value;if(password.length<10){toast('كلمة المرور يجب ألا تقل عن 10 أحرف');return}await apiPost({action:'admin_reset_password',userId,password});row.querySelector('[data-new-user-password]').value='';toast('تم تغيير كلمة المرور وإغلاق الجلسات السابقة')}
            if(button.dataset.adminAction==='delete'){if(!window.confirm(window.appTranslate?.('هل تريد حذف هذا المستخدم؟ لا يمكن التراجع عن هذه العملية.')||'هل تريد حذف هذا المستخدم؟ لا يمكن التراجع عن هذه العملية.'))return;await apiPost({action:'admin_delete',userId});toast('تم حذف المستخدم بنجاح')}
            await openAdminPanel();
          }catch(err){toast(err.message==='cannot_change_own_role'?'لا يمكن تغيير صلاحيتك من هذه الشاشة':err.message==='weak_password'?'كلمة المرور يجب ألا تقل عن 10 أحرف':err.message)}
          finally{if(button.isConnected)button.disabled=false}
        });
      }
      panel.querySelector('#adminUsersList').innerHTML=data.users.map(u=>'<article class="admin-user-card" data-user-row="'+esc(u.id)+'"><div class="admin-user-top"><div class="admin-avatar"><i data-lucide="user-round"></i></div><div class="admin-user-identity"><strong>'+esc(u.username)+'</strong><small>'+ (u.role==='admin'?'مدير النظام':u.role==='leader'?'موزع':'مستخدم') +' · '+(u.status==='active'?'نشط':'معطل')+'</small></div><span class="admin-status '+(u.status==='active'?'is-active':'is-disabled')+'">'+(u.status==='active'?'نشط':'معطل')+'</span></div><div class="admin-user-controls"><label><span>الصلاحية</span><select class="filter-input" data-role-select><option value="user" '+(u.role==='user'?'selected':'')+'>مستخدم</option><option value="leader" '+(u.role==='leader'?'selected':'')+'>موزع</option><option value="admin" '+(u.role==='admin'?'selected':'')+'>مدير</option></select></label><button class="btn small" data-admin-action="role" type="button">حفظ الصلاحية</button>'+(u.id!==currentUser?.id?'<button class="btn small" data-admin-action="status" data-status="'+(u.status==='active'?'disabled':'active')+'" type="button">'+(u.status==='active'?'تعطيل الحساب':'تفعيل الحساب')+'</button>':'')+'</div><div class="admin-password-row"><input class="filter-input" data-new-user-password type="password" minlength="10" placeholder="كلمة مرور جديدة (10 أحرف على الأقل)" autocomplete="new-password"><button class="btn small" data-admin-action="password" type="button"><i data-lucide="key-round"></i> تغيير كلمة المرور</button></div>'+(u.id!==currentUser?.id?'<div class="admin-user-delete"><button class="btn danger small" data-admin-action="delete" type="button">حذف المستخدم</button></div>':'')+'</article>').join('')||'<div class="admin-empty">لا يوجد مستخدمون حتى الآن.</div>';
      panel.querySelector('#adminUsersCount').textContent='إجمالي الحسابات: '+data.users.length;
      panel.querySelector('#adminCountBadge').textContent=String(data.users.length);
      panel.style.display='flex';if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
    }catch(err){toast('تعذر فتح إدارة المستخدمين: '+err.message)}
  }

  const assignmentText=(ar,en)=>document.documentElement.lang==='en'?en:ar;
  const assignmentStatusLabels={new:['جديدة','New'],viewed:['تم الاطلاع','Viewed'],in_progress:['قيد التنفيذ','In progress'],paused:['متوقفة مؤقتاً','Paused'],completed:['مكتملة','Completed'],cancelled:['ملغاة','Cancelled']};
  const assignmentPriorityLabels={low:['منخفضة','Low'],normal:['عادية','Normal'],high:['مرتفعة','High'],urgent:['عاجلة','Urgent']};
  function assignmentActionLabel(action){const labels={created:['تم الإنشاء','Created'],viewed:['تم الاطلاع','Viewed'],updated:['تم التحديث','Updated'],status_changed:['تغيير الحالة','Status changed'],reassigned:['إعادة إسناد','Reassigned'],reassignment_requested:['طلب إعادة إسناد','Reassignment requested'],reassignment_approved:['الموافقة على إعادة الإسناد','Reassignment approved'],reassignment_rejected:['رفض إعادة الإسناد','Reassignment rejected'],note_added:['إضافة ملاحظة','Note added'],archived:['أرشفة','Archived'],restored:['استعادة','Restored']};const pair=labels[action]||[action||'—',action||'—'];return assignmentText(pair[0],pair[1])}
  function assignmentDate(v){if(!v)return assignmentText('بدون موعد','No due date');const d=new Date(v);return Number.isNaN(d.getTime())?esc(v):esc(d.toLocaleString(document.documentElement.lang==='en'?'en-US':'ar-EG',{dateStyle:'medium',timeStyle:'short'}))}
  async function loadAssignedView(){if(!isReady)return;try{const manager=['admin','leader'].includes(currentUser?.role),[l,p,archived]=await Promise.all([apiPost({action:'assignment_list'}),manager?apiPost({action:'leader_users'}):Promise.resolve({users:[]}),apiPost({action:'assignment_archived_list'})]);assignedItems=l.assignments||[];assignedArchivedItems=archived.assignments||[];assignmentPeople=p.users||[];renderAssignedView()}catch(e){toast(assignmentText('تعذر تحميل المتابعات الموجهة: ','Could not load assigned follow-ups: ')+e.message)}}
  function renderAssignedView(){
    const t=assignmentText,search=(document.getElementById('assignedSearch')?.value||'').toLowerCase(),assignee=document.getElementById('assignedAssigneeFilter')?.value||'',priority=document.getElementById('assignedPriorityFilter')?.value||'',from=document.getElementById('assignedDateFrom')?.value||'',to=document.getElementById('assignedDateTo')?.value||'';
    const create=document.getElementById('assignedCreateButton');if(create)create.hidden=!['admin','leader'].includes(currentUser?.role);
    const assigneeSelect=document.getElementById('assignedAssigneeFilter');if(assigneeSelect){const selected=assigneeSelect.value;const people=new Map();assignedItems.forEach(a=>{if(a.assigneeId)people.set(a.assigneeId,a.assigneeName||a.assigneeId)});assignmentPeople.forEach(u=>{if(u.id)people.set(u.id,u.username||u.name||u.id)});assigneeSelect.innerHTML='<option value="">'+t('كل المسؤولين','All assignees')+'</option>'+[...people.entries()].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');assigneeSelect.value=selected}
    const dashboardHost=document.getElementById('dashboardAssignedNew');if(dashboardHost){const mine=assignedItems.filter(a=>!a.archivedAt&&a.assigneeId===currentUser?.id&&a.status==='new').sort((a,b)=>(Date.parse(b.assignedAt||b.createdAt)||0)-(Date.parse(a.assignedAt||a.createdAt)||0)).slice(0,5);dashboardHost.innerHTML=mine.length?mine.map(assignedCard).join(''):'<div class="empty-state">'+t('لا توجد متابعات جديدة موجهة إليك','No new follow-ups assigned to you')+'</div>'}
    const rows=assignedItems.filter(a=>{if(a.archivedAt||(assignee&&a.assigneeId!==assignee)||(priority&&a.priority!==priority))return false;const date=String(a.assignedAt||a.createdAt||'').slice(0,10);if(from&&date<from||to&&date>to)return false;return !search||[a.title,a.description,a.assigneeName,a.ownerLeaderName,a.createdByName].join(' ').toLowerCase().includes(search)});
    const buckets=[['new'],['viewed'],['in_progress'],['paused'],['completed'],['cancelled']],ids=[['assignedNewList','assignedNewCount'],['assignedViewedList','assignedViewedCount'],['assignedProgressList','assignedProgressCount'],['assignedPausedList','assignedPausedCount'],['assignedCompletedList','assignedCompletedCount'],['assignedCancelledList','assignedCancelledCount']];
    buckets.forEach((states,i)=>{const items=rows.filter(a=>states.includes(a.status));document.getElementById(ids[i][1]).textContent=items.length;document.getElementById(ids[i][0]).innerHTML=items.length?items.map(assignedCard).join(''):'<div class="empty-state">'+t('لا توجد متابعات في هذه الحالة','No follow-ups in this status')+'</div>'});
    const archivedSection=document.getElementById('assignedArchivedSection'),archivedHost=document.getElementById('assignedArchivedList'),archivedCount=document.getElementById('assignedArchivedCount');if(archivedSection&&archivedHost&&archivedCount){archivedSection.hidden=!assignedArchivedItems.length;archivedCount.textContent=assignedArchivedItems.length;archivedHost.innerHTML=assignedArchivedItems.length?assignedArchivedItems.map(assignedCard).join(''):'<div class="empty-state">'+t('لا توجد متابعات مؤرشفة','No archived follow-ups')+'</div>'}
    if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
  }
  function assignedCard(a){
    const t=assignmentText,st=assignmentStatusLabels[a.status]||[a.status,a.status],pr=assignmentPriorityLabels[a.priority]||[a.priority,a.priority];
    const kind=a.type==='client'?'<span class="pill">'+t('عميل','Client')+'</span><span class="pill">'+esc(a.clientPhone||'')+'</span>':'<span class="pill">'+t('مهمة','Task')+'</span>';
    return '<article class="entity-card assigned-card"><div class="assigned-card-head"><div><h3>'+esc(a.title)+'</h3><p>'+esc(a.description||t('لا يوجد وصف','No description'))+'</p></div><span class="pill">'+t(pr[0],pr[1])+'</span></div><div class="entity-meta"><span class="pill">'+t(st[0],st[1])+'</span><span class="pill">'+esc(t('المسؤول: ','Assignee: ')+a.assigneeName)+'</span><span class="pill">'+esc(t('الموزع: ','Owner: ')+a.ownerLeaderName)+'</span>'+kind+'</div><div class="assigned-meta"><small>'+esc(t('موعد المتابعة: ','Follow-up: '))+assignmentDate(a.dueAt)+'</small><small>'+esc(t('آخر تحديث: ','Updated: '))+assignmentDate(a.updatedAt)+'</small></div><div class="card-actions"><button class="btn small primary" data-assignment-open="'+esc(a.id)+'"><i data-lucide="eye"></i> '+t('عرض التفاصيل','View details')+'</button></div></article>';
  }
  async function createAssignedFollowup(){
    const t=assignmentText;if(!['admin','leader'].includes(currentUser?.role))return;
    if(!assignmentPeople.length){toast(t('لا يوجد مستخدمون نشطون للإسناد إليهم','No active users available'));return}
    const wrap=document.createElement('div');wrap.className='modal-backdrop show';
    const targets=assignmentPeople.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+'</option>').join('');
    wrap.innerHTML='<section class="modal"><div class="modal-head"><h2>'+t('إسناد متابعة جديدة','Assign a follow-up')+'</h2><button class="btn icon-btn" type="button" data-close>×</button></div><form id="newAssignmentForm"><div class="form-grid"><label class="field full"><span>'+t('نوع الإسناد','Assignment type')+'</span><select name="assignmentType" id="assignmentType"><option value="task">'+t('مهمة','Task')+'</option><option value="client">'+t('عميل','Client')+'</option></select></label><label class="field full" data-task-field><span>'+t('عنوان المهمة','Task title')+'</span><input name="title" maxlength="180"></label><label class="field full" data-client-field hidden><span>'+t('اسم العميل','Client name')+'</span><input name="clientName" maxlength="180"></label><label class="field" data-client-field hidden><span>'+t('رقم هاتف المتابعة','Follow-up phone number')+'</span><input name="clientPhone" type="tel" inputmode="tel" maxlength="30"></label><label class="field full"><span>'+t('التفاصيل','Details')+'</span><textarea name="description" rows="3"></textarea></label><label class="field"><span>'+t('المسؤول','Assignee')+'</span><select name="assigneeId" required>'+targets+'</select></label><label class="field"><span>'+t('الأولوية','Priority')+'</span><select name="priority"><option value="normal">'+t('عادية','Normal')+'</option><option value="high">'+t('مرتفعة','High')+'</option><option value="urgent">'+t('عاجلة','Urgent')+'</option><option value="low">'+t('منخفضة','Low')+'</option></select></label><label class="field full"><span>'+t('موعد المتابعة','Follow-up date')+'</span><input name="dueAt" type="datetime-local"></label></div><div class="modal-foot"><button class="btn primary" type="submit">'+t('إسناد المتابعة','Assign')+'</button><button class="btn" type="button" data-close>'+t('إلغاء','Cancel')+'</button></div></form></section>';
    document.body.appendChild(wrap);const form=wrap.querySelector('form'),type=wrap.querySelector('#assignmentType');
    const syncType=()=>{const client=type.value==='client';wrap.querySelectorAll('[data-client-field]').forEach(x=>{x.hidden=!client;x.style.display=client?'grid':'none'});wrap.querySelectorAll('[data-task-field]').forEach(x=>{x.hidden=client;x.style.display=client?'none':'grid'});form.elements.title.required=!client;form.elements.title.disabled=client;form.elements.clientName.required=client;form.elements.clientPhone.required=client};
    type.addEventListener('change',syncType);syncType();
    wrap.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>wrap.remove());wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove()});
    form.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form).entries());if(data.assignmentType==='client')data.title=data.clientName;try{await apiPost({action:'assignment_create',...data});wrap.remove();toast(t('تم إسناد المتابعة','Follow-up assigned'));await loadAssignedView()}catch(err){toast(err.message)}};
  }
  function closeAssignmentPopup(all=false){const items=[...document.querySelectorAll('.assignment-popup')];(all?items:items.slice(-1)).forEach(x=>x.remove())}
  function showAssignmentPopup(title,content){
    const wrap=document.createElement('div');wrap.className='modal-backdrop show assignment-popup';wrap.innerHTML='<section class="modal assignment-modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>'+title+'</h2><button class="btn icon-btn" type="button" data-popup-close aria-label="Close">×</button></div><div class="assignment-modal-content">'+content+'</div></section>';document.body.appendChild(wrap);wrap.addEventListener('click',e=>{if(e.target.closest('[data-popup-close]')){e.preventDefault();closeAssignmentPopup();return}if(e.target===wrap)closeAssignmentPopup()});return wrap;
  }
  function assignmentHistoryMarkup(activity){
    const t=assignmentText,labels={created:t('إنشاء','Created'),updated:t('تعديل','Updated'),reassigned:t('إعادة إسناد مباشرة','Directly reassigned'),viewed:t('اطلاع','Viewed'),status_changed:t('تغيير الحالة','Status changed'),archived:t('أرشفة','Archived'),restored:t('استعادة','Restored'),reassignment_requested:t('طلب نقل','Transfer requested'),reassignment_approved:t('الموافقة على النقل','Transfer approved'),reassignment_rejected:t('رفض النقل','Transfer rejected'),note_added:t('إضافة ملاحظة','Note added')};
    return '<div class="assignment-history">'+((activity||[]).map(x=>'<article class="assignment-history-item"><b>'+esc(x.actorName||'')+'</b><span>'+esc(labels[x.action]||x.action||'')+'</span><small>'+assignmentDate(x.createdAt)+'</small></article>').join('')||'<div class="empty-state">'+t('لا يوجد سجل حركة','No activity yet')+'</div>')+'</div>';
  }
  let assignmentActionInFlight=false;
  async function openAssignedDetail(id){
    if(assignmentActionInFlight)return;assignmentActionInFlight=true;
    document.querySelectorAll('[data-assignment-open]').forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true')});
    try{return await openAssignedDetailImpl(id)}finally{assignmentActionInFlight=false;document.querySelectorAll('[data-assignment-open]').forEach(button=>{button.disabled=false;button.removeAttribute('aria-busy')})}
  }
  async function openAssignedDetailImpl(id){
    closeAssignmentPopup(true);const t=assignmentText;try{
      const res=await apiPost({action:'assignment_detail',assignmentId:id}),a=res.assignment;
      const canManage=currentUser?.role==='admin'||a.ownerLeaderId===currentUser?.id;
      const canChange=canManage||a.assigneeId===currentUser?.id;
      const statusOptions=Object.entries(assignmentStatusLabels).map(([k,v])=>'<option value="'+k+'" '+(a.status===k?'selected':'')+'>'+t(v[0],v[1])+'</option>').join('');
      const notes=(a.notes||[]).map(n=>'<article class="assignment-note"><header><b>'+esc(n.authorName||'')+'</b><span class="pill">'+t(n.visibility==='shared'?'مشتركة':'خاصة',n.visibility==='shared'?'Shared':'Private')+'</span></header><p>'+esc(n.body||'')+'</p></article>').join('')||'<div class="empty-state">'+t('لا توجد ملاحظات','No notes')+'</div>';
      let actions='<div class="assignment-detail-actions">';
      if(canChange)actions+='<label class="assignment-status-control"><span>'+t('الحالة','Status')+'</span><select class="filter-input" id="assignmentDetailStatus">'+statusOptions+'</select><button class="btn primary" id="assignmentDetailSave">'+t('حفظ التحديث','Save changes')+'</button></label>';
      actions+='<button class="btn" id="assignmentHistoryButton"><i data-lucide="history"></i> '+t('عرض سجل الحركة','View activity log')+'</button>';
      if(canManage)actions+='<button class="btn danger" id="assignmentArchiveButton"><i data-lucide="archive"></i> '+t(a.archivedAt?'استعادة من الأرشيف':'أرشفة المتابعة',a.archivedAt?'Restore from archive':'Archive follow-up')+'</button>';
      if(canManage)actions+='<button class="btn" id="assignmentDirectReassignButton"><i data-lucide="user-round-plus"></i> '+t('إعادة إسناد','Reassign')+'</button>';
      if(!canManage&&a.assigneeId===currentUser?.id)actions+='<button class="btn" id="assignmentTransferButton"><i data-lucide="message-square-share"></i> '+t('طلب إعادة الإسناد','Request reassignment')+'</button>';
      actions+='</div>';
      const requests=canManage?(a.requests||[]).filter(x=>x.status==='pending').map(x=>'<article class="assignment-request"><div>'+t('طلب نقل من ','Transfer from ')+esc(x.fromUserName)+' '+t('إلى ','to ')+esc(x.toUserName)+'<p>'+esc(x.reason)+'</p></div><button class="btn small" data-review="yes" data-request="'+esc(x.id)+'">'+t('موافقة','Approve')+'</button><button class="btn small" data-review="no" data-request="'+esc(x.id)+'">'+t('رفض','Reject')+'</button></article>').join(''):'';
      const content='<div class="assignment-detail-body"><div class="assignment-detail-summary"><h3>'+esc(a.type==='client'?(a.clientName||a.title):a.title)+'</h3><p>'+esc(a.description||t('لا يوجد وصف','No description'))+'</p></div><div class="assignment-detail-grid"><div><small>'+t('النوع','Type')+'</small><b>'+t(a.type==='client'?'عميل':'مهمة',a.type==='client'?'Client':'Task')+'</b></div><div><small>'+t('المنشئ','Created by')+'</small><b>'+esc(a.createdByName||'—')+'</b></div><div><small>'+t('الموزع الحالي','Current owner')+'</small><b>'+esc(a.ownerLeaderName||'—')+'</b></div><div><small>'+t('المسؤول','Assignee')+'</small><b>'+esc(a.assigneeName||'—')+'</b></div>'+(a.type==='client'?'<div><small>'+t('اسم العميل','Client name')+'</small><b>'+esc(a.clientName||a.title||'—')+'</b></div><div><small>'+t('رقم هاتف المتابعة','Follow-up phone')+'</small><b>'+esc(a.clientPhone||'—')+'</b></div>':'')+'<div><small>'+t('موعد المتابعة','Follow-up date')+'</small><b>'+assignmentDate(a.dueAt)+'</b></div><div><small>'+t('الأولوية','Priority')+'</small><b>'+t((assignmentPriorityLabels[a.priority]||['—','—'])[0],(assignmentPriorityLabels[a.priority]||['—','—'])[1])+'</b></div><div><small>'+t('آخر تحديث','Last updated')+'</small><b>'+assignmentDate(a.updatedAt)+'</b></div></div>'+actions+(requests?'<section class="assignment-pending-requests"><h3>'+t('طلبات إعادة الإسناد المعلقة','Pending reassignment requests')+'</h3>'+requests+'</section>':'')+'<section class="assignment-notes-section"><h3>'+t('الملاحظات','Notes')+'</h3>'+notes+'<form id="assignedNoteForm" class="assignment-note-form"><label>'+t('إضافة ملاحظة','Add a note')+'<textarea name="body" required></textarea></label><label>'+t('نوع الملاحظة','Visibility')+'<select name="visibility"><option value="private">'+t('خاصة','Private')+'</option><option value="shared">'+t('مشتركة','Shared')+'</option></select></label><button class="btn primary" type="submit">'+t('حفظ الملاحظة','Save note')+'</button></form></section></div>';
      const popup=showAssignmentPopup(t('تفاصيل المتابعة','Follow-up details'),content);
      if(window.lucide)window.lucide.createIcons({attrs:{'stroke-width':1.8}});
      popup.querySelector('#assignmentHistoryButton')?.addEventListener('click',async()=>{const button=popup.querySelector('#assignmentHistoryButton');if(button.disabled)return;button.disabled=true;try{const result=await apiPost({action:'assignment_history',assignmentId:a.id});const rows=(result.history||[]).map(item=>'<article class="assignment-history-item"><b>'+esc(item.actorName||'')+'</b><span>'+esc(assignmentActionLabel(item.action))+'</span><small>'+assignmentDate(item.createdAt)+'</small></article>').join('')||'<div class="empty-state">'+t('لا يوجد سجل حركة','No activity history')+'</div>';showAssignmentPopup(t('سجل حركة المتابعة','Follow-up activity'),'<div class="assignment-history">'+rows+'</div>')}catch(error){toast(error.message)}finally{button.disabled=false}});
      popup.querySelector('#assignmentDirectReassignButton')?.addEventListener('click',async()=>{
        try{
          const people=await apiPost({action:'assignment_targets',assignmentId:a.id,excludeUserId:a.assigneeId}),targets=(people.users||[]).filter(u=>u.id!==a.assigneeId&&u.id!==currentUser.id&&(currentUser.role==='admin'||u.role!=='admin'));
          if(!targets.length){toast(t('لا يوجد مستخدمون متاحون للإسناد إليهم','No eligible users available'));return}
          const options=targets.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+'</option>').join('');
          const transfer=showAssignmentPopup(t('إعادة إسناد المتابعة','Reassign follow-up'),'<form id="directReassignForm" class="assignment-transfer-form"><label>'+t('المستخدم الجديد','New assignee')+'<select class="filter-input" name="toUserId" required>'+options+'</select></label><div class="modal-foot"><button class="btn primary" type="submit">'+t('تأكيد إعادة الإسناد','Confirm reassignment')+'</button><button class="btn" type="button" data-popup-close>'+t('إلغاء','Cancel')+'</button></div></form>');
          transfer.querySelector('[data-popup-close]')?.addEventListener('click',()=>closeAssignmentPopup());
          transfer.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,submit=f.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;try{await apiPost({action:'assignment_reassign',assignmentId:id,toUserId:f.toUserId.value});toast(t('تمت إعادة إسناد المتابعة بنجاح','Follow-up reassigned successfully'));closeAssignmentPopup(true);await loadAssignedView();await openAssignedDetail(id)}catch(err){toast(err.message)}finally{submit.disabled=false}};
        }catch(err){toast(err.message)}
      });
      popup.querySelector('#assignmentArchiveButton')?.addEventListener('click',async()=>{const button=popup.querySelector('#assignmentArchiveButton');if(button.disabled)return;button.disabled=true;try{await apiPost({action:a.archivedAt?'assignment_restore':'assignment_archive',assignmentId:id,archive:!a.archivedAt});toast(t(a.archivedAt?'تمت استعادة المتابعة':'تمت أرشفة المتابعة',a.archivedAt?'Follow-up restored':'Follow-up archived'));closeAssignmentPopup(true);await loadAssignedView()}catch(error){toast(error.message)}finally{button.disabled=false}});
      popup.querySelector('#assignmentDetailSave')?.addEventListener('click',async()=>{const status=popup.querySelector('#assignmentDetailStatus').value;try{await apiPost({action:'assignment_status',assignmentId:id,status});toast(t('تم تحديث الحالة','Status updated'));await loadAssignedView();await openAssignedDetail(id)}catch(err){toast(err.message)}});
      popup.querySelector('#assignmentTransferButton')?.addEventListener('click',async()=>{
        try{const people=await apiPost({action:'reassignment_targets',assignmentId:a.id,excludeUserId:a.assigneeId}),targets=(people.users||[]).filter(u=>u.id!==currentUser.id&&u.id!==a.assigneeId&&u.role!=='admin');if(!targets.length){toast(t('لا يوجد مستخدمون متاحون لنقل المتابعة إليهم','No eligible users to reassign to'));return}
          const opts=targets.map(u=>'<option value="'+esc(u.id)+'">'+esc(u.username)+'</option>').join('');
          const transfer=showAssignmentPopup(t('طلب إعادة الإسناد','Request reassignment'),'<form id="assignmentTransferForm" class="assignment-transfer-form"><label>'+t('المستخدم الجديد','New assignee')+'<select class="filter-input" name="toUserId" required>'+opts+'</select></label><label>'+t('سبب طلب النقل','Reason for reassignment')+'<textarea class="filter-input" name="reason" rows="4" required></textarea></label><div class="modal-foot"><button class="btn primary" type="submit">'+t('إرسال الطلب','Send request')+'</button><button class="btn" type="button" data-popup-close>'+t('إلغاء','Cancel')+'</button></div></form>');
          transfer.querySelector('[data-popup-close]')?.addEventListener('click',()=>closeAssignmentPopup());
          transfer.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,submit=f.querySelector('[type="submit"]');if(submit.disabled)return;submit.disabled=true;try{await apiPost({action:'reassignment_request',assignmentId:id,toUserId:f.toUserId.value,reason:f.reason.value});toast(t('تم إرسال الطلب للموافقة','Request sent for approval'));await openAssignedDetail(id);await loadAssignedView()}catch(err){toast(err.message)}finally{submit.disabled=false}};
        }catch(err){toast(err.message)}
      });
      popup.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{try{await apiPost({action:'reassignment_review',requestId:button.dataset.request,approve:button.dataset.review==='yes'});toast(t('تم حفظ القرار','Decision saved'));await loadAssignedView();await openAssignedDetail(id)}catch(err){toast(err.message)}});
      popup.querySelector('#assignedNoteForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await apiPost({action:'assignment_note_add',assignmentId:id,body:f.body.value,visibility:f.visibility.value});await openAssignedDetail(id)}catch(err){toast(err.message)}};
    }catch(err){toast(t('تعذر فتح تفاصيل المتابعة: ','Could not open follow-up details: ')+err.message)}
  }
  async function refreshUnifiedNotifications(loadOlder=false){
    const t=assignmentText;
    try{
      const result=await apiPost({action:'notification_list',cursor:loadOlder?serverNotificationCursor:''});
      serverNotifications=loadOlder?serverNotifications.concat(result.notifications||[]):(result.notifications||[]);
      serverNotificationCursor=result.nextCursor||'';serverNotificationHasMore=!!result.hasMore;if(!loadOlder){serverNotificationUnreadCount=Number(result.unreadCount||0);serverNotificationTotalCount=Number(result.totalCount||0);}
    }catch(error){if(!loadOlder)serverNotifications=[];toast(t('تعذر تحميل الإشعارات: ','Could not load notifications: ')+error.message)}
    renderUnifiedNotifications();
  }
  function renderUnifiedNotifications(){
    const t=assignmentText,all=[...taskAlerts.map(a=>({id:'local:'+a.key,kind:'local',title:a.title,body:a.body,createdAt:a.createdAt,isRead:!!a.isRead,taskId:a.taskId,key:a.key})),...serverNotifications.map(n=>({...n,kind:'server'}))].sort((a,b)=>(Date.parse(b.createdAt)||Number(b.createdAt)||0)-(Date.parse(a.createdAt)||Number(a.createdAt)||0));
    const unread=taskAlerts.filter(n=>!n.isRead).length+serverNotificationUnreadCount,list=document.getElementById('taskAlerts'),more=document.getElementById('notificationLoadMore');
    document.getElementById('notificationCount').textContent=unread;document.getElementById('notificationCount').hidden=!unread;document.getElementById('notificationPanelCount').textContent='('+(taskAlerts.length+serverNotificationTotalCount)+')';document.getElementById('notificationBell').setAttribute('aria-label',t('الإشعارات: ','Notifications: ')+unread);
    if(more){more.hidden=!serverNotificationHasMore;more.disabled=false;more.textContent=t('تحميل إشعارات أقدم','Load older notifications')}
    list.innerHTML=all.length?all.map(n=>'<article class="task-alert '+(n.isRead?'is-read':'is-unread')+'"><div class="unified-notice-head"><h3>'+esc(n.title)+'</h3>'+(n.isRead?'':'<span class="unread-dot"></span>')+'</div><p>'+esc(n.body)+'</p><small>'+assignmentDate(n.createdAt)+'</small><div class="task-alert-actions"><button class="btn primary" data-unified-open="'+esc(n.id)+'" data-kind="'+n.kind+'" data-assignment="'+esc(n.assignmentId||'')+'" data-task="'+esc(n.taskId||'')+'">'+t('عرض','Open')+'</button></div></article>').join(''):'<div class="notification-empty">'+t('لا توجد إشعارات حالياً','No notifications yet')+'</div>';
  }
  async function handleUnifiedNotificationClick(e){
    const b=e.target.closest('[data-unified-open]');if(!b)return;
    try{
      if(b.dataset.kind==='local'){
        const alert=taskAlerts.find(x=>x.key===b.dataset.unifiedOpen.replace('local:',''));
        if(alert){alert.isRead=true;closeBrowserNotification(alert.key);persistTaskAlertState();showView('tasks');openForm('task',alert.taskId)}
      }else{
        await apiPost({action:'notification_read',notificationId:b.dataset.unifiedOpen});
        const item=serverNotifications.find(x=>x.id===b.dataset.unifiedOpen);if(item&&!item.isRead){item.isRead=true;serverNotificationUnreadCount=Math.max(0,serverNotificationUnreadCount-1);}
        if(b.dataset.assignment){showView('assigned');await openAssignedDetail(b.dataset.assignment)}
      }
      renderUnifiedNotifications();
    }catch(err){toast(err.message)}
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
  document.getElementById('notificationBell').onclick=async()=>{const panel=document.getElementById('notificationPanel'),open=panel.hidden;panel.hidden=!open;document.getElementById('notificationBell').setAttribute('aria-expanded',String(open));if(open)await refreshUnifiedNotifications()};
  document.getElementById('taskAlerts').addEventListener('click',handleUnifiedNotificationClick);
  document.getElementById('notificationLoadMore')?.addEventListener('click',async event=>{const button=event.currentTarget;if(button.disabled||!serverNotificationHasMore)return;button.disabled=true;button.textContent=assignmentText('جارٍ التحميل...','Loading...');await refreshUnifiedNotifications(true)});
  // Alert action handlers are attached directly in renderTaskAlerts for reliable Android WebView taps.
  document.addEventListener('click',event=>{if(!event.target.closest('.notification-center')){document.getElementById('notificationPanel').hidden=true;document.getElementById('notificationBell').setAttribute('aria-expanded','false')}});
  navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='OPEN_TASK_NOTIFICATION'&&typeof event.data.taskId==='string'){const alert=taskAlerts.find(x=>x.key===event.data.key);if(alert){alert.isRead=true;persistTaskAlertState();renderTaskAlerts()}showView('tasks');if(get('tasks',event.data.taskId))openForm('task',event.data.taskId)}});
  window.addEventListener('smartnote-open-task',event=>{const taskId=event.detail?.taskId;if(typeof taskId==='string'){const alert=taskAlerts.find(x=>x.key===event.detail?.key);if(alert){alert.isRead=true;persistTaskAlertState();renderTaskAlerts()}showView('tasks');if(get('tasks',taskId))openForm('task',taskId)}});
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
  let lastVisibleSyncAt=0;
  setInterval(()=>{if(!document.hidden&&Date.now()-lastVisibleSyncAt>=30000){lastVisibleSyncAt=Date.now();syncCloud()}},5000);
  setInterval(checkTaskNotifications,15000);
  if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js').then(registration=>{serviceWorkerRegistration=registration}).catch(err=>toast('تعذر تجهيز إشعارات الهاتف: '+err.message));
  if(window.lucide)window.lucide.createIcons({attrs:{"stroke-width":1.8}});restoreTaskAlertState();renderAll();requestNotificationPermissionOnStartup();initializeCloud();
})();
