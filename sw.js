// 离线缓存。改了前端文件之后把 VERSION 加一，手机重新打开就会换新的。

const VERSION = 'v1.9.0';
const CACHE = 'yiri-' + VERSION;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/dates.js',
  './js/db.js',
  './js/entries.js',
  './js/assets.js',
  './js/zip.js',
  './js/background.js',
  './js/notes.js',
  './js/settings.js',
  './js/storage.js',
  './js/moods.js',
  './js/toast.js',
  './js/markdown.js',
  './js/ai.js',
  './js/backup.js',
  './js/icons.js',
  './js/ui-today.js',
  './js/ui-calendar.js',
  './js/ui-ondays.js',
  './js/ui-search.js',
  './js/ui-review.js',
  './js/ui-settings.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[sw] 预缓存失败', err);
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只接管自己的文件，AI 接口之类的别碰
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches
        .match('./index.html')
        .then((hit) => hit || fetch(req))
        .catch(() => fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
