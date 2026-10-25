const CACHE_NAME = "lumen-shell-v3";

const APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
    .then(async cache => {
      const results = await Promise.allSettled(
        APP_FILES.map(async path => {
          const response = await fetch(path, { cache: "reload" });
          if (!response.ok) {
            throw new Error("Failed to cache ${path}: ${response.status}");
          }
          await cache.put(path, response);
        })
      );
      
      const failures = results
        .map((result, index) => ({ result, path: APP_FILES[index] }))
        .filter(item => item.result.status === "rejected");
      
      if (failures.some(item => item.path === "./index.html")) {
        throw new Error("Lumen's main HTML file could not be cached.");
      }
      
      await self.skipWaiting();
    })
    
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
    .then(keys =>
      Promise.all(
        keys
        .filter(key => key.startsWith("lumen-shell-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
      )
    )
    .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  
  if (request.method !== "GET") return;
  
  const url = new URL(request.url);
  
  if (url.origin !== self.location.origin) return;
  
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put("./index.html", copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cachedPage = await caches.match("./index.html");
        if (cachedPage) return cachedPage;
        return new Response("Lumen is offline. Please reconnect and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
    );
    return;
  }
  
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      
      return fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      });
    })
    
  );
});