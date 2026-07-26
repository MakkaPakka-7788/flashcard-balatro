/* =========================================================
   小丑牌 · JOKER — 引擎（RNG / 状态 / 存档 / 牌型判定 / 计分 / 卡包 / 统计）
   不直接操作 DOM；loadGame/newGame 等在启动后才会调用 ui 层函数。
   ========================================================= */
"use strict";

/**
 * 核心数据结构（供编辑器 IntelliSense 使用）
 * @typedef {Object} Card
 * @property {string} suit  花色 ♠♥♣♦
 * @property {string} rank  点数 2-10/J/Q/K/A
 * @property {string} id    整局稳定的唯一 id（m0-m51）
 * @property {"bonus"|"mult"|"steel"|"gold"} [enh]  增强
 * @property {boolean} [isNew]  本次新抽（发牌动画用）
 *
 * @typedef {Object} JokerInst
 * @property {string} id    JOKER_DEFS 中的 id
 * @property {string} uid   实例唯一 id（DOM 定位用）
 * @property {number} [state]  成长类小丑的累计值
 * @property {"foil"|"holo"|"poly"} [ed]  版本
 *
 * @typedef {Object} ScoreStep
 * @property {"card"|"held"|"joker"} kind
 * @property {number} chips  该步骤后的筹码
 * @property {number} mult   该步骤后的倍率
 */

/* ---------- 可播种随机数 (mulberry32) ----------
   所有影响玩法的随机（洗牌 / Boss / 商店 / 小丑效果）走 rng()，
   纯视觉随机（彩带、倾斜）用 Math.random，不污染随机流。 */
let _rngState = 1;
function seedRNG(seed) { _rngState = (seed >>> 0) || 1; }
function rng() {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = _rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = arr => arr[Math.floor(rng() * arr.length)];

/* 字符串 → uint32 种子 (djb2) */
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}
/* 今日/每周挑战统一按 UTC 日期取种子：全球同一时刻同一局（v1.3.0 起今日挑战由本地日期改为 UTC） */
const todaySeed = () => hashStr("joker-" + new Date().toISOString().slice(0, 10));

/* 每周挑战：ISO 周数哈希（全球同一周同一局） */
function weekSeed() {
  const d = new Date();
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));   // 该周的周四决定 ISO 年
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return hashStr(`joker-week-${t.getUTCFullYear()}-${week}`);
}

/* ---------- 游戏状态 ---------- */
const G = {};

/* ---------- 跨局统计 / 图鉴（独立于单局存档） ---------- */
const STATS_KEY = "joker_stats_v1";
function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveStats(s) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) { /* 忽略 */ }
}
/* 图鉴收录：seenJokers / seenConsumables(塔罗+幻灵) / seenVouchers */
function markSeen(field, ids) {
  if (!ids.length) return;
  const s = loadStats();
  s[field] = [...new Set([...(s[field] || []), ...ids])];
  saveStats(s);
  return s[field];
}
function markJokersSeen(ids) {
  const seen = markSeen("seenJokers", ids);
  if (seen && seen.length >= JOKER_DEFS.length) awardAchievement("collector");
}
function recordGameEnd(win) {
  const s = loadStats();
  s.games = (s.games || 0) + 1;
  if (win) {
    s.wins = (s.wins || 0) + 1;
    if (G.mode !== "quick") s.deckWins = { ...(s.deckWins || {}), [G.deckId || "classic"]: true };
    else s.deckWins = s.deckWins || {};
  }
  s.bestAnte = Math.max(s.bestAnte || 0, G.endless ? G.ante : Math.min(G.ante, runMaxAnte()));
  const reached = G.endless ? G.ante : Math.min(G.ante, runMaxAnte());
  s.bestByMode = { ...(s.bestByMode || {}), [G.mode || "normal"]: Math.max((s.bestByMode || {})[G.mode || "normal"] || 0, reached) };
  if (G.bestHand) s.bestScore = Math.max(s.bestScore || 0, G.bestHand.total);
  s.history = [{
    d: new Date().toLocaleDateString("sv"),
    seed: G.seed, ante: G.ante, win: !!win,
    endless: !!G.endless, deck: G.deckId || "classic", mode: G.mode || "normal",
  }, ...(s.history || [])].slice(0, 10);
  if (G.seed === todaySeed()) s.didDaily = true;
  if (G.seed === weekSeed()) s.didWeekly = true;
  saveStats(s);
  // 成就颁发放在 saveStats 之后（awardAchievement 内部自行读写 stats，避免快照互相覆盖）
  if (win && G.mode !== "quick") {
    // 通关/无尽成就只在标准与 Boss Rush 模式解锁（快速模式目标更低）
    awardAchievement("first_win");
    if (DECKS.every(d => s.deckWins[d.id])) awardAchievement("all_decks");
  }
  if (win && G.mode === "quick") awardAchievement("quick_win");
  if (win && G.mode === "boss_rush") awardAchievement("rush_win");
  if (G.ante >= 12 && G.mode !== "quick") awardAchievement("endless12");
  if (s.didDaily && s.didWeekly) awardAchievement("challenger");
}

/* ---------- 成就 ---------- */
function awardAchievement(id) {
  const s = loadStats();
  s.achievements = s.achievements || [];
  if (s.achievements.includes(id)) return false;
  s.achievements.push(id);
  saveStats(s);
  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (def && typeof flashMessage === "function") {
    flashMessage(`🏆 ${S("achievement_unlocked")}: ${def.icon} ${L(def.name)}`);
  }
  return true;
}

/* ---------- 存档 ---------- */
const SAVE_KEY = "joker_save_v1";
const PARK_KEY = "joker_save_parked";

/* 开新局/挑战时搁置进行中的存档，结束后可一键恢复（单个搁置位，后开的覆盖先开的） */
function parkCurrentSave() {
  try {
    const cur = localStorage.getItem(SAVE_KEY);
    if (!cur) return false;
    localStorage.setItem(PARK_KEY, cur);
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch (e) { return false; }
}
function hasParkedSave() {
  try { return !!localStorage.getItem(PARK_KEY); } catch (e) { return false; }
}
function restoreParkedSave() {
  try {
    const p = localStorage.getItem(PARK_KEY);
    if (!p) return false;
    localStorage.setItem(SAVE_KEY, p);
    localStorage.removeItem(PARK_KEY);
    return loadGame();
  } catch (e) { return false; }
}

function saveGame() {
  if (G.state === "over") { localStorage.removeItem(SAVE_KEY); return; }
  // 持有类成就的集中检查点（saveGame 在每次状态变化后都会调用）
  if (G.money >= 50) awardAchievement("rich");
  if (G.jokers?.some(j => JOKER_BY_ID.get(j.id)?.rarity === "legendary")) awardAchievement("legendary");
  try {
    const data = {
      v: 6,
      money: G.money, ante: G.ante, round: G.round,
      blindIndex: G.blindIndex, bossId: G.boss?.id,
      jokers: G.jokers.map(j => ({ id: j.id, uid: j.uid, state: j.state, ed: j.ed })),
      deckId: G.deckId, mode: G.mode,
      consumables: G.consumables.map(c => ({ id: c.id, uid: c.uid })),
      handLevels: G.handLevels, handPlayCounts: G.handPlayCounts,
      seed: G.seed, rngState: _rngState,
      masterDeck: G.masterDeck,
      handSize: G.handSize, bonusHands: G.bonusHands,
      bonusDiscards: G.bonusDiscards, freeReroll: G.freeReroll,
      seenBosses: G.seenBosses, endless: G.endless, bestHand: G.bestHand,
      vouchers: G.vouchers, maxJokers: G.maxJokers,
      maxConsumables: G.maxConsumables, interestCap: G.interestCap,
      pendingPack: G.pendingPack,
      voucherDiscount: G.voucherDiscount, investment: G.investment, doubleTag: G.doubleTag,
      soldCount: G.soldCount,
      state: G.state === "playing" ? "playing" : G.state === "shop" ? "shop" : "other",
    };
    // 商店中存档：v6 起货架随档保存，刷新页面不再错过本次商店
    if (G.state === "shop" && Array.isArray(G.shopStock)) {
      data.shop = {
        stock: G.shopStock.map(i => ({ kind: i.kind, id: i.kind === "pack" ? i.def.kind : i.def.id, ed: i.ed || null, sold: !!i.sold })),
        rerollCost: G.rerollCost,
      };
    }
    // 回合中存档：刷新后可从当前手牌继续
    if (G.state === "playing" && !G.scoring) {
      data.mid = {
        deck: G.deck, hand: G.hand,
        handsLeft: G.handsLeft, discardsLeft: G.discardsLeft,
        roundDiscards: G.roundDiscards || 0,
        roundScore: G.roundScore, target: G.target,
        curHandSize: G.curHandSize, maxHands: G.maxHands, maxDiscards: G.maxDiscards,
        sortMode: G.sortMode || "rank",
        disabledJokerUid: G.disabledJokerUid,
      };
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) { /* 隐私模式等场景静默失败 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (typeof d.ante !== "number" || !Array.isArray(d.jokers)) return false;
    newGameState();
    if (typeof d.seed === "number") G.seed = d.seed;
    seedRNG(typeof d.rngState === "number" ? d.rngState : G.seed);
    G.money = d.money; G.ante = d.ante; G.round = d.round;
    G.blindIndex = d.blindIndex ?? 0;
    G.boss = BOSSES.find(b => b.id === d.bossId) || rnd(BOSSES);
    G.jokers = d.jokers.filter(j => JOKER_BY_ID.has(j.id));
    G.consumables = (d.consumables || []).filter(c => consumableDef(c.id));
    Object.assign(G.handLevels, d.handLevels);
    G.handPlayCounts = d.handPlayCounts || {};
    if (Array.isArray(d.masterDeck) && d.masterDeck.length) G.masterDeck = d.masterDeck;
    G.handSize = d.handSize ?? 8;
    G.bonusHands = d.bonusHands || 0;
    G.bonusDiscards = d.bonusDiscards || 0;
    G.freeReroll = d.freeReroll || 0;
    G.seenBosses = Array.isArray(d.seenBosses) ? d.seenBosses : [];
    G.endless = !!d.endless;
    G.bestHand = d.bestHand || null;
    G.vouchers = (d.vouchers || []).filter(id => VOUCHER_BY_ID.has(id));
    G.maxJokers = d.maxJokers ?? 5;
    G.maxConsumables = d.maxConsumables ?? 2;
    G.interestCap = d.interestCap ?? 5;
    G.pendingPack = d.pendingPack || null;
    G.deckId = d.deckId || "classic";
    G.mode = MODES.some(m => m.id === d.mode) ? d.mode : "normal";
    G.voucherDiscount = !!d.voucherDiscount;
    G.investment = d.investment || 0;
    G.doubleTag = d.doubleTag || 0;
    G.soldCount = d.soldCount || 0;
    if (d.state === "playing" && d.mid && Array.isArray(d.mid.hand)) {
      Object.assign(G, {
        state: "playing",
        deck: d.mid.deck || [], hand: d.mid.hand,
        handsLeft: d.mid.handsLeft, discardsLeft: d.mid.discardsLeft,
        roundDiscards: d.mid.roundDiscards ?? 1,   // 旧档未知时按已弃牌处理，避免误发铁手成就
        roundScore: d.mid.roundScore || 0, target: d.mid.target,
        curHandSize: d.mid.curHandSize || G.handSize,
        maxHands: d.mid.maxHands ?? 4, maxDiscards: d.mid.maxDiscards ?? 3,
        sortMode: d.mid.sortMode || "rank",
      });
      G.currentBoss = activeBossFor(G);   // 含奇科禁用与 Boss Rush（旧写法回合中读档会丢 Boss Rush 减益）
      G.disabledJokerUid = d.mid.disabledJokerUid ?? null;   // 猩红之心的禁用随档恢复
      $("blind-select").classList.add("hidden");
      $("shop").classList.add("hidden");
      render();
      flashMessage(S("msg_restored"));
      checkDeadEnd();   // 空手牌残局的存档：恢复后立即结算而非软锁
    } else if (d.state === "shop" && Array.isArray(d.shop?.stock)) {
      // v6: 商店中存档 → 按 id 重建货架并回到商店（不重跑 rollShop / onShopEnter 钩子）
      G.rerollCost = d.shop.rerollCost ?? BALANCE.rerollBase;
      G.shopStock = d.shop.stock.map(s => {
        const def = s.kind === "joker" ? JOKER_BY_ID.get(s.id)
          : s.kind === "planet" ? PLANETS.find(p => p.id === s.id)
          : s.kind === "tarot" ? TAROT_BY_ID.get(s.id)
          : s.kind === "spectral" ? SPECTRAL_BY_ID.get(s.id)
          : s.kind === "pack" ? PACKS.find(p => p.kind === s.id)
          : VOUCHER_BY_ID.get(s.id);
        return def ? { kind: s.kind, def, ed: s.ed || null, sold: !!s.sold } : null;
      }).filter(Boolean);
      restoreShop();
      flashMessage(S("msg_restored_shop"));
    } else {
      showBlindSelect();
      render();
      flashMessage(S("msg_restored_blind"));
    }
    if (G.pendingPack) showPackOverlay();   // 开包途中刷新，恢复选择界面
    return true;
  } catch (e) { return false; }
}

function newGameState(seed) {
  const s = (seed ?? Date.now()) >>> 0;
  seedRNG(s);
  Object.assign(G, {
    seed: s,
    masterDeck: buildMasterDeck(),
    deck: [], hand: [], selected: new Set(),
    jokers: [], maxJokers: 5,
    consumables: [], maxConsumables: 2,
    money: BALANCE.startMoney, ante: 1, round: 0,
    handSize: BALANCE.handSize,
    maxHands: BALANCE.baseHands, maxDiscards: BALANCE.baseDiscards,
    handsLeft: BALANCE.baseHands, discardsLeft: BALANCE.baseDiscards,
    bonusHands: 0, bonusDiscards: 0, freeReroll: 0,
    interestCap: BALANCE.interestCap, vouchers: [], pendingPack: null,
    disabledJokerUid: null,                       // 猩红之心禁用的小丑
    voucherDiscount: false, investment: 0, doubleTag: 0,   // 标签效果
    soldCount: 0, roundDiscards: 0,               // 成就埋点：单局卖卡数 / 本回合弃牌数
    roundScore: 0, target: 0,
    blindIndex: 0,           // 0 小盲 1 大盲 2 Boss
    boss: null, currentBoss: null,
    seenBosses: [], endless: false, bestHand: null,
    handLevels: Object.fromEntries(Object.keys(HAND_TYPES).map(k => [k, 1])),
    handPlayCounts: {},
    shopStock: [], rerollCost: 5,
    deckId: "classic", mode: "normal",
    scoring: false, speed: 1, _deadEnd: false,
    state: "blind-select",
  });
}

function newGame(seed, deckId = "classic", mode = "normal") {
  newGameState(seed);
  G.mode = MODES.some(m => m.id === mode) ? mode : "normal";
  const deck = DECKS.find(d => d.id === deckId) || DECKS[0];
  G.deckId = deck.id;
  deck.apply(G);
  pickBoss();
  showBlindSelect();
  render();
}

/* 同一局内 Boss 不重复，全部见过后重置池 */
function pickBoss() {
  let pool = BOSSES.filter(b => !G.seenBosses.includes(b.id));
  if (!pool.length) { G.seenBosses = []; pool = BOSSES; }
  G.boss = rnd(pool);
  G.seenBosses.push(G.boss.id);
}

/* 当前盲注实际生效的 Boss：非 Boss 盲注为 null；持有奇科时 Boss 效果失效。
   startBlind 与回合中读档都经此计算 currentBoss。 */
function activeBossFor(g = G) {
  if (!(g.mode === "boss_rush" || g.blindIndex === 2)) return null;
  if (g.jokers.some(j => j.id === "chicot")) return null;
  return g.boss;
}

/* ---------- 牌库 ----------
   masterDeck 整局持久（塔罗可改花色/点数/增强/销毁），
   每个盲注从它复制 + 洗牌得到本回合的 deck。 */
function buildMasterDeck() {
  const d = [];
  let uid = 0;
  for (const s of SUITS) for (const r of RANKS)
    d.push({ suit: s, rank: r, id: `m${uid++}` });
  return d;
}

function buildDeck() {
  G.deck = G.masterDeck.map(c => ({ ...c }));
  for (let i = G.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [G.deck[i], G.deck[j]] = [G.deck[j], G.deck[i]];
  }
}

/* 对一张牌的所有副本（母牌库 / 本回合牌库 / 手牌）应用修改 */
function applyCardMod(id, fn) {
  for (const arr of [G.masterDeck, G.deck, G.hand]) {
    const c = arr.find(x => x.id === id);
    if (c) fn(c);
  }
}

/* ---------- 盲注目标 ---------- */
/* 快速模式用专用放缓曲线（见 BALANCE.quickAnte），Boss Rush 用标准曲线 */
function anteCurve() {
  return G.mode === "quick" ? BALANCE.quickAnte : ANTE_BASE;
}
const runMaxAnte = () => G.mode === "quick" ? BALANCE.quickAnte.length : MAX_ANTE;

/* 盲注奖励：Boss Rush 每盲注 +$1 补偿全程减益 */
function blindReward(idx) {
  return BALANCE.blindRewards[idx] + (G.mode === "boss_rush" ? BALANCE.bossRushRewardBonus : 0);
}

function blindTarget(idx) {
  const curve = anteCurve();
  const ai = G.ante - 1;
  const base = ai < curve.length
    ? curve[ai]
    : curve[curve.length - 1] * Math.pow(BALANCE.endlessGrowth, ai - curve.length + 1);
  const bossMult = BALANCE.bossMultOverride[G.boss?.id] ?? BALANCE.bossMult;
  const mults = [1, BALANCE.bigBlindMult, bossMult];
  return Math.floor(base * (mults[idx] ?? 1));
}

function drawToFull(initial = false) {
  // Boss: 蛇 — 出牌/弃牌后只补 3 张（开局发牌不受限）
  const limit = (!initial && G.currentBoss?.id === "serpent")
    ? Math.min(G.curHandSize, G.hand.length + 3)
    : G.curHandSize;
  while (G.hand.length < limit && G.deck.length > 0) {
    const c = G.deck.pop();
    c.isNew = true;           // 用于发牌动画
    G.hand.push(c);
  }
  sortHand(G.sortMode || "rank");
}

function sortHand(mode) {
  G.sortMode = mode;
  if (mode === "rank")
    G.hand.sort((a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank] || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
  else
    G.hand.sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || RANK_VAL[b.rank] - RANK_VAL[a.rank]);
}

function selectedCards() { return G.hand.filter(c => G.selected.has(c.id)); }

/* ---------- 牌型判定 ---------- */
function isDebuffed(card, g = G) {
  if (!g.currentBoss) return false;
  if (g.currentBoss.id === "mark") return ["J", "Q", "K"].includes(card.rank);
  const map = { club: "♣", goad: "♠", window: "♦", head: "♥" };
  return map[g.currentBoss.id] === card.suit;
}

const hasJoker = (id, g = G) => !!g.jokers && g.jokers.some(j => j.id === id);

/* 与 computeScoring 一致：显式接受 g，不隐式读全局（保证注入任意状态时结果自洽） */
function evaluate(cards, g = G) {
  const active = cards.filter(c => !isDebuffed(c, g));
  const ranks = active.map(c => RANK_VAL[c.rank]);
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const groups = Object.values(counts).sort((a, b) => b - a);
  const suits = new Set(active.map(c => c.suit));
  // 四指: 4 张即可组成同花/顺子；抄近路: 顺子允许跳 1 个点数
  const minRun = hasJoker("four_fingers", g) ? 4 : 5;
  const maxGap = hasJoker("shortcut", g) ? 2 : 1;
  const isFlush = active.length >= minRun && suits.size === 1;
  let isStraight = false;
  if (active.length >= minRun && new Set(ranks).size === active.length) {
    const runOk = u => u.every((v, i) => i === 0 || (v - u[i - 1] >= 1 && v - u[i - 1] <= maxGap));
    const u = [...new Set(ranks)].sort((a, b) => a - b);
    isStraight = runOk(u);
    if (!isStraight && u[u.length - 1] === 14) isStraight = runOk([1, ...u.slice(0, -1)]);  // A 作 1
  }
  let type;
  if (groups[0] === 5) type = isFlush ? "flush_five" : "five_kind";
  else if (isFlush && groups[0] === 3 && groups[1] === 2) type = "flush_house";
  else if (isFlush && isStraight) type = "straight_flush";
  else if (groups[0] === 4) type = "four_kind";
  else if (groups[0] === 3 && groups[1] === 2) type = "full_house";
  else if (isFlush) type = "flush";
  else if (isStraight) type = "straight";
  else if (groups[0] === 3) type = "three_kind";
  else if (groups[0] === 2 && groups[1] === 2) type = "two_pair";
  else if (groups[0] === 2) type = "pair";
  else type = "high_card";

  // 计分牌：组成牌型的牌（高牌只算最大那张）；飞溅: 全部参与
  let scoringCards;
  if (hasJoker("splash", g)) {
    scoringCards = active.slice();
  } else if (type === "high_card") {
    const best = active.slice().sort((a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank])[0];
    scoringCards = best ? [best] : [];
  } else if (["pair", "two_pair", "three_kind", "four_kind", "full_house"].includes(type)) {
    scoringCards = active.filter(c => counts[RANK_VAL[c.rank]] >= 2);
  } else {
    scoringCards = active.slice();
  }
  return {
    type, scoringCards,
    activeCount: active.length,
    hasPair: groups[0] >= 2,
    hasThree: groups[0] >= 3,
  };
}

function handStats(type, g = G) {
  const def = HAND_TYPES[type];
  const lvl = g.handLevels[type];
  return {
    chips: def.chips + def.up[0] * (lvl - 1),
    mult: def.mult + def.up[1] * (lvl - 1),
    lvl,
  };
}

/* 蓝图解析：每个小丑的"有效计分定义"。copy:"right" 沿链取右侧第一个非复制小丑。
   返回 [{ j: 原实例(动画/版本用), def: 有效定义, inst: 状态来源实例 }] */
function scoringJokers(g) {
  return g.jokers
    .filter(j => j.uid !== g.disabledJokerUid)   // 猩红之心禁用的小丑不参与计分
    .map((j, i, arr) => {
      let idx = i, def = JOKER_BY_ID.get(arr[idx].id), guard = 0;
      while (def?.copy === "right" && guard++ <= arr.length) {
        idx++;
        def = arr[idx] ? JOKER_BY_ID.get(arr[idx].id) : null;
      }
      if (def?.copy) def = null;   // 复制链没有落点
      return { j, def, inst: arr[idx] || j };
    });
}

/* ---------- 纯函数计分 ----------
   不触碰 DOM / 音效 / 动画，返回完整的计分步骤序列，
   playHand 只负责按步骤播放，测试可直接断言 total。
   顺序: 牌型基础 → 逐卡(含重触发/小丑 perCard) → 手中牌(钢铁/heldCard 小丑) → 小丑版本+after */
function computeScoring(cards, g = G) {
  const ev = evaluate(cards, g);
  const stats = handStats(ev.type, g);
  // 打出的牌全部被 Boss 禁用 → 0 分
  if (cards.length > 0 && ev.activeCount === 0) {
    return { ev, stats, ctx: null, steps: [], chips: 0, mult: 0, total: 0, allDebuffed: true };
  }
  const ctx = {
    type: ev.type, cards, playedCount: cards.length,
    scoringCards: ev.scoringCards,
    hasPair: ev.hasPair, hasThree: ev.hasThree,
    firstFace: cards.find(c => ["J", "Q", "K"].includes(c.rank) && !isDebuffed(c, g)) || null,
  };
  const sj = scoringJokers(g);
  let chips = stats.chips, mult = stats.mult;
  // Boss: 燧石 — 牌型基础筹码和倍率减半
  if (g.currentBoss?.id === "flint") {
    chips = Math.ceil(chips / 2);
    mult = Math.ceil(mult / 2);
  }
  const steps = [];
  const applyEffect = (j, r) => {
    if (r.chips) chips += r.chips;
    if (r.mult) mult += r.mult;
    if (r.xmult) mult = Math.round(mult * r.xmult * 100) / 100;
    steps.push({ kind: "joker", joker: j, effect: r, chips, mult });
  };
  for (const c of ev.scoringCards) {
    // 重触发：每张牌的触发次数 = 1 + 各小丑的额外触发
    let triggers = 1;
    for (const { def, inst } of sj) {
      if (def?.retrigger) triggers += def.retrigger(c, ctx, g, inst) || 0;
    }
    for (let t = 0; t < triggers; t++) {
      const add = CHIP_VAL(c.rank) + (c.enh === "bonus" ? ENH_CHIPS : 0) + (c.perm || 0);
      chips += add;
      const enhMult = c.enh === "mult" ? ENH_MULT : 0;
      if (enhMult) mult += enhMult;
      steps.push({ kind: "card", card: c, add, enhMult, chips, mult, again: t > 0 });
      for (const { j, def, inst } of sj) {
        if (!def?.perCard) continue;
        const r = def.perCard(c, ctx, g, inst);
        if (r) applyEffect(j, r);
      }
    }
  }
  // 手中牌（未打出、留在手里的）：钢铁牌 + 持有类小丑（男爵/射月）
  for (const hc of g.hand) {
    if (hc.enh === "steel") {
      mult = Math.round(mult * ENH_STEEL_X * 100) / 100;
      steps.push({ kind: "held", card: hc, xmult: ENH_STEEL_X, chips, mult });
    }
    for (const { j, def, inst } of sj) {
      if (!def?.heldCard) continue;
      const r = def.heldCard(hc, g, inst);
      if (r) {
        if (r.chips) chips += r.chips;
        if (r.mult) mult += r.mult;
        if (r.xmult) mult = Math.round(mult * r.xmult * 100) / 100;
        steps.push({ kind: "heldJoker", joker: j, card: hc, effect: r, chips, mult });
      }
    }
  }
  for (const { j, def, inst } of sj) {
    // 版本效果先于该小丑自身效果（排序影响 ×倍率收益）；版本属于小丑本体，蓝图不复制
    const ed = j.ed && EDITIONS[j.ed];
    if (ed) applyEffect(j, ed.effect);
    if (!def?.after) continue;
    const r = def.after(ctx, g, inst);
    if (r) applyEffect(j, r);
  }
  return { ev, stats, ctx, steps, chips, mult, total: Math.floor(chips * mult), allDebuffed: false };
}

/* ---------- 商店库存 ---------- */
/* 小丑版本掉率见 BALANCE.editionRates（累进阈值，默认 3% 多彩 / 7% 全息 / 10% 闪箔） */
function rollEdition() {
  const r = rng(), e = BALANCE.editionRates;
  if (r < e.poly) return "poly";
  if (r < e.poly + e.holo) return "holo";
  if (r < e.poly + e.holo + e.foil) return "foil";
  return null;
}

function rollShop() {
  G.shopStock = [];
  const owned = new Set(G.jokers.map(j => j.id));
  const pool = JOKER_DEFS.filter(d => !owned.has(d.id));
  const weights = BALANCE.rarityWeights;
  const jokerCount = G.vouchers.includes("overstock") ? 3 : 2;
  for (let i = 0; i < jokerCount && pool.length; i++) {
    const bag = [];
    pool.forEach(d => { for (let w = 0; w < weights[d.rarity]; w++) bag.push(d); });
    const pick = rnd(bag);
    pool.splice(pool.indexOf(pick), 1);
    G.shopStock.push({ kind: "joker", def: pick, ed: rollEdition(), sold: false });
  }
  G.shopStock.push({ kind: "planet", def: rnd(PLANETS), sold: false });
  // 塔罗位低概率被幻灵牌顶替
  if (rng() < BALANCE.spectralChance) G.shopStock.push({ kind: "spectral", def: rnd(SPECTRALS), sold: false });
  else G.shopStock.push({ kind: "tarot", def: rnd(TAROTS), sold: false });
  G.shopStock.push({ kind: "pack", def: rnd(PACKS), sold: false });
  const vLeft = VOUCHERS.filter(v => !G.vouchers.includes(v.id));
  if (vLeft.length) G.shopStock.push({ kind: "voucher", def: rnd(vLeft), sold: false });
  markJokersSeen(G.shopStock.filter(i => i.kind === "joker").map(i => i.def.id));
  markSeen("seenConsumables", G.shopStock.filter(i => i.kind === "tarot" || i.kind === "spectral").map(i => i.def.id));
  markSeen("seenVouchers", G.shopStock.filter(i => i.kind === "voucher").map(i => i.def.id));
}

/* ---------- 卡包 ---------- */
function openPack(kind) {
  let pool;
  if (kind === "arcana") pool = TAROTS.slice();
  else if (kind === "celestial") pool = PLANETS.slice();
  else pool = JOKER_DEFS.filter(d => !G.jokers.some(j => j.id === d.id));
  const choices = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const pick = rnd(pool);
    pool.splice(pool.indexOf(pick), 1);
    choices.push(pick.id);
  }
  G.pendingPack = { kind, choices };
  if (kind === "buffoon") markJokersSeen(choices);
  if (kind === "arcana") markSeen("seenConsumables", choices);
}

/* 返回 true=成功；"full"=槽位已满；false=无效 */
function choosePackOption(i) {
  const pk = G.pendingPack;
  if (!pk || pk.choices[i] == null) return false;
  const id = pk.choices[i];
  if (pk.kind === "arcana") {
    if (G.consumables.length >= G.maxConsumables) return "full";
    G.consumables.push({ id, uid: "t" + Date.now() + Math.random().toString(36).slice(2, 5) });
  } else if (pk.kind === "celestial") {
    const def = PLANETS.find(p => p.id === id);
    G.handLevels[def.hand]++;
  } else {
    if (G.jokers.length >= G.maxJokers) return "full";
    G.jokers.push({ id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
  }
  G.pendingPack = null;
  return true;
}

function skipPack() { G.pendingPack = null; }
