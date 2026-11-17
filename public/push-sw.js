// Aviso de fim de descanso (Web Push), importado pelo service worker gerado pelo Workbox.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { corpo: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.titulo || "Hora da próxima série", {
    body: d.corpo || "",
    tag: d.tag || "descanso",
    renotify: true,
    icon: "icon-192.png",
    badge: "icon-192.png",
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    if (cs.length) return cs[0].focus();
    return self.clients.openWindow(self.registration.scope);
  }));
});
