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
   standard : 组合识别 + 弃牌换手 + 塔罗 + 全品类采购
   expert   : standard 之上再加 小丑排序 / 择优购卡 / 星球针对性升级
   ========================================================= */
function makeBot(api, tier = "standard") {
  const { G, RANK_VAL, JOKER_BY_ID, playHand, discard, startBlind, buyItem,
    useConsumable, choosePackOption, skipPack, newGameState, pickBoss, sellJoker } = api;
  const byRankDesc = (a, b) => RANK_VAL[b.rank] - RANK_VAL[a.rank];
  const RARITY_W = { common: 1, uncommon: 2, rare: 3, legendary: 4 };
  const SUIT_TAROT = { sun: "♥", star: "♦", moon: "♣", world: "♠" };
  /* ×倍率 生效在结算末端收益最大——expert 把它们排到右边 */
  const XMULT_IDS = new Set(["blackboard", "baron_red", "cavendish", "duo", "trio", "canio", "acrobat", "baron"]);

  function bestSelection(hand, mustFive) {
    if (tier === "novice") {
      const sel = hand.slice(0, Math.min(5, hand.length));
      return mustFive && sel.length !== 5 ? null : sel;
    }
    const bySuit = {};
    hand.forEach(x => (bySuit[x.suit] ||= []).push(x));
    // 持有四指时 4 张同花即可成型（修复该卡单卡实验数据失真）
    const flushNeed = G.jokers.some(j => j.id === "four_fingers") ? 4 : 5;
    for (const s in bySuit) {
      if (bySuit[s].length >= flushNeed) return bySuit[s].sort(byRankDesc).slice(0, 5);
    }
    const byRank = {};
    hand.forEach(x => (byRank[x.rank] ||= []).push(x));
    const groups = Object.values(byRank).sort((a, b) => b.length - a.length || RANK_VAL[b[0].rank] - RANK_VAL[a[0].rank]);
    let sel = [];
    for (const g of groups) {
      if (g.length >= 2 && sel.length + g.length <= 5) sel.push(...g);
    }
    if (!sel.length) sel = hand.slice().sort(byRankDesc).slice(0, 1);
    if (mustFive) {
      const rest = hand.filter(x => !sel.includes(x)).sort(byRankDesc);
      while (sel.length < 5 && rest.length) sel.push(rest.shift());
      if (sel.length !== 5) return null;
    }
    return sel;
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
        if (have >= 5 - convertible && have < 5 && others.length) {
          G.selected.clear();
          others.sort(byRankDesc).slice(0, 5 - have).forEach(x => G.selected.add(x.id));
          useConsumable(cons);
        }
      } else if (["lovers", "chariot", "justice", "devil", "aura"].includes(def.id)) {
        const target = G.hand.filter(x => !x.enh).sort(byRankDesc)[0];
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
    // 蓝图排到最右（最强）小丑的左侧以复制它（修复蓝图单卡数据失真）
    const bp = G.jokers.findIndex(j => j.id === "blueprint");
    if (bp >= 0 && bp !== G.jokers.length - 2) {
      const [x] = G.jokers.splice(bp, 1);
      G.jokers.splice(G.jokers.length - 1, 0, x);
    }
  }

  function jokerValue(item) {
    return RARITY_W[item.def.rarity] * 2 + (XMULT_IDS.has(item.def.id) ? 3 : 0) + (item.ed ? 1 : 0);
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
      const worst = G.jokers.slice()
        .sort((a, b) => RARITY_W[JOKER_BY_ID.get(a.id).rarity] - RARITY_W[JOKER_BY_ID.get(b.id).rarity])[0];
      if (RARITY_W[item.def.rarity] - RARITY_W[JOKER_BY_ID.get(worst.id).rarity] >= sellThreshold) sellJoker(worst);
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
      else if (item.kind === "pack" && G.money >= price + 8) {
        buyItem(item, price);
        if (G.pendingPack && choosePackOption(0) !== true) skipPack();
      }
    }
    // expert: 货架无可买小丑且现金富余时付费刷新找货（闪卡成长/高价值卡；修复闪卡数据失真）
    if (tier === "expert" && depth < 2 && G.money >= G.rerollCost + 8 &&
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
        if (tier !== "novice" && !mustFive && sel && sel.length <= 2 && G.discardsLeft > 0 && G.hand.length > 5) {
          const suitCounts = {};
          G.hand.forEach(x => suitCounts[x.suit] = (suitCounts[x.suit] || 0) + 1);
          const flushSuit = Object.keys(suitCounts).find(s => suitCounts[s] === 4);
          if (flushSuit) {
            const junk = G.hand.filter(x => x.suit !== flushSuit)
              .sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]).slice(0, 5);
            if (junk.length) {
              G.selected.clear();
              junk.forEach(x => G.selected.add(x.id));
              discard();
              continue;
            }
          }
        }
        if (tier !== "novice" && !mustFive && sel && sel.length <= 1 && G.discardsLeft > 0 && G.hand.length > 5) {
          G.selected.clear();
          G.hand.slice().sort((a, b) => RANK_VAL[a.rank] - RANK_VAL[b.rank]).slice(0, 5)
            .forEach(x => G.selected.add(x.id));
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

  return { bestSelection, botShop, simulate };
}

module.exports = { elements, compileGame, enableFastClock, makeBot, ROOT, SOURCES };
