// sw.js — 硬缓存外壳：断网也能打开 PWA（API 不缓存）
const CACHE = "serdio-v18";
const SHELL = ["/", "/index.html", "/style.css", "/app.js", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API/WS/音频直连，不缓存
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/tts/") ||
      url.pathname.startsWith("/mock-audio/") || e.request.headers.get("upgrade") === "websocket") return;
  // 外壳命中缓存优先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (e.request.method === "GET" && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
