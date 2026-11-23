const CACHE = 'sren-shell-online-v21';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './theme.js', './language.js', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// Cache only the app shell for installability. All database traffic stays online-only.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match('./index.html');
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  if (!taskId) return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      client.postMessage({ type: 'OPEN_TASK_NOTIFICATION', taskId });
      if ('focus' in client) return client.focus();
    }
    return self.clients.openWindow(`./?openTask=${encodeURIComponent(taskId)}`);
  })());
});
