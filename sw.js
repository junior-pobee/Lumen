const CACHE_NAME = "lumen-shell-v4";
const APP_PAGE = "./index.html";

const APP_FILES = [
  APP_PAGE,
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    const results = await Promise.allSettled(
      APP_FILES.map(async path => {
        const response = await fetch(path, { cache: "reload" });
        if (!response.ok) {
          throw new Error(`Failed to cache ${path}: ${response.status}`);
        }
        await cache.put(path, response);
      })
    );

    // The main page is the only file the app cannot work without.
    if (results[0].status === "rejected") {
      throw new Error("Lumen's main page could not be cached.");
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("lumen-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: network first, and each page is cached under its OWN address.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      } catch (error) {
        // Offline: this exact page if we have it, otherwise the Lumen app page.
        const samePage = await caches.match(request, { ignoreSearch: true });
        if (samePage) return samePage;

        const appPage = await caches.match(APP_PAGE);
        if (appPage) return appPage;

        return new Response("Lumen is offline. Please reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // Everything else (icons, manifest, scripts): cache first, then network.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(CACHE_NAME)
        .then(cache => cache.put(request, copy))
        .catch(() => {});
    }
    return response;
  })());
});
