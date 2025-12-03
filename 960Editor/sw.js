const CACHE_NAME = "schach960-cache-v1";
const FILES_TO_CACHE = [
  "./",
  "Hammerschach_960_Editor_V5.html",
  "Logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached ||
      fetch(event.request).catch(() => caches.match("Hammerschach_960_Editor_V5.html"))
    )
  );
});
