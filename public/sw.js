// Replaced with a new value on every release (vite.config.ts), so each release is a new worker.
const CACHE_VERSION = "ember-v5";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

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

// Activate: clean up old caches, take over open pages, and if this is a new release (an older
// version's caches were here), get every open copy of the app onto it. A copy in the
// background is reloaded straight away; the one on screen is told, and reloads itself as soon
// as you're not typing. (Copies still running code from before this existed don't listen for
// that message, so they're reloaded too: a moment's flash beats being stuck on an old design.)
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((key) => !key.includes(CACHE_VERSION));
    await Promise.all(old.map((key) => caches.delete(key)));
    await self.clients.claim();
    if (old.length === 0) return; // first install: nothing to update
    const windows = await self.clients.matchAll({ type: "window" });
    for (const client of windows) {
      // Old pages never answer; new ones say "ok" and reload themselves when it's safe.
      const listens = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 1500);
        pendingAcks.set(client.id, () => { clearTimeout(timer); resolve(true); });
        client.postMessage({ type: "ember:new-version" });
      });
      pendingAcks.delete(client.id);
      if (!listens && "navigate" in client) client.navigate(client.url).catch(() => {});
    }
  })());
});

const pendingAcks = new Map();
self.addEventListener("message", (event) => {
  if (event.data?.type === "ember:new-version-ok" && event.source) pendingAcks.get(event.source.id)?.();
});

// Image optimization: add format/quality/resize params to Supabase storage URLs
function optimizeImageRequest(request) {
  const url = new URL(request.url);
  if (url.hostname.includes("supabase") && url.pathname.includes("/storage/") && !url.pathname.endsWith(".svg")) {
    // Request WebP with quality optimization and width limit for thumbnails
    if (!url.searchParams.has("format")) {
      url.searchParams.set("format", "webp");
    }
    if (!url.searchParams.has("quality")) {
      url.searchParams.set("quality", "75");
    }
    // Limit oversized images to 1200px width (feed images)
    if (!url.searchParams.has("width") && !url.searchParams.has("w")) {
      url.searchParams.set("width", "1200");
    }
    return new Request(url.toString(), {
      headers: request.headers,
      mode: "cors",
      credentials: "omit",
    });
  }
  return request;
}

// Cache size management - evict oldest entries when cache grows too large
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await Promise.all(keys.slice(0, keys.length - maxItems).map((key) => cache.delete(key)));
  }
}

// Fetch strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  // Supabase storage files: optimize + cache-first
  if (url.hostname.includes("supabase") && url.pathname.includes("/storage/")) {
    event.respondWith(
      (async () => {
        const optimized = optimizeImageRequest(request);
        const res = await cacheFirst(optimized, IMAGE_CACHE, 7 * 24 * 60 * 60);
        trimCache(IMAGE_CACHE, 200); // Keep cache bounded
        return res;
      })()
    );
    return;
  }

  // The app's own icons and logo: show the cached one, and fetch the latest for next time
  // (so a new logo appears without reinstalling).
  if (url.origin === self.location.origin && url.pathname.match(/\.(png|svg|ico)$/i)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Images: Cache-first with long TTL
  if (request.destination === "image" || url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // API calls: Network-only
  if (url.hostname.includes("supabase") || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // JS/CSS bundles: Stale-while-revalidate
  if (request.destination === "script" || request.destination === "style" || url.pathname.match(/\.(js|css)$/i)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // HTML: Network-first with offline fallback
  if (request.destination === "document" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Fonts: Cache-first 30 days
  if (request.destination === "font" || url.pathname.match(/\.(woff2?|ttf|otf)$/i)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, 30 * 24 * 60 * 60));
    return;
  }
});

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

// Push notifications (sent by the send-push function): show them even with the app closed
// or the phone locked. If Ember is open on screen, the app shows its own badge instead.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Ember";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-maskable-192.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const onScreen = clients.some((c) => c.visibilityState === "visible" && c.focused);
      if (onScreen) return undefined;
      return self.registration.showNotification(title, options);
    })
  );
});

// Tapping a notification opens Ember at the right chat or post (reusing an open window).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        return existing.focus().then((c) => (c && "navigate" in c ? c.navigate(target) : undefined));
      }
      return self.clients.openWindow(target);
    })
  );
});
