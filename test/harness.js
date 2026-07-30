// @ts-nocheck —— 测试走 node 直跑，类型检查只覆盖游戏源码
/* =========================================================
   测试共享环境：DOM 桩 + 源码编译 + 快进时钟 + 分级策略机器人
   test.js（回归测试）与 balance.js（平衡报告）共用。
   ========================================================= */
"use strict";

const elements = {};
function mkEl() {
  return {
    innerHTML: "", textContent: "", className: "", style: { setProperty(){} }, dataset: {},
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    appendChild(){}, append(){}, querySelectorAll(){ return []; }, querySelector(){ return null; },
    onclick: null, onmouseenter: null, onmousemove: null, onmouseleave: null,
    disabled: false, offsetHeight: 0, remove(){}, addEventListener(){},
    getBoundingClientRect(){ return { left: 0, top: 0, width: 92, height: 128 }; },
    setProperty(){}, setAttribute(){}, click(){ if (this.onclick) this.onclick(); },
  };
}

global.document = {
  addEventListener(){},
  getElementById: id => (elements[id] ||= mkEl()),
  createElement: () => mkEl(),
  querySelector: () => null, querySelectorAll: () => [],
  body: mkEl(),
  title: "",
  documentElement: mkEl(),
};
global.window = { innerWidth: 1920, innerHeight: 1080 };
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 1);
global.confirm = () => true;
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SOURCES = ["i18n.js", "defs.js", "engine.js", "audio.js", "ui.js", "main.js"];

let _api = null;
function compileGame() {
  if (_api) return _api;
  let src = SOURCES.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  src += `\nmodule.exports = { G, evaluate, playHand, startBlind, discard, JOKER_DEFS, JOKER_BY_ID,
    rollShop, rollEdition, buyItem, computeScoring, newGameState, newGame, skipBlind, blindTarget,
    seedRNG, rng, buildDeck, TAROTS, TAROT_BY_ID, BOSSES, PACKS, VOUCHERS, EDITIONS, DECKS, PLANETS,
    SPECTRALS, SPECTRAL_BY_ID, SKIP_TAGS, HELP_PAGES, consumableDef, sellJoker, shareLink,
    ACHIEVEMENTS, awardAchievement, fmt, BALANCE, GAME_VERSION, MODES, weekSeed, todaySeed, runMaxAnte, blindReward, markSeen, parkCurrentSave, hasParkedSave, restoreParkedSave,
    saveGame, loadGame, useConsumable, applyCardMod, pickBoss, openPack, choosePackOption, skipPack,
    openShop, activeBossFor, doReroll, collectCashout, renderCashout, renderStats, winRound,
    loadStats, recordGameEnd, markJokersSeen, RANK_VAL, HAND_TYPES, ANTE_BASE,
    ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L };`;
  const M = require("module");
  const m = new M.Module("game");
  m._compile(src, "game.js");
  _api = m.exports;
  return _api;
}

/* 快进时钟：sleep 立即返回，rAF 动画数帧内结束 */
function enableFastClock() {
  let fakeNow = 0;
  global.performance.now = () => (fakeNow += 120);
  const realSetTimeout = global.setTimeout;
  global.setTimeout = (cb, ms) => realSetTimeout(cb, 0);
}

/* =========================================================
   分级策略机器人
   novice   : 无脑打前 5 张，只会按顺序买小丑 —— 校准下限
   standard : 真实计分择手 + 确定性弃牌展望 + 塔罗/卡包/全品类采购
   expert   : standard 之上再加 蓝图实测排位 / 构筑估值 / 更深弃牌采样
   ========================================================= */
function makeBot(api, tier = "standard") {
  const { G, RANK_VAL, JOKER_BY_ID, playHand, discard, startBlind, buyItem,
    useConsumable, choosePackOption, skipPack, newGameState, pickBoss, sellJoker } = api;
  const byRankDesc = (a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank];
  const RARITY_W = { common: 1, uncommon: 2, rare: 3, legendary: 4 };
  const SUIT_TAROT = { sun: "♥", star: "♦", moon: "♣", world: "♠" };
  /* ×倍率 生效在结算末端收益最大——expert 把它们排到右边 */
  const XMULT_IDS = new Set(["blackboard", "baron_red", "cavendish", "duo", "trio", "canio", "acrobat", "baron"]);

  function combinations(items, size) {
    const out = [];
    const pick = (start, cur) => {
      if (cur.length === size) { out.push(cur.slice()); return; }
      for (let i = start; i <= items.length - (size - cur.length); i++) {
        cur.push(items[i]);
        pick(i + 1, cur);
        cur.pop();
      }
    };
    pick(0, []);
    return out;
  }

  /* 候选手必须用“打出后”的持有手牌计分，否则钢铁牌、男爵、射月、高举拳头会被误判。 */
  function scoreSelection(cards, state = G) {
    const ids = new Set(cards.map(c => c.id));
    const scoringState = { ...state, hand: state.hand.filter(c => !ids.has(c.id)) };
    return api.computeScoring(cards, scoringState);
  }

  /* 穷举一手至多 218 个合法子集，直接复用游戏真实计分器。
     这样 Boss、增强、牌型等级和构筑协同无需在机器人里维护一套平行规则。 */
  function rankedSelection(hand, mustFive, state = G) {
    if (tier === "novice") {
      const cards = hand.slice(0, Math.min(5, hand.length));
      return mustFive && cards.length !== 5 ? null : { cards, score: 0, scoring: null, tie: 0 };
    }
    if (mustFive && hand.length < 5) return null;
    let best = null;
    const lo = mustFive ? 5 : 1;
    const hi = Math.min(5, hand.length);
    for (let n = lo; n <= hi; n++) {
      for (const cards of combinations(hand, n)) {
        const scoring = scoreSelection(cards, state);
        const ids = new Set(cards.map(c => c.id));
        const heldGold = hand.filter(c => !ids.has(c.id) && c.enh === "gold").length;
        const tie = heldGold * 10 - cards.length;
        if (!best || scoring.total > best.score || (scoring.total === best.score && tie > best.tie)) {
          best = { cards, score: scoring.total, scoring, tie };
        }
      }
    }
    return best;
  }

  function bestSelection(hand, mustFive, state = G) {
    return rankedSelection(hand, mustFive, state)?.cards || null;
  }

  /* 弃牌展望会反复评估虚拟手牌：先按基础牌型筛出少量代表候选，再走真实计分。
     真正出牌仍由 rankedSelection 全量穷举；这里只控制批量平衡仿真的成本。 */
  function projectedBestScore(hand, mustFive, state) {
    if (mustFive && hand.length < 5) return 0;
    const ranked = [], byType = new Map(), bySize = new Map();
    const lo = mustFive ? 5 : 1;
    for (let n = lo; n <= Math.min(5, hand.length); n++) {
      for (const cards of combinations(hand, n)) {
        const ev = api.evaluate(cards, state);
        const ht = api.HAND_TYPES[ev.type];
        const lvl = state.handLevels[ev.type] || 1;
        const baseChips = ht.chips + ht.up[0] * (lvl - 1);
        const baseMult = ht.mult + ht.up[1] * (lvl - 1);
        const cardChips = ev.scoringCards.reduce((sum, c) =>
          sum + (c.rank === "A" ? 11 : Math.min(10, RANK_VAL[c.rank])), 0);
        const proxy = (baseChips + cardChips) * baseMult;
        const row = { cards, proxy };
        ranked.push(row);
        if (!byType.has(ev.type) || proxy > byType.get(ev.type).proxy) byType.set(ev.type, row);
        if (!bySize.has(n) || proxy > bySize.get(n).proxy) bySize.set(n, row);
      }
    }
    ranked.sort((a, b) => b.proxy - a.proxy);
    const shortlist = [...ranked.slice(0, 8), ...byType.values(), ...bySize.values()];
    const seen = new Set();
    let best = 0;
    for (const row of shortlist) {
      const key = row.cards.map(c => c.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      best = Math.max(best, scoreSelection(row.cards, state).total);
    }
    return best;
  }

  /* 单牌保留价值只用于生成少量弃牌候选；最终取舍仍由真实计分器的期望得分决定。 */
  function cardKeepValue(card, hand) {
    const rankN = hand.filter(c => c.rank === card.rank).length;
    const suitN = hand.filter(c => c.suit === card.suit).length;
    const maxGap = G.jokers.some(j => j.id === "shortcut") ? 2 : 1;
    const near = hand.filter(c => c !== card && Math.abs(RANK_VAL[c.rank] - RANK_VAL[card.rank]) <= maxGap).length;
    let v = (rankN - 1) * 12 + (suitN - 1) * 2 + near * 3 + RANK_VAL[card.rank] / 10;
    if (card.enh === "steel") v += 12;
    else if (card.enh === "gold") v += 8;
    else if (card.enh) v += 5;
    if (card.rank === "K" && G.jokers.some(j => j.id === "baron")) v += 24;
    if (card.rank === "Q" && G.jokers.some(j => j.id === "shoot_the_moon")) v += 20;
    if (["J", "Q", "K"].includes(card.rank) && G.jokers.some(j => j.id === "canio")) v -= 12;
    return v;
  }

  function discardCandidates(hand) {
    const maxDiscard = Math.min(5, hand.length, G.deck.length || 0);
    if (!maxDiscard) return [];
    const out = [], seen = new Set();
    const add = cards => {
      const use = cards.slice(0, maxDiscard);
      if (!use.length) return;
      const key = use.map(c => c.id).sort().join("|");
      if (!seen.has(key)) { seen.add(key); out.push(use); }
    };
    const lowFirst = hand.slice().sort((a, b) => cardKeepValue(a, hand) - cardKeepValue(b, hand));
    for (const n of new Set([1, Math.min(3, maxDiscard), maxDiscard])) add(lowFirst.slice(0, n));

    for (const suit of ["♠", "♥", "♣", "♦"]) {
      if (hand.filter(c => c.suit === suit).length < 2) continue;
      add(hand.filter(c => c.suit !== suit)
        .sort((a, b) => cardKeepValue(a, hand) - cardKeepValue(b, hand)));
    }

    const rankCounts = {};
    hand.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
    const singles = hand.filter(c => rankCounts[c.rank] === 1)
      .sort((a, b) => cardKeepValue(a, hand) - cardKeepValue(b, hand));
    if (singles.length && singles.length < hand.length) add(singles);

    const maxGap = G.jokers.some(j => j.id === "shortcut") ? 2 : 1;
    let bestRun = [];
    for (let mask = 1; mask < (1 << hand.length); mask++) {
      const cards = hand.filter((c, i) => mask & (1 << i));
      const vals = [...new Set(cards.map(c => RANK_VAL[c.rank]))].sort((a, b) => a - b);
      if (vals.length !== cards.length || vals.length < 2 || vals.length > 4) continue;
      const ok = vals.every((v, i) => !i || v - vals[i - 1] <= maxGap);
      if (ok && vals.length > bestRun.length) bestRun = cards;
    }
    if (bestRun.length >= 2) {
      const ids = new Set(bestRun.map(c => c.id));
      add(hand.filter(c => !ids.has(c.id))
        .sort((a, b) => cardKeepValue(a, hand) - cardKeepValue(b, hand)));
    }
    return out;
  }

  /* 对未知牌堆做固定分层抽样：按稳定 id 排序，不偷看实际抽牌顺序，也不调用 rng()。 */
  function sampledDraws(count) {
    if (count <= 0) return [[]];
    const pool = G.deck.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (pool.length < count) return [pool];
    const sampleN = tier === "expert" ? 3 : 2;
    const out = [], seen = new Set();
    for (let s = 0; s < sampleN; s++) {
      const used = new Set(), draw = [];
      for (let k = 0; k < count; k++) {
        let idx = (s * 7 + k * Math.max(1, Math.floor(pool.length / count))) % pool.length;
        while (used.has(idx)) idx = (idx + 1) % pool.length;
        used.add(idx); draw.push(pool[idx]);
      }
      const key = draw.map(c => c.id).sort().join("|");
      if (!seen.has(key)) { seen.add(key); out.push(draw); }
    }
    return out;
  }

  function projectedState(discarded, held) {
    const state = {
      ...G, hand: held,
      discardsLeft: Math.max(0, G.discardsLeft - 1),
      roundDiscards: (G.roundDiscards || 0) + 1,
      jokers: G.jokers.map(j => ({ ...j })),
    };
    for (const j of state.jokers) {
      const def = JOKER_BY_ID.get(j.id);
      if (def?.onDiscard) def.onDiscard(discarded, state, j);
    }
    return state;
  }

  function bestDiscard(hand, mustFive = false) {
    if (tier === "novice" || !G.discardsLeft || !G.deck.length) return null;
    const now = rankedSelection(hand, mustFive);
    if (now && now.score >= Math.max(0, G.target - G.roundScore)) return null;
    let best = null;
    for (const cards of discardCandidates(hand)) {
      const ids = new Set(cards.map(c => c.id));
      const held = hand.filter(c => !ids.has(c.id));
      const missing = Math.max(0, G.curHandSize - held.length);
      const refillCap = G.currentBoss?.id === "serpent" ? Math.min(3, missing) : missing;
      const drawN = Math.min(refillCap, G.deck.length);
      const state = projectedState(cards, held);
      const scores = sampledDraws(drawN).map(draw => {
        const future = held.concat(draw);
        state.hand = future;
        return projectedBestScore(future, mustFive, state);
      });
      const expected = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (!best || expected > best.expected) best = { cards, expected };
    }
    if (!best) return null;
    const current = now?.score || 0;
    const threshold = tier === "expert" ? 1.06 : 1.15;
    return best.expected > current * threshold ? best.cards : null;
  }

  /* 回合中使用目标型消耗品：凑同花 / 给大牌上增强 */
  function useTargetedConsumables() {
    if (tier === "novice") return;
    for (const cons of G.consumables.slice()) {
      const def = api.consumableDef(cons.id);
      if (!def?.targets || G.state !== "playing") continue;
      const suit = SUIT_TAROT[def.id];
      if (suit) {
        const have = G.hand.filter(x => x.suit === suit).length;
        const others = G.hand.filter(x => x.suit !== suit);
        const convertible = Math.min(def.targets[1], others.length);
        const need = G.jokers.some(j => j.id === "four_fingers") ? 4 : 5;
        if (have >= need - convertible && have < need && others.length) {
          G.selected.clear();
          others.sort(byRankDesc).slice(0, need - have).forEach(x => G.selected.add(x.id));
          useConsumable(cons);
        }
      } else if (def.id === "emperor") {
        const rankCounts = {};
        G.hand.forEach(c => rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1);
        const ranks = Object.keys(RANK_VAL).sort((a, b) => RANK_VAL[a] - RANK_VAL[b]);
        const target = G.hand.filter(c => {
          const next = ranks[(ranks.indexOf(c.rank) + 1) % ranks.length];
          return rankCounts[next] > 0;
        }).slice(0, def.targets[1]);
        if (target.length) {
          G.selected.clear();
          target.forEach(c => G.selected.add(c.id));
          useConsumable(cons);
        }
      } else if (def.id === "hanged") {
        const target = G.hand.filter(c => !c.enh)
          .sort((a, b) => cardKeepValue(a, G.hand) - cardKeepValue(b, G.hand))
          .slice(0, def.targets[1]);
        if (target.length) {
          G.selected.clear();
          target.forEach(c => G.selected.add(c.id));
          useConsumable(cons);
        }
      } else if (["lovers", "chariot", "justice", "devil", "aura", "cryptid"].includes(def.id)) {
        const lowTarget = def.id === "justice" || def.id === "devil";
        const target = G.hand.filter(x => !x.enh)
          .sort(lowTarget ? (a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank] : byRankDesc)[0]
          || G.hand.slice().sort(byRankDesc)[0];
        if (target) {
          G.selected.clear();
          G.selected.add(target.id);
          useConsumable(cons);
        }
      }
    }
    G.selected.clear();
  }

  /* expert：把 ×倍率 小丑排到结算末端 */
  function orderJokers() {
    if (tier !== "expert" || G.jokers.length < 2) return;
    G.jokers.sort((a, b) => (XMULT_IDS.has(a.id) ? 1 : 0) - (XMULT_IDS.has(b.id) ? 1 : 0));
    // 蓝图逐一试复制目标，用当前手牌真实得分决定位置，而非假定最右小丑一定最强。
    const bp = G.jokers.findIndex(j => j.id === "blueprint");
    if (bp >= 0) {
      const [blueprint] = G.jokers.splice(bp, 1);
      const base = G.jokers.slice();
      let bestOrder = null, bestScore = -1;
      for (let target = 0; target < base.length; target++) {
        const order = base.slice();
        order.splice(target, 0, blueprint);
        G.jokers = order;
        const score = rankedSelection(G.hand, G.currentBoss?.id === "psychic")?.score || 0;
        if (score > bestScore) { bestScore = score; bestOrder = order; }
      }
      G.jokers = bestOrder || base.concat(blueprint);
    }
  }

  const HAND_SYNERGY = {
    pair: new Set(["sly", "jolly", "duo"]),
    three_kind: new Set(["wily", "zany", "trio"]),
    flush: new Set(["crafty", "droll"]),
    straight: new Set(["crazy"]),
  };

  function jokerValue(item) {
    const def = item.def || JOKER_BY_ID.get(item.id);
    let value = RARITY_W[def.rarity] * 3 + def.cost * 0.25;
    if (XMULT_IDS.has(def.id)) value += 3;
    if (def.money) value += 2;
    if (def.retrigger || def.heldCard) value += 1.5;
    if (def.id === "blueprint") value += G.jokers.some(j => j.id !== "blueprint") ? 5 : 0;
    const favourite = Object.entries(G.handPlayCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (favourite && HAND_SYNERGY[favourite]?.has(def.id)) value += 4;
    if (item.ed === "poly") value += 5;
    else if (item.ed === "holo") value += 3;
    else if (item.ed === "foil") value += 2;
    if (item.state) value += Math.min(4, Number(item.state) / 5);
    return value;
  }

  function consumableValue(id) {
    const values = {
      judgement: 14, tower: 12, strength: 9, hermit: 8, temperance: 8, empress: 6,
      hanged: 7, emperor: 6, chariot: 6, lovers: 5, justice: 5, devil: 5,
      sun: 4, star: 4, moon: 4, world: 4,
    };
    return (values[id] || 1) + (id === "hermit" ? Math.min(5, G.money / 4) : 0);
  }

  function packChoiceIndex() {
    const pk = G.pendingPack;
    if (!pk?.choices?.length) return -1;
    let values;
    if (pk.kind === "celestial") {
      values = pk.choices.map(id => {
        const p = api.PLANETS.find(x => x.id === id);
        return (G.handPlayCounts[p.hand] || 0) * 10 + G.handLevels[p.hand];
      });
    } else if (pk.kind === "buffoon") {
      values = pk.choices.map(id => jokerValue({ def: JOKER_BY_ID.get(id) }));
    } else {
      values = pk.choices.map(consumableValue);
    }
    let best = 0;
    for (let i = 1; i < values.length; i++) if (values[i] > values[best]) best = i;
    return best;
  }

  function botShop(depth = 0) {
    if (tier === "novice") {
      for (const item of G.shopStock) {
        if (item.sold || item.kind !== "joker") continue;
        const price = item.def.cost + (item.ed ? api.EDITIONS[item.ed].costUp : 0);
        if (G.jokers.length < G.maxJokers && G.money >= price) buyItem(item, price);
      }
      return;
    }
    for (const cons of G.consumables.slice()) {
      const def = api.consumableDef(cons.id);
      if (def.apply) useConsumable(cons);
    }
    // 槽满时用弱小丑换商店里的高价值小丑（阈值 2：更低会频繁半价换卡亏钱）
    const sellThreshold = 2;
    for (const item of G.shopStock) {
      if (item.sold || item.kind !== "joker" || G.jokers.length < G.maxJokers) continue;
      const price = item.def.cost + (item.ed ? api.EDITIONS[item.ed].costUp : 0);
      if (G.money < price) continue;
      const worst = G.jokers.slice().sort((a, b) => jokerValue(a) - jokerValue(b))[0];
      if (jokerValue(item) - jokerValue(worst) >= sellThreshold) sellJoker(worst);
    }
    // expert 优先买高价值小丑；standard 按货架顺序
    const stock = tier === "expert"
      ? G.shopStock.slice().sort((a, b) =>
          (b.kind === "joker" ? jokerValue(b) : 0) - (a.kind === "joker" ? jokerValue(a) : 0))
      : G.shopStock;
    for (const item of stock) {
      if (item.sold) continue;
      const price = item.kind === "planet" ? api.BALANCE.planetPrice
        : item.kind === "joker" ? item.def.cost + (item.ed ? api.EDITIONS[item.ed].costUp : 0)
        : item.def.cost;
      if (item.kind === "joker" && G.jokers.length < G.maxJokers && G.money >= price) buyItem(item, price);
      else if (item.kind === "planet") {
        // expert 对口牌型降低购买门槛（不设上限限制——星球是廉价必买品）
        const top = tier === "expert"
          ? Object.entries(G.handPlayCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0])
          : [];
        const bar = top.includes(item.def.hand) ? 2 : 4;
        if (G.money >= price + bar) buyItem(item, price);
      }
      else if (item.kind === "voucher" && G.money >= price + 6) buyItem(item, price);
      else if (item.kind === "pack" && G.money >= price + 8 &&
          (item.def.kind === "celestial" ||
           (item.def.kind === "arcana" && G.consumables.length < G.maxConsumables) ||
           (item.def.kind === "buffoon" && G.jokers.length < G.maxJokers))) {
        buyItem(item, price);
        if (G.pendingPack && choosePackOption(packChoiceIndex()) !== true) skipPack();
      }
    }
    // expert: 只在持有闪卡时用超过 $20 储备的闲钱刷新一次，兼顾成长与复利。
    if (tier === "expert" && G.jokers.some(j => j.id === "flash_card") &&
        depth < 1 && G.money >= G.rerollCost + 20 &&
        !G.shopStock.some(i => !i.sold && i.kind === "joker" && G.jokers.length < G.maxJokers && G.money >= i.def.cost)) {
      if (api.doReroll()) botShop(depth + 1);
    }
  }

  /* 自动打一整局；opts.grantJoker 开局白送小丑（单卡实验），opts.mode 游戏模式 */
  async function simulate(seed, deckId = "classic", opts = {}) {
    const maxRounds = opts.maxRounds || 60;
    newGameState(seed);
    G.mode = api.MODES.some(m => m.id === opts.mode) ? opts.mode : "normal";
    const deck = api.DECKS.find(d => d.id === deckId) || api.DECKS[0];
    G.deckId = deck.id;
    deck.apply(G);
    if (opts.grantJoker) G.jokers.push({ id: opts.grantJoker, uid: "grant0" });
    pickBoss();
    const violations = [];
    const bossesFaced = [];
    let prevLvlSum = 0;
    const mk = () => ({
      result: null, ante: G.ante, round: G.round, money: G.money,
      jokers: G.jokers.map(j => j.id), vouchers: G.vouchers.slice(),
      deathBoss: G.blindIndex === 2 ? (G.currentBoss?.id ?? G.boss?.id ?? null) : null,
      deathBlind: G.blindIndex,
      scoreRatio: G.target ? Math.min(1, G.roundScore / G.target) : 0,
      handTypes: { ...G.handPlayCounts },
      bossesFaced: bossesFaced.slice(),
      bestHand: G.bestHand ? G.bestHand.total : 0,
      violations,
    });
    while (G.round < maxRounds) {
      startBlind(G.blindIndex);
      if (G.blindIndex === 2 && G.boss) bossesFaced.push(G.boss.id);
      orderJokers();
      let steps = 0;
      while (G.state === "playing" && steps++ < 24) {
        useTargetedConsumables();
        const mustFive = G.currentBoss?.id === "psychic";
        let sel = bestSelection(G.hand, mustFive);
        const throwAway = bestDiscard(G.hand, mustFive);
        if (throwAway) {
          G.selected.clear();
          throwAway.forEach(x => G.selected.add(x.id));
          discard();
          continue;
        }
        if (!sel) sel = G.hand.slice(0, Math.min(5, G.hand.length));
        G.selected.clear();
        sel.forEach(x => G.selected.add(x.id));
        await playHand();
        if (G.money < 0) violations.push(`金钱为负: ${G.money}`);
        if (!Number.isFinite(G.roundScore)) violations.push(`分数非法: ${G.roundScore}`);
        const lvlSum = Object.values(G.handLevels).reduce((a, b) => a + b, 0);
        if (lvlSum < prevLvlSum) violations.push(`牌型等级回退: ${lvlSum} < ${prevLvlSum}`);
        prevLvlSum = lvlSum;
      }
      if (G.state === "roundwon") {
        elements["cashout-btn"].onclick();
        if (G.state === "over") return { ...mk(), result: "win" };
        botShop();
        elements["next-round-btn"].onclick();
      } else if (G.state === "over") {
        return { ...mk(), result: "lose" };
      } else {
        return { ...mk(), result: "stuck:" + G.state };
      }
    }
    return { ...mk(), result: "cap" };
  }

  return { bestSelection, bestDiscard, packChoiceIndex, botShop, simulate };
}

module.exports = { elements, compileGame, enableFastClock, makeBot, ROOT, SOURCES };
