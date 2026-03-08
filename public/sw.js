const CACHE_VERSION = "cloudbook-v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// Static assets to precache
const PRECACHE_ASSETS = [
  "/",
  "/favicon.png",
  "/logo.png",
  "/placeholder.svg",
];

// Install: precache critical static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.includes(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls (except Supabase storage)
  if (request.method !== "GET") return;

  // Images: Cache-first with long TTL
  if (
    request.destination === "image" ||
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)
  ) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // Supabase storage files: Cache-first
  if (url.hostname.includes("supabase") && url.pathname.includes("/storage/")) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 24 * 60 * 60));
    return;
  }

  // API calls (Supabase REST/auth): Network-only
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/rest/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return; // Let the browser handle normally
  }

  // JS/CSS bundles: Stale-while-revalidate
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    url.pathname.match(/\.(js|css)$/i)
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // HTML navigation: Network-first with offline fallback
  if (request.destination === "document" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Fonts: Cache-first
  if (request.destination === "font" || url.pathname.match(/\.(woff2?|ttf|otf)$/i)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 30 * 24 * 60 * 60));
    return;
  }
});

// Cache-first: return cached or fetch & cache
async function cacheFirst(request, cacheName, maxAgeSec = 86400) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 408 });
  }
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || caches.match("/");
  }
}

// Stale-while-revalidate: return cached immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}
