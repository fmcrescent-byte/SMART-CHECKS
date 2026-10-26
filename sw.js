// Smart Check service worker: instant repeat loads for static files. API calls (Apps Script) are never cached.
const V = 'smart-check-v3';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const cacheFirst = /\/(lib|assets)\//.test(u.pathname);
  if (cacheFirst) {
    e.respondWith(caches.open(V).then(c => c.match(r).then(hit => hit || fetch(r).then(n => { if (n.ok) c.put(r, n.clone()); return n; }))));
  } else {
    e.respondWith(fetch(r).then(n => { if (n.ok) { const cp = n.clone(); caches.open(V).then(c => c.put(r, cp)); } return n; }).catch(() => caches.match(r)));
  }
});
