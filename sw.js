// Deskside service worker: keeps the app opening when the network drops.
// The page itself always tries the network first, so updates show up right away.
const CACHE = 'deskside-v2026.10.19';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Live data and sign-ins always go straight to the network.
  if (url.pathname.includes('/api/')) return;
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('index.html')) {
      e.respondWith(fetch(req).then(r => { if (r.ok && !r.redirected && r.type === 'basic') { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); } return r; })
        .catch(() => caches.match('index.html')));
      return;
    }
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  // Fonts: serve the saved copy, refresh it in the background.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
});
