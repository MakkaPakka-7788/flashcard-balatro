/* 小丑牌 · JOKER — Service Worker
   网络优先、缓存兜底：在线时始终拿最新版本，离线时用缓存照常游玩。 */
const CACHE = "joker-1.3.0";
const ASSETS = [
  "./", "./index.html", "./style.css",
  "./i18n.js", "./defs.js", "./engine.js", "./audio.js", "./ui.js", "./main.js",
  "./manifest.json", "./icon.svg", "./apple-touch-icon.png", "./icon-maskable.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // 导航请求（含 ?seed=… 分享深链）统一按壳页面 "./" 缓存与匹配：离线也能打开分享链接，
  // 且不会为每个不同 query 的 URL 落一份冗余缓存
  const key = e.request.mode === "navigate" ? "./" : e.request;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {   // 404/500 等失败响应不写缓存，避免污染离线兜底
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(key, copy));
      }
      return res;
    }).catch(() => caches.match(key))
  );
});
