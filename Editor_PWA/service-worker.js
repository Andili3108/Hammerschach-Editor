const CACHE_NAME = "hammerschach-editor-pwa-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./Hammerschach-Editor-PWA.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.error("Cache addAll failed:", err);
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith("hammerschach-editor-pwa-"))
          .map((key) => caches.delete(key))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).catch(() => {
        // Optional: could add fallback here later (e.g. offline page)
        return caches.match("./Hammerschach-Editor-PWA.html");
      });
    })
  );
});
