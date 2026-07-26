// @ts-nocheck —— SW 全局(self/skipWaiting)不在 DOM lib 里，本文件跳过类型检查
/* 小丑牌 · JOKER — Service Worker
   网络优先 + 弱网 3 秒回退缓存：在线拿最新版，弱网/离线秒开。 */
const CACHE = "joker-1.4.1";
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
  // 网络优先；弱网 3 秒未响应先回缓存秒开（网络照常在后台完成并刷新缓存供下次用）
  let cacheWrite = Promise.resolve();
  const network = fetch(e.request).then(res => {
    if (res.ok) {   // 404/500 等失败响应不写缓存，避免污染离线兜底
      const copy = res.clone();
      cacheWrite = caches.open(CACHE).then(c => c.put(key, copy)).catch(() => {});
    }
    return res;
  }).catch(() => null);
  // 缓存写入纳入事件生命周期：弱网回退兑现响应后，SW 不会在后台写缓存完成前被终止
  e.waitUntil(network.then(() => cacheWrite).catch(() => {}));
  e.respondWith((async () => {
    const first = await Promise.race([network, new Promise(r => setTimeout(() => r("slow"), 3000))]);
    if (first && first !== "slow") return first;
    const hit = await caches.match(key);
    if (hit) return hit;
    const late = await network;   // 无缓存可用：等网络的最终结果
    return late || Response.error();
  })());
});
