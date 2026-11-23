(() => {
  const translations = {
    'دفتر العقارات':'Real Estate Notebook','القائمة الرئيسية':'MAIN MENU','الرئيسية':'Dashboard','مساحات العمل':'Workspaces','المشاريع':'Projects','الوحدات':'Units','الملاحظات':'Notes','العملاء':'Clients','المتابعات':'Follow-ups',
    'ملخص سريع لكل بياناتك العقارية':'A quick overview of your real estate data','نظم بياناتك في مجموعات مستقلة':'Organize your data into separate workspaces','قاعدة موحدة لكل المشروعات':'One place for all your projects','تفاصيل الوحدات وأسعارها':'Unit details and pricing','كل المعلومات التي سجلتها':'All the information you have saved','بيانات العملاء واحتياجاتهم':'Client details and requirements','المهام والمواعيد القادمة':'Upcoming tasks and reminders',
    'إضافة جديدة':'Add new','مساحة جديدة':'New workspace','مشروع جديد':'New project','وحدة جديدة':'New unit','ملاحظة جديدة':'New note','عميل جديد':'New client','متابعة جديدة':'New follow-up','عرض':'View','تعديل':'Edit','حذف':'Delete','بدء':'Start','إنهاء':'Complete','إلغاء':'Cancel','إغلاق':'Close','حفظ البيانات':'Save','حفظ':'Save','تأكيد الحذف':'Confirm deletion','حذف نهائي':'Delete permanently','إعادة المحاولة':'Retry',
    'ابحث عن مشروع أو وحدة أو ملاحظة أو عميل...':'Search projects, units, notes, or clients...','تصفية المشاريع...':'Filter projects...','بحث في الوحدات...':'Search units...','ابحث في الملاحظات...':'Search notes...','ابحث في المتابعات...':'Search follow-ups...','بحث':'Search','الأولوية':'Priority','من تاريخ':'From date','إلى تاريخ':'To date','كل المساحات':'All workspaces','كل المشاريع':'All projects','كل الأولويات':'All priorities','اختر...':'Select...','بدون تحديد':'None',
    'مساحة منظمة':'Organized workspace','مشروع محفوظ':'Saved project','وحدة مسجلة':'Registered unit','معلومة محفوظة':'Saved note','نظرة عامة':'Overview','آخر ما تم تسجيله في دفتر العقارات':'Recently added to your notebook','كل الملاحظات ←':'All notes →','أحدث الملاحظات':'Recent notes','أحدث الإجراءات':'Latest activity','مساحات العمل':'Workspaces','المتابعات المفتوحة':'Open follow-ups','مرتبة حسب الأولوية ثم موعد المتابعة':'Sorted by priority and due date','تفعيل التنبيهات':'Enable reminders','إيقاف التنبيهات ساعة':'Snooze reminders for an hour','كل المتابعات ←':'All follow-ups →','الوصول السريع':'Quick actions','ابدأ بتسجيل معلومة جديدة':'Add a new record','سجل بيانات مشروع ومطور وموقع وأنظمة سداد.':'Save project, developer, location, and payment details.','سجل معلومة فوراً واربطها بمشروع أو وحدة.':'Quickly save a note and link it to a project or unit.','احفظ المساحة والسعر والتفاصيل الخاصة بالوحدة.':'Save the unit area, price, and details.','إضافة مشروع':'Add project','كتابة ملاحظة':'Write a note','إضافة وحدة':'Add unit','لا توجد متابعات مفتوحة':'No open follow-ups','لا توجد إجراءات بعد':'No activity yet','أضف أو عدّل سجلًا ليظهر هنا.':'Add or update a record to see it here.',
    'اسم المساحة':'Workspace name','وصف مختصر':'Short description','لون المساحة':'Workspace color','اسم المشروع':'Project name','المطور العقاري':'Developer','المنطقة / الموقع':'Area / location','نوع المشروع':'Project type','موعد التسليم':'Delivery date','أنظمة السداد':'Payment plans','العمولة':'Commission','رابط الموقع على الخريطة':'Map link','تفاصيل ومعلومات المشروع':'Project details','اسم أو كود الوحدة':'Unit name or code','المشروع':'Project','المساحة بالمتر':'Area (m²)','الدور':'Floor','عدد الغرف':'Bedrooms','السعر':'Price','المقدم':'Down payment','تفاصيل الأقساط':'Installment details','التسليم':'Delivery','الحالة':'Status','تفاصيل إضافية':'Additional details','عنوان الملاحظة':'Note title','المحتوى':'Content','المشروع المرتبط':'Linked project','الوحدة المرتبطة':'Linked unit','العميل المرتبط':'Linked client','التصنيفات (افصل بينها بفاصلة)':'Tags (separate with commas)','اسم العميل':'Client name','رقم الهاتف':'Phone number','الميزانية':'Budget','المنطقة المطلوبة':'Preferred area','نوع الوحدة المطلوبة':'Preferred unit type','ملاحظات':'Notes','عنوان المتابعة':'Follow-up title','الوقت':'Time','العميل':'Client','التفاصيل':'Details',
    'سكني':'Residential','تجاري':'Commercial','إداري':'Administrative','ساحلي':'Coastal','متعدد الاستخدامات':'Mixed use','شقة':'Apartment','فيلا':'Villa','تاون هاوس':'Townhouse','توين هاوس':'Twin house','دوبلكس':'Duplex','محل':'Shop','مكتب':'Office','عيادة':'Clinic','أخرى':'Other','متاحة':'Available','محجوزة':'Reserved','مباعة':'Sold','غير محدد':'Unspecified','جديد':'New','مهتم':'Interested','متابعة':'Follow-up','تعاقد':'Contracted','غير مهتم':'Not interested','معلقة':'Pending','قيد التنفيذ':'In progress','مكتملة':'Completed','عادية':'Normal','مهمة':'Important','عاجلة':'Urgent','غير مرتبط':'Not linked','بدون تاريخ':'No date','بدون وصف':'No description','لا يوجد وصف':'No description', 'متابعة جديدة':'New follow-up','تم إغلاق المتابعة':'Follow-up completed','متابعة محولة إليك':'A follow-up was reassigned to you','طلب إعادة إسناد':'Reassignment request','تم رفض النقل':'Reassignment was rejected','تمت الموافقة على النقل':'Reassignment approved','تم إسناد متابعة إليك':'A follow-up was assigned to you','حان موعد المتابعة':'Follow-up is due','المتابعة ما زالت معلقة':'The follow-up is still pending','هل ما زلت تعمل على المتابعة؟':'Are you still working on this follow-up?','تم حفظ البيانات على Google Sheets':'Data saved to Google Sheets','تم الحفظ على الجهاز وستتم المزامنة عند عودة الإنترنت':'Saved on this device; it will sync when internet returns','تم الحذف محلياً وستتم المزامنة عند عودة الإنترنت':'Deleted locally; changes will sync when internet returns','تم حذف السجل من Google Sheets':'Record deleted from Google Sheets','فشل الحذف: ':'Could not delete: ','تعذر حفظ نسخة محلية: ':'Could not save local copy: ','تعذر تنفيذ الإجراء: ':'Could not perform action: ','تعذر فتح تفاصيل المتابعة: ':'Could not open follow-up details: ','تعذر تحميل المتابعات الموجهة: ':'Could not load assigned follow-ups: ','تم إسناد المتابعة':'Follow-up assigned','لا يوجد مستخدم آخر متاح':'No other active user available','لا توجد متابعات مسندة حالياً.':'No assigned follow-ups yet.','المتابعات المشتركة وسجل الإسناد والإشعارات':'Shared follow-ups, assignment history and notifications','تم إرسال الطلب للموزع للموافقة':'Request sent to the assignment owner for approval','تم إخفاء الإشعار':'Notification dismissed','تعذر استعادة التنبيهات المحفوظة: ':'Could not restore saved alerts: ','تم تفعيل إشعارات الهاتف وجدولة مواعيد المتابعات':'Phone notifications enabled and follow-up reminders scheduled','لم يتم السماح بإشعارات الهاتف. يمكنك تفعيلها من إعدادات التطبيق.':'Phone notifications were not allowed. You can enable them in app settings.','إشعارات الهاتف':'Phone notifications','إشعارات المتابعات':'Follow-up notifications','إيقافها ساعة':'Snooze for an hour','لا توجد تفاصيل إضافية':'No additional details','مساحة عمل':'Workspace','مشروع':'Project','وحدة':'Unit','عميل':'Client','ملاحظة':'Note','الملاحظات الذكية':'Smart notes','جنيه':'EGP','لا توجد إشعارات حالياً':'No notifications','إظهار المتابعة':'Open follow-up','إخفاء':'Dismiss','آخر تحديث':'Last updated','تاريخ الإنشاء':'Created','تاريخ المتابعة':'Due date','تاريخ بدء المتابعة':'Started','حالة العميل':'Client status','مساحة العمل':'Workspace',
    'لا توجد ملاحظات بعد':'No notes yet','ابدأ بإضافة أول معلومة في دفتر العقارات.':'Add your first note to the notebook.','لا توجد مساحات عمل':'No workspaces yet','أنشئ مساحة لتنظيم مشروعاتك.':'Create a workspace to organize your projects.','ابدأ بإنشاء مساحة عمل':'Create your first workspace','مثلاً: الساحل الشمالي، القاهرة، معلومات عامة.':'For example: North Coast, Cairo, General.','لا توجد مشاريع مطابقة':'No matching projects','أضف مشروعاً جديداً أو غيّر كلمات البحث.':'Add a project or change your search.','لا توجد وحدات مسجلة':'No units yet','أضف وحدة واربطها بأحد المشاريع.':'Add a unit and link it to a project.','دفتر الملاحظات فارغ':'No notes yet','سجل معلومة سريعة واربطها بمشروع أو وحدة أو عميل.':'Add a note and link it to a project, unit, or client.','لا يوجد عملاء':'No clients yet','أضف بيانات العملاء واحتياجاتهم.':'Add client details and requirements.','لا توجد متابعات مطابقة':'No matching follow-ups','غيّر الفلاتر أو أضف متابعة جديدة.':'Change the filters or add a follow-up.','متابعة عامة':'General follow-up','نتائج البحث':'Search results','بحث شامل في قاعدة بياناتك':'Search your entire database','العودة للرئيسية':'Back to dashboard','فتح القسم':'Open section',
    'إشعارات المتابعات':'Follow-up notifications','إيقافها ساعة':'Snooze for an hour','تفعيل الوضع الداكن':'Switch to dark mode','تفعيل الوضع الفاتح':'Switch to light mode','Switch to English':'Switch to Arabic',
    'الاتصال بالإنترنت مطلوب':'Internet connection required','هذا التطبيق يعمل أونلاين فقط، ويحتاج اتصالاً بقاعدة بيانات Google Sheets.':'This app requires an internet connection to access its Google Sheets database.',
    'لا يمكن الحفظ بدون اتصال بقاعدة البيانات':'Cannot save without a database connection','تم حفظ البيانات على Google Sheets':'Data saved to Google Sheets','فشل الحفظ:':'Could not save:','هل تريد حذف هذا السجل نهائياً من قاعدة البيانات؟':'Permanently delete this record from the database?','لا يمكن الحذف بدون اتصال بقاعدة البيانات':'Cannot delete without a database connection','تم حذف السجل من Google Sheets':'Record deleted from Google Sheets','فشل الحذف:':'Could not delete:','لا يمكن تغيير الحالة بدون اتصال بقاعدة البيانات':'Cannot change status without a database connection','تم تحديث حالة المتابعة على جهاز آخر؛ انتظر المزامنة ثم حاول مرة أخرى':'This follow-up changed on another device. Wait for sync and try again.','بدأت المتابعة':'Follow-up started','تم إنهاء المتابعة':'Follow-up completed','فشل تغيير حالة المتابعة:':'Could not change follow-up status:',
    'غير متصل':'Disconnected','متصل بقاعدة البيانات':'Connected to database','جاري الاتصال...':'Connecting...','يتم تحميل بياناتك من Google Sheets.':'Loading your data from Google Sheets.','مزامنة تلقائية كل 5 ثوانٍ.':'Syncing every 5 seconds.','تعذر الاتصال بالإنترنت.':'Could not connect to the internet.','لا يوجد اتصال بالإنترنت.':'No internet connection.','انقطع اتصال الإنترنت.':'Internet connection lost.','اتصل بالإنترنت ثم اضغط إعادة المحاولة. لا يتم تخزين بياناتك على هذا الجهاز.':'Connect to the internet, then retry. Your data is not stored on this device.',
    'تفعيل إشعارات المتصفح والتنبيهات داخل التطبيق':'Browser and in-app notifications enabled','لم يتم السماح بإشعارات النظام؛ ستظل التنبيهات داخل التطبيق متاحة':'System notifications were not allowed. In-app reminders are still available.','إشعارات المتصفح مفعلة':'Browser notifications enabled','تنبيهات داخل التطبيق فقط':'In-app reminders only','إيقاف التنبيهات لمدة ساعة':'Reminders snoozed for one hour','تمت إعادة تفعيل التنبيهات':'Reminders turned back on','تم إيقاف التنبيهات لمدة ساعة':'Reminders snoozed for one hour',
    'إنشاء مساحة عمل':'Create workspace','المستخدمون':'Users','المساحات':'Workspaces','الإشعارات':'Notifications','لا يوجد رقم هاتف':'No phone number','منطقة غير محددة':'Unspecified area','ملاحظة عامة':'General note','هل ما زلت تعمل على المتابعة؟':'Are you still working on this follow-up?','المتابعة ما زالت معلقة':'The follow-up is still pending','إشعارات النظام غير مدعومة أو Service Worker غير جاهز':'System notifications are unavailable or the service worker is not ready','إشعارات النظام تتطلب فتح التطبيق عبر HTTPS مع دعم Service Worker':'System notifications require HTTPS and service worker support','هذا المتصفح لا يدعم إشعارات النظام؛ ستظل التنبيهات داخل التطبيق متاحة':'This browser does not support system notifications. In-app reminders remain available.','هذا المتصفح لا يدعم إشعارات Service Worker؛ ستظل التنبيهات داخل التطبيق متاحة':'This browser does not support service worker notifications. In-app reminders remain available.','لإشعارات iPhone وiPad، أضف التطبيق إلى الشاشة الرئيسية وافتحه منها، ثم فعّل الإشعارات':'For iPhone and iPad notifications, add the app to your home screen, open it, then enable notifications.','فعّل إشعارات المتصفح من الإعدادات':'Enable browser notifications in settings','جاري الحفظ...':'Saving...','انتهت مهلة الاتصال بالخادم':'Connection timed out','تعذر الوصول إلى Google Apps Script':'Could not reach Google Apps Script','تعذر تنفيذ العملية':'The operation failed','لم تصل استجابة صالحة من Google Apps Script؛ راجع نشر Web App':'Google Apps Script returned an invalid response. Check the Web App deployment.','لم يتم العثور على بيانات قاعدة البيانات':'Database not found','حجم البيانات اقترب من الحد المسموح في Google Sheets؛ يلزم تقسيم التخزين قبل إضافة المزيد':'The Google Sheets data limit is near. Split the data before adding more.','لم تعد هذه المتابعة موجودة':'This follow-up no longer exists','تعذر تشغيل صوت التنبيه في هذا المتصفح':'Could not play the reminder sound in this browser','بيانات التنبيهات المحفوظة غير صالحة':'Saved reminder data is invalid','دفتر العقارات الذكي':'Smart Real Estate Notebook','تفعيل التنبيهات الآن':'Turn reminders back on now','لا توجد نتائج':'No results','يلزم الاتصال بالإنترنت وقاعدة البيانات.':'An internet and database connection is required.','تم الاتصال بـ Google Sheets.':'Connected to Google Sheets.','تعذر تحديث البيانات تلقائياً:':'Could not sync data automatically:','تعذر الاتصال بقاعدة البيانات:':'Could not connect to the database:','تعذر تجهيز إشعارات الهاتف:':'Could not set up phone notifications:','تعذر تفعيل إشعارات المتصفح:':'Could not enable browser notifications:','تعذر حفظ حالة التنبيهات على هذا الجهاز:':'Could not save reminder settings on this device:','تعذر تشغيل نغمة التنبيه:':'Could not play reminder sound:','تعذر تفعيل صوت التنبيه:':'Could not enable reminder sound:','تعذر استعادة التنبيهات المحفوظة:':'Could not restore saved reminders:','تعذر إرسال إشعار النظام:':'Could not send system notification:','تعذر إغلاق إشعار النظام:':'Could not close system notification:','تعذر مزامنة إخفاء الإشعار:':'Could not sync dismissed notification:','تم تفعيل إشعارات المتصفح والتنبيهات داخل التطبيق':'Browser and in-app notifications enabled','إضافة':'Add','تفاصيل السجل':'Record details','＋ مشروع جديد':'＋ New project','＋ وحدة جديدة':'＋ New unit','＋ ملاحظة سريعة':'＋ Quick note','أضف متابعة جديدة لتظهر هنا حسب أولويتها.':'Add a follow-up to see it here by priority.','بدون عنوان':'Untitled','بحث شامل':'Full search','اللون':'Color','رابط الموقع':'Map link','الوحدة':'Unit','نوع الوحدة':'Unit type','جرّب كلمات بحث أخرى.':'Try different search terms.','انقطع اتصال الإنترنت. التطبيق يعمل أونلاين فقط؛ أعد الاتصال ثم حاول مرة أخرى.':'Internet connection lost. This app requires an internet connection. Reconnect and retry.','تأكد أن نشر Apps Script متاح لأي شخص لديه الرابط، ثم أعد المحاولة.':'Make sure the Apps Script deployment is available to anyone with the link, then try again.','PRIVATE PROPERTY PORTFOLIO':'PRIVATE PROPERTY PORTFOLIO'
  };
  Object.assign(translations,{    'مرحباً بعودتك':'Welcome back','سجّل الدخول للوصول إلى بياناتك ومساحات عملك.':'Sign in to access your data and workspaces.','اسم المستخدم':'Username','كلمة المرور':'Password','أدخل اسم المستخدم':'Enter your username','أدخل كلمة المرور':'Enter your password','جارٍ التحقق من بيانات الدخول...':'Verifying your credentials...','تسجيل الدخول':'Sign in','بياناتك محفوظة بشكل مستقل وآمن':'Your data is stored separately and securely','إدارة المستخدمين':'User management','SMARTNOTE CONTROL CENTER':'SMARTNOTE CONTROL CENTER','إنشاء الحسابات والتحكم في الصلاحيات وكلمات المرور.':'Create accounts and manage roles and passwords.','إضافة مستخدم جديد':'Add a new user','مثال: ahmed123':'Example: ahmed123','10 أحرف على الأقل':'At least 10 characters','إنشاء الحساب':'Create account','الحسابات المسجلة':'Registered accounts','إدارة حسابات النظام':'Manage system accounts','تغييرات الصلاحيات وكلمات المرور تُطبق فوراً.':'Role and password changes take effect immediately.','تم':'Done','تم إنشاء المستخدم بنجاح':'User created successfully','اسم المستخدم مستخدم بالفعل':'This username is already taken','كلمة المرور يجب ألا تقل عن 10 أحرف':'Password must be at least 10 characters','تفعيل':'Enable','تعطيل':'Disable','تغيير الصلاحية':'Change role','تغيير كلمة المرور':'Change password','مدير':'Administrator','مستخدم':'User','نشط':'Active','معطل':'Disabled','تعذر استعادة الجلسة حالياً بسبب الاتصال. أعد المحاولة، ولن تحتاج لإدخال كلمة المرور.':'Unable to restore the session due to a connection problem. Retry; you will not need to enter your password.','تعذر الاتصال بالخادم: ':'Could not connect to the server: ','تسجيل الخروج':'Sign out','تم تسجيل الخروج.':'You have been signed out.','تم تسجيل الدخول؛ المزامنة كل 30 ثانية.':'Signed in; syncing every 30 seconds.','لا يوجد اتصال؛ سيتم استعادة جلستك عند عودة الإنترنت.':'You are offline. Your session will be restored when the connection returns.','تعذر الاتصال بالخادم. أعد المحاولة دون تسجيل خروجك.':'Unable to reach the server. Retry without signing out.','انقطع اتصال الإنترنت. ستتم إعادة المزامنة تلقائياً عند عودة الاتصال.':'Internet connection lost. Sync will resume automatically when you reconnect.'});
  Object.assign(translations,{
    'المتابعات الموجهة':'Assigned follow-ups','المهام المسندة إليك أو التي تدير توزيعها':'Tasks assigned to you or managed by you','الموجهة':'Assigned',
    'إسناد متابعة':'Assign follow-up','إسناد متابعة جديدة':'Assign a new follow-up','إسناد المتابعة':'Assign follow-up','عنوان المتابعة':'Follow-up title','المسؤول':'Assignee','الموزع':'Owner','الموزع الحالي':'Current owner','المنشئ':'Created by','موعد التسليم':'Due date','آخر تحديث':'Last updated','عرض التفاصيل':'View details','كل الحالات':'All statuses','كل الأولويات':'All priorities','ابحث في المتابعات الموجهة...':'Search assigned follow-ups...','جديدة':'New','تم الاطلاع':'Viewed','متوقفة مؤقتاً':'Paused','ملغاة':'Cancelled','مرتفعة':'High','منخفضة':'Low','لا توجد متابعات في هذه الحالة':'No follow-ups in this status','لا يوجد مستخدمون نشطون للإسناد إليهم':'No active users available','إسناد':'Assign','تم إسناد المتابعة':'Follow-up assigned','تحديث':'Update','الملاحظات':'Notes','سجل الحركة':'Activity history','لا يوجد سجل حركة':'No activity yet','لا توجد ملاحظات':'No notes','إضافة ملاحظة':'Add a note','نوع الملاحظة':'Visibility','خاصة':'Private','مشتركة':'Shared','حفظ الملاحظة':'Save note','طلب إعادة الإسناد':'Request reassignment','سبب النقل':'Reason','إرسال الطلب':'Send request','تم إرسال الطلب للموافقة':'Request sent for approval','طلب نقل من ':'Transfer request from ','إلى ':'to ','موافقة':'Approve','رفض':'Reject','تم تحديث الحالة':'Status updated','تم حفظ القرار':'Decision saved','الإشعارات: ':'Notifications: ','عرض':'Open','لا توجد إشعارات حالياً':'No notifications yet','مرحباً،':'Welcome,','المهام المسندة':'Assigned tasks','تفاصيل المتابعة':'Follow-up details','إنشاء':'Created','تعديل':'Updated','اطلاع':'Viewed','تغيير الحالة':'Status changed','أرشفة':'Archived','استعادة':'Restored','طلب نقل':'Transfer requested','الموافقة على النقل':'Transfer approved','رفض النقل':'Transfer rejected','إضافة ملاحظة':'Note added','بدون موعد':'No due date','لا يوجد وصف':'No description'
  });
  Object.assign(translations,{'تفاصيل المتابعة':'Follow-up details','عرض سجل الحركة':'View activity log','سجل الحركة':'Activity log','حفظ التحديث':'Save changes','طلب إعادة الإسناد':'Request reassignment','المستخدم الجديد':'New assignee','سبب طلب النقل':'Reason for reassignment','إرسال الطلب':'Send request','طلبات إعادة الإسناد المعلقة':'Pending reassignment requests','لا يوجد سجل حركة':'No activity yet','لا توجد ملاحظات':'No notes','تم حفظ القرار':'Decision saved','لا يوجد مستخدمون متاحون لنقل المتابعة إليهم':'No eligible users to reassign to','الأولوية':'Priority','آخر تحديث':'Last updated'});
  Object.assign(translations,{
    'المسؤول عن المتابعة':'Follow-up assignee','كل المسؤولين':'All assignees',
    'أحدث المتابعات الموجهة الجديدة':'Latest new assigned follow-ups',
    'أحدث المتابعات المسندة إليك والتي لم تطّلع عليها بعد':'The latest new follow-ups assigned to you that you have not viewed yet',
    'كل المتابعات الموجهة ←':'All assigned follow-ups →',
    'لا توجد متابعات جديدة موجهة إليك':'No new follow-ups assigned to you',
    'تم الاطلاع':'Viewed','لا توجد متابعات في هذه الحالة':'No follow-ups in this status'
  });
  Object.assign(translations,{
    'نوع الإسناد':'Assignment type','مهمة':'Task','عميل':'Client','عنوان المهمة':'Task title',
    'اسم العميل':'Client name','رقم هاتف المتابعة':'Follow-up phone number',
    'موعد المتابعة':'Follow-up date','إعادة إسناد':'Reassign','إعادة إسناد المتابعة':'Reassign follow-up',
    'ملاحظات (اختياري)':'Notes (optional)','تأكيد إعادة الإسناد':'Confirm reassignment',
    'تمت إعادة إسناد المتابعة بنجاح':'Follow-up reassigned successfully',
    'لا يوجد مستخدمون متاحون للإسناد إليهم':'No eligible users available',
    'إعادة إسناد مباشرة':'Directly reassigned','النوع':'Type'
  });
  Object.assign(translations,{
    'متابعة عميل':'Client follow-up','متابعة عميل:':'Client follow-up:',
    'موعد المتابعة: ':'Follow-up date: ','المسؤول: ':'Assignee: ','الموزع: ':'Assigned by: '
  });
  Object.assign(translations,{
    'متابعة عميل':'Client follow-up','متابعة عميل:':'Client follow-up:',
    'رقم هاتف المتابعة':'Follow-up phone number','رقم هاتف متابعة العميل':'Client follow-up phone number',
    'المستخدم الجديد':'New assignee','تأكيد إعادة الإسناد':'Confirm reassignment',
    'طلب إعادة الإسناد':'Request reassignment','سبب طلب النقل':'Reason for reassignment',
    'تمت إعادة إسناد المتابعة بنجاح':'Follow-up reassigned successfully',
    'لا يوجد مستخدمون متاحون للإسناد إليهم':'No eligible users available'
  });
  Object.assign(translations,{'operation_in_progress':'Another operation is still running. Please wait.','جارٍ التنفيذ':'In progress — please wait.'});
  Object.assign(translations,{
    'too_many_attempts':'Too many sign-in attempts. Try again in 15 minutes.','تحميل إشعارات أقدم':'Load older notifications','جارٍ التحميل...':'Loading...','تعذر تحميل الإشعارات:':'Could not load notifications:','سجل التدقيق':'Audit log','لا توجد أحداث مسجلة.':'No audit events recorded.','System':'System',
    'user_has_active_assignments':'Reassign this account’s active follow-ups before disabling or deleting it.','user_has_pending_requests':'Resolve this account’s pending reassignment requests before disabling or deleting it.','user_manages_active_assignments':'Transfer this account’s active follow-up ownership before changing its role to User.','same_assignee':'Choose a different assignee.',
    'cannot_delete_self':'You cannot delete your own account.',
    'unauthorized':'Invalid username or password, or your session has expired.',
    'forbidden':'You do not have permission to perform this action.',
    'inactive_user':'This account is disabled.',
    'username_exists':'This username is already in use.',
    'weak_password':'Password must be between 10 and 128 characters.',
    'user_not_found':'The requested user or record was not found.',
    'cannot_change_own_role':'You cannot change your own role.',
    'request_pending':'A reassignment request is already pending for this follow-up.',
    'request_not_pending':'This reassignment request has already been processed.',
    'invalid_reason':'A reason is required for a reassignment request.',
    'invalid_title':'Enter a valid title.',
    'invalid_status':'The selected status is not valid.',
    'invalid_note':'The note cannot be empty.',
    'database_too_large':'The saved data has exceeded the supported size.',
    'database_not_configured':'The database has not been configured.',
    'invalid_action':'This action is not supported.',
    'invalid_data':'The submitted data is invalid.',
    'server_error':'The server could not complete the request. Please try again.'

    'هل تريد حذف هذا المستخدم؟ لا يمكن التراجع عن هذه العملية.':'Delete this user? This action cannot be undone.',
    'تم حذف المستخدم بنجاح':'User deleted successfully.',
    'حذف المستخدم':'Delete user',
    'تعذر حفظ نسخة محلية:':'Could not save local copy:',
    'تعذر جدولة تذكيرات الهاتف:':'Could not schedule phone reminders:',
    'توسيع الشريط الجانبي':'Expand sidebar',
    'طي الشريط الجانبي':'Collapse sidebar',
    'معرّف السجل':'Record ID',
    'يلزم تسجيل الدخول أولاً':'Please sign in first.',
    'تم الحفظ محلياً وستتم المزامنة عند عودة الإنترنت':'Saved locally. Changes will sync when internet returns.',
    'لم تصل استجابة صالحة من Google Apps Script؛ تحقق من نشر Web App':'No valid response from Google Apps Script. Check the Web App deployment.',
    'تعذر تحديث البيانات:':'Could not refresh data:',
    'تعذر الاتصال بالخادم:':'Could not connect to server:',
    'تعذر تغيير كلمة المرور. سجل الدخول مرة أخرى.':'Could not change password. Please sign in again.',
    'تم تغيير كلمة المرور وإغلاق الجلسات السابقة':'Password reset. Previous sessions have been revoked.',
    'تم تحديث حالة الحساب':'Account status updated.',
    'تم تحديث صلاحية المستخدم':'User role updated.',
    'لا يمكن تغيير صلاحيتك من هذه الشاشة':'You cannot change your own role here.',
    'إدارة المستخدمين':'User management',
    'إضافة مستخدم جديد':'Add new user',
    'إنشاء الحساب':'Create account',
    'الحسابات المسجلة':'Registered accounts',
    'مدير النظام':'Administrator',
    'موزع':'Leader',
    'مستخدم':'User',
    'نشط':'Active',
    'معطل':'Disabled',
    'تعطيل الحساب':'Disable account',
    'تفعيل الحساب':'Enable account',
    'حفظ الصلاحية':'Save role',
    'كلمة مرور جديدة (10 أحرف على الأقل)':'New password (at least 10 characters)',
    'تغييرات الصلاحيات وكلمات المرور تُطبق فوراً.':'Role and password changes take effect immediately.',
    'تم':'Done'
  });
  const originals = new WeakMap();
  const attributeOriginals = new WeakMap();
  let language = 'ar';
  function translate(value){
    const leading=value.match(/^\s*/)?.[0]||'',trailing=value.match(/\s*$/)?.[0]||'',core=value.slice(leading.length,value.length-trailing.length);
    if(translations[core])return leading+translations[core]+trailing;
    const required=core.endsWith(' *'),base=required?core.slice(0,-2):core;
    if(required&&translations[base])return leading+translations[base]+' *'+trailing;
    const plus=core.match(/^[＋+]\s*(.+)$/);if(plus&&translations[plus[1]])return `${leading}+ ${translations[plus[1]]}${trailing}`;
    const phrase=core.match(/^(إضافة|تعديل) (.+)$/);if(phrase&&translations[phrase[2]])return `${leading}${phrase[1]==='إضافة'?'Add':'Edit'} ${translations[phrase[2]]}${trailing}`;
    let match=core.match(/^(\d+)\s+مشاريع$/);if(match)return `${leading}${match[1]} projects${trailing}`;
    match=core.match(/^(\d+)\s+مشروع$/);if(match)return `${leading}${match[1]} projects${trailing}`;
    match=core.match(/^(\d+)\s+وحدات$/);if(match)return `${leading}${match[1]} units${trailing}`;
    match=core.match(/^(\d+) نتيجة عن: (.+)$/);if(match)return `${leading}${match[1]} results for: ${match[2]}${trailing}`;
    match=core.match(/^الدور\s+(.+)$/);if(match)return `${leading}Floor ${match[1]}${trailing}`;
    match=core.match(/^(.+)\s+جنيه$/);if(match)return `${leading}${match[1]} EGP${trailing}`;
    match=core.match(/^(.+)\s+م²$/);if(match)return `${leading}${match[1]} m²${trailing}`;
    match=core.match(/^الإشعارات:\s*(\d+)$/);if(match)return `${leading}Notifications: ${match[1]}${trailing}`;
    match=core.match(/^تفعيل التنبيهات الآن \((\d+) د\)$/);if(match)return `${leading}Turn reminders back on now (${match[1]} min)${trailing}`;
    match=core.match(/^(\d+) دقيقة\.?$/);if(match)return `${leading}${match[1]} minutes${trailing}`;
    match=core.match(/^تسليم\s+(.+)$/);if(match)return `${leading}Delivery ${match[1]}${trailing}`;
    if(core.startsWith('حان موعد المتابعة:'))return leading+'Follow-up due: '+core.slice('حان موعد المتابعة:'.length).trim()+trailing;
    if(core.startsWith('مرّت ساعة على بدء:'))return leading+'One hour has passed since: '+core.slice('مرّت ساعة على بدء:'.length).trim()+trailing;
    if(core.startsWith('التنبيهات متوقفة مؤقتاً؛')){const remaining=core.slice(core.lastIndexOf('بعد')+3).trim(),duration=remaining.match(/^(\d+) دقيقة/);return leading+'Reminders are snoozed. They will resume automatically after '+(duration?`${duration[1]} minutes`:remaining)+trailing}
    for(const [source,target] of Object.entries(translations)){if(source.endsWith(':')&&core.startsWith(source))return leading+target+core.slice(source.length)+trailing}
    return value;
  }
  window.appTranslate=value=>language==='en'?translate(String(value??'')):String(value??'');
  function applyText(node){
    if(!node.nodeValue?.trim())return;
    if(node.parentElement?.closest('#detailTitle,.detail-field dd,.entity-card:not(.quick-action-card) h3,.entity-card:not(.quick-action-card) p,.note-body,.list-item strong,.list-item small,.workspace-row strong'))return;
    if(!originals.has(node))originals.set(node,{source:node.nodeValue,rendered:node.nodeValue});
    const state=originals.get(node);if(node.nodeValue!==state.rendered)state.source=node.nodeValue;
    const source=state.source,next=language==='en'?translate(source):source;state.rendered=next;
    if(node.nodeValue!==next)node.nodeValue=next;
  }
  function applyAttributes(element){
    if(['themeToggle','sidebarToggle','languageToggle'].includes(element.id))return;
    for(const name of ['placeholder','title','aria-label']){
      if(!element.hasAttribute(name))continue;
      let values=attributeOriginals.get(element);if(!values){values={};attributeOriginals.set(element,values)}
      const current=element.getAttribute(name);
      if(!(name in values))values[name]={source:current,rendered:current};
      const state=values[name];if(current!==state.rendered)state.source=current;
      const source=state.source,next=language==='en'?translate(source):source;state.rendered=next;
      if(current!==next)element.setAttribute(name,next);
    }
  }
  function walk(root){
    if(root.nodeType===Node.TEXT_NODE){applyText(root);return}
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
    if(root.nodeType===Node.ELEMENT_NODE)applyAttributes(root);
    const elements=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT);let element;while((element=elements.nextNode()))applyAttributes(element);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))applyText(node);
  }
  function setLanguage(next){
    language=next==='en'?'en':'ar';document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';document.title=language==='en'?'Smart Real Estate Notebook':'دفتر العقارات الذكي';
    try{localStorage.setItem('aqarLanguage',language)}catch{}
    const button=document.getElementById('languageToggle');if(button){button.textContent=language==='ar'?'EN':'العربية';button.setAttribute('aria-label',language==='ar'?'Switch to English':'Switch to Arabic');button.title=button.getAttribute('aria-label')}
    walk(document.body);
    window.dispatchEvent(new CustomEvent('app-language-change',{detail:{language}}));
  }
  try{language=localStorage.getItem('aqarLanguage')==='ar'?'ar':'en'}catch{language='en'}
  document.documentElement.lang=language;document.documentElement.dir=language==='en'?'ltr':'rtl';
  document.addEventListener('DOMContentLoaded',()=>{
    setLanguage(language);
    document.getElementById('languageToggle')?.addEventListener('click',()=>setLanguage(language==='ar'?'en':'ar'));
    const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')applyText(record.target);else if(record.type==='attributes')applyAttributes(record.target);else record.addedNodes.forEach(node=>walk(node))}});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
    walk(document.body);
  });
})();
