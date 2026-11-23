import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar, Style } from '@capacitor/status-bar';

const isNative = Capacitor.isNativePlatform();
let channelReady = false;
let lastScheduleSignature = '';

function stableId(value) {
  let hash = 2166136261;
  for (let i = 0; i < String(value).length; i++) {
    hash ^= String(value).charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2147483646 + 1;
}

function parseLocalDate(date, time = '09:00') {
  if (!date) return null;
  const [year, month, day] = String(date).split('-').map(Number);
  const [hour, minute] = String(time || '09:00').split(':').map(Number);
  const value = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

async function ensureChannel() {
  if (!isNative || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: 'smartnote-reminders',
      name: 'تذكيرات SmartNote',
      description: 'تنبيهات مواعيد المتابعات',
      importance: 5,
      visibility: 1,
      sound: 'default'
    });
  } catch (error) {
    // Android versions below API 26 do not require notification channels.
    console.debug('Notification channel setup:', error);
  }
  channelReady = true;
}

async function hasPermission(request = false) {
  if (!isNative) return false;
  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'granted') return true;
  if (!request) return false;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
}

if (isNative) {
  // Keep Android status/navigation bars visible and reserve their layout space.
  StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
  StatusBar.setBackgroundColor({ color: '#762236' }).catch(() => {});
  StatusBar.setStyle({ style: Style.Light }).catch(() => {});
  StatusBar.show().catch(() => {});

  window.smartNoteNativeNotifications = {
    isNative: true,

    async requestPermission() {
      const granted = await hasPermission(true);
      if (granted) await ensureChannel();
      return granted;
    },

    async syncTaskReminders(tasks = []) {
      if (!(await hasPermission(false))) return;
      await ensureChannel();

      const now = Date.now();
      const desired = [];
      for (const task of tasks) {
        if (!task || task.status === 'مكتملة') continue;

        if (task.dueDate) {
          const dueAt = parseLocalDate(task.dueDate, task.dueTime || '09:00');
          if (dueAt && dueAt.getTime() > now + 5000 && task.status !== 'قيد التنفيذ') {
            desired.push({
              id: stableId(task.id + ':due'),
              title: 'موعد متابعة مستحق',
              body: 'حان موعد المتابعة: ' + (task.title || 'متابعة جديدة'),
              schedule: { at: dueAt },
              channelId: 'smartnote-reminders',
              extra: { smartNoteReminder: true, taskId: task.id, kind: 'due' }
            });
          }
        }

        if (task.status === 'قيد التنفيذ' && task.startedAt) {
          const startedAt = new Date(task.startedAt);
          const reminderAt = new Date(startedAt.getTime() + 60 * 60 * 1000);
          if (!Number.isNaN(reminderAt.getTime()) && reminderAt.getTime() > now + 5000) {
            desired.push({
              id: stableId(task.id + ':in_progress'),
              title: 'تذكير بمتابعة قيد التنفيذ',
              body: 'مرّت ساعة على بدء: ' + (task.title || 'متابعة'),
              schedule: { at: reminderAt },
              channelId: 'smartnote-reminders',
              smallIcon: 'ic_launcher',
              extra: { smartNoteReminder: true, taskId: task.id, kind: 'in_progress' }
            });
          }
        }
      }

      desired.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
      const bounded = desired.slice(0, 100);
      const signature = JSON.stringify(bounded.map(item => [item.id, item.schedule.at.getTime(), item.title, item.body]));
      if (signature === lastScheduleSignature) return;

      const pending = await LocalNotifications.getPending();
      const previous = (pending.notifications || []).filter(item => item.extra?.smartNoteReminder);
      if (previous.length) {
        await LocalNotifications.cancel({ notifications: previous.map(item => ({ id: item.id })) });
      }
      if (bounded.length) {
        await LocalNotifications.schedule({ notifications: bounded });
      }
      lastScheduleSignature = signature;
    },

    async cancel(id) {
      if (!isNative) return;
      const pending = await LocalNotifications.getPending();
      if ((pending.notifications || []).some(item => item.id === id)) {
        await LocalNotifications.cancel({ notifications: [{ id }] });
      }
    }
  };

  LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const taskId = event.notification?.extra?.taskId;
    if (typeof taskId === 'string') {
      window.dispatchEvent(new CustomEvent('smartnote-open-task', { detail: { taskId } }));
    }
  });
}
