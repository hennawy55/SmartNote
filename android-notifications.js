// Native Android notification permission and local notification bridge.
// Existing browser notification flow remains available for the web/PWA build.
(async () => {
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!isNative) return;

  const LocalNotifications = window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
  if (!LocalNotifications) {
    console.warn('Capacitor LocalNotifications plugin is unavailable.');
    return;
  }

  window.smartNoteNativeNotifications = {
    async requestPermission() {
      try {
        let status = await LocalNotifications.checkPermissions();
        if (status.display !== 'granted') status = await LocalNotifications.requestPermissions();
        return status.display === 'granted';
      } catch (error) {
        console.error('Notification permission error:', error);
        return false;
      }
    },
    async show(id, title, body, extra = {}) {
      const allowed = await this.requestPermission();
      if (!allowed) return false;
      await LocalNotifications.schedule({
        notifications: [{
          id: Number(id) || Math.floor(Date.now() % 2147483647),
          title: String(title || 'SmartNote'),
          body: String(body || ''),
          schedule: { at: new Date(Date.now() + 1000) },
          extra
        }]
      });
      return true;
    }
  };
})();
