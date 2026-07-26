/* =========================================================
   小丑牌 · JOKER — 事件绑定 / 键盘 / PWA 注册 / 启动
   依赖前序脚本的全局定义，必须最后加载。
   ========================================================= */
"use strict";

/* ---------- 事件绑定 ---------- */
/* 双击确认的破坏性按钮（重新开局 / 今日挑战） */
function bindConfirmButton(btn, labelKey, action) {
  btn.onclick = () => {
    if (btn.dataset.confirm) {
      delete btn.dataset.confirm;
      btn.textContent = S(labelKey);
      action();
      updateChallengeButtons();   // 恢复今日/每周按钮的 ✓ 标记
    } else {
      btn.dataset.confirm = "1";
      btn.textContent = S("confirm_abandon");
      setTimeout(() => {
        if (!btn.dataset.confirm) return;
        delete btn.dataset.confirm;
        btn.textContent = S(labelKey);
        updateChallengeButtons();
      }, 2500);
    }
  };
}

function startFreshGame(seed, deckId, mode) {
  if (parkCurrentSave()) flashMessage(S("run_parked"));   // 进行中的对局搁置而非删除
  document.querySelectorAll(".overlay").forEach(o => o.classList.add("hidden"));
  newGame(seed, deckId, mode);
  flashMessage(seed === todaySeed() ? S("daily_start", G.seed)
    : seed === weekSeed() ? S("weekly_start", G.seed)
    : S("seed_start", G.seed));
}

/* 起始牌组 + 模式选择（重新开局 / 每日每周挑战 / 自定义种子 / 复盘历史种子时弹出） */
let _pendingMode = "normal";
function showDeckSelect(seed) {
  // 模式开关行
  const mbox = $("mode-options");
  const renderModes = () => {
    mbox.innerHTML = "";
    MODES.forEach(m => {
      const chip = document.createElement("button");
      chip.className = "mode-chip" + (m.id === _pendingMode ? " mode-on" : "");
      chip.innerHTML = `${m.icon} ${L(m.name)}<small>${L(m.desc)}</small>`;
      chip.onclick = () => { _pendingMode = m.id; renderModes(); };
      mbox.appendChild(chip);
    });
  };
  renderModes();
  const box = $("deck-options");
  box.innerHTML = "";
  DECKS.forEach(d => {
    const wrap = document.createElement("div");
    wrap.className = "shop-item";
    const cardEl = makeShopMiniCard("deck-card", d.icon, L(d.name), L(d.desc));
    const btn = document.createElement("button");
    btn.className = "btn btn-blue buy-btn";
    btn.textContent = S("choose_btn");
    btn.onclick = () => {
      $("deck-select").classList.add("hidden");
      startFreshGame(seed, d.id, _pendingMode);
    };
    wrap.append(cardEl, btn);
    box.appendChild(wrap);
  });
  $("deck-select").classList.remove("hidden");
}

$("play-btn").onclick = playHand;
$("discard-btn").onclick = discard;
$("sort-rank").onclick = () => { sortHand("rank"); render(); };
$("sort-suit").onclick = () => { sortHand("suit"); render(); };
$("run-info-btn").onclick = showRunInfo;
$("collection-btn").onclick = showCollection;
$("help-btn").onclick = () => showHelp(0);
$("close-help-btn").onclick = () => $("help").classList.add("hidden");
$("help-prev-btn").onclick = () => showHelp(_helpPage - 1);
$("help-next-btn").onclick = () => showHelp(_helpPage + 1);
$("share-btn").onclick = copyShareLink;
$("close-collection-btn").onclick = () => $("collection").classList.add("hidden");
/* 存档导出/导入：跨设备迁移进度（存档+统计+偏好打包 base64） */
$("export-btn").onclick = async () => {
  const data = {
    save: localStorage.getItem(SAVE_KEY),
    stats: localStorage.getItem(STATS_KEY),
    lang: LANG,
    muted: localStorage.getItem("joker_muted"),
    errors: localStorage.getItem("joker_errors_v1"),   // 诊断信息随码导出（导入端忽略）
  };
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  try {
    await navigator.clipboard.writeText(code);
    flashMessage(S("export_copied"));
  } catch (e) {
    window.prompt?.(S("export_manual"), code);
  }
};
$("import-btn").onclick = () => {
  const v = typeof window.prompt === "function" ? window.prompt(S("import_prompt"), "") : null;
  if (!v || !v.trim()) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(v.trim()))));
    if (!data || (typeof data.save !== "string" && typeof data.stats !== "string")) throw new Error("bad");
    if (data.save) localStorage.setItem(SAVE_KEY, data.save);
    if (data.stats) localStorage.setItem(STATS_KEY, data.stats);
    if (data.lang) localStorage.setItem("joker_lang", data.lang);
    if (data.muted != null) localStorage.setItem("joker_muted", data.muted);
    if (typeof location !== "undefined" && location.reload) location.reload();
  } catch (e) {
    flashMessage(S("import_bad"));
  }
};
bindConfirmButton($("new-run-btn"), "new_run_btn", () => showDeckSelect());
bindConfirmButton($("daily-btn"), "daily_btn", () => showDeckSelect(todaySeed()));
bindConfirmButton($("weekly-btn"), "weekly_btn", () => showDeckSelect(weekSeed()));
$("seed-line").onclick = () => {
  const v = typeof window.prompt === "function"
    ? window.prompt(S("seed_prompt"), "") : null;
  if (!v || !v.trim()) return;
  const t = v.trim();
  showDeckSelect(/^\d+$/.test(t) ? parseInt(t, 10) : hashStr(t));
};
$("deck-cancel-btn").onclick = () => $("deck-select").classList.add("hidden");
/* BGM 独立开关（M 键静音仍是总开关） */
const musicBtnText = () => S(AudioFX.musicEnabled() ? "music_btn_on" : "music_btn_off");
$("music-btn").textContent = musicBtnText();
$("music-btn").onclick = () => {
  AudioFX.toggleMusic();
  AudioFX.startMusic();
  $("music-btn").textContent = musicBtnText();
};

$("lang-btn").textContent = LANG === "zh" ? "English" : "中文";
$("lang-btn").onclick = () => {
  try { localStorage.setItem("joker_lang", LANG === "zh" ? "en" : "zh"); } catch (e) { /* 忽略 */ }
  saveGame();
  if (typeof location !== "undefined" && location.reload) location.reload();
};
$("close-info-btn").onclick = () => $("run-info").classList.add("hidden");
$("deck-info").onclick = showDeckView;
$("close-deck-btn").onclick = () => $("deck-view").classList.add("hidden");
$("pack-skip-btn").onclick = () => {
  skipPack();
  $("pack-open").classList.add("hidden");
  saveGame();
};
$("reroll-btn").onclick = () => {
  if (!doReroll()) return;
  AudioFX.discard();
  renderShop(); render();
};
$("next-round-btn").onclick = () => {
  $("shop").classList.add("hidden");
  showBlindSelect();
};
$("restart-btn").onclick = () => {
  $("end-screen").classList.add("hidden");
  showDeckSelect();
};
$("restore-parked-btn").onclick = () => {
  $("end-screen").classList.add("hidden");
  if (!restoreParkedSave()) newGame();
};
$("endless-btn").onclick = () => {
  G.endless = true;
  $("end-screen").classList.add("hidden");
  G.blindIndex = 0;
  pickBoss();
  openShop();
  saveGame();
  flashMessage(S("endless_start"));
};

/* 手牌点击：容器级事件委托 */
$("hand").onclick = e => {
  const el = e.target?.closest?.(".card");
  if (!el) return;
  const card = G.hand.find(c => c.id === el.dataset.cid);
  if (card) toggleSelect(card);
};
/* 键盘无障碍：焦点在卡牌上时 Enter/空格 = 切换选中（stopPropagation 避免触发全局 Enter 出牌） */
$("hand").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const el = e.target?.closest?.(".card");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  const card = G.hand.find(c => c.id === el.dataset.cid);
  if (card) toggleSelect(card);
});

/* 3D 倾斜：全局委托 */
$("game").addEventListener("pointermove", handleTiltMove);

/* 窗口尺寸变化（含手机转屏）→ 重排手牌间距 */
let _resizeTimer = null;
window.addEventListener?.("resize", () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(renderHand, 150);
});

/* 点击按钮后立即失焦：避免随后的 Enter/空格 重复触发按钮而不是快捷键 */
document.addEventListener("click", e => {
  const btn = /** @type {any} */ (e.target)?.closest?.("button");
  if (btn) btn.blur?.();
});

/* 计分中点击任意处 → 4 倍速快进；触屏点空白处收起 tooltip；首次交互启动 BGM */
document.addEventListener("pointerdown", e => {
  AudioFX.startMusic();
  if (G.scoring && G.speed === 1) {
    G.speed = 4;
    flashMessage(S("accelerate"));
  }
  if (NO_HOVER && !/** @type {any} */ (e.target)?.closest?.(".joker, .consumable")) hideTooltip();
});

/* 键盘操作：
   回合中   1-9 选牌 / Enter 出牌 / X 弃牌 / R/S 排序 / Esc 取消选择
   盲注选择 Enter 选择 / X 跳过
   商店     1-9 购买 / R 刷新 / Enter 下一回合
   卡包     1-3 选取 / X 或 Esc 放弃
   任意     M 静音 / Esc 关闭弹层 */
document.addEventListener("keydown", e => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "m") {
    const muted = AudioFX.toggleMute();
    flashMessage(muted ? S("muted") : S("unmuted"));
    return;
  }
  // 信息类弹层用 Esc 关闭
  if (e.key === "Escape") {
    ["run-info", "deck-view", "collection", "deck-select", "help"].forEach(id => $(id).classList.add("hidden"));
    if (G.pendingPack) { skipPack(); $("pack-open").classList.add("hidden"); saveGame(); }
    else if (G.state === "playing" && !G.scoring && G.selected.size) { G.selected.clear(); render(); }
    return;
  }
  // 卡包 3 选 1
  if (G.pendingPack) {
    if (/^[1-3]$/.test(k)) pickPack(+k - 1);
    else if (k === "x") { skipPack(); $("pack-open").classList.add("hidden"); saveGame(); }
    return;
  }
  if (G.state === "blind-select") {
    if (e.key === "Enter") $("blind-options").querySelector?.("button[data-i]")?.click?.();
    else if (k === "x") $("blind-options").querySelector?.("button[data-skip]")?.click?.();
    return;
  }
  if (G.state === "shop") {
    if (/^[1-9]$/.test(k)) {
      const btns = /** @type {any} */ (document.querySelectorAll("#shop-items .buy-btn"));
      const b = btns[+k - 1];
      if (b && !b.disabled) b.click?.();
    } else if (k === "r" && !$("reroll-btn").disabled) $("reroll-btn").onclick();
    else if (e.key === "Enter") $("next-round-btn").onclick();
    return;
  }
  if (G.state !== "playing" || G.scoring) return;
  if (/^[1-9]$/.test(k)) {
    const c = G.hand[+k - 1];
    if (c) toggleSelect(c);
  } else if (e.key === "Enter") {
    if (!$("play-btn").disabled) playHand();
  } else if (k === "x") {
    if (!$("discard-btn").disabled) discard();
  } else if (k === "r") { sortHand("rank"); render(); }
  else if (k === "s") { sortHand("suit"); render(); }
});

/* ---------- 持久化与错误留痕 ---------- */
/* 申请持久存储：降低浏览器"7 天不活跃清理站点数据"抹掉存档的风险（安装为 PWA 后更稳） */
if (typeof navigator !== "undefined") navigator.storage?.persist?.().catch?.(() => {});
/* 最近 5 条 JS 错误记入 localStorage，随「导出进度」附带——玩家反馈问题时自带现场 */
const ERR_KEY = "joker_errors_v1";
window.addEventListener?.("error", e => {
  try {
    const list = JSON.parse(localStorage.getItem(ERR_KEY)) || [];
    list.unshift({ d: new Date().toISOString().slice(0, 19), v: GAME_VERSION, m: String(e.message || "?").slice(0, 200) });
    localStorage.setItem(ERR_KEY, JSON.stringify(list.slice(0, 5)));
  } catch (err) { /* 忽略 */ }
});

/* ---------- PWA ----------
   网络优先策略下刷新即得新版；对常驻不刷新的已安装 PWA，
   检测到新 Service Worker 就绪时弹出可点击的更新提示。 */
if (typeof navigator !== "undefined" && "serviceWorker" in navigator &&
    typeof location !== "undefined" && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener?.("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener?.("statechange", () => {
        if (nw.state === "installed" && navigator.serviceWorker.controller) {
          const el = flashMessage(S("update_ready"), "update-toast", 12000);
          el.onclick = () => location.reload();
        }
      });
    });
  }).catch(() => { /* 离线支持是增强项 */ });
}

/* ---------- 启动 ----------
   支持 ?seed=xxx&deck=yyy&mode=zzz 深链：与存档种子不同时开新局复现 */
applyStaticText();
updateChallengeButtons();
(function boot() {
  let urlSeed = null, urlDeck = "classic", urlMode = "normal";
  try {
    if (typeof location !== "undefined" && location.search) {
      const params = new URLSearchParams(location.search);
      const s = params.get("seed");
      if (s) urlSeed = /^\d+$/.test(s) ? (parseInt(s, 10) >>> 0) : hashStr(s);
      // manifest shortcuts 深链：?daily=1 / ?weekly=1 直达当期挑战
      if (params.get("daily") != null) urlSeed = todaySeed();
      else if (params.get("weekly") != null) urlSeed = weekSeed();
      urlDeck = params.get("deck") || "classic";
      urlMode = params.get("mode") || "normal";
    }
  } catch (e) { /* 忽略 */ }
  const restored = loadGame();
  if (urlSeed !== null && (!restored || G.seed !== urlSeed)) {
    startFreshGame(urlSeed, urlDeck, urlMode);
  } else if (!restored) {
    newGame();
  }
})();
