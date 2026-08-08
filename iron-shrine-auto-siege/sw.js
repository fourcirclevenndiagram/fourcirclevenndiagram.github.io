const CACHE = "iron-shrine-v2";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./assets/icon.svg", "./assets/icon-192.png", "./assets/icon-512.png",
  "./js/constants.js", "./js/prng.js", "./js/bitmap-font.js",
  "./js/audio.js", "./js/simulation.js", "./js/renderer.js",
  "./js/portrait-art.js", "./js/ui-scenes.js",
  "./js/input.js", "./js/main.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(ASSETS.map(asset => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/@vite/") || url.pathname.includes("/node_modules/")) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
