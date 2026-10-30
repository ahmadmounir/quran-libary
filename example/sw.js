// Service worker of the example: keeps the mushaf on the phone, so pages already read open offline.
//
// - Page files, the index and the fonts never change once published (a new version goes into a new folder), so they
//   are "cache first": after the first visit they come from the phone, with no request at all.
// - The app itself (index.html, style.css, js/…) is "network first": a new version shows as soon as there is a
//   network, and the stored copy is used when there is none.
// - Audio is NOT stored here: the files are big and are played with Range requests. The browser's own cache keeps them
//   (they are sent with "Cache-Control: immutable") and the player downloads the next page in the background.
const FILES = "mushaf-files-v1";
const APP = "mushaf-app-v1";
const IMMUTABLE = /\/(mushaf|fonts)\//; // …/mushaf/pages/page-001.json, …/fonts/pages/p1.woff2, …

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url);

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(FILES);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone()); // opaque or failed answers are never kept
      return response;
    })());
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith(new URL("./", self.registration.scope).pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) ?? Response.error();
      }
    })());
  }
});
