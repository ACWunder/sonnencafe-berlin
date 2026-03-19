// public/sw.js — Sonnencafe Berlin Service Worker
// Cache-first strategy for static data files so repeat visits are instant.

const CACHE = "sonnencafe-v1";

// Static assets to pre-cache on install
const PRECACHE = [
  "/cafes-cache.json",
  "/buildings-mitte.json",
  "/buildings-kreuzberg.json",
  "/buildings-prenzlauer-berg.json",
  "/buildings-schoeneberg.json",
  "/green-areas-cache.json",
  "/sun-emoji.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Remove old cache versions
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache-first for our static JSON/asset files
  const isCacheable = PRECACHE.some((p) => url.pathname === p);
  if (isCacheable) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached ?? fetch(event.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Network-first for everything else (API, map tiles, app shell)
  // — just let them pass through normally
});
