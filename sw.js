// Service Worker do PCM — cacheia só o "casco" do app (HTML/CSS/JS estático)
// para abrir rápido e funcionar offline na parte visual. NUNCA cacheia
// chamadas ao Supabase (dados sempre precisam vir da rede, na hora).

const CACHE_NAME = 'pcm-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só cuida de requisições GET dentro do mesmo domínio do app.
  // Tudo que for para o Supabase (ou qualquer outro domínio) passa direto
  // pela rede, sem cache — dados de OS, equipamentos etc. têm que ser
  // sempre atuais.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

// ══ NOTIFICAÇÕES PUSH ══
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'PCM', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'PCM — Controle de Manutenção';
  const options = {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: data.tag || 'pcm-notif',
    data: { osId: data.osId || null, url: data.url || './index.html' },
    requireInteraction: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.focus();
          if (event.notification.data && event.notification.data.osId && 'postMessage' in client) {
            client.postMessage({ type: 'ABRIR_OS', osId: event.notification.data.osId });
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
