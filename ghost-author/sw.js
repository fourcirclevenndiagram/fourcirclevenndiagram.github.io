/* GHOST AUTHOR — offline shell.
   The page is a single self-contained document, so caching that one document
   is enough. Its filename is NOT hardcoded here: the page posts its own URL
   on load, and every successful GET is cached as it goes. Rename the HTML
   file freely — this worker keeps working. */
const CACHE = "ghost-author-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* the page tells us where it actually lives */
self.addEventListener("message", (e) => {
  const data = e.data;
  if (!data || data.type !== "PRECACHE" || !Array.isArray(data.urls)) return;
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(data.urls)).catch(() => {})
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // network first, fall back to cache — updates stay fast, offline still works
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => {
          if (hit) return hit;
          // offline navigation to a URL we never saw: hand back any cached page
          if (req.mode === "navigate") {
            return caches.open(CACHE)
              .then((c) => c.keys())
              .then((keys) => {
                const doc = keys.find((k) => !/\.(js|css|png|jpg|svg|webmanifest)$/i.test(new URL(k.url).pathname));
                return doc ? caches.match(doc) : undefined;
              });
          }
          return undefined;
        })
      )
  );
});
