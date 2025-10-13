// public/sw.js
// Service Worker for Push Notifications

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// プッシュ通知受信時の処理
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received', event);

  let data = {
    title: 'TSUMU COINS',
    body: '通知が届きました',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: 'tsumu-notification',
    requireInteraction: false,
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (e) {
    console.error('[SW] Failed to parse push data', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    requireInteraction: data.requireInteraction,
    data: {
      url: data.url || '/',
      timestamp: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 通知クリック時の処理
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているタブがあればそれをアクティブにする
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブで開く
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// 通知を閉じた時の処理（オプション）
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed', event);
});
