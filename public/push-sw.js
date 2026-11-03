/* push-sw.js — handlers de Web Push.
 * Injetado no service worker do Workbox via workbox.importScripts (vite.config.js).
 * Worker clássico: só self.addEventListener, sem import/ESM. */

self.addEventListener('push', function (event) {
  var payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = { title: 'HopeFin', body: event.data ? event.data.text() : '' }
  }
  var title = payload.title || 'HopeFin'
  var options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    lang: 'pt-BR',
    tag: payload.tag || undefined,
    renotify: payload.tag ? true : false,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var alvo = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async function () {
      var janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (var i = 0; i < janelas.length; i++) {
        var c = janelas[i]
        if ('focus' in c) {
          try { if (c.navigate) await c.navigate(alvo) } catch (e) { /* ignora */ }
          return c.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(alvo)
    })()
  )
})
