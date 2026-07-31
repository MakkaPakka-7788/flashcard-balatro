/* =========================================================
   小丑牌 · JOKER — UI（渲染 / 动画 / 流程（音效见 audio.js，事件绑定与启动见 main.js））
   所有面向玩家的文案经 i18n.js 的 L() / S() 取当前语言。
   ========================================================= */
"use strict";

/* ---------- 工具 ---------- */
/** @param {string} id @returns {any} */
const $ = id => document.getElementById(id);
/* HTML 转义：innerHTML 拼接用户可控文本（导入的历史记录等）时必须过一遍 */
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
/* 计分期间点击屏幕可 4 倍速快进（G.speed） */
const sleep = ms => new Promise(r => setTimeout(r, ms / (G.speed || 1)));
/* 大数显示：无尽模式后期分数可达 1e12+ */
const fmt = n => {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1e12) return n.toExponential(2).replace("e+", "e");
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  return n.toLocaleString("en-US");
};

/* 环境能力检测（测试环境无 matchMedia，一律回退 false） */
const REDUCED_MOTION = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;
const NO_HOVER = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(hover: none)").matches : false;

/* ---------- 盲注选择 ---------- */
function showBlindSelect() {
  G.state = "blind-select";
  const box = $("blind-options");
  box.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const m = BLIND_META[i];
    const el = document.createElement("div");
    el.className = "blind-option" + (i < G.blindIndex ? " done" : "");
    const isBoss = i === 2;
    const rush = G.mode === "boss_rush";   // Boss Rush: 每个盲注开打时才随机 Boss，预览为未知
    el.innerHTML = `
      <div class="bo-name ${m.cls}" style="background:${["#006bb8", "#d07f1d", "#7a1fa0"][i]}">${isBoss ? (rush ? "👹 ???" : G.boss.icon + " " + L(G.boss.name)) : L(m.name)}</div>
      <div class="bo-chip">${rush ? "👹" : isBoss ? G.boss.icon : (i === 0 ? "🔵" : "🟠")}</div>
      <div class="bo-target">${rush && isBoss ? "???" : fmt(blindTarget(i))}</div>
      <div class="bo-reward">${S("reward_word")} ${"$".repeat(blindReward(i))}</div>
      <div class="bo-effect">${rush ? S("bossrush_hint") : isBoss ? L(G.boss.desc) : ""}</div>
      ${i < G.blindIndex
        ? `<div class="bo-done-mark">${S("done_mark")}</div>`
        : i === G.blindIndex
          ? `<button class="btn btn-blue small" data-i="${i}">${S("select_btn")}</button>${i < 2 ? `<button class="btn btn-red small" data-skip="${i}" style="margin-top:6px">${S("skip_btn")}</button>` : ""}`
          : `<div class="bo-done-mark" style="color:#5a7a72">${S("upcoming")}</div>`}
    `;
    box.appendChild(el);
  }
  box.querySelectorAll("button[data-i]").forEach((/** @type {any} */ b) =>
    b.onclick = () => startBlind(+b.dataset.i));
  box.querySelectorAll("button[data-skip]").forEach((/** @type {any} */ b) =>
    b.onclick = () => skipBlind());
  $("blind-select").classList.remove("hidden");
  $("shop").classList.add("hidden");
}

/* 跳过盲注 → 随机标签奖励（放弃奖励金/商店，换一个小补偿）
   加倍标签：让下一个获得的标签效果再触发一次 */
function skipBlind() {
  const tag = rnd(SKIP_TAGS);
  let msg = tag.apply(G);
  if (tag.id !== "double_tag" && G.doubleTag > 0) {
    G.doubleTag--;
    msg += " ×2 (" + tag.apply(G) + ")";
  }
  G.blindIndex++;
  AudioFX.discard();
  flashMessage(`${tag.icon} ${L(tag.name)}: ${msg}`);
  saveGame();
  showBlindSelect();
  renderStats();
  return tag;
}

function startBlind(idx) {
  G.blindIndex = idx;
  // Boss Rush: 每个盲注都换一个新 Boss 并生效其减益（目标倍率仍按盲注位置）
  // 小盲/大盲选新 Boss 会覆盖底注开局那次 pickBoss，因此 Boss 盲注也要重新选
  if (G.mode === "boss_rush") pickBoss();
  G.currentBoss = activeBossFor(G);
  G.round++;
  G.roundScore = 0;
  G.target = blindTarget(idx);
  G.maxHands = BALANCE.baseHands + G.bonusHands;
  G.maxDiscards = BALANCE.baseDiscards + G.bonusDiscards;
  let handSize = G.handSize;
  if (G.currentBoss) {
    AudioFX.boss();
    showBossBanner(G.currentBoss);
    tipOnce("boss", "tip_boss");
    if (G.currentBoss.id === "manacle") handSize -= 1;
    if (G.currentBoss.id === "water") G.maxDiscards = 0;
    if (G.currentBoss.id === "needle") G.maxHands = 1;
  } else {
    // Boss 盲注但 currentBoss 为空 = 被奇科禁用
    if ((G.mode === "boss_rush" || idx === 2) && G.boss)
      flashMessage(S("msg_chicot_disable", `${G.boss.icon} ${L(G.boss.name)}`));
    AudioFX.play();
  }
  G.handsLeft = G.maxHands;
  G.discardsLeft = G.maxDiscards;
  G.roundDiscards = 0;
  G.curHandSize = handSize;
  buildDeck();
  G.hand = [];
  G.selected.clear();
  drawToFull(true);
  // Boss: 猩红之心 — 每手随机禁用一张小丑牌
  G.disabledJokerUid = (G.currentBoss?.id === "crimson" && G.jokers.length)
    ? rnd(G.jokers).uid : null;
  G.state = "playing";
  $("blind-select").classList.add("hidden");
  saveGame();
  render();
  checkDeadEnd();   // 牌库被消耗品销毁到发不出可玩手牌时，开局立即结算
}

/* ---------- 选牌 ---------- */
function toggleSelect(card) {
  if (G.scoring || G.state !== "playing") return;
  if (G.selected.has(card.id)) { G.selected.delete(card.id); AudioFX.deselect(); }
  else if (G.selected.size < 5) { G.selected.add(card.id); AudioFX.select(); }
  else return;
  // 增量更新：只切换这张牌的选中态，不重建整个手牌 DOM
  const el = $("hand").querySelector?.(`[data-cid="${card.id}"]`);
  if (el) el.classList.toggle("selected", G.selected.has(card.id));
  renderPreview();
}

/* ---------- 出牌计分 ---------- */
async function playHand() {
  const cards = selectedCards();
  if (!cards.length || G.scoring || G.state !== "playing") return;
  if (G.currentBoss?.id === "psychic" && cards.length !== 5) {
    flashMessage(S("psychic_need5"));
    return;
  }
  // 反悔锁：先落一份带出牌意图的档——计分动画中刷新会自动重放同一手，而非回滚重选
  G._pendingPlay = cards.map(c => c.id);
  saveGame();
  G._pendingPlay = null;
  // 局代际快照：动画期间若开了新局（深链/重新开局/读档重放被打断），每个 await 后立即退出
  const run = G.runId;
  G.scoring = true;
  G.speed = 1;
  G.handsLeft--;
  AudioFX.play();
  // try/finally: 动画流程中任何一步抛异常都不能让 scoring 卡死输入
  // （异常本身不吞——向上冒泡进 unhandledrejection 留痕）
  try {

  // 移入出牌区
  G.hand = G.hand.filter(c => !G.selected.has(c.id));
  G.selected.clear();
  const playArea = $("play-area");
  playArea.innerHTML = "";
  const cardEls = new Map();
  for (const c of cards) {
    const el = makeCardEl(c);
    if (isDebuffed(c)) el.classList.add("debuffed");
    playArea.appendChild(el);
    cardEls.set(c.id, el);
  }
  renderHand(); renderStats(); renderPreview();
  await sleep(350);
  if (run !== G.runId) return;

  // 计分（纯函数），出牌次数先入账（超新星语义：不含本次）
  const ev0 = evaluate(cards);
  G.handPlayCounts[ev0.type] = (G.handPlayCounts[ev0.type] || 0) + 1;
  const sc = computeScoring(cards);
  if (!sc.allDebuffed && (!G.bestHand || sc.total > G.bestHand.total))
    G.bestHand = { type: sc.ev.type, total: sc.total };
  if (!sc.allDebuffed) {
    if (["five_kind", "flush_house", "flush_five"].includes(sc.ev.type)) awardAchievement("hidden_hand");
    if (sc.total >= 100000) awardAchievement("big_hand");
  }

  if (sc.allDebuffed) {
    $("hand-name").textContent = S("all_debuffed_name");
    setCalc(0, 0);
    flashMessage(S("all_debuffed_flash"));
    await sleep(700);
  } else {
    $("hand-name").innerHTML = `${L(HAND_TYPES[sc.ev.type].name)} <span class="lvl">Lv.${sc.stats.lvl}</span>`;
    setCalc(sc.stats.chips, sc.stats.mult);
    await sleep(450);

    // 按步骤播放动画
    let curEl = null, chipIdx = 0;
    for (const step of sc.steps) {
      if (run !== G.runId) return;
      if (step.kind === "card") {
        if (curEl) { curEl.classList.remove("scoring"); curEl.classList.add("scored"); }
        curEl = cardEls.get(step.card.id) || null;
        if (curEl) curEl.classList.add("scoring");
        AudioFX.chip(chipIdx++);
        if (curEl) {
          floatText(curEl, `+${step.add}`, "chips");
          if (step.again) floatText(curEl, S("again_word"), "mult");
          if (step.enhMult) floatText(curEl, `+${step.enhMult} ${S("mult_word")}`, "mult");
        }
        setCalc(step.chips, step.mult, "chips");
        await sleep(260);
      } else if (step.kind === "held" || step.kind === "heldJoker") {
        // 手中牌触发：钢铁牌 或 持有类小丑（男爵/射月）
        const el = $("hand").querySelector?.(`[data-cid="${step.card.id}"]`);
        if (el) {
          el.classList.add("scoring");
          const r = step.effect || { xmult: step.xmult };
          floatText(el, r.xmult ? `×${r.xmult}` : r.mult ? `+${r.mult} ${S("mult_word")}` : `+${r.chips}`, r.chips ? "chips" : "mult");
          setTimeout(() => el.classList.remove("scoring"), 420);
        }
        if (step.kind === "heldJoker") {
          const jokerEl = document.querySelector(`[data-jid="${step.joker.uid}"]`);
          if (jokerEl) {
            jokerEl.classList.add("triggered");
            setTimeout(() => jokerEl.classList.remove("triggered"), 420);
          }
        }
        AudioFX.joker();
        setCalc(step.chips, step.mult, "mult");
        await sleep(300);
      } else {
        await animateJokerStep(step);
      }
    }
    if (curEl) { curEl.classList.remove("scoring"); curEl.classList.add("scored"); }

    // 结算总分
    await sleep(300);
    showTotalBurst(sc.chips, sc.mult, sc.total);
    AudioFX.money();
    if (!REDUCED_MOTION) {
      $("game").classList.add("shake");
      setTimeout(() => $("game").classList.remove("shake"), 400);
    }
    await countUp(G.roundScore, G.roundScore + sc.total, 600);
  }
  if (run !== G.runId) return;
  G.roundScore += sc.total;

  // 成长类小丑钩子（绿色小丑 / 坐公交 / 冰淇淋…），可返回 "destroy"
  const melted = G.jokers.filter(j => {
    const def = JOKER_BY_ID.get(j.id);
    return def?.onPlay && def.onPlay(sc.ctx, G, j) === "destroy";
  });
  for (const j of melted) {
    const def = JOKER_BY_ID.get(j.id);
    flashMessage(S("eaten_flash", `${def.icon} ${L(def.name)}`));
    G.jokers = G.jokers.filter(x => x !== j);
  }
  await sleep(500);
  if (run !== G.runId) return;

  // 清理出牌区
  playArea.innerHTML = "";
  setCalc(0, 0);
  $("hand-name").innerHTML = "&nbsp;";

  // Boss: 钩子
  if (G.currentBoss?.id === "hook") {
    const hooked = [];
    for (let k = 0; k < 2 && G.hand.length; k++) {
      const idx = Math.floor(rng() * G.hand.length);
      hooked.push(...G.hand.splice(idx, 1));
    }
    // 与主动弃牌一致，触发小丑牌 onDiscard
    for (const j of G.jokers) {
      const def = JOKER_BY_ID.get(j.id);
      if (def?.onDiscard) def.onDiscard(hooked, G, j);
    }
    flashMessage(S("hook_flash"));
  }

  drawToFull();
  // Boss: 猩红之心 — 换一张禁用的小丑
  if (G.currentBoss?.id === "crimson" && G.jokers.length) {
    G.disabledJokerUid = rnd(G.jokers).uid;
    renderJokers();
  }
  G.scoring = false;
  G.speed = 1;

  // 胜负判定
  if (G.roundScore >= G.target) { G.disabledJokerUid = null; await winRound(); return; }
  if (G.handsLeft <= 0) { gameOver(false); return; }
  checkDeadEnd();
  saveGame();
  render();

  } finally {
    // 正常路径已复位，这里兜异常路径：保证玩家不被永久锁输入。
    // 换局后（run 过期）不碰新局的标志位——新局可能正在计分。
    if (run === G.runId) { G.scoring = false; G.speed = 1; }
  }
}

async function animateJokerStep(step) {
  const jokerEl = document.querySelector(`[data-jid="${step.joker.uid}"]`);
  if (jokerEl) {
    jokerEl.classList.add("triggered");
    setTimeout(() => jokerEl.classList.remove("triggered"), 420);
  }
  AudioFX.joker();
  const r = step.effect;
  if (r.chips) { if (jokerEl) floatText(jokerEl, `+${r.chips}`, "chips"); setCalc(step.chips, step.mult, "chips"); }
  if (r.mult) { if (jokerEl) floatText(jokerEl, `+${r.mult} ${S("mult_word")}`, "mult"); setCalc(step.chips, step.mult, "mult"); }
  if (r.xmult) { if (jokerEl) floatText(jokerEl, `×${r.xmult}`, "mult"); setCalc(step.chips, step.mult, "mult"); }
  await sleep(340);
}

function setCalc(chips, mult, bump) {
  $("chips-box").textContent = fmt(Math.floor(chips));
  $("mult-box").textContent = fmt(Math.round(mult * 100) / 100);
  if (bump) {
    const el = $(bump === "chips" ? "chips-box" : "mult-box");
    el.classList.add("bump");
    setTimeout(() => el.classList.remove("bump"), 120);
  }
}

async function countUp(from, to, dur) {
  const el = $("round-score");
  dur = dur / (G.speed || 1);
  const start = performance.now();
  return new Promise(res => {
    function step(t) {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.floor(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(step); else res();
    }
    requestAnimationFrame(step);
  });
}

function floatText(el, text, cls) {
  const f = document.createElement("div");
  f.className = `float-score ${cls}`;
  f.textContent = text;
  el.appendChild(f);
  setTimeout(() => f.remove(), 850);
}

/* 消息统一进堆叠容器：多条提示纵向排列不再互相遮盖；aria-live 供读屏朗读 */
function flashStack() {
  let box = document.getElementById("flash-stack");
  if (!box) {
    box = document.createElement("div");
    box.id = "flash-stack";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  return box;
}
function flashMessage(msg, cls = "", ms = 1800) {
  const el = document.createElement("div");
  el.className = "flash-msg" + (cls ? " " + cls : "");
  el.textContent = msg;
  flashStack().appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

/* 总分爆发：大额得分有更强的视觉冲击 */
function showTotalBurst(chips, mult, total) {
  const el = document.createElement("div");
  el.className = "total-burst" + (total >= 20000 ? " huge" : total >= 5000 ? " big" : "");
  el.innerHTML = `<span class="tb-chips">${fmt(Math.floor(chips))}</span><span class="tb-x">×</span><span class="tb-mult">${fmt(Math.round(mult * 100) / 100)}</span><span class="tb-eq">=</span><span class="tb-total">${fmt(total)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), total >= 5000 ? 1700 : 1300);
}

/* Boss 登场横幅 */
function showBossBanner(boss) {
  const el = document.createElement("div");
  el.className = "boss-banner";
  el.innerHTML = `<div class="bb-icon">${boss.icon}</div><div class="bb-text"><div class="bb-name">${L(boss.name)}</div><div class="bb-desc">${L(boss.desc)}</div></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), REDUCED_MOTION ? 1800 : 2600);
}

/* ---------- 两次点击确认 ----------
   破坏性操作的统一交互：首次点击武装（视觉提示），二次点击执行，超时自动解除。
   全局同一时刻只保留一个武装中的控件（卖小丑/用消耗品/重新开局等共用）。 */
const CONFIRM_MS = 2500;
let _armedConfirm = null;   // { el, disarm }
function disarmConfirm() {
  if (!_armedConfirm) return;
  const a = _armedConfirm;
  _armedConfirm = null;
  a.disarm();
}
/* arm/disarm 负责视觉状态，onConfirm 执行动作；对同一元素的第二次点击即确认 */
function confirmTwice(el, { arm, disarm, onConfirm }) {
  if (_armedConfirm && _armedConfirm.el === el) {
    disarmConfirm();
    onConfirm();
    return;
  }
  disarmConfirm();
  const timer = setTimeout(() => { if (_armedConfirm && _armedConfirm.el === el) disarmConfirm(); }, CONFIRM_MS);
  _armedConfirm = { el, disarm: () => { clearTimeout(timer); disarm(); } };
  arm();
}

/* ---------- 死局检测 ----------
   无合法出牌可能（手牌打空 / 通灵者凑不齐 5 张且补无可补）时，
   按当前分数直接结算。出牌 / 弃牌 / 开局 / 读档 / 用消耗品五条路径共用。 */
function checkDeadEnd() {
  if (G.state !== "playing" || G.scoring || G._deadEnd) return false;
  const need5 = G.currentBoss?.id === "psychic";
  const cantPlay = G.hand.length === 0 || (need5 && G.hand.length + G.deck.length < 5);
  if (!cantPlay) return false;
  G._deadEnd = true;
  flashMessage(S("dead_end"));
  setTimeout(() => {
    if (!G._deadEnd || G.state !== "playing") return;   // 期间开了新局则作废
    G._deadEnd = false;
    if (G.roundScore >= G.target) winRound();
    else gameOver(false);
  }, 1000);
  return true;
}

/* ---------- 弃牌 ---------- */
function discard() {
  const cards = selectedCards();
  if (!cards.length || !G.discardsLeft || G.scoring || G.state !== "playing") return;
  G.discardsLeft--;
  G.roundDiscards = (G.roundDiscards || 0) + 1;
  AudioFX.discard();
  for (const j of G.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    if (def?.onDiscard) def.onDiscard(cards, G, j);
  }
  G.hand = G.hand.filter(c => !G.selected.has(c.id));
  G.selected.clear();
  drawToFull();

  checkDeadEnd();
  saveGame();
  render();
}

/* ---------- 彩带粒子（纯视觉，用 Math.random 不占用游戏随机流） ---------- */
function confetti(count = 80) {
  if (REDUCED_MOTION) return;
  const colors = ["#f7d774", "#f4443e", "#0092e0", "#38bd64", "#a63fe0", "#ff8f80"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "confetti";
    const size = 6 + Math.random() * 8;
    p.style.cssText = `
      left:${Math.random() * 100}vw;
      width:${size}px;height:${size * (Math.random() > .5 ? 1 : .4)}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration:${2.2 + Math.random() * 2}s;
      animation-delay:${Math.random() * .8}s;
      --drift:${(Math.random() - .5) * 240}px;
      --spin:${(Math.random() - .5) * 1400}deg;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 5200);
  }
}

/* ---------- 回合胜利 / 商店 ---------- */
async function winRound() {
  const run = G.runId;   // 局代际：600ms 结算延迟中开新局则本协程作废
  G.state = "roundwon";
  if (G.blindIndex === 2 && !(G.roundDiscards > 0)) awardAchievement("iron_hand");
  AudioFX.win();
  confetti(G.blindIndex === 2 ? 140 : 70);
  render();
  await sleep(600);
  if (run !== G.runId) return;
  const m = BLIND_META[G.blindIndex];
  const reward = blindReward(G.blindIndex);
  const lines = [];
  let earn = reward;
  lines.push([`${S("defeat_word")} ${G.blindIndex === 2 ? L(G.boss.name) : L(m.name)}`, `$${reward}`]);
  if (G.handsLeft > 0) { lines.push([`${S("hands_left_bonus")} ×${G.handsLeft}`, `$${G.handsLeft}`]); earn += G.handsLeft; }
  const interest = Math.min(G.interestCap, Math.floor(G.money / BALANCE.interestRate));
  if (interest > 0) { lines.push([S("interest_line", G.interestCap, BALANCE.interestRate), `$${interest}`]); earn += interest; }
  // 投资标签：击败 Boss 兑现
  if (G.blindIndex === 2 && G.investment > 0) {
    const v = BALANCE.investmentPayout * G.investment;
    lines.push([`📈 ${S("investment_line")}`, `$${v}`]);
    earn += v;
    G.investment = 0;
  }
  // 手中黄金牌
  const goldCards = G.hand.filter(c => c.enh === "gold");
  if (goldCards.length) {
    const v = goldCards.length * ENH_GOLD_MONEY;
    lines.push([S("gold_cards_line", goldCards.length), `$${v}`]);
    earn += v;
  }
  for (const j of G.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    if (def?.money) { const v = def.money(G, j); lines.push([`${def.icon} ${L(def.name)}`, `$${v}`]); earn += v; }
  }
  // 先收集再删除，避免遍历中修改数组
  const destroyed = G.jokers.filter(j => {
    const def = JOKER_BY_ID.get(j.id);
    return def?.roundEnd && def.roundEnd(G, j) === "destroy";
  });
  for (const j of destroyed) {
    const def = JOKER_BY_ID.get(j.id);
    flashMessage(S("eaten_flash", `${def.icon} ${L(def.name)}`));
    G.jokers = G.jokers.filter(x => x !== j);
  }
  G._cashout = { earn, lines };
  renderCashout();
  saveGame();   // v7: 结算屏随档保存，刷新后可恢复待收取奖励
}

/* 结算屏渲染（winRound 与读档恢复共用） */
function renderCashout() {
  const { earn, lines } = G._cashout;
  // lines 可能来自导入的存档码：esc 防注入
  $("cashout-lines").innerHTML = lines.map(([a, b]) =>
    `<div class="co-line"><span>${esc(a)}</span><span class="co-val">${esc(b)}</span></div>`).join("");
  $("cashout-btn").textContent = `${S("cashout_collect")} $${earn}`;
  $("cashout-btn").onclick = collectCashout;
  $("cashout").classList.remove("hidden");
}

/* 收取奖励并推进盲注/底注 */
function collectCashout() {
  const earn = G._cashout?.earn || 0;
  G._cashout = null;
  G.money += earn;
  AudioFX.money();
  $("cashout").classList.add("hidden");
  // Boss 击败 → 下一底注
  if (G.blindIndex === 2) {
    G.ante++;
    if (G.ante >= 12 && G.mode !== "quick") awardAchievement("endless12");
    if (!G.endless && G.ante > runMaxAnte()) { gameOver(true); return; }
    G.blindIndex = 0;
    pickBoss();
  } else {
    G.blindIndex++;
  }
  saveGame();
  openShop();
}

function openShop() {
  G.state = "shop";
  // onShopEnter 钩子（佩尔科复制消耗品），返回本地化消息则提示；随后存档避免刷新丢失
  for (const j of G.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    const msg = def?.onShopEnter && def.onShopEnter(G, j);
    if (msg) flashMessage(msg);
  }
  G.rerollCost = G.vouchers.includes("clearance") ? BALANCE.rerollClearance : BALANCE.rerollBase;
  rollShop();
  renderShop();
  $("shop").classList.remove("hidden");
  render();
  saveGame();
  tipOnce("shop", "tip_shop");
}

/* 商店刷新（刷新按钮与测试机器人共用）：返回 false = 刷不动 */
function doReroll() {
  if (G.freeReroll > 0) G.freeReroll--;
  else if (G.money >= G.rerollCost) { G.money -= G.rerollCost; G.rerollCost += 1; }
  else return false;
  for (const j of G.jokers) {
    const def = JOKER_BY_ID.get(j.id);
    if (def?.onReroll) def.onReroll(G, j);
  }
  rollShop();
  saveGame();
  return true;
}

/* 读档回到回合中/结算屏（loadGame 调用）：隐藏常驻弹层并整体重绘 */
function restoreBoard() {
  $("blind-select").classList.add("hidden");
  $("shop").classList.add("hidden");
  render();
}

/* 读档回到商店（loadGame 调用）：只按存档重建界面，不重跑进店钩子/随机货架 */
function restoreShop() {
  G.state = "shop";
  $("blind-select").classList.add("hidden");
  renderShop();
  $("shop").classList.remove("hidden");
  render();
}

function makeShopMiniCard(cls, icon, name, desc) {
  const el = document.createElement("div");
  el.className = "planet-card " + cls;
  el.innerHTML = `<div class="p-icon">${icon}</div>
    <div class="p-name">${name}</div>
    <div class="p-desc">${desc}</div>`;
  return el;
}

function renderShop() {
  const box = $("shop-items");
  box.innerHTML = "";
  G.shopStock.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "shop-item" + (item.sold ? " sold" : "");
    let cardEl, price;
    if (item.kind === "joker") {
      price = item.def.cost + (item.ed ? EDITIONS[item.ed].costUp : 0);
      cardEl = makeJokerEl({ id: item.def.id, uid: "shop" + idx, ed: item.ed }, true);
    } else if (item.kind === "tarot") {
      price = item.def.cost;
      cardEl = makeShopMiniCard("tarot-card", item.def.icon, L(item.def.name), L(item.def.desc));
    } else if (item.kind === "spectral") {
      price = item.def.cost;
      cardEl = makeShopMiniCard("spectral-card", item.def.icon, L(item.def.name), L(item.def.desc));
    } else if (item.kind === "pack") {
      price = item.def.cost;
      cardEl = makeShopMiniCard("pack-card", item.def.icon, L(item.def.name), L(item.def.desc));
    } else if (item.kind === "voucher") {
      price = G.voucherDiscount ? Math.ceil(item.def.cost / 2) : item.def.cost;   // 折扣标签
      cardEl = makeShopMiniCard("voucher-card", item.def.icon, L(item.def.name), L(item.def.desc));
    } else {
      price = BALANCE.planetPrice;
      const ht = HAND_TYPES[item.def.hand];
      cardEl = makeShopMiniCard("", item.def.icon, L(item.def.name),
        `${S("upgrade_word")} ${L(ht.name)}<br>+${ht.up[0]} ${S("chips_word")} +${ht.up[1]} ${S("mult_word")}`);
    }
    const priceEl = document.createElement("div");
    priceEl.className = "price-tag";
    priceEl.textContent = `$${price}`;
    const buyBtn = document.createElement("button");
    buyBtn.className = "btn btn-orange buy-btn";
    buyBtn.textContent = item.sold ? S("sold_out") : S("buy_btn");
    buyBtn.disabled = item.sold || G.money < price ||
      (item.kind === "joker" && G.jokers.length >= G.maxJokers) ||
      ((item.kind === "tarot" || item.kind === "spectral") && G.consumables.length >= G.maxConsumables) ||
      // 槽满时对应卡包也禁购：3 选 1 全是 "full" 的死端购买（弹层挡住卖卡腾位，只能白花钱放弃）
      (item.kind === "pack" && item.def.kind === "buffoon" && G.jokers.length >= G.maxJokers) ||
      (item.kind === "pack" && item.def.kind === "arcana" && G.consumables.length >= G.maxConsumables);
    buyBtn.onclick = () => buyItem(item, price);
    wrap.append(priceEl, cardEl, buyBtn);
    box.appendChild(wrap);
  });
  $("reroll-btn").textContent = G.freeReroll > 0 ? S("reroll_free", G.freeReroll) : S("reroll_cost", G.rerollCost);
  $("reroll-btn").disabled = G.freeReroll <= 0 && G.money < G.rerollCost;

  // 已持有的小丑：商店内直接出售，方便腾位换新（两次点击确认）
  const owned = $("shop-owned");
  owned.innerHTML = "";
  if (!G.jokers.length) {
    owned.innerHTML = `<span class="so-empty">—</span>`;
  } else {
    G.jokers.forEach(j => {
      const def = JOKER_BY_ID.get(j.id);
      const el = document.createElement("button");
      el.className = "so-joker";
      el.innerHTML = `${def.icon} ${L(def.name)} <b>+$${sellValue(def)}</b>`;
      el.title = L(def.desc);
      el.onclick = () => confirmTwice(el, {
        arm: () => {
          el.dataset.confirm = "1";
          el.classList.add("so-confirm");
          el.innerHTML = `${S("sell_again", sellValue(def))}`;
        },
        disarm: () => {
          delete el.dataset.confirm;
          el.classList.remove("so-confirm");
          el.innerHTML = `${def.icon} ${L(def.name)} <b>+$${sellValue(def)}</b>`;
        },
        onConfirm: () => sellJoker(j),
      });
      owned.appendChild(el);
    });
  }
}

function buyItem(item, price) {
  if (G.money < price || item.sold) return;
  if ((item.kind === "tarot" || item.kind === "spectral") && G.consumables.length >= G.maxConsumables) return;
  // 与 renderShop 的禁用一致：槽满时对应卡包拒绝购买（键盘购买等旁路的纵深防御）
  if (item.kind === "pack" && ((item.def.kind === "buffoon" && G.jokers.length >= G.maxJokers) ||
    (item.def.kind === "arcana" && G.consumables.length >= G.maxConsumables))) return;
  G.money -= price;
  item.sold = true;
  AudioFX.buy();
  if (item.kind === "joker") {
    const uid = "j" + Date.now() + Math.random().toString(36).slice(2, 5);
    G.jokers.push({ id: item.def.id, uid, ed: item.ed || undefined });
    G._popUid = uid;   // 新买的小丑入场动效
  } else if (item.kind === "tarot" || item.kind === "spectral") {
    G.consumables.push({ id: item.def.id, uid: "t" + Date.now() + Math.random().toString(36).slice(2, 5) });
    if (item.def.targets) tipOnce("tarot", "tip_tarot");
  } else if (item.kind === "pack") {
    openPack(item.def.kind);
    showPackOverlay();
  } else if (item.kind === "voucher") {
    item.def.apply(G);
    G.vouchers.push(item.def.id);
    G.voucherDiscount = false;   // 折扣标签一次性
    flashMessage(`${item.def.icon} ${L(item.def.name)}: ${L(item.def.desc)}`);
  } else {
    G.handLevels[item.def.hand]++;
    flashMessage(`${item.def.icon} ${L(HAND_TYPES[item.def.hand].name)} → Lv.${G.handLevels[item.def.hand]}`);
  }
  saveGame();
  renderShop(); render();
}

/* ---------- 卡包弹层 ---------- */
function showPackOverlay() {
  const pk = G.pendingPack;
  if (!pk) { $("pack-open").classList.add("hidden"); return; }
  const packDef = PACKS.find(p => p.kind === pk.kind);
  $("pack-title").textContent = `${packDef.icon} ${L(packDef.name)} — ${S("pick_one")}`;
  const box = $("pack-choices");
  box.innerHTML = "";
  pk.choices.forEach((id, i) => {
    const wrap = document.createElement("div");
    wrap.className = "shop-item";
    let cardEl;
    if (pk.kind === "arcana") {
      const def = TAROT_BY_ID.get(id);
      cardEl = makeShopMiniCard("tarot-card", def.icon, L(def.name), L(def.desc));
    } else if (pk.kind === "celestial") {
      const def = PLANETS.find(p => p.id === id);
      const ht = HAND_TYPES[def.hand];
      cardEl = makeShopMiniCard("", def.icon, L(def.name),
        `${S("upgrade_word")} ${L(ht.name)}<br>+${ht.up[0]} ${S("chips_word")} +${ht.up[1]} ${S("mult_word")}`);
    } else {
      cardEl = makeJokerEl({ id, uid: "pack" + i }, true);
    }
    const btn = document.createElement("button");
    btn.className = "btn btn-blue buy-btn";
    btn.textContent = S("choose_btn");
    btn.onclick = () => pickPack(i);
    wrap.append(cardEl, btn);
    box.appendChild(wrap);
  });
  $("pack-open").classList.remove("hidden");
}

function pickPack(i) {
  const pk = G.pendingPack;
  if (!pk) return;
  const id = pk.choices[i];
  const def = pk.kind === "arcana" ? TAROT_BY_ID.get(id)
    : pk.kind === "celestial" ? PLANETS.find(p => p.id === id)
    : JOKER_BY_ID.get(id);
  const r = choosePackOption(i);
  if (r === "full") { flashMessage(S("slots_full")); return; }
  if (r !== true) return;
  AudioFX.buy();
  flashMessage(S("pack_taken", `${def.icon} ${L(def.name)}`));
  $("pack-open").classList.add("hidden");
  saveGame();
  render();
  if (G.state === "shop") renderShop();
}

function sellJoker(j) {
  if (G.scoring) return;
  const def = JOKER_BY_ID.get(j.id);
  const v = sellValue(def);
  G.jokers = G.jokers.filter(x => x !== j);
  G.money += v;
  G.soldCount = (G.soldCount || 0) + 1;
  if (G.soldCount >= 5) awardAchievement("merchant");
  AudioFX.money();
  flashMessage(S("sold_flash", L(def.name), v));
  hideTooltip();
  saveGame();
  render();
  if (G.state === "shop") renderShop();
}

/* ---------- 小丑牌排序 ---------- */
function moveJoker(j, dir) {
  if (G.scoring) return;   // 与卖出/用消耗品一致：计分动画中禁止（存档保护见 saveGame）
  const i = G.jokers.indexOf(j);
  const t = i + dir;
  if (i < 0 || t < 0 || t >= G.jokers.length) return;
  [G.jokers[i], G.jokers[t]] = [G.jokers[t], G.jokers[i]];
  AudioFX.select();
  saveGame();
  renderJokers();
}

/* ---------- 消耗品（塔罗）使用 ---------- */
function useConsumable(cons) {
  if (G.scoring) return false;
  const def = consumableDef(cons.id);

  // 检查前置条件（灵魂等幻灵牌）
  if (def.canUse) {
    const check = def.canUse(G);
    if (!check.ok) {
      flashMessage(L(check.reason));
      return false;
    }
  }

  let msg;
  if (def.targets) {
    if (G.state !== "playing") { flashMessage(S("only_in_round")); return false; }
    const sel = selectedCards();
    const [min, max] = def.targets;
    if (sel.length < min || sel.length > max) {
      flashMessage(S("need_select", min === max ? min : `${min}-${max}`));
      return false;
    }
    msg = def.applyCards(sel, G);
    G.selected.clear();
  } else {
    msg = def.apply(G);
    if (msg == null) { flashMessage(S("cannot_use")); return false; }   // apply 返回 null = 无法使用，不消耗
  }
  G.consumables = G.consumables.filter(x => x !== cons);
  AudioFX.buy();
  flashMessage(`${def.icon} ${L(def.name)}: ${msg}`);
  hideTooltip();
  checkDeadEnd();   // 吊人/献祭可清空手牌——消耗品是第五条死局路径，与出牌/弃牌同兜底
  saveGame();
  render();
  if (G.state === "shop") renderShop();
  return true;
}

function makeConsumableEl(cons) {
  const def = consumableDef(cons.id);
  const el = document.createElement("div");
  el.className = "consumable" + (def.spectral ? " spectral" : "");
  el.dataset.uid = cons.uid;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `${L(def.name)} — ${L(def.desc)}`);
  el.onkeydown = e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();
    el.click?.();   // 与点击一致：两次确认使用
  };
  el.innerHTML = `<div class="c-icon">${def.icon}</div><div class="c-name">${L(def.name)}</div>`;
  el.onmouseenter = e => showTarotTip(e, def);
  el.onmousemove = e => moveTooltip(e);
  el.onmouseleave = () => { hideTooltip(); cancelSellConfirm(el); };
  // 双击确认使用（与小丑牌卖出共用 confirmTwice）
  el.onclick = e => confirmTwice(el, {
    arm: () => {
      if (NO_HOVER) showTarotTip(e, def);
      el.classList.add("confirm-sell");
      const badge = document.createElement("div");
      badge.className = "sell-badge";
      badge.textContent = def.targets ? S("use_again_target") : S("use_again");
      el.appendChild(badge);
    },
    disarm: () => { el.classList.remove("confirm-sell"); el.querySelector(".sell-badge")?.remove(); },
    onConfirm: () => useConsumable(cons),
  });
  return el;
}

function renderConsumables() {
  const box = $("consumables");
  box.innerHTML = "";
  G.consumables.forEach(c => box.appendChild(makeConsumableEl(c)));
  for (let i = G.consumables.length; i < G.maxConsumables; i++) {
    const s = document.createElement("div");
    s.className = "consumable-slot";
    box.appendChild(s);
  }
  $("consumable-count").textContent = `${G.consumables.length}/${G.maxConsumables}`;
}

/* ---------- 牌库查看器 ---------- */
function showDeckView() {
  const grid = $("deck-grid");
  const inDeck = G.state === "playing" ? new Set(G.deck.map(c => c.id)) : null;
  grid.innerHTML = SUITS.map(s => {
    const cards = G.masterDeck.filter(c => c.suit === s)
      .sort((a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank]);
    const red = s === "♥" || s === "♦";
    return `<div class="dv-row">
      <span class="dv-suit ${red ? "dv-red" : ""}">${s}<small>×${cards.length}</small></span>
      <div class="dv-cards">${cards.map(c =>
        `<span class="dv-card ${red ? "dv-red" : ""}${inDeck && !inDeck.has(c.id) ? " dv-used" : ""}${c.enh ? " dv-enh" : ""}"
          title="${[c.enh ? L(ENH[c.enh].name) + ": " + L(ENH[c.enh].desc) : "", c.perm ? `+${c.perm} ${S("chips_word")}` : ""].filter(Boolean).join(" · ")}">${c.rank}${c.enh ? `<i>${ENH[c.enh].icon}</i>` : ""}${c.perm ? `<b>+${c.perm}</b>` : ""}</span>`).join("")}
      </div></div>`;
  }).join("");
  $("deck-view-hint").textContent = G.state === "playing" ? S("deck_hint_playing") : S("deck_hint_all");
  $("deck-view").classList.remove("hidden");
  $("close-deck-btn")?.focus?.();
}

/* ---------- 图鉴 / 跨局统计 / 对局历史 ---------- */
function showCollection() {
  const s = loadStats();
  const seen = new Set(s.seenJokers || []);
  G.jokers.forEach(j => seen.add(j.id));
  const modeBests = MODES
    .filter(m => (s.bestByMode || {})[m.id])
    .map(m => `${m.icon}${s.bestByMode[m.id]}`)
    .join(" ");
  $("collection-stats").textContent = S("stats_line",
    s.games || 0, s.wins || 0, s.bestAnte || 0, fmt(s.bestScore || 0), seen.size, JOKER_DEFS.length)
    + (modeBests ? ` · ${modeBests}` : "");
  const clItem = (d, isSeen) => isSeen
    ? `<div class="cl-item" title="${L(d.desc)}"><div class="cl-icon">${d.icon}</div><div class="cl-name">${L(d.name)}</div></div>`
    : `<div class="cl-item cl-unknown"><div class="cl-icon">❓</div><div class="cl-name">???</div></div>`;
  $("collection-grid").innerHTML = JOKER_DEFS.map(d => clItem(d, seen.has(d.id))).join("");
  // 塔罗+幻灵 / 优惠券分区（商店出现过即收录）
  const seenC = new Set(s.seenConsumables || []);
  G.consumables.forEach(x => seenC.add(x.id));
  $("consumables-col-grid").innerHTML = [...TAROTS, ...SPECTRALS].map(d => clItem(d, seenC.has(d.id))).join("");
  const seenV = new Set([...(s.seenVouchers || []), ...G.vouchers]);
  $("vouchers-col-grid").innerHTML = VOUCHERS.map(d => clItem(d, seenV.has(d.id))).join("");
  const unlocked = new Set(s.achievements || []);
  $("achievements-grid").innerHTML = ACHIEVEMENTS.map(a => `
    <div class="cl-item ${unlocked.has(a.id) ? "ach-on" : "cl-unknown"}" title="${L(a.desc)}">
      <div class="cl-icon">${unlocked.has(a.id) ? a.icon : "🔒"}</div>
      <div class="cl-name">${L(a.name)}</div>
    </div>`).join("");
  const hist = s.history || [];
  $("run-history").innerHTML = hist.length
    ? hist.map(h => {
        const deck = DECKS.find(d => d.id === h.deck) || DECKS[0];
        const md = MODES.find(m => m.id === h.mode);
        return `<div class="rh-row">
          <span class="rh-date">${esc(h.d)}</span>
          <span>${h.win ? "🏆" : "💀"} ${S("ante_word")} ${esc(h.ante)}${h.endless ? "∞" : ""} · ${deck.icon}${md && md.id !== "normal" ? md.icon : ""}</span>
          <span class="rh-seed">${esc(h.seed)}</span>
          <button class="small-btn rh-replay" data-seed="${esc(h.seed)}" title="${S("replay_tip")}">↻</button>
        </div>`;
      }).join("")
    : `<div class="rh-row rh-empty">—</div>`;
  $("run-history").querySelectorAll("button[data-seed]").forEach(b => b.onclick = () => {
    $("collection").classList.add("hidden");
    showDeckSelect(+b.dataset.seed);
  });
  $("collection").classList.remove("hidden");
  $("close-collection-btn")?.focus?.();
}

/* 今日/每周挑战按钮的完成标记（历史里出现过该种子即视为已挑战） */
function updateChallengeButtons() {
  let hist = [];
  try { hist = (loadStats().history || []); } catch (e) { /* 忽略 */ }
  const mark = (id, key, seed) => {
    const done = hist.some(h => h.seed === seed);
    const el = $(id);
    if (!el.dataset.confirm) el.textContent = S(key) + (done ? " ✓" : "");
  };
  mark("daily-btn", "daily_btn", todaySeed());
  mark("weekly-btn", "weekly_btn", weekSeed());
}

/* ---------- 帮助 / 新手引导 ---------- */
let _helpPage = 0;
function showHelp(page = 0) {
  _helpPage = Math.max(0, Math.min(HELP_PAGES.length - 1, page));
  const p = HELP_PAGES[_helpPage];
  $("help-title").textContent = `${L(p.title)} (${_helpPage + 1}/${HELP_PAGES.length})`;
  $("help-body").innerHTML = L(p.body);
  $("help-prev-btn").disabled = _helpPage === 0;
  $("help-next-btn").disabled = _helpPage === HELP_PAGES.length - 1;
  $("help").classList.remove("hidden");
  $("close-help-btn")?.focus?.();   // 键盘用户可直接 Enter 关闭
}

/* 一次性情境提示（每个 key 整个浏览器只弹一次） */
const TIPS_KEY = "joker_tips_v1";
function tipOnce(key, msgKey) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(TIPS_KEY)) || {}; } catch (e) { /* 忽略 */ }
  if (seen[key]) return;
  seen[key] = 1;
  try { localStorage.setItem(TIPS_KEY, JSON.stringify(seen)); } catch (e) { /* 忽略 */ }
  flashMessage(S(msgKey), "tip-msg", 6500);
}

/* ---------- 结束 ---------- */
function runStatsHTML() {
  const played = Object.entries(G.handPlayCounts).sort((a, b) => b[1] - a[1]);
  const deck = DECKS.find(d => d.id === (G.deckId || "classic")) || DECKS[0];
  let s = `<div class="end-stats">${deck.icon} ${L(deck.name)} · ${S("rounds_word")} ${G.round}`;
  if (played[0]) s += ` · ${S("fav_hand")}: ${L(HAND_TYPES[played[0][0]].name)} ×${played[0][1]}`;
  if (G.bestHand) s += `<br>${S("best_play")}: ${L(HAND_TYPES[G.bestHand.type].name)} ${fmt(G.bestHand.total)}`;
  s += `<br>${S("seed_word")}: ${G.seed}`;
  return s + `</div>`;
}

function gameOver(win) {
  G.state = "over";
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 隐私模式等场景静默失败 */ }
  recordGameEnd(win);
  updateChallengeButtons();
  win ? AudioFX.win() : AudioFX.lose();
  if (win) confetti(220);
  $("end-title").textContent = win ? S("win_title") : S("lose_title");
  $("end-title").className = "end-title " + (win ? "win" : "lose");
  $("end-detail").innerHTML = (win
    ? S("win_detail", runMaxAnte(), G.money)
    : `${S("fell_at")} ${G.endless ? S("endless_word") + " · " : ""}${S("ante_word")} ${G.ante} · ${G.blindIndex === 2 ? L(G.boss.name) : L(BLIND_META[G.blindIndex].name)}<br>${S("short_by", fmt(Math.max(0, G.target - G.roundScore)))}`)
    + runStatsHTML();
  $("endless-btn").classList.toggle("hidden", !win);
  $("restore-parked-btn").classList.toggle("hidden", !hasParkedSave());
  $("end-screen").classList.remove("hidden");
}

/* 分享链接：?seed=xxx&deck=yyy 打开即可复现同一局 */
function shareLink() {
  if (typeof location === "undefined") return "";
  const mode = G.mode && G.mode !== "normal" ? `&mode=${G.mode}` : "";
  return `${location.origin}${location.pathname}?seed=${G.seed}&deck=${G.deckId || "classic"}${mode}`;
}
async function copyShareLink() {
  const url = shareLink();
  try {
    await navigator.clipboard.writeText(url);
    flashMessage(S("share_copied"));
  } catch (e) {
    window.prompt?.(S("share_manual"), url);
  }
}

/* ---------- 卡面渲染 ---------- */
/* 标准扑克点阵排布 [x%, y%, 是否倒转] */
const PIP_LAYOUTS = {
  "2": [[50, 22], [50, 78, 1]],
  "3": [[50, 20], [50, 50], [50, 80, 1]],
  "4": [[32, 22], [68, 22], [32, 78, 1], [68, 78, 1]],
  "5": [[32, 22], [68, 22], [50, 50], [32, 78, 1], [68, 78, 1]],
  "6": [[32, 22], [68, 22], [32, 50], [68, 50], [32, 78, 1], [68, 78, 1]],
  "7": [[32, 22], [68, 22], [50, 36], [32, 50], [68, 50], [32, 78, 1], [68, 78, 1]],
  "8": [[32, 22], [68, 22], [50, 36], [32, 50], [68, 50], [50, 64, 1], [32, 78, 1], [68, 78, 1]],
  "9": [[32, 19], [68, 19], [32, 41], [68, 41], [50, 50], [32, 59, 1], [68, 59, 1], [32, 81, 1], [68, 81, 1]],
  "10": [[32, 19], [68, 19], [50, 30], [32, 41], [68, 41], [32, 59, 1], [68, 59, 1], [50, 70, 1], [32, 81, 1], [68, 81, 1]],
};
const FACE_ART = { J: "⚜️", Q: "👑", K: "♛" };
const FACE_CHAR = { J: "J", Q: "Q", K: "K" };

function makeCardEl(c) {
  const el = document.createElement("div");
  const red = c.suit === "♥" || c.suit === "♦";
  el.className = `card ${red ? "red-suit" : "dark-suit"}`;
  el.dataset.cid = c.id;
  // 键盘/读屏可达：Tab 聚焦，Enter/空格选中（键盘委托见 main.js 的 #hand 监听）
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", c.rank + c.suit + (c.enh && ENH[c.enh] ? " " + L(ENH[c.enh].name) : ""));

  // rank/suit 经 loadGame 白名单清洗，esc 是纵深防御（文件头的 innerHTML 规矩）
  const corners = `
    <div class="corner tl">${esc(c.rank)}<small>${esc(c.suit)}</small></div>
    <div class="corner br">${esc(c.rank)}<small>${esc(c.suit)}</small></div>`;

  let center;
  if (c.rank === "A") {
    center = `<div class="ace-area"><div class="ace-pip">${c.suit}</div><div class="ace-ring"></div></div>`;
  } else if (FACE_ART[c.rank]) {
    center = `
      <div class="face-frame">
        <div class="face-suit ftl">${c.suit}</div>
        <div class="face-art">${FACE_ART[c.rank]}</div>
        <div class="face-char">${FACE_CHAR[c.rank]}</div>
        <div class="face-suit fbr">${c.suit}</div>
      </div>`;
  } else {
    const pips = (PIP_LAYOUTS[c.rank] || []).map(([x, y, inv]) =>
      `<span class="pip-item${inv ? " inv" : ""}" style="left:${x}%;top:${y}%">${c.suit}</span>`
    ).join("");
    center = `<div class="pips">${pips}</div>`;
  }
  let enhMark = "";
  if (c.enh && ENH[c.enh]) {
    el.classList.add(`enh-${c.enh}`);
    enhMark = `<div class="enh-mark" title="${L(ENH[c.enh].name)}: ${L(ENH[c.enh].desc)}">${ENH[c.enh].icon}</div>`;
  }
  // 永久成长筹码（徒步者等）
  if (typeof c.perm === "number" && c.perm > 0) enhMark += `<div class="perm-mark" title="+${c.perm} ${S("chips_word")}">+${c.perm}</div>`;
  el.innerHTML = corners + center + enhMark + `<div class="card-gloss"></div>`;
  return el;
}

/* 3D 视差倾斜：#game 上统一事件委托，卡牌/小丑不再各自挂监听器。
   pointermove 高频触发，合帧到 rAF 再写样式，降低移动端主线程压力。 */
let _tiltEl = null, _tiltEvt = null, _tiltRaf = 0;
function resetTilt(el) {
  el.style.setProperty("--ry", "0deg");
  el.style.setProperty("--rx", "0deg");
}
function handleTiltMove(e) {
  if (REDUCED_MOTION) return;
  _tiltEvt = e;
  if (!_tiltRaf && typeof requestAnimationFrame === "function")
    _tiltRaf = requestAnimationFrame(applyTilt);
}
function applyTilt() {
  _tiltRaf = 0;
  const e = _tiltEvt;
  if (!e) return;
  const el = e.target?.closest?.(".card, .joker") || null;
  if (_tiltEl && _tiltEl !== el) { resetTilt(_tiltEl); _tiltEl = null; }
  if (!el) return;
  _tiltEl = el;
  const maxDeg = el.classList.contains("joker") ? 20 : 16;
  const r = el.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - .5;
  const py = (e.clientY - r.top) / r.height - .5;
  el.style.setProperty("--ry", (px * maxDeg).toFixed(2) + "deg");
  el.style.setProperty("--rx", (-py * maxDeg).toFixed(2) + "deg");
  el.style.setProperty("--gx", ((px + .5) * 100).toFixed(1) + "%");
  el.style.setProperty("--gy", ((py + .5) * 100).toFixed(1) + "%");
}

function renderHand() {
  const box = $("hand");
  box.innerHTML = "";
  const n = G.hand.length;
  let dealIdx = 0;
  G.hand.forEach((c, i) => {
    const el = makeCardEl(c);
    if (G.selected.has(c.id)) el.classList.add("selected");
    if (isDebuffed(c)) el.classList.add("debuffed");
    // 扇形排列
    const mid = (n - 1) / 2;
    const off = i - mid;
    el.style.transform = `rotate(${off * 2.2}deg) translateY(${Math.abs(off) * 4}px)`;
    el.style.zIndex = String(i);
    // 发牌动画（新抽的牌依次飞入）
    if (c.isNew && !REDUCED_MOTION) {
      el.classList.add("deal-in");
      el.style.animationDelay = (dealIdx++ * 60) + "ms";
    }
    c.isNew = false;
    box.appendChild(el);
  });
  // 动态间距：按容器宽度计算重叠量，窄屏不再挤成一叠（CSS 固定负边距仅作无 JS 兜底）
  const w = box.clientWidth || 0;
  if (w > 0 && n > 1) {
    const els = box.querySelectorAll(".card");
    const cardW = els[0]?.offsetWidth || 92;
    const gap = Math.min(10, Math.max((w - 8 - cardW * n) / (n - 1), -cardW * 0.62));
    els.forEach((el, i) => { el.style.margin = i === 0 ? "0" : `0 0 0 ${gap.toFixed(1)}px`; });
  }
  $("deck-count").textContent = `${G.deck.length}/${G.masterDeck.length}`;
}

function makeJokerEl(j, isShop = false) {
  const def = JOKER_BY_ID.get(j.id);
  const el = document.createElement("div");
  el.className = `joker ${def.rarity}`;
  el.dataset.jid = j.uid;
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `${L(def.name)} — ${L(def.desc)}`);
  el.onkeydown = e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault(); e.stopPropagation();
    el.click?.();   // 与点击一致：两次确认出售 / 查看说明
  };
  const edBadge = j.ed ? `<div class="ed-tag ed-${j.ed}">${L(EDITIONS[j.ed].name)}</div>` : "";
  if (j.ed) el.classList.add("ed-" + j.ed);
  // 成长型小丑：卡面常显当前成长值
  const stateBadge = def.stateText ? `<div class="j-state">${def.stateText(j)}</div>` : "";
  el.innerHTML = `<div class="j-icon">${def.icon}</div><div class="j-name">${L(def.name)}</div><div class="j-tag">${L(RARITY_NAME[def.rarity])}</div>${edBadge}${stateBadge}`;
  el.onmouseenter = e => showTooltip(e, def, isShop, j.ed, j);
  el.onmousemove = e => moveTooltip(e);
  el.onmouseleave = () => { hideTooltip(); cancelSellConfirm(el); };
  // 触屏设备无 hover：点击商店小丑牌显示说明
  if (isShop && NO_HOVER) el.onclick = e => showTooltip(e, def, true, j.ed, j);
  if (!isShop) {
    // 双击确认出售（避免原生 confirm 阻塞动画；确认态经 confirmTwice 全局互斥）
    el.onclick = e => confirmTwice(el, {
      arm: () => {
        if (NO_HOVER) showTooltip(e, def, false, j.ed, j);   // 触屏首次点击先看说明
        el.classList.add("confirm-sell");
        const badge = document.createElement("div");
        badge.className = "sell-badge";
        badge.textContent = S("sell_again", sellValue(def));
        el.appendChild(badge);
      },
      disarm: () => { el.classList.remove("confirm-sell"); el.querySelector(".sell-badge")?.remove(); },
      onConfirm: () => sellJoker(j),
    });
    // 左右移动（小丑结算顺序影响 ×倍率收益）
    for (const [dir, cls, label] of [[-1, "j-left", "◀"], [1, "j-right", "▶"]]) {
      const b = document.createElement("button");
      b.className = "j-move " + cls;
      b.textContent = String(label);
      b.title = S("move_joker_tip");
      b.onclick = e => { e.stopPropagation?.(); moveJoker(j, dir); };
      el.appendChild(b);
    }
  }
  return el;
}

function showTooltip(e, def, isShop, ed, inst) {
  const tt = $("tooltip");
  const edLine = ed ? `<div class="tt-ed">✨ ${L(EDITIONS[ed].name)}: ${L(EDITIONS[ed].desc)}</div>` : "";
  const stateLine = def.stateText && inst
    ? `<div class="tt-state">📈 ${S("current_word")}: ${def.stateText(inst)}</div>` : "";
  tt.innerHTML = `<div class="tt-title">${def.icon} ${L(def.name)}</div>
    <div class="tt-rarity ${def.rarity}">${L(RARITY_NAME[def.rarity])}</div>
    <div class="tt-desc">${L(def.desc)}</div>${stateLine}${edLine}
    ${isShop ? "" : `<div class="tt-sell">${S("click_sell", sellValue(def))}</div>`}`;
  tt.classList.remove("hidden");
  moveTooltip(e);
}
function showTarotTip(e, def) {
  const tt = $("tooltip");
  tt.innerHTML = `<div class="tt-title">${def.icon} ${L(def.name)}</div>
    <div class="tt-rarity ${def.spectral ? "rare" : "uncommon"}">${def.spectral ? S("spectral_label") : S("tarot_label")}</div>
    <div class="tt-desc">${L(def.desc)}</div>
    <div class="tt-sell">${def.targets ? S("select_first_use") : S("click_use")}</div>`;
  tt.classList.remove("hidden");
  moveTooltip(e);
}
function moveTooltip(e) {
  const tt = $("tooltip");
  const x = Math.min(e.clientX + 16, window.innerWidth - 250);
  const y = Math.min(e.clientY + 16, window.innerHeight - tt.offsetHeight - 16);
  tt.style.left = x + "px"; tt.style.top = y + "px";
}
function hideTooltip() { $("tooltip").classList.add("hidden"); }

/* 移开鼠标解除该元素的武装确认（其余解除路径统一走 confirmTwice/disarmConfirm） */
function cancelSellConfirm(el) {
  if (_armedConfirm && _armedConfirm.el === el) disarmConfirm();
}

function renderJokers() {
  const box = $("jokers");
  box.innerHTML = "";
  G.jokers.forEach(j => {
    const el = makeJokerEl(j);
    if (j.uid === G.disabledJokerUid) el.classList.add("debuffed");
    if (j.uid === G._popUid && !REDUCED_MOTION) { el.classList.add("pop"); G._popUid = null; }
    box.appendChild(el);
  });
  for (let i = G.jokers.length; i < G.maxJokers; i++) {
    const s = document.createElement("div");
    s.className = "empty-slot";
    box.appendChild(s);
  }
  $("joker-count").textContent = `${G.jokers.length}/${G.maxJokers}`;
}

function renderStats() {
  $("hands-left").textContent = G.handsLeft;
  $("discards-left").textContent = G.discardsLeft;
  $("money").textContent = "$" + G.money;
  $("ante").textContent = G.ante + (G.endless ? "∞" : "");
  $("ante-max").textContent = G.endless ? "" : "/" + runMaxAnte();   // 无尽模式没有上限概念
  $("round").textContent = G.round;
  $("round-score").textContent = fmt(G.roundScore);
  const modeDef = MODES.find(m => m.id === G.mode);
  const modeTag = G.mode !== "normal" && modeDef ? ` · ${modeDef.icon}${L(modeDef.name)}` : "";
  const seedTag = G.isDaily ? S("today_suffix") : G.isWeekly ? S("week_suffix") : "";   // 开局定格，跨 UTC 午夜不掉标
  $("seed-line").textContent = `${S("seed_word")} ${G.seed ?? "-"}${seedTag}${modeTag}`;
  const m = BLIND_META[G.blindIndex] || BLIND_META[0];
  const isBoss = G.blindIndex === 2 && G.state === "playing";
  $("blind-name").textContent = isBoss ? `${G.boss.icon} ${L(G.boss.name)}` : L(m.name);
  $("blind-name").className = "blind-name " + m.cls;
  $("blind-chip").className = "blind-chip " + m.chip;
  $("blind-chip").textContent = isBoss ? G.boss.icon : "";
  $("blind-target").textContent = fmt(G.state === "playing" ? G.target : blindTarget(G.blindIndex));
  $("blind-reward").textContent = S("reward_word") + " " + "$".repeat(blindReward(G.blindIndex) || 3);
  const eff = $("blind-effect");
  if (isBoss) { eff.textContent = L(G.boss.desc); eff.classList.remove("hidden"); }
  else eff.classList.add("hidden");
}

/* 牌型预览 + 按钮状态（选牌时的轻量更新，不重建手牌 DOM） */
function renderPreview() {
  const sel = selectedCards();
  if (sel.length && !G.scoring) {
    const ev = evaluate(sel);
    if (ev.activeCount === 0) {
      $("hand-name").textContent = S("all_debuffed_name");
      setCalc(0, 0);
    } else {
      const st = handStats(ev.type);
      $("hand-name").innerHTML = `${L(HAND_TYPES[ev.type].name)} <span class="lvl">Lv.${st.lvl}</span>`;
      setCalc(st.chips, st.mult);
    }
  } else if (!G.scoring) {
    $("hand-name").innerHTML = "&nbsp;";
    setCalc(0, 0);
  }
  $("play-btn").disabled = !sel.length || G.scoring || G.state !== "playing";
  $("discard-btn").disabled = !sel.length || !G.discardsLeft || G.scoring || G.state !== "playing";
  $("discard-btn").textContent = `${S("discard_btn")} (${G.discardsLeft})`;
  $("play-btn").textContent = `${S("play_btn")} (${G.handsLeft})`;
}

function render() {
  renderHand();
  renderJokers();
  renderConsumables();
  renderStats();
  renderPreview();
}

/* ---------- 牌型等级弹层 ---------- */
function showRunInfo() {
  const box = $("hand-levels");
  box.innerHTML = Object.entries(HAND_TYPES).map(([k, def]) => {
    const st = handStats(k);
    return `<div class="hl-row">
      <span class="hl-lvl">Lv.${st.lvl}</span>
      <span class="hl-name">${L(def.name)}</span>
      <span class="hl-chips">${st.chips}</span><span class="hl-x">×</span><span class="hl-mult">${st.mult}</span>
    </div>`;
  }).join("");
  $("run-info").classList.remove("hidden");
  $("close-info-btn")?.focus?.();
}

/* ---------- 静态文案（data-i18n） ---------- */
function applyStaticText() {
  const els = document.querySelectorAll?.("[data-i18n]");
  if (els?.forEach) els.forEach((/** @type {any} */ el) => { el.textContent = S(el.dataset.i18n); });
  $("version-line").textContent = "v" + GAME_VERSION;
  document.title = S("game_title");
  document.documentElement?.setAttribute?.("lang", LANG === "en" ? "en" : "zh-CN");
}
