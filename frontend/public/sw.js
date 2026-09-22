/*
 * Sahayam service worker — offline app shell.
 *
 * PRECACHE and VERSION are filled in at build time by the sw-precache plugin in
 * vite.config.ts with every file of the production build, so one online visit
 * caches the whole Citizen Portal (HTML, JS, CSS, icons) at install time.
 *
 * - Page navigations: network first; offline -> cached app shell (SPA routing
 *   then renders /citizen/* as usual); no cached shell -> minimal offline page.
 * - Same-origin static files: served from the shell cache.
 * - Google Fonts: stale-while-revalidate so the offline UI keeps its typography.
 * - API / backend / map tiles / everything else: not intercepted (never cached).
 */
const VERSION = "dev";
const PRECACHE = [] /* __PRECACHE__ */;

const SHELL_CACHE = `sahayam-shell-${VERSION}`;
const FONT_CACHE = "sahayam-fonts-v1";
const SHELL_URL = "/index.html";
const NAV_TIMEOUT_MS = 4000;
// Must match the stylesheet link in index.html
const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#0f172a" />
<title>SAHAYAM — Offline</title>
<style>
  *{box-sizing:border-box;margin:0}
  body{min-height:100vh;display:flex;flex-direction:column;background:#f8fafc;color:#0f172a;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{background:#0f172a;color:#fff;padding:.85rem 1rem;font-weight:800;letter-spacing:.04em}
  main{flex:1;display:flex;align-items:center;justify-content:center;padding:1.5rem 1rem}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:1.75rem 1.5rem;max-width:420px;width:100%;
    text-align:center;box-shadow:0 4px 12px -2px rgba(15,23,42,.06)}
  .dot{width:44px;height:44px;border-radius:50%;background:#fffbeb;border:1px solid #fde68a;color:#d97706;
    display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.3rem;font-weight:800}
  h1{font-size:1.3rem;margin-bottom:.5rem}
  p{color:#475569;font-size:.95rem;line-height:1.5;margin-bottom:1.25rem}
  button{background:#1d4ed8;color:#fff;border:0;border-radius:6px;padding:.7rem 1.4rem;font-size:.95rem;font-weight:600;cursor:pointer}
  small{display:block;color:#64748b;font-size:.8rem;margin-top:1.1rem;line-height:1.45}
</style></head>
<body>
  <header>SAHAYAM</header>
  <main><div class="card">
    <div class="dot">!</div>
    <h1>You're offline</h1>
    <p>Connect to the internet and open Sahayam once to enable offline access.</p>
    <button onclick="location.reload()">Retry Connection</button>
    <small>In an emergency, call 112 (National Emergency Number).</small>
  </div></main>
  <script>addEventListener("online", function () { location.reload(); });</script>
</body></html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Best effort: cache the web fonts so the offline UI looks identical
async function precacheFonts() {
  try {
    const cache = await caches.open(FONT_CACHE);
    const res = await fetch(FONT_CSS, { mode: "cors" });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(
      urls.map((u) => fetch(u, { mode: "cors" }).then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => null))
    );
  } catch {
    /* fonts fall back to system fonts */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => precacheFonts())
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("sahayam-") && k !== SHELL_CACHE && k !== FONT_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// The cached shell is only used when every precached file is present,
// otherwise the page would load without its JS/CSS (blank screen).
async function cachedShell() {
  if (PRECACHE.length === 0) return null;
  const cache = await caches.open(SHELL_CACHE);
  const hits = await Promise.all(PRECACHE.map((url) => cache.match(url, { ignoreVary: true })));
  if (hits.some((r) => !r)) return null;
  return cache.match(SHELL_URL, { ignoreVary: true });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

async function handleNavigate(request) {
  const network = fetch(request);
  network.catch(() => undefined);
  try {
    return await withTimeout(network, NAV_TIMEOUT_MS);
  } catch {
    const shell = await cachedShell();
    if (shell) return shell;
    try {
      return await network; // slow but reachable server
    } catch {
      return offlineResponse();
    }
  }
}

async function fontStaleWhileRevalidate(request) {
  const cache = await caches.open(FONT_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fresh;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api") || url.pathname.startsWith("/webhook")) return;
    if (request.mode === "navigate") {
      event.respondWith(handleNavigate(request));
      return;
    }
    // ignoreVary: servers may send "Vary: Origin" while the page requests its
    // bundle with crossorigin (Origin header) - hashed build files never vary
    event.respondWith(
      caches.match(request, { cacheName: SHELL_CACHE, ignoreVary: true }).then((cached) => cached || fetch(request))
    );
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(fontStaleWhileRevalidate(request));
  }
  // anything else (backend API, map tiles, geocoding) goes straight to the network
});
