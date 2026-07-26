// @ts-nocheck —— 测试走 node 直跑，类型检查只覆盖游戏源码
/* 回归测试：牌型 / 计分 / 塔罗 / 商店 / 存档迁移 / SW 资源校验 + 机器人整局模拟
   --fast: 全程快进时钟并跳过整局模拟，供日常迭代秒级反馈（提交前跑全量） */
const fs = require("fs");
const path = require("path");
const { elements, compileGame, enableFastClock, makeBot, ROOT } = require("./harness");
const FAST = process.argv.includes("--fast");

const api = compileGame();
const { G, evaluate, playHand, startBlind, discard, JOKER_DEFS, rollShop, rollEdition, buyItem,
  computeScoring, newGameState, newGame, skipBlind, blindTarget, seedRNG, rng, buildDeck,
  TAROTS, TAROT_BY_ID, BOSSES, VOUCHERS, EDITIONS, DECKS, HAND_TYPES,
  saveGame, loadGame, useConsumable, pickBoss, openPack, choosePackOption, skipPack, openShop,
  loadStats, recordGameEnd, markJokersSeen,
  ENH_CHIPS, ENH_MULT, ENH_STEEL_X, S, L } = api;

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) pass++;
  else { fail++; console.error("FAIL:", msg); }
}

const c = (rank, suit, extra) => ({ rank, suit, id: Math.random().toString(36), ...extra });

/* ---------- i18n ---------- */
assert(L({ zh: "甲", en: "A" }) === "甲", "默认中文");
assert(S("msg_destroyed", 2).includes("2"), "模板填充");
assert(S("__missing__") === "__missing__", "缺失键回退");

/* ---------- 牌型判定 ---------- */
assert(evaluate([c("A","♠"),c("A","♥"),c("A","♦"),c("A","♣"),c("K","♠")]).type === "four_kind", "四条");
assert(evaluate([c("A","♠"),c("A","♥"),c("K","♦"),c("K","♣"),c("K","♠")]).type === "full_house", "葫芦");
assert(evaluate([c("2","♠"),c("5","♠"),c("9","♠"),c("J","♠"),c("K","♠")]).type === "flush", "同花");
assert(evaluate([c("2","♠"),c("3","♥"),c("4","♦"),c("5","♣"),c("6","♠")]).type === "straight", "顺子");
assert(evaluate([c("A","♠"),c("2","♥"),c("3","♦"),c("4","♣"),c("5","♠")]).type === "straight", "A-5顺子");
assert(evaluate([c("10","♠"),c("J","♠"),c("Q","♠"),c("K","♠"),c("A","♠")]).type === "straight_flush", "同花顺");
assert(evaluate([c("7","♠"),c("7","♥"),c("7","♦")]).type === "three_kind", "三条");
assert(evaluate([c("7","♠"),c("7","♥"),c("2","♦"),c("2","♠")]).type === "two_pair", "两对");
assert(evaluate([c("7","♠"),c("7","♥")]).type === "pair", "对子");
assert(evaluate([c("7","♠"),c("K","♥")]).type === "high_card", "高牌");
assert(evaluate([c("7","♠"),c("K","♥")]).scoringCards[0].rank === "K", "高牌只计最大牌");
assert(evaluate([c("7","♠"),c("7","♥"),c("2","♦")]).scoringCards.length === 2, "对子计2张");

/* ---------- 可播种随机数 ---------- */
seedRNG(123);
const seqA = [rng(), rng(), rng()];
seedRNG(123);
const seqB = [rng(), rng(), rng()];
assert(seqA.every((v, i) => v === seqB[i]), "相同种子随机序列一致");
assert(seqA[0] !== seqA[1], "随机序列有变化");

newGameState(42); buildDeck();
const deck1 = G.deck.map(x => x.rank + x.suit).join(",");
newGameState(42); buildDeck();
const deck2 = G.deck.map(x => x.rank + x.suit).join(",");
assert(deck1 === deck2, "相同种子牌库洗牌顺序一致");

/* ---------- 底注目标（含无尽增长） ---------- */
newGameState(1);
assert(blindTarget(0) === 100, "底注1小盲目标100");
assert(blindTarget(1) === 150, "底注1大盲目标150");
assert(blindTarget(2) === 200, "底注1 Boss目标200");
G.ante = 8;
assert(blindTarget(0) === 26000, "底注8小盲目标26000");
G.ante = 10;
assert(blindTarget(0) === 105000, "底注10无尽增长 ×2.5: " + blindTarget(0));

/* ---------- Boss 同局不重复 ---------- */
newGameState(11);
const seen = new Set();
for (let i = 0; i < BOSSES.length; i++) { pickBoss(); seen.add(G.boss.id); }
assert(seen.size === BOSSES.length, "连续选 Boss 不重复: " + seen.size);
pickBoss();
assert(G.boss && G.seenBosses.length === 1, "池耗尽后重置再选");

/* ---------- 纯函数计分 ---------- */
newGameState(7);
let sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * 2, "对子基础计分 48: " + sc.total);
G.jokers = [{ id: "joker", uid: "t1" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * (2 + 4), "小丑+4倍率后 144: " + sc.total);
assert(sc.steps.length === 3, "计分步骤 2卡+1小丑");
G.jokers = [];

/* ---------- 卡牌增强计分 ---------- */
sc = computeScoring([c("K","♥", { enh: "bonus" })]);
assert(sc.total === (5 + 10 + ENH_CHIPS) * 1, "加成牌 +30 筹码: " + sc.total);
sc = computeScoring([c("K","♥", { enh: "mult" })]);
assert(sc.total === (5 + 10) * (1 + ENH_MULT), "倍率牌 +4 倍率: " + sc.total);
G.hand = [c("2","♠", { enh: "steel" })];
sc = computeScoring([c("K","♥")]);
assert(sc.total === Math.floor((5 + 10) * 1 * ENH_STEEL_X), "钢铁牌手中 ×1.5: " + sc.total);
assert(sc.steps.some(s => s.kind === "held"), "钢铁牌产生 held 步骤");
G.hand = [];

/* ---------- 重触发小丑 ---------- */
G.jokers = [{ id: "hack", uid: "r1" }];
sc = computeScoring([c("3","♠"), c("3","♥")]);
// 对3: 基础10筹码 + 每张3触发两次(3×4) = 22, ×2 = 44
assert(sc.total === (10 + 3 * 4) * 2, "黑客重触发 2/3/4/5: " + sc.total);
assert(sc.steps.filter(s => s.kind === "card").length === 4, "重触发产生4个卡步骤");
assert(sc.steps.some(s => s.again), "重触发步骤带 again 标记");
G.jokers = [{ id: "sock_buskin", uid: "r2" }];
sc = computeScoring([c("K","♠"), c("K","♥")]);
assert(sc.total === (10 + 10 * 4) * 2, "悲喜面具重触发人头牌: " + sc.total);
G.jokers = [{ id: "dusk", uid: "r3" }];
G.handsLeft = 0;
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 * 4) * 2, "黄昏最后一手全重触发: " + sc.total);
G.handsLeft = 4;
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 7 + 7) * 2, "黄昏非最后一手不触发: " + sc.total);
G.jokers = [];

/* ---------- 成长小丑 ---------- */
const gj = { id: "green_joker", uid: "g1" };
const ctxNoFace = { cards: [c("7","♠")], type: "high_card", playedCount: 1, hasPair: false, hasThree: false };
const defGreen = JOKER_DEFS.find(d => d.id === "green_joker");
defGreen.onPlay(ctxNoFace, G, gj);
defGreen.onPlay(ctxNoFace, G, gj);
assert(gj.state === 2, "绿色小丑出牌累计 +2");
defGreen.onDiscard([c("2","♠")], G, gj);
assert(gj.state === 1, "绿色小丑弃牌 -1");
assert(defGreen.after(ctxNoFace, G, gj).mult === 1, "绿色小丑 after 生效");

const bus = { id: "ride_the_bus", uid: "b1" };
const defBus = JOKER_DEFS.find(d => d.id === "ride_the_bus");
defBus.onPlay(ctxNoFace, G, bus);
defBus.onPlay(ctxNoFace, G, bus);
assert(bus.state === 2, "坐公交连续无人头累计");
defBus.onPlay({ ...ctxNoFace, cards: [c("K","♠")] }, G, bus);
assert(bus.state === 0, "坐公交遇人头重置");

const ice = { id: "ice_cream", uid: "i1", state: 19 };
const defIce = JOKER_DEFS.find(d => d.id === "ice_cream");
assert(defIce.after(ctxNoFace, G, ice).chips === 5, "冰淇淋剩 5 筹码");
assert(defIce.onPlay(ctxNoFace, G, ice) === "destroy", "冰淇淋融尽销毁");

const sq = { id: "square", uid: "s1" };
const defSq = JOKER_DEFS.find(d => d.id === "square");
defSq.onPlay({ ...ctxNoFace, playedCount: 4 }, G, sq);
assert(sq.state === 4 && defSq.after(ctxNoFace, G, sq).chips === 4, "方形小丑4张牌成长");

const flash = { id: "flash_card", uid: "f1" };
const defFlash = JOKER_DEFS.find(d => d.id === "flash_card");
defFlash.onReroll(G, flash);
assert(flash.state === 2 && defFlash.after(ctxNoFace, G, flash).mult === 2, "闪卡刷新成长");

/* ---------- 小丑版本 ---------- */
G.jokers = [{ id: "joker", uid: "e1", ed: "foil" }];
sc = computeScoring([c("K","♥")]);
assert(sc.total === (5 + 10 + 50) * (1 + 4), "闪箔 +50 筹码: " + sc.total);
G.jokers = [{ id: "joker", uid: "e2", ed: "poly" }];
sc = computeScoring([c("K","♥")]);
assert(sc.total === Math.floor(15 * (1 * 1.5 + 4)), "多彩 ×1.5 在自身效果前: " + sc.total);
G.jokers = [];
seedRNG(99);
let edOk = true;
for (let i = 0; i < 200; i++) {
  if (![null, "foil", "holo", "poly"].includes(rollEdition())) edOk = false;
}
assert(edOk, "版本掉落值合法");

/* ---------- 新牌型: 五条 / 同花葫芦 ---------- */
newGameState(7);
assert(evaluate([c("7","♠"),c("7","♥"),c("7","♦"),c("7","♣"),c("7","♠")]).type === "five_kind", "五条(混花色)");
assert(evaluate([c("7","♥"),c("7","♥"),c("7","♥"),c("7","♥"),c("7","♥")]).type === "flush_five", "同花五条优先于五条");
assert(evaluate([c("7","♥"),c("7","♥"),c("7","♥"),c("K","♥"),c("K","♥")]).type === "flush_house", "同花葫芦");
assert(evaluate([c("7","♥"),c("7","♠"),c("7","♥"),c("K","♥"),c("K","♥")]).type === "full_house", "混花色仍是普通葫芦");
sc = computeScoring([c("7","♠"),c("7","♥"),c("7","♦"),c("7","♣"),c("7","♠")]);
assert(sc.total === (120 + 7 * 5) * 12, "五条计分 120+35 ×12: " + sc.total);
assert(api.PLANETS.length === 12 && Object.keys(HAND_TYPES).every(h => api.PLANETS.some(p => p.hand === h)), "12张星球牌覆盖全部牌型");

/* ---------- 牌型规则小丑: 四指 / 抄近路 / 飞溅 ---------- */
const flush4 = [c("2","♠"),c("5","♠"),c("9","♠"),c("K","♠")];
assert(evaluate(flush4).type === "high_card", "无四指: 4张同花不成立");
G.jokers = [{ id: "four_fingers", uid: "ff" }];
assert(evaluate(flush4).type === "flush", "四指: 4张同花成立");
assert(evaluate([c("3","♠"),c("4","♥"),c("5","♦"),c("6","♣")]).type === "straight", "四指: 4张顺子成立");
G.jokers = [{ id: "shortcut", uid: "sc" }];
assert(evaluate([c("2","♠"),c("4","♥"),c("6","♦"),c("8","♣"),c("10","♠")]).type === "straight", "抄近路: 跳点顺子");
assert(evaluate([c("2","♠"),c("5","♥"),c("6","♦"),c("8","♣"),c("10","♠")]).type === "high_card", "抄近路: 跳2点不成立");
G.jokers = [{ id: "splash", uid: "sp" }];
let evSplash = evaluate([c("7","♠"),c("7","♥"),c("2","♦"),c("3","♣"),c("9","♠")]);
assert(evSplash.type === "pair" && evSplash.scoringCards.length === 5, "飞溅: 全部5张参与计分");
G.jokers = [];

/* ---------- 蓝图复制 ---------- */
G.jokers = [{ id: "blueprint", uid: "bp" }, { id: "joker", uid: "jk" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 4 + 4), "蓝图复制右侧+4倍率: " + sc.total);
G.jokers = [{ id: "joker", uid: "jk" }, { id: "blueprint", uid: "bp" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 4), "蓝图右侧无小丑则无效果: " + sc.total);
G.jokers = [{ id: "blueprint", uid: "b1" }, { id: "blueprint", uid: "b2" }, { id: "joker", uid: "jk" }];
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (10 + 14) * (2 + 12), "蓝图链式复制: " + sc.total);
G.jokers = [];

/* ---------- 持有类小丑: 男爵 / 射月 / 高举拳头 ---------- */
G.jokers = [{ id: "baron", uid: "ba" }];
G.hand = [c("K","♠"), c("K","♥"), c("2","♦")];
sc = computeScoring([c("7","♥")]);
// 高牌基础5 + 卡7 = 12 筹码, 倍率 1×1.5×1.5 = 2.25
assert(sc.total === Math.floor((5 + 7) * 2.25), "男爵: 手中2张K ×1.5×1.5: " + sc.total);
assert(sc.steps.filter(s => s.kind === "heldJoker").length === 2, "男爵产生2个 heldJoker 步骤");
G.jokers = [{ id: "shoot_the_moon", uid: "sm" }];
G.hand = [c("Q","♠")];
sc = computeScoring([c("7","♥")]);
assert(sc.total === (5 + 7) * (1 + 13), "射月: 手中Q +13倍率: " + sc.total);
G.jokers = [{ id: "raised_fist", uid: "rf" }];
G.hand = [c("3","♠"), c("K","♥")];
sc = computeScoring([c("7","♥")]);
assert(sc.total === (5 + 7) * (1 + 6), "高举拳头: 最小点数3 ×2 加倍率: " + sc.total);
G.jokers = []; G.hand = [];

/* ---------- 徒步者: 计分牌永久成长 ---------- */
newGameState(23);
const hikerJ = { id: "hiker", uid: "hk" };
const defHiker = JOKER_DEFS.find(d => d.id === "hiker");
const permCard = G.masterDeck[0];
G.hand = [];
defHiker.onPlay({ cards: [permCard], scoringCards: [permCard] }, G, hikerJ);
defHiker.onPlay({ cards: [permCard], scoringCards: [permCard] }, G, hikerJ);
assert(G.masterDeck[0].perm === 10, "徒步者: 母牌库永久 +10 筹码");
sc = computeScoring([{ ...G.masterDeck[0] }]);
const baseChip = (r => r === "A" ? 11 : (api.RANK_VAL[r] >= 11 ? 10 : api.RANK_VAL[r]))(G.masterDeck[0].rank);
assert(sc.total === (5 + baseChip + 10) * 1, "永久筹码参与计分: " + sc.total);

/* ---------- 起始牌组 ---------- */
newGame(1, "red");
assert(G.bonusDiscards === 1 && G.deckId === "red", "红牌组 +1 弃牌");
newGame(1, "blue");
assert(G.bonusHands === 1, "蓝牌组 +1 出牌");
newGame(1, "yellow");
assert(G.money === 10, "黄牌组开局 $10");
newGame(1, "ghost");
assert(G.consumables.length === 1 && TAROT_BY_ID.has(G.consumables[0].id), "幽灵牌组开局塔罗");
newGame(1, "nonsense");
assert(G.deckId === "classic", "未知牌组回退经典");

/* ---------- 全部禁用 → 0 分 ---------- */
newGameState(7);
G.currentBoss = BOSSES.find(b => b.id === "club");
sc = computeScoring([c("2","♣"), c("5","♣"), c("9","♣"), c("J","♣"), c("K","♣")]);
assert(sc.allDebuffed === true && sc.total === 0, "全禁用牌 0 分");
G.currentBoss = null;

/* ---------- 新 Boss 机制 ---------- */
assert(BOSSES.length === 14, "14 个 Boss");
G.currentBoss = BOSSES.find(b => b.id === "mark");
sc = computeScoring([c("K","♠"), c("K","♥")]);
assert(sc.allDebuffed === true, "印记: 人头牌全禁用");
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === 48, "印记: 非人头牌正常计分");
G.currentBoss = BOSSES.find(b => b.id === "flint");
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === (5 + 14) * 1, "燧石: 基础10/2减半为5/1: " + sc.total);
G.currentBoss = null;
// 蛇: 出牌后只补3张
newGameState(31);
G.boss = BOSSES.find(b => b.id === "serpent");
startBlind(2);
assert(G.hand.length === 8, "蛇: 开局仍发满8张");
// 通过 discard 间接验证蛇的补牌（弃后手上1张 → 只补到3张）
G.hand = [G.hand[0]];
G.selected.clear();
G.selected.add(G.hand[0].id);
discard();
assert(G.hand.length === 3, "蛇: 弃1张后只补到3张: " + G.hand.length);
// 猩红之心: 被禁用的小丑不参与计分
newGameState(33);
G.jokers = [{ id: "joker", uid: "cj1" }];
G.disabledJokerUid = "cj1";
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === 48, "猩红之心: 禁用小丑无加成: " + sc.total);
G.disabledJokerUid = null;
sc = computeScoring([c("7","♠"), c("7","♥")]);
assert(sc.total === 144, "解除禁用后恢复加成");
G.jokers = [];

/* ---------- 幻灵牌 ---------- */
assert(api.SPECTRALS.length === 5 && api.consumableDef("aura") && api.consumableDef("hermit"), "消耗品统一查询");
newGameState(35);
G.state = "shop"; G.money = 50;
const soulItem = { kind: "spectral", def: api.SPECTRAL_BY_ID.get("the_soul"), sold: false };
G.shopStock = [soulItem];
buyItem(soulItem, soulItem.def.cost);
assert(G.consumables.length === 1, "幻灵牌进消耗品槽");
assert(useConsumable(G.consumables[0]) === true, "灵魂使用成功");
assert(G.jokers.length === 1 && JOKER_DEFS.find(d => d.id === G.jokers[0].id).rarity === "legendary", "灵魂: 获得传奇小丑");
// 槽满时灵魂不可用且不消耗
G.jokers = JOKER_DEFS.slice(0, 5).map((d, i) => ({ id: d.id, uid: "s" + i }));
G.consumables = [{ id: "the_soul", uid: "so2" }];
assert(useConsumable(G.consumables[0]) === false && G.consumables.length === 1, "灵魂: 槽满不消耗");
G.jokers = []; G.consumables = [];
// 献祭
const deckBefore = G.masterDeck.length;
const moneyBefore = G.money;
G.consumables = [{ id: "immolate", uid: "im1" }];
assert(useConsumable(G.consumables[0]) === true, "献祭使用成功");
assert(G.masterDeck.length === deckBefore - 5 && G.money === moneyBefore + 20, "献祭: -5张牌 +$20");
// 谜影复制
G.state = "playing";
G.hand = [{ ...G.masterDeck[0] }];
G.selected = new Set([G.hand[0].id]);
G.consumables = [{ id: "cryptid", uid: "cr1" }];
assert(useConsumable(G.consumables[0]) === true, "谜影使用成功");
assert(G.masterDeck.length === deckBefore - 5 + 2, "谜影: 牌库 +2 副本");

/* ---------- 新标签 ---------- */
assert(api.SKIP_TAGS.length === 7, "7 种标签");
newGameState(37);
const jokerTag = api.SKIP_TAGS.find(t => t.id === "joker_tag");
jokerTag.apply(G);
assert(G.jokers.length === 1, "小丑标签: 获得小丑");
G.jokers = JOKER_DEFS.slice(0, 5).map((d, i) => ({ id: d.id, uid: "t" + i }));
const m0money = G.money;
jokerTag.apply(G);
assert(G.money === m0money + 4, "小丑标签: 槽满改发 $4");
G.jokers = [];
api.SKIP_TAGS.find(t => t.id === "voucher_tag").apply(G);
assert(G.voucherDiscount === true, "折扣标签生效");
api.SKIP_TAGS.find(t => t.id === "investment_tag").apply(G);
assert(G.investment === 1, "投资标签生效");
api.SKIP_TAGS.find(t => t.id === "double_tag").apply(G);
assert(G.doubleTag === 1, "加倍标签生效");

/* ---------- 帮助页 ---------- */
assert(api.HELP_PAGES.length === 4 && api.HELP_PAGES.every(p => p.title.zh && p.title.en && p.body.zh && p.body.en), "帮助页 4 页双语齐全");

/* ---------- i18n 键覆盖：源码/HTML 引用的每个键都必须在字典中 ---------- */
{
  const dictSrc = fs.readFileSync(path.join(ROOT, "i18n.js"), "utf8");
  const dictKeys = new Set([...dictSrc.matchAll(/^  (\w+): *\{ *zh:/gm)].map(x => x[1]));
  const used = new Set();
  for (const f of ["defs.js", "engine.js", "audio.js", "ui.js", "main.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    [...src.matchAll(/\bS\("([\w]+)"/g)].forEach(x => used.add(x[1]));
  }
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  [...html.matchAll(/data-i18n="([\w]+)"/g)].forEach(x => used.add(x[1]));
  const missing = [...used].filter(k => !dictKeys.has(k));
  assert(missing.length === 0, "i18n 缺失键: " + missing.join(", "));
  // 反向：字典键必须被源码/HTML 以字符串引用，防孤儿键腐化
  const allSrc = ["defs.js", "engine.js", "audio.js", "ui.js", "main.js"].map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n") + html;
  const orphan = [...dictKeys].filter(k => !allSrc.includes(`"${k}"`));
  assert(orphan.length === 0, "i18n 孤儿键(无引用): " + orphan.join(", "));
  assert(used.size > 60, "i18n 扫描到足够多的键引用: " + used.size);
  // 双语完整性：每个字典键都要有 zh 和 en（条目可能跨行）
  const zhOnly = [...dictSrc.matchAll(/^  (\w+): *\{([\s\S]*?)\},$/gm)]
    .filter(m => !/\ben:/.test(m[2])).map(m => m[1]);
  assert(zhOnly.length === 0, "缺英文翻译的键: " + zhOnly.join(", "));
}

/* ---------- 游戏模式 ---------- */
assert(api.MODES.length === 3, "3 种模式");
// 快速模式: 4 底注 + 抽稀曲线
newGame(1, "classic", "quick");
assert(G.mode === "quick" && api.runMaxAnte() === 4, "快速模式 4 底注");
assert(blindTarget(0) === 100, "快速底注1 = 100");
G.ante = 2;
assert(blindTarget(0) === api.BALANCE.quickAnte[1], "快速底注2用专用曲线");
G.ante = 4;
assert(blindTarget(0) === api.BALANCE.quickAnte[3], "快速底注4用专用曲线");
G.ante = 5;
assert(blindTarget(0) === Math.floor(api.BALANCE.quickAnte[3] * api.BALANCE.endlessGrowth), "快速无尽按增速续走");
// Boss Rush 奖励补偿
newGame(2, "classic", "boss_rush");
assert(api.blindReward(0) === api.BALANCE.blindRewards[0] + 1, "BossRush 盲注奖励 +$1");
G.mode = "normal";
assert(api.blindReward(0) === api.BALANCE.blindRewards[0], "标准模式奖励不变");
// Boss Rush: 小盲/大盲也有 Boss,且每个盲注换 Boss
newGame(2, "classic", "boss_rush");
const rushBosses = [];
for (let i = 0; i < 2; i++) {
  startBlind(i);
  assert(G.currentBoss !== null, `BossRush 盲注${i}有Boss减益`);
  rushBosses.push(G.currentBoss.id);
  G.state = "shop";
}
startBlind(2);
assert(G.currentBoss !== null, "BossRush Boss盲注正常");
rushBosses.push(G.currentBoss.id);
assert(new Set(rushBosses).size === 3, "BossRush 三个盲注 Boss 各不相同: " + rushBosses.join(","));
G.ante = 1;
assert([100, 150].includes(Math.floor(blindTarget(0))) || blindTarget(0) >= 100, "BossRush 小盲目标用原倍率");
// 无效模式回退 + 存档往返
newGame(3, "classic", "nonsense2");
assert(G.mode === "normal", "未知模式回退标准");
newGame(4, "classic", "quick");
G.state = "blind-select";
saveGame();
newGameState(1);
assert(loadGame() === true && G.mode === "quick", "模式随存档恢复");
localStorage.removeItem("joker_save_v1");
// 每周种子: 确定性 + 与每日不同
assert(api.weekSeed() === api.weekSeed(), "weekSeed 确定性");
assert(api.weekSeed() !== api.todaySeed(), "周种子 ≠ 日种子");
assert(Number.isInteger(api.weekSeed()) && api.weekSeed() > 0, "weekSeed 是正整数");

/* ---------- 大数显示 ---------- */
assert(api.fmt(1234) === "1,234", "fmt 千分位");
assert(api.fmt(2.5e9) === "2.50B", "fmt 十亿级: " + api.fmt(2.5e9));
assert(api.fmt(1.23e13) === "1.23e13", "fmt 科学计数: " + api.fmt(1.23e13));
assert(api.fmt(Infinity) === "∞", "fmt 无穷");

/* ---------- 无尽显示与深无尽护栏 ---------- */
newGameState(49);
G.endless = true;
api.renderStats();
assert(elements["ante-max"].textContent === "", "无尽模式隐藏底注上限");
G.endless = false;
api.renderStats();
assert(elements["ante-max"].textContent === "/8", "标准模式显示 /8");
G.ante = 500;
assert(Number.isFinite(blindTarget(0)) && blindTarget(0) <= Number.MAX_SAFE_INTEGER, "深无尽目标夹紧在安全整数内");

/* ---------- 成就 ---------- */
localStorage.removeItem("joker_stats_v1");
assert(api.ACHIEVEMENTS.length === 13, "13 个成就");
assert(api.awardAchievement("big_hand") === true, "首次解锁成就");
assert(api.awardAchievement("big_hand") === false, "重复解锁被拒");
assert(loadStats().achievements.includes("big_hand"), "成就持久化");
newGameState(41);
G.deckId = "red"; G.ante = 9; G.endless = false;
recordGameEnd(true);
let ach = loadStats();
assert(ach.achievements.includes("first_win") && ach.deckWins.red === true, "通关成就 + 牌组胜利记录");
G.ante = 12; G.endless = true;
recordGameEnd(false);
assert(loadStats().achievements.includes("endless12"), "无尽底注12成就");
G.money = 60; G.jokers = [];
saveGame();
assert(loadStats().achievements.includes("rich"), "$50 成就（saveGame 检查点）");
G.jokers = [{ id: "canio", uid: "lg1" }];
saveGame();
assert(loadStats().achievements.includes("legendary"), "传奇小丑成就");
G.jokers = [];
markJokersSeen(JOKER_DEFS.map(d => d.id));
assert(loadStats().achievements.includes("collector"), "图鉴集齐成就");
// 模式与挑战成就
newGameState(43);
G.mode = "quick"; G.ante = 5;
recordGameEnd(true);
assert(loadStats().achievements.includes("quick_win"), "快速通关成就");
G.mode = "boss_rush"; G.ante = 9;
recordGameEnd(true);
assert(loadStats().achievements.includes("rush_win"), "BossRush 通关成就");
G.mode = "normal";
G.seed = api.todaySeed(); recordGameEnd(false);
assert(!loadStats().achievements.includes("challenger"), "只玩每日不解锁挑战者");
G.seed = api.weekSeed(); recordGameEnd(false);
assert(loadStats().achievements.includes("challenger"), "每日+每周解锁挑战者");
// 图鉴分区收录
api.markSeen("seenConsumables", ["aura", "hermit"]);
api.markSeen("seenVouchers", ["crate"]);
const colStats = loadStats();
assert(colStats.seenConsumables.length === 2 && colStats.seenVouchers.length === 1, "塔罗/优惠券收录");
localStorage.removeItem("joker_stats_v1");
localStorage.removeItem("joker_save_v1");

/* ---------- 存档搁置 / 恢复 ---------- */
newGameState(45);
G.state = "blind-select"; G.money = 33;
saveGame();
assert(api.parkCurrentSave() === true, "搁置成功");
assert(localStorage.getItem("joker_save_v1") === null && api.hasParkedSave(), "搁置后主存档清空");
newGameState(46);
G.money = 1;
assert(api.restoreParkedSave() === true, "恢复搁置成功");
assert(G.money === 33 && !api.hasParkedSave(), "恢复后金钱与搁置位状态正确");
localStorage.removeItem("joker_save_v1");
assert(api.parkCurrentSave() === false, "无进行局时搁置返回 false");
localStorage.removeItem("joker_save_parked");

/* ---------- 持久化牌库 + 塔罗改牌 ---------- */
newGameState(13);
assert(G.masterDeck.length === 52, "母牌库52张");
const m0 = G.masterDeck[0];
G.hand = [{ ...m0 }];
G.deck = [];
TAROT_BY_ID.get("sun").applyCards([G.hand[0]], G);
assert(G.hand[0].suit === "♥" && G.masterDeck[0].suit === "♥", "太阳: 手牌与母牌库同步变红桃");
buildDeck();
assert(G.deck.find(x => x.id === m0.id).suit === "♥", "改动在下回合牌库中保留");

const aceCard = G.masterDeck.find(x => x.rank === "A");
G.hand = [{ ...aceCard }];
TAROT_BY_ID.get("emperor").applyCards([G.hand[0]], G);
assert(G.hand[0].rank === "2", "皇帝: A→2 回绕");

G.hand = [{ ...G.masterDeck[5] }];
TAROT_BY_ID.get("justice").applyCards([G.hand[0]], G);
assert(G.masterDeck[5].enh === "steel", "正义: 附加钢铁增强");
G.hand = [{ ...G.masterDeck[8] }];
TAROT_BY_ID.get("devil").applyCards([G.hand[0]], G);
assert(G.masterDeck[8].enh === "gold", "恶魔: 附加黄金增强");

G.hand = [{ ...G.masterDeck[6] }, { ...G.masterDeck[7] }];
TAROT_BY_ID.get("hanged").applyCards(G.hand.slice(), G);
assert(G.masterDeck.length === 50 && G.hand.length === 0, "吊人: 永久销毁2张");

/* ---------- 跳过盲注奖励 ---------- */
newGameState(9);
G.boss = BOSSES[0];
const before = { money: G.money, reroll: G.freeReroll, lvls: Object.values(G.handLevels).reduce((a, b) => a + b, 0) };
const tag = skipBlind();
assert(!!tag && G.blindIndex === 1, "跳过推进并返回标签");
const changed = G.money > before.money || G.freeReroll > before.reroll ||
  Object.values(G.handLevels).reduce((a, b) => a + b, 0) > before.lvls;
assert(changed, "跳过奖励已生效");

/* ---------- 塔罗购买进入消耗品槽 + 使用 ---------- */
newGameState(3);
G.state = "shop";
const hermit = { kind: "tarot", def: TAROT_BY_ID.get("hermit"), sold: false };
G.shopStock = [hermit];
G.money = 10;
buyItem(hermit, 4);
assert(G.money === 6 && G.consumables.length === 1, "购买塔罗进入消耗品槽");
assert(useConsumable(G.consumables[0]) === true, "使用隐者成功");
assert(G.money === 12 && G.consumables.length === 0, "隐者: $6 翻倍为 $12");
G.consumables = [{ id: "sun", uid: "x1" }];
assert(useConsumable(G.consumables[0]) === false && G.consumables.length === 1, "目标塔罗需在回合中使用");
G.consumables = [];

/* ---------- 优惠券 ---------- */
newGameState(15);
G.state = "shop"; G.money = 50;
const crate = { kind: "voucher", def: VOUCHERS.find(v => v.id === "crate"), sold: false };
G.shopStock = [crate];
buyItem(crate, crate.def.cost);
assert(G.maxConsumables === 3 && G.vouchers.includes("crate"), "手提箱: 消耗品槽 +1");
const retainer = { kind: "voucher", def: VOUCHERS.find(v => v.id === "retainer"), sold: false };
G.shopStock = [retainer];
buyItem(retainer, retainer.def.cost);
assert(G.maxJokers === 6, "伙伴合约: 小丑槽 +1");
const compound = { kind: "voucher", def: VOUCHERS.find(v => v.id === "compound"), sold: false };
G.shopStock = [compound];
buyItem(compound, compound.def.cost);
assert(G.interestCap === 10, "复利: 利息上限 $10");

/* ---------- 商店库存构成 ---------- */
newGameState(17);
rollShop();
assert(G.shopStock.filter(i => i.kind === "joker").length === 2, "默认2张小丑");
assert(G.shopStock.some(i => i.kind === "planet") && G.shopStock.some(i => i.kind === "tarot"), "含星球与塔罗");
assert(G.shopStock.some(i => i.kind === "pack") && G.shopStock.some(i => i.kind === "voucher"), "含卡包与优惠券");
G.vouchers = ["overstock"];
rollShop();
assert(G.shopStock.filter(i => i.kind === "joker").length === 3, "超额库存: 3张小丑");

/* ---------- 商店刷新（doReroll：按钮与机器人共用） ---------- */
newGameState(29);
G.state = "shop"; G.money = 10; G.rerollCost = 5;
rollShop();
assert(api.doReroll() === true && G.money === 5 && G.rerollCost === 6, "付费刷新扣费加价");
G.freeReroll = 1;
assert(api.doReroll() === true && G.money === 5 && G.freeReroll === 0 && G.rerollCost === 6, "免费刷新不扣钱不加价");
G.money = 0;
assert(api.doReroll() === false, "没钱刷不动");
localStorage.removeItem("joker_save_v1");

/* ---------- 卡包 ---------- */
newGameState(19);
openPack("arcana");
assert(G.pendingPack && G.pendingPack.choices.length === 3, "塔罗包3个选项");
assert(choosePackOption(0) === true && G.consumables.length === 1 && !G.pendingPack, "选取塔罗入槽");
openPack("celestial");
const beforeLvls = JSON.stringify(G.handLevels);
assert(choosePackOption(1) === true, "选取星球牌");
assert(JSON.stringify(G.handLevels) !== beforeLvls, "星球包立即升级牌型");
openPack("buffoon");
G.jokers = JOKER_DEFS.slice(0, 5).map((d, i) => ({ id: d.id, uid: "f" + i }));
assert(choosePackOption(0) === "full", "小丑槽满返回 full");
skipPack();
assert(!G.pendingPack, "放弃卡包清空");
G.jokers = [];

/* ---------- 跨局统计 / 图鉴 / 历史 ---------- */
localStorage.removeItem("joker_stats_v1");
markJokersSeen(["joker", "banner"]);
assert(loadStats().seenJokers.length === 2, "图鉴记录见过的小丑");
newGameState(21);
G.ante = 3; G.bestHand = { type: "pair", total: 500 }; G.deckId = "red";
recordGameEnd(false);
const st = loadStats();
assert(st.games === 1 && st.bestAnte === 3 && st.bestScore === 500, "战绩统计记录");
assert(st.history.length === 1 && st.history[0].seed === 21 && st.history[0].deck === "red", "对局历史记录");
for (let i = 0; i < 12; i++) recordGameEnd(false);
assert(loadStats().history.length === 10, "历史最多10条");

/* ---------- 存档迁移（v2 / v3 旧档能加载） ---------- */
const v2save = {
  money: 8, ante: 2, round: 4, blindIndex: 1, bossId: "hook",
  jokers: [{ id: "joker", uid: "old1" }],
  handLevels: Object.fromEntries(Object.keys(HAND_TYPES).map(k => [k, 1])),
  handPlayCounts: { pair: 3 }, seed: 42, rngState: 42,
  handSize: 8, bonusHands: 0, bonusDiscards: 0, freeReroll: 0, state: "other",
};
localStorage.setItem("joker_save_v1", JSON.stringify(v2save));
assert(loadGame() === true, "v2 旧档可加载");
assert(G.money === 8 && G.ante === 2 && G.jokers.length === 1, "v2 基础字段恢复");
assert(G.masterDeck.length === 52, "v2 无母牌库 → 重建52张");
assert(G.maxJokers === 5 && G.maxConsumables === 2 && G.interestCap === 5, "v2 新字段取默认");
assert(Array.isArray(G.vouchers) && G.vouchers.length === 0 && G.deckId === "classic", "v2 优惠券/牌组默认");

const v3save = { ...v2save, v: 3, masterDeck: G.masterDeck, consumables: [{ id: "hermit", uid: "c1" }], seenBosses: ["hook"], endless: false, bestHand: { type: "pair", total: 99 } };
localStorage.setItem("joker_save_v1", JSON.stringify(v3save));
assert(loadGame() === true, "v3 旧档可加载");
assert(G.consumables.length === 1 && G.seenBosses.length === 1 && G.bestHand.total === 99, "v3 字段恢复");
// v4 档（无 mode/soldCount/搁置字段时代）
const v4save = { ...v3save, v: 4, vouchers: ["crate"], maxJokers: 5, maxConsumables: 3, interestCap: 5, deckId: "red" };
localStorage.setItem("joker_save_v1", JSON.stringify(v4save));
assert(loadGame() === true, "v4 旧档可加载");
assert(G.mode === "normal" && G.soldCount === 0 && G.deckId === "red" && G.maxConsumables === 3, "v4 新字段取默认、旧字段恢复");
localStorage.removeItem("joker_save_v1");
// v5 档（无商店快照时代）：正常加载并回到盲注选择
const v5save = { ...v4save, v: 5, mode: "quick", soldCount: 3 };
localStorage.setItem("joker_save_v1", JSON.stringify(v5save));
assert(loadGame() === true, "v5 旧档可加载");
assert(G.mode === "quick" && G.soldCount === 3 && G.state === "blind-select" && G.shopStock.length === 0, "v5 无商店快照 → 回盲注选择");
localStorage.removeItem("joker_save_v1");

/* ---------- v6: 商店中存档 / 读档（刷新不再错过商店） ---------- */
newGameState(61);
G.state = "shop"; G.money = 30;
rollShop();
G.shopStock[0].sold = true;
G.rerollCost = 7;
saveGame();
const shopKey = i => (i.def.id || i.def.kind) + ":" + (i.ed || "") + ":" + !!i.sold;
const shopSnap = G.shopStock.map(shopKey).join(",");
newGameState(1);
assert(loadGame() === true && G.state === "shop", "商店存档恢复到商店: " + G.state);
assert(G.shopStock.map(shopKey).join(",") === shopSnap, "商店货架一致恢复（含已售/版本）");
assert(G.rerollCost === 7, "刷新价随档恢复");
localStorage.removeItem("joker_save_v1");
// 佩尔科：读档回商店不重复触发进店复制
newGameState(63);
G.jokers = [{ id: "perkeo", uid: "pk" }];
G.consumables = [{ id: "hermit", uid: "h1" }];
openShop();
assert(G.consumables.length === 2, "佩尔科进店复制一次");
newGameState(1);
assert(loadGame() === true && G.state === "shop" && G.consumables.length === 2, "商店读档不重跑佩尔科钩子");
localStorage.removeItem("joker_save_v1");
// 猩红之心：回合中读档保留被禁用的小丑
newGameState(65);
G.jokers = [{ id: "joker", uid: "cj" }];
G.boss = BOSSES.find(b => b.id === "crimson");
startBlind(2);
assert(G.disabledJokerUid === "cj", "猩红之心开局禁用小丑");
saveGame();
newGameState(1);
assert(loadGame() === true && G.disabledJokerUid === "cj", "回合中读档保留禁用小丑");
localStorage.removeItem("joker_save_v1");
// v6 档（商店快照、无 cashout/pendingPlay 时代）
const v6save = { ...v5save, v: 6, state: "shop",
  shop: { stock: [{ kind: "tarot", id: "hermit", ed: null, sold: false }, { kind: "joker", id: "joker", ed: "foil", sold: true }], rerollCost: 4 } };
localStorage.setItem("joker_save_v1", JSON.stringify(v6save));
assert(loadGame() === true && G.state === "shop" && G.shopStock.length === 2, "v6 旧档恢复商店");
assert(G.shopStock[1].ed === "foil" && G.shopStock[1].sold === true && G.rerollCost === 4, "v6 货架字段恢复");
localStorage.removeItem("joker_save_v1");
// 坏档/导入防御：masterDeck 非法条目被过滤
const dirtySave = { ...v5save, v: 7, masterDeck: [{ suit: "♠", rank: "A", id: "m0" }, { bad: 1 }, null, { suit: "X", rank: "A", id: "m1" }] };
localStorage.setItem("joker_save_v1", JSON.stringify(dirtySave));
assert(loadGame() === true && G.masterDeck.length === 1 && G.masterDeck[0].id === "m0", "坏档牌库条目被过滤: " + G.masterDeck.length);
localStorage.removeItem("joker_save_v1");

/* ---------- SW 资源清单与缓存版本校验 ---------- */
{
  const swSrc = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const cacheName = (swSrc.match(/const CACHE = "([^"]+)"/) || [])[1];
  const assetList = [...swSrc.matchAll(/"\.\/([^"]*)"/g)].map(x => x[1]).filter(Boolean);
  assert(!!cacheName, "sw.js 有 CACHE 名");
  for (const a of assetList) {
    assert(fs.existsSync(path.join(ROOT, a)), `SW 资源存在: ${a}`);
  }
  const expected = ["index.html", "style.css", "i18n.js", "defs.js", "engine.js", "ui.js", "manifest.json", "icon.svg", "apple-touch-icon.png"];
  for (const f of expected) {
    assert(assetList.includes(f), `SW 清单包含: ${f}`);
  }
  // 版本单一来源：SW 缓存名必须等于 "joker-" + GAME_VERSION
  assert(cacheName === "joker-" + api.GAME_VERSION, `SW CACHE(${cacheName}) 与 GAME_VERSION(${api.GAME_VERSION}) 不一致`);
  // 语义：相对上一次提交（HEAD），若资源有改动则 CACHE 必须已升级——一个提交周期只需升一次
  try {
    const { execSync } = require("child_process");
    const headSw = execSync("git show HEAD:sw.js", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const headCache = (headSw.match(/const CACHE = "([^"]+)"/) || [])[1];
    if (headCache === cacheName) {
      const changed = execSync(`git status --porcelain -- ${assetList.join(" ")}`,
        { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
      assert(!changed, `静态资源相对 HEAD 已修改但 CACHE 仍为 "${cacheName}"，请升级版本号:\n${changed}`);
    } else {
      pass++;   // 本周期已升级缓存版本
    }
  } catch (e) { /* 无 git 环境时跳过 */ }
}

(async () => {
  if (FAST) enableFastClock();

  /* ---------- 回合流程 ---------- */
  newGameState(2026);
  G.boss = BOSSES[0];
  startBlind(0);
  assert(G.state === "playing", "进入回合");
  assert(G.hand.length === 8 && G.deck.length === 44, "发牌与牌库");
  assert(G.target === 100, "底注1小盲目标100");

  let safety = 0;
  while (G.state === "playing" && safety++ < 10) {
    G.selected.clear();
    G.hand.slice(0, Math.min(5, G.hand.length)).forEach(x => G.selected.add(x.id));
    const before = G.handsLeft;
    await playHand();
    assert(G.handsLeft === before - 1 || G.state !== "playing", "出牌次数递减");
  }
  console.log("回合结束后状态:", G.state, "分数:", G.roundScore, "目标:", G.target);
  assert(G.state !== "playing", "回合已结束");
  assert(G.bestHand && G.bestHand.total > 0, "最佳出牌已记录");

  /* ---------- 中途存档 / 读档 ---------- */
  newGameState(555);
  G.boss = BOSSES.find(b => b.id === "psychic");
  startBlind(0);
  G.selected.clear();
  G.hand.slice(0, 3).forEach(x => G.selected.add(x.id));
  await playHand();
  if (G.state === "playing") {
    saveGame();
    const snap = { hand: G.hand.map(x => x.rank + x.suit).join(","), handsLeft: G.handsLeft, score: G.roundScore, money: G.money };
    newGameState(1);
    assert(loadGame() === true, "读档成功");
    assert(G.state === "playing", "恢复到回合中");
    assert(G.hand.map(x => x.rank + x.suit).join(",") === snap.hand, "手牌一致恢复");
    assert(G.handsLeft === snap.handsLeft && G.roundScore === snap.score && G.money === snap.money, "回合数据一致恢复");
    assert(G.masterDeck.length === 52, "母牌库随档恢复");
  } else {
    console.log("(中途存档用例: 第一手即结束回合，跳过)");
  }
  localStorage.removeItem("joker_save_v1");

  /* ---------- 传奇：奇科禁用 Boss（AUDIT_EXEMPT，效果在 activeBossFor） ---------- */
  newGameState(777);
  G.boss = BOSSES.find(b => b.id === "water");
  startBlind(2);
  assert(G.currentBoss?.id === "water" && G.maxDiscards === 0, "无奇科: 流水正常清零弃牌");
  newGameState(777);
  G.jokers = [{ id: "chicot", uid: "jc" }];
  G.boss = BOSSES.find(b => b.id === "water");
  startBlind(2);
  assert(G.currentBoss === null, "奇科: Boss 盲注 currentBoss 置空");
  assert(G.maxDiscards > 0, "奇科: 流水弃牌限制失效");
  newGameState(778);
  G.jokers = [{ id: "chicot", uid: "jc" }];
  G.boss = BOSSES.find(b => b.id === "needle");
  startBlind(2);
  assert(G.maxHands > 1, "奇科: 针头出牌限制失效");
  // Boss Rush 每个盲注都是 Boss，同样被禁用；回合中读档保持禁用
  newGameState(779);
  G.mode = "boss_rush";
  G.jokers = [{ id: "chicot", uid: "jc" }];
  startBlind(0);
  assert(G.currentBoss === null, "奇科: Boss Rush 小盲也禁用");
  saveGame();
  newGameState(1);
  assert(loadGame() === true && G.currentBoss === null, "奇科: 回合中读档仍禁用");
  // 无奇科的 Boss Rush 回合中读档要恢复 Boss 减益（旧实现会丢）
  newGameState(780);
  G.mode = "boss_rush";
  startBlind(0);
  const brBoss = G.currentBoss?.id;
  saveGame();
  newGameState(1);
  assert(loadGame() === true && !!brBoss && G.currentBoss?.id === brBoss, "Boss Rush 回合中读档恢复 Boss 减益");
  localStorage.removeItem("joker_save_v1");

  /* ---------- 传奇：佩尔科复制消耗品（AUDIT_EXEMPT，onShopEnter 钩子） ---------- */
  newGameState(781);
  G.jokers = [{ id: "perkeo", uid: "jp" }];
  G.consumables = [{ id: "hermit", uid: "pc1" }];
  openShop();
  assert(G.consumables.length === 2 && G.consumables[1].id === "hermit", "佩尔科: 进店复制手中消耗品");
  assert(G.consumables[0].uid !== G.consumables[1].uid, "佩尔科: 复制体 uid 独立");
  openShop();
  assert(G.consumables.length === 2, "佩尔科: 槽满不复制");
  G.consumables = [];
  openShop();
  assert(G.consumables.length === 0, "佩尔科: 无消耗品不复制");
  localStorage.removeItem("joker_save_v1");

  /* ---------- 传奇：特里布莱 / 约里克数值 ---------- */
  newGameState(782);
  const kk = () => [c("K","♠"), c("K","♥")];
  const kkMult = computeScoring(kk(), G).mult;
  G.jokers = [{ id: "triboulet", uid: "tb" }];
  assert(computeScoring(kk(), G).mult === kkMult * 4, "特里布莱: 两张K共×4倍率");
  G.jokers = [{ id: "yorick", uid: "yk", state: 30 }];
  assert(computeScoring(kk(), G).mult === kkMult * 3, "约里克: 累计弃30张 ×3 倍率");
  const yk = { id: "yorick", uid: "yk2", state: 0 };
  JOKER_DEFS.find(d => d.id === "yorick").onDiscard([c("K","♠"), c("2","♥")], G, yk);
  assert(yk.state === 2, "约里克: 弃牌张数累计");
  G.jokers = [];

  /* ---------- 全部小丑牌回调不抛异常 ---------- */
  for (const def of JOKER_DEFS) {
    const ctx = { type: "pair", cards: [c("7","♠"), c("7","♥")], playedCount: 2, hasPair: true, hasThree: false, firstFace: null };
    const j = { id: def.id, uid: "t" };
    try {
      if (def.after) def.after(ctx, G, j);
      if (def.perCard) def.perCard(c("A","♥"), ctx, G, j);
      if (def.money) def.money(G, j);
      if (def.onDiscard) def.onDiscard([c("K","♠")], G, j);
      if (def.onPlay) def.onPlay(ctx, G, j);
      if (def.onReroll) def.onReroll(G, j);
      if (def.onShopEnter) def.onShopEnter(G, j);
      if (def.retrigger) def.retrigger(c("K","♠"), ctx, G, j);
      pass++;
    } catch (e) { fail++; console.error("FAIL joker:", def.id, e.message); }
  }

  /* ---------- 全小丑触发审计：每张计分类小丑必须在其目标场景真正生效 ---------- */
  newGameState(51);
  const trig = (jokerId, cards, o = {}) => {
    G.jokers = [{ id: jokerId, uid: "audit", state: o.state }];
    G.hand = o.hand || [];
    G.money = o.money ?? 0;
    G.discardsLeft = o.discardsLeft ?? 3;
    G.handsLeft = o.handsLeft ?? 3;
    G.handPlayCounts = o.plays || {};
    const r = computeScoring(cards);
    G.jokers = []; G.hand = [];
    return r;
  };
  const fired = r => r.steps.some(s => (s.kind === "joker" || s.kind === "heldJoker") && s.joker.uid === "audit");
  const retrig = (r, n) => r.steps.filter(s => s.kind === "card").length === n;
  const pair7 = () => [c("7","♠"), c("7","♥")];
  const SCEN = {
    joker: () => fired(trig("joker", pair7())),
    greedy: () => fired(trig("greedy", [c("7","♦")])),
    lusty: () => fired(trig("lusty", [c("7","♥")])),
    wrathful: () => fired(trig("wrathful", [c("7","♠")])),
    gluttonous: () => fired(trig("gluttonous", [c("7","♣")])),
    wily: () => fired(trig("wily", [c("7","♠"),c("7","♥"),c("7","♦")])),
    sly: () => fired(trig("sly", pair7())),
    crafty: () => fired(trig("crafty", [c("2","♠"),c("5","♠"),c("9","♠"),c("J","♠"),c("K","♠")]))
      && fired(trig("crafty", [c("7","♥"),c("7","♥"),c("7","♥"),c("K","♥"),c("K","♥")])),   // 含同花葫芦
    jolly: () => fired(trig("jolly", pair7())),
    zany: () => fired(trig("zany", [c("7","♠"),c("7","♥"),c("7","♦")])),
    droll: () => fired(trig("droll", [c("2","♠"),c("5","♠"),c("9","♠"),c("J","♠"),c("K","♠")]))
      && fired(trig("droll", [c("7","♥"),c("7","♥"),c("7","♥"),c("K","♥"),c("K","♥")])),
    crazy: () => fired(trig("crazy", [c("2","♠"),c("3","♥"),c("4","♦"),c("5","♣"),c("6","♠")])),
    half: () => fired(trig("half", [c("7","♠"),c("8","♥")])),
    banner: () => fired(trig("banner", pair7(), { discardsLeft: 2 })),
    mystic: () => fired(trig("mystic", pair7(), { discardsLeft: 0 })),
    fibonacci: () => fired(trig("fibonacci", [c("A","♠")])),
    scary_face: () => fired(trig("scary_face", [c("K","♠")])),
    even_steven: () => fired(trig("even_steven", [c("4","♠")])),
    odd_todd: () => fired(trig("odd_todd", [c("9","♠")])),
    blackboard: () => fired(trig("blackboard", [c("7","♠"),c("2","♣")])),
    baron_red: () => fired(trig("baron_red", [c("7","♥"),c("2","♦")])),
    cavendish: () => fired(trig("cavendish", pair7())),
    photograph: () => fired(trig("photograph", [c("K","♥")])),
    abstract: () => fired(trig("abstract", pair7())),
    bull: () => fired(trig("bull", pair7(), { money: 10 })),
    bootstraps: () => fired(trig("bootstraps", pair7(), { money: 10 })),
    golden: () => JOKER_DEFS.find(d => d.id === "golden").money(G, { id: "golden" }) === 4,
    supernova: () => fired(trig("supernova", pair7(), { plays: { pair: 4 } })),
    acrobat: () => fired(trig("acrobat", pair7(), { handsLeft: 0 })),
    duo: () => fired(trig("duo", pair7())),
    trio: () => fired(trig("trio", [c("7","♠"),c("7","♥"),c("7","♦")])),
    canio: () => fired(trig("canio", pair7(), { state: 1 })),
    triboulet: () => fired(trig("triboulet", [c("K","♠"),c("K","♥")]))
      && fired(trig("triboulet", [c("Q","♠"),c("Q","♥")])),
    yorick: () => fired(trig("yorick", pair7(), { state: 15 })),
    hack: () => retrig(trig("hack", [c("3","♠"),c("3","♥")]), 4),
    sock_buskin: () => retrig(trig("sock_buskin", [c("K","♠"),c("K","♥")]), 4),
    dusk: () => retrig(trig("dusk", pair7(), { handsLeft: 0 }), 4),
    green_joker: () => fired(trig("green_joker", pair7(), { state: 2 })),
    ride_the_bus: () => fired(trig("ride_the_bus", pair7(), { state: 2 })),
    ice_cream: () => fired(trig("ice_cream", pair7(), { state: 2 })),
    square: () => fired(trig("square", pair7(), { state: 4 })),
    flash_card: () => fired(trig("flash_card", pair7(), { state: 2 })),
    scholar: () => fired(trig("scholar", [c("A","♠")])),
    walkie_talkie: () => fired(trig("walkie_talkie", [c("10","♠")])) && fired(trig("walkie_talkie", [c("4","♠")])),
    baron: () => fired(trig("baron", [c("7","♠")], { hand: [c("K","♥")] })),
    shoot_the_moon: () => fired(trig("shoot_the_moon", [c("7","♠")], { hand: [c("Q","♥")] })),
    raised_fist: () => fired(trig("raised_fist", [c("7","♠")], { hand: [c("3","♥")] })),
  };
  // 规则改写/复制/卡牌成长类走 evaluate/onPlay，已在上方单测覆盖；奇科(activeBossFor)/佩尔科(onShopEnter)有专项单测
  const AUDIT_EXEMPT = new Set(["four_fingers", "shortcut", "splash", "blueprint", "hiker", "chicot", "perkeo"]);
  for (const def of JOKER_DEFS) {
    if (AUDIT_EXEMPT.has(def.id)) { pass++; continue; }
    if (!SCEN[def.id]) { fail++; console.error("FAIL 缺少触发审计场景:", def.id); continue; }
    assert(SCEN[def.id](), `触发审计: ${def.id}`);
  }

  /* ---------- 全部即时塔罗不抛异常 ---------- */
  for (const t of TAROTS.filter(x => x.apply)) {
    try { t.apply(G); pass++; }
    catch (e) { fail++; console.error("FAIL tarot:", t.id, e.message); }
  }

  /* ---------- 死局检测：牌库被销毁到极小后的三种残局 ---------- */
  enableFastClock();
  // A) 打光手牌与牌库、分数未达标 → 判负而非软锁
  newGameState(881);
  G.masterDeck = G.masterDeck.slice(0, 6);
  G.boss = BOSSES[0];
  startBlind(0);
  let dlGuard = 0;
  while (G.state === "playing" && G.hand.length && dlGuard++ < 6) {
    G.selected.clear();
    G.hand.slice(0, Math.min(3, G.hand.length)).forEach(x => G.selected.add(x.id));
    await playHand();
  }
  await new Promise(r => setTimeout(r, 30));
  assert(G.state === "over", "死局A: 打光牌后判负: " + G.state);
  // B) 弃光最后的手牌 → 判负（回归：曾误走 winRound 白拿过关）
  newGameState(883);
  G.masterDeck = G.masterDeck.slice(0, 6);
  G.boss = BOSSES[0];
  startBlind(0);
  G.selected.clear();
  G.hand.forEach(x => G.selected.add(x.id));
  discard();
  await new Promise(r => setTimeout(r, 30));
  assert(G.state === "over", "死局B: 弃光牌判负而非胜利: " + G.state);
  // C) 通灵者要求 5 张但全场凑不齐 → 开局即结算
  newGameState(885);
  G.masterDeck = G.masterDeck.slice(0, 4);
  G.boss = BOSSES.find(b => b.id === "psychic");
  startBlind(2);
  await new Promise(r => setTimeout(r, 30));
  assert(G.state === "over", "死局C: 通灵者凑不齐5张即结算: " + G.state);
  localStorage.removeItem("joker_save_v1");
  localStorage.removeItem("joker_stats_v1");

  /* ---------- v7: 结算屏与计分中断的存档保真 ---------- */
  // 结算屏中刷新 → 恢复待收取奖励，收取后正常进商店
  newGameState(887);
  G.boss = BOSSES[0];
  startBlind(0);
  G.roundScore = 500; G.target = 100;
  await api.winRound();
  assert(G.state === "roundwon" && G._cashout && G._cashout.earn > 0, "结算屏数据就绪");
  newGameState(1);
  assert(loadGame() === true && G.state === "roundwon" && G._cashout.earn > 0, "结算屏刷新后恢复待收取奖励");
  const cashMoney = G.money;
  elements["cashout-btn"].onclick();
  assert(G.money > cashMoney && G.state === "shop" && G.blindIndex === 1, "恢复后收取进商店");
  localStorage.removeItem("joker_save_v1");
  // 计分动画中刷新 → 自动重放同一手（防"看结果悔棋"）
  newGameState(891);
  G.boss = BOSSES[0];
  startBlind(0);
  G._pendingPlay = G.hand.slice(0, 2).map(c => c.id);
  saveGame();
  G._pendingPlay = null;
  newGameState(1);
  assert(loadGame() === true && G.state === "playing", "反悔锁档可加载");
  for (let w = 0; w < 300 && (G.scoring || G.roundScore === 0); w++) await new Promise(r => setTimeout(r, 5));
  assert(G.handsLeft === 3 && G.roundScore > 0, `重放自动完成: hands=${G.handsLeft} score=${G.roundScore}`);
  localStorage.removeItem("joker_save_v1");

  /* ---------- 种子全局模拟（快进时钟 + 策略机器人，覆盖不同起始牌组） ---------- */
  if (FAST) {
    console.log("(--fast: 跳过整局模拟)");
  } else {
    enableFastClock();
    const bot = makeBot(api);
    let bestAnte = 0;
    const deckIds = ["classic", "blue", "red"];
    for (const [i, seed] of [1001, 20260716, 777].entries()) {
      try {
        const { result, violations } = await bot.simulate(seed, deckIds[i]);
        bestAnte = Math.max(bestAnte, G.ante);
        console.log(`模拟 seed=${seed} ${deckIds[i]}: ${result}, 底注 ${G.ante}, 回合 ${G.round}, 小丑 ${G.jokers.length}, $${G.money}`);
        assert(["win", "lose", "cap"].includes(result), `模拟正常结束 (seed=${seed}): ${result}`);
        assert(violations.length === 0, `模拟无不变量违规 (seed=${seed}): ${violations.join("; ")}`);
      } catch (e) {
        fail++;
        console.error(`FAIL 模拟崩溃 (seed=${seed}):`, e.stack || e.message);
      }
    }
    assert(bestAnte >= 2, "机器人至少打到底注 2（覆盖商店/Boss路径）: " + bestAnte);
  }

  console.log("结果: " + pass + " 通过, " + fail + " 失败");
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
