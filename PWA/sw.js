const cacheName = "knoledge-search-shell-v0.1.7-search-fix";
const shellFiles = [
  "./",
  "index.html",
  "about.html",
  "styles.css",
  "app.js",
  "pwa.js",
  "app.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "Branding/KS Engine c.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(shellFiles.map((file) => new URL(file, self.registration.scope)))),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedPage = await caches.match(event.request);
        return cachedPage || caches.match(new URL("index.html", self.registration.scope));
      }),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          try {
            const cache = await caches.open(cacheName);
            await cache.put(event.request, response.clone());
          } catch (error) {
            console.error("Knoledge Search could not refresh its offline cache:", error);
          }
        }
        return response;
      } catch (error) {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        throw error;
      }
    })(),
  );
});
