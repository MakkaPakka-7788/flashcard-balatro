/* =========================================================
   小丑牌 · JOKER — 数据定义（牌型 / Boss / 小丑 / 星球 / 塔罗 / 卡包 / 优惠券 / 标签）
   name/desc 为 {zh, en} 双语对象，渲染时经 i18n.js 的 L() 取当前语言。
   加载顺序: i18n.js → defs.js → engine.js → ui.js
   ========================================================= */
"use strict";

/* 版本号：与 sw.js 的 CACHE("joker-" + 版本) 保持一致，由测试强制校验 */
const GAME_VERSION = "1.4.2";

/* ---------- 扑克常量 ---------- */
const SUITS = ["♠", "♥", "♣", "♦"];
const SUIT_NAME = {
  "♠": { zh: "黑桃", en: "Spades" },
  "♥": { zh: "红桃", en: "Hearts" },
  "♣": { zh: "梅花", en: "Clubs" },
  "♦": { zh: "方片", en: "Diamonds" },
};
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
const CHIP_VAL = r => r === "A" ? 11 : (RANK_VAL[r] >= 11 ? 10 : RANK_VAL[r]);

const HAND_TYPES = {
  flush_five:     { name: { zh: "同花五条", en: "Flush Five" },      chips: 160, mult: 16, up: [50, 3] },
  flush_house:    { name: { zh: "同花葫芦", en: "Flush House" },     chips: 140, mult: 14, up: [40, 4] },
  five_kind:      { name: { zh: "五条",     en: "Five of a Kind" },  chips: 120, mult: 12, up: [35, 3] },
  straight_flush: { name: { zh: "同花顺",   en: "Straight Flush" },  chips: 100, mult: 8,  up: [40, 4] },
  four_kind:      { name: { zh: "四条",     en: "Four of a Kind" },  chips: 60,  mult: 7,  up: [30, 3] },
  full_house:     { name: { zh: "葫芦",     en: "Full House" },      chips: 40,  mult: 4,  up: [25, 2] },
  flush:          { name: { zh: "同花",     en: "Flush" },           chips: 35,  mult: 4,  up: [15, 2] },
  straight:       { name: { zh: "顺子",     en: "Straight" },        chips: 30,  mult: 4,  up: [30, 3] },
  three_kind:     { name: { zh: "三条",     en: "Three of a Kind" }, chips: 30,  mult: 3,  up: [20, 2] },
  two_pair:       { name: { zh: "两对",     en: "Two Pair" },        chips: 20,  mult: 2,  up: [20, 1] },
  pair:           { name: { zh: "对子",     en: "Pair" },            chips: 10,  mult: 2,  up: [15, 1] },
  high_card:      { name: { zh: "高牌",     en: "High Card" },       chips: 5,   mult: 1,  up: [10, 1] },
};
/* 同花家族牌型（含隐藏牌型），crafty / droll 等「打出同花时」判定共用 */
const isFlushType = t => ["flush", "straight_flush", "flush_house", "flush_five"].includes(t);

/* 经 80 局×2 组机器人 A/B 对比调平的曲线（原 [.,.,.,2000,5000,11000,20000,35000,50000]
   在底注 5 有 39% 的死亡尖峰）：相邻倍率平滑递减 3.0→1.6 */
const ANTE_BASE = [100, 300, 800, 1800, 3800, 7500, 14000, 26000, 42000];
const MAX_ANTE = 8;

/* ---------- 可调平衡参数 ----------
   全部集中于此，test/balance.js 可用 --set key=value 覆盖后批量仿真做 A/B。
   boss 目标倍率按 Boss 单独可调（针头只能出 1 次牌，目标相应降低）。 */
const BALANCE = {
  startMoney: 4,
  baseHands: 4,
  baseDiscards: 3,
  handSize: 8,
  interestRate: 5,        // 每 $N 得 $1 利息
  interestCap: 5,
  compoundInterestCap: 10, // 复利优惠券后的利息上限（apply 与双语 desc 均由此插值）
  maxJokers: 5,           // 小丑槽位（伙伴合约优惠券 +1）
  maxConsumables: 2,      // 消耗品槽位（手提箱优惠券 +1）
  blindRewards: [3, 4, 5],
  rerollBase: 3,
  rerollClearance: 1,     // 清仓甩卖优惠券后的刷新起价
  bigBlindMult: 1.5,
  bossMult: 2,
  /* 个别 Boss 的目标倍率：针头只能出 1 次牌，目标不加倍（400 局数据显示 ×2 时
     其击杀率 38.7%，为其余 Boss 中位数的 3 倍） */
  bossMultOverride: { wall: 4, needle: 1 },
  endlessGrowth: 2.5,     // 无尽模式逐底注增速
  /* 快速模式专用曲线：直接抽稀标准曲线(100/800/3800/14000)时 51% 死在底注 3；
     放缓后按 300 局仿真定档在机器人胜率 ~10%（标准 3%，休闲定位） */
  quickAnte: [100, 500, 1800, 7500],
  /* Boss Rush 每个盲注都有减益，奖励每盲注 +$1 补偿（补偿后机器人胜率 0.7%→1.7%，困难定位） */
  bossRushRewardBonus: 1,
  rarityWeights: { common: 12, uncommon: 5, rare: 2, legendary: 1 },
  spectralChance: 0.15,   // 商店塔罗位变幻灵牌的概率
  planetPrice: 3,         // 商店星球牌统一售价（ui.renderShop 与测试机器人共用）
  editionRates: { poly: 0.03, holo: 0.07, foil: 0.10 },   // 小丑版本掉率（rollEdition 按累进阈值取）
  sellRatio: 0.5,         // 小丑卖出价 = cost × 该比例（下取整，至少 $1）
  tagCash: 3,             // 金钱标签的即时奖励
  tagJokerFull: 4,        // 小丑标签在槽满时的补偿金
  investmentPayout: 15,   // 投资标签击败 Boss 后的兑现额
  immolateMoney: 20,      // 幻灵牌·献祭的奖励金
  immolateFloor: 20,      // 献祭要求的牌库保底张数
};

/* ---------- 卡牌增强 ---------- */
const ENH_CHIPS = 30;      // 加成牌：计分时额外筹码
const ENH_MULT = 4;        // 倍率牌：计分时额外倍率
const ENH_STEEL_X = 1.5;   // 钢铁牌：留在手中时倍率乘数
const ENH_GOLD_MONEY = 3;  // 黄金牌：回合结束仍在手中时得钱
const ENH = {
  bonus: { name: { zh: "加成牌", en: "Bonus Card" }, icon: "🔷",
    desc: { zh: `计分时 +${ENH_CHIPS} 筹码`, en: `+${ENH_CHIPS} Chips when scored` } },
  mult:  { name: { zh: "倍率牌", en: "Mult Card" }, icon: "🔺",
    desc: { zh: `计分时 +${ENH_MULT} 倍率`, en: `+${ENH_MULT} Mult when scored` } },
  steel: { name: { zh: "钢铁牌", en: "Steel Card" }, icon: "🛡",
    desc: { zh: `留在手中时 ×${ENH_STEEL_X} 倍率`, en: `×${ENH_STEEL_X} Mult while held in hand` } },
  gold:  { name: { zh: "黄金牌", en: "Gold Card" }, icon: "💰",
    desc: { zh: `回合结束时若在手中 +$${ENH_GOLD_MONEY}`, en: `+$${ENH_GOLD_MONEY} if held in hand at end of round` } },
};

const RARITY_NAME = {
  common:    { zh: "普通", en: "Common" },
  uncommon:  { zh: "罕见", en: "Uncommon" },
  rare:      { zh: "稀有", en: "Rare" },
  legendary: { zh: "传奇", en: "Legendary" },
};

/* ---------- Boss 盲注 ---------- */
const BOSSES = [
  { id: "hook",   icon: "🪝", name: { zh: "钩子", en: "The Hook" },
    desc: { zh: "每次出牌后随机弃掉 2 张手牌", en: "Discards 2 random held cards after each played hand" } },
  { id: "club",   icon: "♣", name: { zh: "梅花", en: "The Club" },
    desc: { zh: "所有梅花牌被禁用（不计分）", en: "All Club cards are debuffed (no score)" } },
  { id: "goad",   icon: "♠", name: { zh: "刺棒", en: "The Goad" },
    desc: { zh: "所有黑桃牌被禁用（不计分）", en: "All Spade cards are debuffed (no score)" } },
  { id: "window", icon: "♦", name: { zh: "窗户", en: "The Window" },
    desc: { zh: "所有方片牌被禁用（不计分）", en: "All Diamond cards are debuffed (no score)" } },
  { id: "head",   icon: "♥", name: { zh: "头颅", en: "The Head" },
    desc: { zh: "所有红桃牌被禁用（不计分）", en: "All Heart cards are debuffed (no score)" } },
  { id: "psychic",icon: "🔮", name: { zh: "通灵者", en: "The Psychic" },
    desc: { zh: "每次必须打出 5 张牌", en: "Must play 5 cards every hand" } },
  { id: "manacle",icon: "⛓", name: { zh: "镣铐", en: "The Manacle" },
    desc: { zh: "手牌上限 -1", en: "-1 hand size" } },
  { id: "water",  icon: "💧", name: { zh: "流水", en: "The Water" },
    desc: { zh: "本回合弃牌次数为 0", en: "Start with 0 discards" } },
  { id: "needle", icon: "💉", name: { zh: "针头", en: "The Needle" },
    desc: { zh: "本回合只能出 1 次牌", en: "Play only 1 hand" } },
  { id: "wall",   icon: "🧱", name: { zh: "高墙", en: "The Wall" },
    desc: { zh: "目标分数特别高", en: "Extra large target score" } },
  { id: "mark",   icon: "🃏", name: { zh: "印记", en: "The Mark" },
    desc: { zh: "所有人头牌 (J/Q/K) 被禁用", en: "All face cards (J/Q/K) are debuffed" } },
  { id: "flint",  icon: "🪨", name: { zh: "燧石", en: "The Flint" },
    desc: { zh: "牌型的基础筹码和倍率减半", en: "Base Chips and Mult are halved" } },
  { id: "serpent",icon: "🐍", name: { zh: "蛇", en: "The Serpent" },
    desc: { zh: "出牌或弃牌后只补 3 张牌", en: "Draw only 3 cards after each play or discard" } },
  { id: "crimson",icon: "🫀", name: { zh: "猩红之心", en: "Crimson Heart" },
    desc: { zh: "每次出牌随机禁用一张小丑牌", en: "One random Joker is disabled every hand" } },
];

/* ---------- 盲注元数据（奖励金额见 BALANCE.blindRewards） ---------- */
const BLIND_META = [
  { name: { zh: "小盲注", en: "Small Blind" }, cls: "", chip: "" },
  { name: { zh: "大盲注", en: "Big Blind" }, cls: "big-blind", chip: "big" },
  { name: { zh: "Boss盲注", en: "Boss Blind" }, cls: "boss-blind", chip: "boss" },
];

/* ---------- 小丑牌定义 ---------- */
/**
 * 小丑牌回调契约（checkJs 用；新增回调字段先在此登记）
 * @typedef {Object} JokerDef
 * @property {string} id
 * @property {string} icon
 * @property {"common"|"uncommon"|"rare"|"legendary"} rarity
 * @property {number} cost
 * @property {{zh: string, en: string}} name
 * @property {{zh: string, en: string}} desc
 * @property {(ctx: any, g: any, j: any) => (JokerEffect | null | void)} [after]        牌型算完后
 * @property {(card: any, ctx: any, g: any, j: any) => (JokerEffect | null)} [perCard]  逐卡计分
 * @property {(card: any, g: any, j: any) => (JokerEffect | null)} [heldCard]           手中持有
 * @property {(card: any, ctx: any, g: any, j: any) => number} [retrigger]              额外触发次数
 * @property {(g: any, j: any) => number} [money]                                       回合结算得钱
 * @property {(ctx: any, g: any, j: any) => ("destroy" | void)} [onPlay]                每手结算后，可返回 "destroy"
 * @property {(cards: any[], g: any, j: any) => void} [onDiscard]                       弃牌时
 * @property {(g: any, j: any) => void} [onReroll]                                      商店刷新时
 * @property {(g: any, j: any) => (string | null | void)} [onShopEnter]                 进店时，返回本地化消息则提示
 * @property {(g: any, j: any) => ("destroy" | void)} [roundEnd]                        回合结束，可返回 "destroy"
 * @property {(j: any) => string} [stateText]                                           成长值展示
 * @property {"right"} [copy]          蓝图复制方向
 */
/** @typedef {{chips?: number, mult?: number, xmult?: number}} JokerEffect 计分回调的返回形状 */
/* trigger: perCard(逐卡计分时) / after(牌型算完后) / money(结算时) */
/** @type {JokerDef[]} */
const JOKER_DEFS = [
  { id: "joker", icon: "🃏", rarity: "common", cost: 3,
    name: { zh: "小丑", en: "Joker" },
    desc: { zh: "+4 倍率", en: "+4 Mult" },
    after: s => ({ mult: 4 }) },
  { id: "greedy", icon: "🤑", rarity: "common", cost: 5,
    name: { zh: "贪婪小丑", en: "Greedy Joker" },
    desc: { zh: "打出的每张方片牌 +3 倍率", en: "Played Diamond cards give +3 Mult" },
    perCard: (c) => c.suit === "♦" ? { mult: 3 } : null },
  { id: "lusty", icon: "😈", rarity: "common", cost: 5,
    name: { zh: "色欲小丑", en: "Lusty Joker" },
    desc: { zh: "打出的每张红桃牌 +3 倍率", en: "Played Heart cards give +3 Mult" },
    perCard: (c) => c.suit === "♥" ? { mult: 3 } : null },
  { id: "wrathful", icon: "😡", rarity: "common", cost: 5,
    name: { zh: "暴怒小丑", en: "Wrathful Joker" },
    desc: { zh: "打出的每张黑桃牌 +3 倍率", en: "Played Spade cards give +3 Mult" },
    perCard: (c) => c.suit === "♠" ? { mult: 3 } : null },
  { id: "gluttonous", icon: "😋", rarity: "common", cost: 5,
    name: { zh: "暴食小丑", en: "Gluttonous Joker" },
    desc: { zh: "打出的每张梅花牌 +3 倍率", en: "Played Club cards give +3 Mult" },
    perCard: (c) => c.suit === "♣" ? { mult: 3 } : null },
  { id: "wily", icon: "🧠", rarity: "common", cost: 4,
    name: { zh: "机智小丑", en: "Wily Joker" },
    desc: { zh: "打出的牌含三条时 +100 筹码", en: "+100 Chips if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { chips: 100 } : null },
  { id: "sly", icon: "🦊", rarity: "common", cost: 4,
    name: { zh: "狡猾小丑", en: "Sly Joker" },
    desc: { zh: "打出的牌含对子时 +50 筹码", en: "+50 Chips if hand contains a Pair" },
    after: (s) => s.hasPair ? { chips: 50 } : null },
  { id: "crafty", icon: "🛠", rarity: "common", cost: 4,
    name: { zh: "灵巧小丑", en: "Crafty Joker" },
    desc: { zh: "打出同花时 +80 筹码", en: "+80 Chips if hand contains a Flush" },
    after: (s) => isFlushType(s.type) ? { chips: 80 } : null },
  /* 500局单卡实验: 快乐 +0.42 偏强 → $5；滑稽 -0.01、古怪 +0.04 偏弱 → 各 $4 */
  { id: "jolly", icon: "😆", rarity: "common", cost: 5,
    name: { zh: "快乐小丑", en: "Jolly Joker" },
    desc: { zh: "打出的牌含对子时 +8 倍率", en: "+8 Mult if hand contains a Pair" },
    after: (s) => s.hasPair ? { mult: 8 } : null },
  { id: "zany", icon: "🤪", rarity: "common", cost: 4,
    name: { zh: "滑稽小丑", en: "Zany Joker" },
    desc: { zh: "打出的牌含三条时 +12 倍率", en: "+12 Mult if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { mult: 12 } : null },
  { id: "droll", icon: "🎭", rarity: "common", cost: 4,
    name: { zh: "古怪小丑", en: "Droll Joker" },
    desc: { zh: "打出同花时 +10 倍率", en: "+10 Mult if hand contains a Flush" },
    after: (s) => isFlushType(s.type) ? { mult: 10 } : null },
  { id: "crazy", icon: "🌀", rarity: "common", cost: 5,
    name: { zh: "疯狂小丑", en: "Crazy Joker" },
    desc: { zh: "打出顺子时 +12 倍率", en: "+12 Mult if hand contains a Straight" },
    after: (s) => s.type === "straight" || s.type === "straight_flush" ? { mult: 12 } : null },
  /* 500局单卡实验: 半张 +0.37、旗帜 +0.49，均高于普通卡替换基准(+0.21) → 各提 $1 */
  { id: "half", icon: "🌓", rarity: "common", cost: 6,
    name: { zh: "半张小丑", en: "Half Joker" },
    desc: { zh: "打出 ≤3 张牌时 +20 倍率", en: "+20 Mult if played hand has ≤3 cards" },
    after: (s) => s.playedCount <= 3 ? { mult: 20 } : null },
  { id: "banner", icon: "🚩", rarity: "common", cost: 6,
    name: { zh: "旗帜", en: "Banner" },
    desc: { zh: "每剩余 1 次弃牌 +30 筹码", en: "+30 Chips per remaining discard" },
    after: (s, g) => g.discardsLeft > 0 ? { chips: 30 * g.discardsLeft } : null },
  { id: "mystic", icon: "🏔", rarity: "common", cost: 5,
    name: { zh: "神秘峰会", en: "Mystic Summit" },
    desc: { zh: "弃牌次数为 0 时 +15 倍率", en: "+15 Mult when 0 discards remain" },
    after: (s, g) => g.discardsLeft === 0 ? { mult: 15 } : null },
  /* 500局单卡实验: 边际增益 +0.72，居罕见卡首位 → $8 提到 $9 */
  { id: "fibonacci", icon: "🐚", rarity: "uncommon", cost: 9,
    name: { zh: "斐波那契", en: "Fibonacci" },
    desc: { zh: "打出的每张 A/2/3/5/8 +8 倍率", en: "Each played A/2/3/5/8 gives +8 Mult" },
    perCard: (c) => ["A", "2", "3", "5", "8"].includes(c.rank) ? { mult: 8 } : null },
  { id: "scary_face", icon: "👻", rarity: "common", cost: 4,
    name: { zh: "鬼脸", en: "Scary Face" },
    desc: { zh: "打出的每张人头牌 +30 筹码", en: "Played face cards give +30 Chips" },
    perCard: (c) => ["J", "Q", "K"].includes(c.rank) ? { chips: 30 } : null },
  { id: "even_steven", icon: "2️⃣", rarity: "common", cost: 4,
    name: { zh: "偶数史蒂文", en: "Even Steven" },
    desc: { zh: "打出的每张偶数牌 (2,4,6,8,10) +4 倍率", en: "Played even cards (2,4,6,8,10) give +4 Mult" },
    perCard: (c) => ["2", "4", "6", "8", "10"].includes(c.rank) ? { mult: 4 } : null },
  { id: "odd_todd", icon: "3️⃣", rarity: "common", cost: 4,
    name: { zh: "奇数托德", en: "Odd Todd" },
    desc: { zh: "打出的每张奇数牌 (A,3,5,7,9) +31 筹码", en: "Played odd cards (A,3,5,7,9) give +31 Chips" },
    perCard: (c) => ["A", "3", "5", "7", "9"].includes(c.rank) ? { chips: 31 } : null },
  /* 300局实验: -0.21,低于替换基准 0.42 → $8 降 $6 */
  { id: "blackboard", icon: "🖤", rarity: "uncommon", cost: 6,
    name: { zh: "黑板", en: "Blackboard" },
    desc: { zh: "打出的牌全为黑色花色时 ×3 倍率", en: "×3 Mult if all played cards are black suits" },
    after: (s) => s.cards.every(c => c.suit === "♠" || c.suit === "♣") ? { xmult: 3 } : null },
  /* 300局实验: -0.29,与黑板对称同降 → $8 降 $6 */
  { id: "baron_red", icon: "👸", rarity: "uncommon", cost: 6,   // id 为历史遗留命名（与男爵无关），改 id 会破坏旧存档
    name: { zh: "红心女王", en: "Red Queen" },
    desc: { zh: "打出的牌全为红色花色时 ×3 倍率", en: "×3 Mult if all played cards are red suits" },
    after: (s) => s.cards.every(c => c.suit === "♥" || c.suit === "♦") ? { xmult: 3 } : null },
  { id: "cavendish", icon: "🍌", rarity: "uncommon", cost: 7,
    name: { zh: "卡文迪什", en: "Cavendish" },
    desc: { zh: "×3 倍率，回合结束有 1/6 概率被吃掉", en: "×3 Mult, 1 in 6 chance to be eaten at end of round" },
    after: () => ({ xmult: 3 }),
    roundEnd: (g, j) => { if (rng() < 1 / 6) return "destroy"; } },
  /* 500局单卡实验: 边际增益 +0.09，低于普通卡替换基准(+0.21) → $5 降到 $4 */
  { id: "photograph", icon: "📷", rarity: "common", cost: 4,
    name: { zh: "照片", en: "Photograph" },
    desc: { zh: "打出的第一张人头牌 ×2 倍率", en: "First played face card gives ×2 Mult" },
    perCard: (c, s) => (["J", "Q", "K"].includes(c.rank) && s.firstFace === c) ? { xmult: 2 } : null },
  /* 500局单卡实验: 边际增益 +0.78，居普通卡第二 → $6 提到 $7 */
  { id: "abstract", icon: "🎨", rarity: "common", cost: 7,
    name: { zh: "抽象小丑", en: "Abstract Joker" },
    desc: { zh: "每持有 1 张小丑牌 +3 倍率", en: "+3 Mult per Joker owned" },
    after: (s, g) => ({ mult: 3 * g.jokers.length }) },
  { id: "bull", icon: "🐂", rarity: "uncommon", cost: 6,
    name: { zh: "公牛", en: "Bull" },
    desc: { zh: "每持有 $1 +2 筹码", en: "+2 Chips per $1 owned" },
    after: (s, g) => g.money > 0 ? { chips: 2 * g.money } : null },
  { id: "bootstraps", icon: "👢", rarity: "uncommon", cost: 7,
    name: { zh: "自力更生", en: "Bootstraps" },
    desc: { zh: "每持有 $5 +2 倍率", en: "+2 Mult per $5 owned" },
    after: (s, g) => Math.floor(g.money / 5) > 0 ? { mult: 2 * Math.floor(g.money / 5) } : null },
  /* 500局单卡实验: 黄金 +0.63、超新星 +0.56，均明显偏强 → 各提 $1 */
  { id: "golden", icon: "🪙", rarity: "common", cost: 8,
    name: { zh: "黄金小丑", en: "Golden Joker" },
    desc: { zh: "回合结束时获得 $4", en: "Earn $4 at end of round" },
    money: () => 4 },
  { id: "supernova", icon: "💥", rarity: "uncommon", cost: 7,
    name: { zh: "超新星", en: "Supernova" },
    desc: { zh: "本局该牌型之前每打出过 1 次 +1 倍率", en: "+1 Mult per time this hand type was previously played" },
    after: (s, g) => {
      const n = (g.handPlayCounts[s.type] || 1) - 1;  // 不含本次
      return n > 0 ? { mult: n } : null;
    } },
  { id: "acrobat", icon: "🤸", rarity: "uncommon", cost: 8,
    name: { zh: "杂技演员", en: "Acrobat" },
    desc: { zh: "最后一次出牌时 ×3 倍率", en: "×3 Mult on the final hand of the round" },
    after: (s, g) => g.handsLeft === 0 ? { xmult: 3 } : null },
  { id: "duo", icon: "👯", rarity: "rare", cost: 10,
    name: { zh: "二重奏", en: "The Duo" },
    desc: { zh: "打出的牌含对子时 ×2 倍率", en: "×2 Mult if hand contains a Pair" },
    after: (s) => s.hasPair ? { xmult: 2 } : null },
  /* 300局实验: -0.32,独立价值低于稀有定位 → $10 降 $8 */
  { id: "trio", icon: "🎻", rarity: "rare", cost: 8,
    name: { zh: "三重奏", en: "The Trio" },
    desc: { zh: "打出的牌含三条时 ×3 倍率", en: "×3 Mult if hand contains Three of a Kind" },
    after: (s) => s.hasThree ? { xmult: 3 } : null },
  /* 500局单卡实验: 边际增益 +1.16 居全卡第一 → 保守从 $15 提到 $16 */
  { id: "canio", icon: "🎪", rarity: "legendary", cost: 16,
    name: { zh: "卡尼奥", en: "Canio" },
    desc: { zh: "×1 倍率，每弃掉一张人头牌永久 +0.5", en: "×1 Mult, gains +0.5 permanently per discarded face card" },
    after: (s, g, j) => ({ xmult: 1 + (j.state || 0) }),
    stateText: j => `×${(1 + (j.state || 0)).toFixed(1)}`,
    onDiscard: (cards, g, j) => { j.state = (j.state || 0) + cards.filter(c => ["J", "Q", "K"].includes(c.rank)).length * 0.5; } },
  { id: "triboulet", icon: "🤹", rarity: "legendary", cost: 18,
    name: { zh: "特里布莱", en: "Triboulet" },
    desc: { zh: "打出的每张 K 和 Q ×2 倍率", en: "Each played King or Queen gives ×2 Mult" },
    perCard: c => c.rank === "K" || c.rank === "Q" ? { xmult: 2 } : null },
  { id: "yorick", icon: "💀", rarity: "legendary", cost: 15,
    name: { zh: "约里克", en: "Yorick" },
    desc: { zh: "×1 倍率，每累计弃掉 15 张牌永久 ×1", en: "×1 Mult, gains ×1 permanently per 15 cards discarded" },
    after: (s, g, j) => ({ xmult: 1 + Math.floor((j.state || 0) / 15) }),
    stateText: j => `×${1 + Math.floor((j.state || 0) / 15)} (${(j.state || 0) % 15}/15)`,
    onDiscard: (cards, g, j) => { j.state = (j.state || 0) + cards.length; } },
  /* 效果实现在 engine.activeBossFor：Boss 盲注开始时若在场则 currentBoss 置空 */
  { id: "chicot", icon: "🤡", rarity: "legendary", cost: 16,
    name: { zh: "奇科", en: "Chicot" },
    desc: { zh: "Boss 盲注的负面效果失效", en: "Disables every Boss Blind effect" } },
  { id: "perkeo", icon: "🍷", rarity: "legendary", cost: 14,
    name: { zh: "佩尔科", en: "Perkeo" },
    desc: { zh: "进入商店时，若消耗品有空位，复制一张手中随机消耗品", en: "Duplicates a random held consumable when entering the shop, if a slot is free" },
    onShopEnter: g => {
      if (!g.consumables.length || g.consumables.length >= g.maxConsumables) return null;
      const src = g.consumables[Math.floor(rng() * g.consumables.length)];
      const def = consumableDef(src.id);
      g.consumables.push({ id: src.id, uid: "t" + Date.now() + Math.random().toString(36).slice(2, 5) });
      return S("msg_perkeo_copy", `${def.icon} ${L(def.name)}`);
    } },

  /* --- 重触发类: retrigger(card, ctx, g, j) 返回额外触发次数 --- */
  { id: "hack", icon: "💻", rarity: "uncommon", cost: 6,
    name: { zh: "黑客", en: "Hack" },
    desc: { zh: "打出的每张 2/3/4/5 重新触发一次", en: "Retrigger each played 2, 3, 4 or 5" },
    retrigger: c => ["2", "3", "4", "5"].includes(c.rank) ? 1 : 0 },
  { id: "sock_buskin", icon: "👺", rarity: "uncommon", cost: 7,
    name: { zh: "悲喜面具", en: "Sock and Buskin" },
    desc: { zh: "打出的每张人头牌重新触发一次", en: "Retrigger each played face card" },
    retrigger: c => ["J", "Q", "K"].includes(c.rank) ? 1 : 0 },
  { id: "dusk", icon: "🌆", rarity: "uncommon", cost: 7,
    name: { zh: "黄昏", en: "Dusk" },
    desc: { zh: "最后一次出牌时，所有牌重新触发一次", en: "Retrigger all played cards on the final hand of the round" },
    retrigger: (c, s, g) => g.handsLeft === 0 ? 1 : 0 },

  /* --- 成长类: onPlay(ctx, g, j) 在每手结算后调用，可返回 "destroy" --- */
  /* 500局单卡实验: 边际增益 +0.79 居普通卡第一 → $6 提到 $7 */
  { id: "green_joker", icon: "🥒", rarity: "common", cost: 7,
    name: { zh: "绿色小丑", en: "Green Joker" },
    desc: { zh: "每出一手牌 +1 倍率，每弃一次牌 -1 倍率", en: "+1 Mult per hand played, -1 Mult per discard" },
    stateText: j => `+${j.state || 0} ${S("mult_word")}`,
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onPlay: (s, g, j) => { j.state = (j.state || 0) + 1; },
    onDiscard: (cards, g, j) => { j.state = Math.max(0, (j.state || 0) - 1); } },
  { id: "ride_the_bus", icon: "🚌", rarity: "common", cost: 5,
    name: { zh: "坐公交", en: "Ride the Bus" },
    desc: { zh: "每连续打出一手不含人头牌的牌 +1 倍率，打出人头牌则重置", en: "+1 Mult per consecutive hand without face cards; resets when a face card is played" },
    stateText: j => `+${j.state || 0} ${S("mult_word")}`,
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onPlay: (s, g, j) => {
      if (s.cards.some(c => ["J", "Q", "K"].includes(c.rank))) j.state = 0;
      else j.state = (j.state || 0) + 1;
    } },
  { id: "ice_cream", icon: "🍦", rarity: "common", cost: 4,
    name: { zh: "冰淇淋", en: "Ice Cream" },
    desc: { zh: "+100 筹码，每出一手牌融化 -5，融尽后消失", en: "+100 Chips, melts by 5 per hand played; gone when it reaches 0" },
    stateText: j => `${Math.max(0, 100 - 5 * (j.state || 0))} ${S("chips_word")}`,
    after: (s, g, j) => {
      const v = 100 - 5 * (j.state || 0);
      return v > 0 ? { chips: v } : null;
    },
    onPlay: (s, g, j) => {
      j.state = (j.state || 0) + 1;
      if (100 - 5 * j.state <= 0) return "destroy";
    } },
  { id: "square", icon: "🟦", rarity: "common", cost: 4,
    name: { zh: "方形小丑", en: "Square Joker" },
    desc: { zh: "打出的手牌恰为 4 张时，永久 +4 筹码", en: "Gains +4 Chips permanently when played hand has exactly 4 cards" },
    stateText: j => `+${j.state || 0} ${S("chips_word")}`,
    after: (s, g, j) => (j.state || 0) > 0 ? { chips: j.state } : null,
    onPlay: (s, g, j) => { if (s.playedCount === 4) j.state = (j.state || 0) + 4; } },
  { id: "flash_card", icon: "⚡", rarity: "uncommon", cost: 6,
    name: { zh: "闪卡", en: "Flash Card" },
    desc: { zh: "每次商店刷新 +2 倍率", en: "+2 Mult per shop reroll" },
    stateText: j => `+${j.state || 0} ${S("mult_word")}`,
    after: (s, g, j) => (j.state || 0) > 0 ? { mult: j.state } : null,
    onReroll: (g, j) => { j.state = (j.state || 0) + 2; } },

  /* --- 点数价值类 --- */
  { id: "scholar", icon: "🎓", rarity: "common", cost: 4,
    name: { zh: "学者", en: "Scholar" },
    desc: { zh: "打出的每张 A +20 筹码 +4 倍率", en: "Played Aces give +20 Chips and +4 Mult" },
    perCard: c => c.rank === "A" ? { chips: 20, mult: 4 } : null },
  { id: "walkie_talkie", icon: "📻", rarity: "common", cost: 4,
    name: { zh: "对讲机", en: "Walkie Talkie" },
    desc: { zh: "打出的每张 10 或 4 +10 筹码 +4 倍率", en: "Each played 10 or 4 gives +10 Chips and +4 Mult" },
    perCard: c => c.rank === "10" || c.rank === "4" ? { chips: 10, mult: 4 } : null },

  /* --- 手中持有类: heldCard(card, g, j) 对回合中留在手里的每张牌调用 --- */
  { id: "baron", icon: "🎩", rarity: "rare", cost: 10,
    name: { zh: "男爵", en: "Baron" },
    desc: { zh: "手中持有的每张 K ×1.5 倍率", en: "Each King held in hand gives ×1.5 Mult" },
    heldCard: c => c.rank === "K" ? { xmult: 1.5 } : null },
  { id: "shoot_the_moon", icon: "🌛", rarity: "common", cost: 5,
    name: { zh: "射月", en: "Shoot the Moon" },
    desc: { zh: "手中持有的每张 Q +13 倍率", en: "Each Queen held in hand gives +13 Mult" },
    heldCard: c => c.rank === "Q" ? { mult: 13 } : null },
  /* 500局单卡实验: 边际增益 +0.39，显著高于普通卡替换基准(+0.21) → $4 提到 $5 */
  { id: "raised_fist", icon: "✊", rarity: "common", cost: 5,
    name: { zh: "高举拳头", en: "Raised Fist" },
    desc: { zh: "手中最小点数牌的点数 ×2 加到倍率", en: "Adds double the rank of your lowest held card to Mult" },
    after: (s, g) => {
      if (!g.hand.length) return null;
      const low = Math.min(...g.hand.map(c => RANK_VAL[c.rank]));
      return { mult: low * 2 };
    } },

  /* --- 牌型规则类（改变判定，engine.evaluate 读取） --- */
  { id: "four_fingers", icon: "🖐", rarity: "uncommon", cost: 7,
    name: { zh: "四指", en: "Four Fingers" },
    desc: { zh: "只需 4 张牌即可组成同花和顺子", en: "Flushes and Straights can be made with 4 cards" } },
  { id: "shortcut", icon: "🪜", rarity: "uncommon", cost: 7,
    name: { zh: "抄近路", en: "Shortcut" },
    desc: { zh: "顺子允许跳过 1 个点数（如 2,4,6,8,10）", en: "Straights may skip one rank (e.g. 2,4,6,8,10)" } },
  { id: "splash", icon: "💦", rarity: "common", cost: 4,
    name: { zh: "飞溅", en: "Splash" },
    desc: { zh: "打出的每张牌都参与计分", en: "Every played card counts in scoring" } },

  /* --- 复制类 --- */
  { id: "blueprint", icon: "📐", rarity: "rare", cost: 12,
    name: { zh: "蓝图", en: "Blueprint" },
    desc: { zh: "复制右侧小丑牌的计分效果", en: "Copies the scoring ability of the Joker to its right" },
    copy: "right" },

  /* --- 卡牌成长类 --- */
  { id: "hiker", icon: "🥾", rarity: "uncommon", cost: 6,
    name: { zh: "徒步者", en: "Hiker" },
    desc: { zh: "每张计分的牌永久 +5 筹码", en: "Each scored card permanently gains +5 Chips" },
    onPlay: (s, g, j) => {
      (s.scoringCards || s.cards).forEach(c => applyCardMod(c.id, x => x.perm = (x.perm || 0) + 5));
    } },
];
const JOKER_BY_ID = new Map(JOKER_DEFS.map(d => [d.id, d]));
const sellValue = def => Math.max(1, Math.floor(def.cost * BALANCE.sellRatio));
/* 未持有的传奇小丑候选池（灵魂幻灵牌 canUse/apply 共用） */
const legendaryPool = g => JOKER_DEFS.filter(d => d.rarity === "legendary" && !g.jokers.some(j => j.id === d.id));

/* ---------- 星球牌 ---------- */
const PLANETS = [
  { id: "pluto",   icon: "🪐", name: { zh: "冥王星", en: "Pluto" },   hand: "high_card" },
  { id: "mercury", icon: "☿",  name: { zh: "水星",   en: "Mercury" }, hand: "pair" },
  { id: "uranus",  icon: "🌀", name: { zh: "天王星", en: "Uranus" },  hand: "two_pair" },
  { id: "venus",   icon: "♀",  name: { zh: "金星",   en: "Venus" },   hand: "three_kind" },
  { id: "saturn",  icon: "🪐", name: { zh: "土星",   en: "Saturn" },  hand: "straight" },
  { id: "jupiter", icon: "🟠", name: { zh: "木星",   en: "Jupiter" }, hand: "flush" },
  { id: "earth",   icon: "🌍", name: { zh: "地球",   en: "Earth" },   hand: "full_house" },
  { id: "mars",    icon: "🔴", name: { zh: "火星",   en: "Mars" },    hand: "four_kind" },
  { id: "neptune", icon: "🔵", name: { zh: "海王星", en: "Neptune" }, hand: "straight_flush" },
  { id: "planetx", icon: "🪩", name: { zh: "行星X",  en: "Planet X" }, hand: "five_kind" },
  { id: "ceres",   icon: "⚪", name: { zh: "谷神星", en: "Ceres" },   hand: "flush_house" },
  { id: "eris",    icon: "🟣", name: { zh: "阋神星", en: "Eris" },    hand: "flush_five" },
];

/* ---------- 塔罗牌 ----------
   购买后进入消耗品槽，点击使用。
   apply(g)              : 即时效果，返回本地化消息
   targets:[min,max] + applyCards(cards, g) : 对选中手牌生效（回合中） */
const suitTarot = (id, zhName, enName, icon, suit) => ({
  id, icon, cost: 4, targets: /** @type {[number, number]} */ ([1, 3]),
  name: { zh: zhName, en: enName },
  desc: { zh: `选中 ≤3 张手牌变为${SUIT_NAME[suit].zh}`, en: `Convert up to 3 selected cards to ${SUIT_NAME[suit].en}` },
  applyCards: (cards, g) => {
    cards.forEach(c => applyCardMod(c.id, x => x.suit = suit));
    return S("msg_suit_change", cards.length, suit);
  },
});
const enhTarot = (id, zhName, enName, icon, enh) => ({
  id, icon, cost: 5, targets: /** @type {[number, number]} */ ([1, 1]),
  name: { zh: zhName, en: enName },
  desc: { zh: `选中 1 张手牌变为${ENH[enh].name.zh}（${ENH[enh].desc.zh}）`,
          en: `Convert 1 selected card to a ${ENH[enh].name.en} (${ENH[enh].desc.en})` },
  applyCards: (cards, g) => {
    applyCardMod(cards[0].id, x => x.enh = enh);
    return S("msg_enhanced", cards[0].rank + cards[0].suit, L(ENH[enh].name));
  },
});
/**
 * @typedef {Object} ConsumableDef
 * @property {string} id
 * @property {string} icon
 * @property {number} cost
 * @property {{zh: string, en: string}} name
 * @property {{zh: string, en: string}} desc
 * @property {boolean} [spectral]
 * @property {[number, number]} [targets]
 * @property {(g: any) => (string | null)} [apply]           即时效果；返回 null = 当前无法使用（不消耗）
 * @property {(cards: any[], g: any) => string} [applyCards] 对选中手牌生效
 * @property {(g: any) => {ok: boolean, reason?: {zh: string, en: string}}} [canUse]
 */
/** @type {ConsumableDef[]} */
const TAROTS = [
  { id: "hermit", icon: "🕯", cost: 4,
    name: { zh: "隐者", en: "The Hermit" },
    desc: { zh: "金钱翻倍 (最多 +$20)", en: "Double your money (max +$20)" },
    apply: g => { const v = Math.min(20, Math.max(0, g.money)); g.money += v; return `+$${v}`; } },
  { id: "temperance", icon: "⚖️", cost: 4,
    name: { zh: "节制", en: "Temperance" },
    desc: { zh: "获得持有小丑牌总售价 (最多 $30)", en: "Gain total sell value of your Jokers (max $30)" },
    apply: g => {
      const v = Math.min(30, g.jokers.reduce((s, j) => s + sellValue(JOKER_BY_ID.get(j.id)), 0));
      g.money += v; return `+$${v}`;
    } },
  { id: "empress", icon: "👑", cost: 4,
    name: { zh: "女皇", en: "The Empress" },
    desc: { zh: "随机牌型 +1 级", en: "Upgrade a random hand type by 1 level" },
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${L(HAND_TYPES[k].name)} → Lv.${g.handLevels[k]}`;
    } },
  { id: "strength", icon: "💪", cost: 5,
    name: { zh: "力量", en: "Strength" },
    desc: { zh: "每回合弃牌次数 +1 (本局)", en: "+1 discard per round (this run)" },
    apply: g => {
      g.bonusDiscards++;
      if (g.state === "playing") { g.maxDiscards++; g.discardsLeft++; }   // 回合中使用立即生效
      return S("msg_discard_up", BALANCE.baseDiscards + g.bonusDiscards);
    } },
  { id: "judgement", icon: "📯", cost: 8,
    name: { zh: "审判", en: "Judgement" },
    desc: { zh: "每回合出牌次数 +1 (本局)", en: "+1 hand per round (this run)" },
    apply: g => {
      g.bonusHands++;
      if (g.state === "playing") { g.maxHands++; g.handsLeft++; }   // 回合中使用立即生效
      return S("msg_hands_up", BALANCE.baseHands + g.bonusHands);
    } },
  { id: "tower", icon: "🗼", cost: 8,
    name: { zh: "高塔", en: "The Tower" },
    desc: { zh: "手牌上限 +1 (本局)", en: "+1 hand size (this run)" },
    apply: g => {
      g.handSize++;
      if (g.state === "playing") { g.curHandSize++; drawToFull(); }   // 回合中使用立即补一张
      return S("msg_handsize_up", g.handSize);
    } },
  suitTarot("sun",   "太阳", "The Sun",   "☀️", "♥"),
  suitTarot("star",  "星星", "The Star",  "⭐", "♦"),
  suitTarot("moon",  "月亮", "The Moon",  "🌙", "♣"),
  suitTarot("world", "世界", "The World", "🌏", "♠"),
  { id: "emperor", icon: "🤴", cost: 5, targets: [1, 2],
    name: { zh: "皇帝", en: "The Emperor" },
    desc: { zh: "选中 ≤2 张手牌点数 +1 (A→2)", en: "Raise rank of up to 2 selected cards by 1 (A→2)" },
    applyCards: (cards, g) => {
      cards.forEach(c => applyCardMod(c.id, x => {
        x.rank = RANKS[(RANKS.indexOf(x.rank) + 1) % RANKS.length];
      }));
      return S("msg_rank_up", cards.length);
    } },
  enhTarot("lovers",  "恋人", "The Lovers",  "💞", "bonus"),
  enhTarot("chariot", "战车", "The Chariot", "🛞", "mult"),
  enhTarot("justice", "正义", "Justice",     "🛡", "steel"),
  enhTarot("devil",   "恶魔", "The Devil",   "😈", "gold"),
  { id: "hanged", icon: "🪢", cost: 5, targets: [1, 2],
    name: { zh: "吊人", en: "The Hanged Man" },
    desc: { zh: "销毁选中的 ≤2 张牌（永久移出牌库）", en: "Destroy up to 2 selected cards (removed from deck permanently)" },
    applyCards: (cards, g) => {
      const ids = new Set(cards.map(c => c.id));
      g.masterDeck = g.masterDeck.filter(c => !ids.has(c.id));
      g.deck = g.deck.filter(c => !ids.has(c.id));
      g.hand = g.hand.filter(c => !ids.has(c.id));
      return S("msg_destroyed", cards.length);
    } },
];
const TAROT_BY_ID = new Map(TAROTS.map(t => [t.id, t]));

/* ---------- 幻灵牌（高风险高收益消耗品，商店塔罗位低概率出现） ----------
   apply 返回 null 表示无法使用（不消耗） */
/** @type {ConsumableDef[]} */
const SPECTRALS = [
  { id: "ectoplasm", icon: "🫧", cost: 6, spectral: true,
    name: { zh: "灵质", en: "Ectoplasm" },
    desc: { zh: "随机一张小丑牌获得多彩版本（×1.5 倍率），手牌上限 -1", en: "A random Joker becomes Polychrome (×1.5 Mult); -1 hand size" },
    apply: g => {
      const pool = g.jokers.filter(j => !j.ed);
      if (!pool.length || g.handSize <= 5) return null;
      const j = rnd(pool);
      j.ed = "poly";
      g.handSize--;
      return `${JOKER_BY_ID.get(j.id).icon} → ${L(EDITIONS.poly.name)}`;
    } },
  { id: "aura", icon: "🌈", cost: 6, spectral: true, targets: [1, 1],
    name: { zh: "光环", en: "Aura" },
    desc: { zh: "选中 1 张手牌获得随机增强", en: "Give 1 selected card a random enhancement" },
    applyCards: (cards, g) => {
      const enh = rnd(Object.keys(ENH));
      applyCardMod(cards[0].id, x => x.enh = enh);
      return S("msg_enhanced", cards[0].rank + cards[0].suit, L(ENH[enh].name));
    } },
  { id: "cryptid", icon: "👣", cost: 7, spectral: true, targets: [1, 1],
    name: { zh: "谜影", en: "Cryptid" },
    desc: { zh: "复制选中的 1 张手牌，2 张副本加入牌库", en: "Create 2 copies of 1 selected card in your deck" },
    applyCards: (cards, g) => {
      const src = g.masterDeck.find(x => x.id === cards[0].id) || cards[0];
      for (let k = 0; k < 2; k++) {
        g.masterDeck.push({ ...src, id: "c" + Date.now() + Math.random().toString(36).slice(2, 5) });
      }
      return S("msg_copied", cards[0].rank + cards[0].suit);
    } },
  { id: "the_soul", icon: "👁", cost: 10, spectral: true,
    name: { zh: "灵魂", en: "The Soul" },
    desc: { zh: "获得一张随机传奇小丑牌", en: "Gain a random Legendary Joker" },
    canUse: g => {
      if (g.jokers.length >= g.maxJokers) return { ok: false, reason: { zh: "小丑牌槽位已满", en: "Joker slots full" } };
      if (!legendaryPool(g).length) return { ok: false, reason: { zh: "无可用传奇小丑", en: "No legendary Jokers available" } };
      return { ok: true };
    },
    apply: g => {
      const pool = legendaryPool(g);
      if (!pool.length) return null;   // canUse 之外的直调兜底（不消耗）
      const def = rnd(pool);
      g.jokers.push({ id: def.id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
      return `${def.icon} ${L(def.name)}`;
    } },
  { id: "immolate", icon: "🔥", cost: 5, spectral: true,
    name: { zh: "献祭", en: "Immolate" },
    desc: { zh: `随机销毁牌库 5 张牌，获得 $${BALANCE.immolateMoney}`, en: `Destroy 5 random cards in your deck, gain $${BALANCE.immolateMoney}` },
    apply: g => {
      if (g.masterDeck.length <= BALANCE.immolateFloor) return null;   // 保底牌库
      for (let k = 0; k < 5 && g.masterDeck.length; k++) {
        const idx = Math.floor(rng() * g.masterDeck.length);
        const [gone] = g.masterDeck.splice(idx, 1);
        g.deck = g.deck.filter(x => x.id !== gone.id);
        g.hand = g.hand.filter(x => x.id !== gone.id);
      }
      g.money += BALANCE.immolateMoney;
      return "+$" + BALANCE.immolateMoney;
    } },
];
const SPECTRAL_BY_ID = new Map(SPECTRALS.map(s => [s.id, s]));
/* 消耗品统一查询（塔罗 + 幻灵） */
const consumableDef = id => TAROT_BY_ID.get(id) || SPECTRAL_BY_ID.get(id);

/* ---------- 卡包（购买后 3 选 1） ---------- */
const PACKS = [
  { kind: "arcana", icon: "🔮", cost: 4,
    name: { zh: "塔罗包", en: "Arcana Pack" },
    desc: { zh: "3 张塔罗牌选 1", en: "Pick 1 of 3 Tarot cards" } },
  { kind: "celestial", icon: "🪐", cost: 4,
    name: { zh: "星球包", en: "Celestial Pack" },
    desc: { zh: "3 张星球牌选 1（立即生效）", en: "Pick 1 of 3 Planet cards (applied instantly)" } },
  { kind: "buffoon", icon: "🎪", cost: 6,
    name: { zh: "小丑包", en: "Buffoon Pack" },
    desc: { zh: "3 张小丑牌选 1", en: "Pick 1 of 3 Jokers" } },
];

/* ---------- 优惠券（每局每种限购一次的永久升级） ---------- */
const VOUCHERS = [
  { id: "overstock", icon: "📦", cost: 10,
    name: { zh: "超额库存", en: "Overstock" },
    desc: { zh: "商店每次多 1 张小丑牌", en: "Shop offers +1 Joker" },
    apply: g => {} },   // 效果在 engine.rollShop：jokerCount 按持券判定
  { id: "clearance", icon: "🏷", cost: 8,
    name: { zh: "清仓甩卖", en: "Clearance Sale" },
    desc: { zh: `商店刷新费从 $${BALANCE.rerollClearance} 起`, en: `Shop rerolls start at $${BALANCE.rerollClearance}` },
    apply: g => {} },   // 效果在 ui.openShop：rerollCost 按持券取 BALANCE.rerollClearance
  { id: "crate", icon: "🧰", cost: 8,
    name: { zh: "手提箱", en: "Crate" },
    desc: { zh: "消耗品槽 +1", en: "+1 consumable slot" },
    apply: g => { g.maxConsumables++; } },
  { id: "retainer", icon: "💼", cost: 10,
    name: { zh: "伙伴合约", en: "Retainer" },
    desc: { zh: "小丑牌槽 +1", en: "+1 Joker slot" },
    apply: g => { g.maxJokers++; } },
  { id: "compound", icon: "🏦", cost: 10,
    name: { zh: "复利", en: "Compound Interest" },
    desc: { zh: `利息上限 $${BALANCE.interestCap} → $${BALANCE.compoundInterestCap}`,
            en: `Interest cap raised from $${BALANCE.interestCap} to $${BALANCE.compoundInterestCap}` },
    apply: g => { g.interestCap = BALANCE.compoundInterestCap; } },
  { id: "grabber", icon: "🫳", cost: 10,
    name: { zh: "抓手", en: "Grabber" },
    desc: { zh: "每回合出牌次数 +1", en: "+1 hand per round" },
    apply: g => { g.bonusHands++; } },
];
const VOUCHER_BY_ID = new Map(VOUCHERS.map(v => [v.id, v]));

/* ---------- 小丑牌版本（商店随机附带，加价出售） ---------- */
const EDITIONS = {
  foil: { name: { zh: "闪箔", en: "Foil" }, desc: { zh: "+50 筹码", en: "+50 Chips" },
    effect: { chips: 50 }, costUp: 2 },
  holo: { name: { zh: "全息", en: "Holographic" }, desc: { zh: "+10 倍率", en: "+10 Mult" },
    effect: { mult: 10 }, costUp: 3 },
  poly: { name: { zh: "多彩", en: "Polychrome" }, desc: { zh: "×1.5 倍率", en: "×1.5 Mult" },
    effect: { xmult: 1.5 }, costUp: 5 },
};

/* ---------- 游戏模式 ---------- */
const MODES = [
  { id: "normal", icon: "🎴",
    name: { zh: "标准", en: "Standard" },
    desc: { zh: "8 个底注", en: "8 antes" } },
  { id: "quick", icon: "⚡",
    name: { zh: "快速", en: "Quick" },
    desc: { zh: "4 个底注 · 约 10 分钟", en: "4 antes · ~10 min" } },
  { id: "boss_rush", icon: "👹",
    name: { zh: "Boss Rush", en: "Boss Rush" },
    desc: { zh: "每个盲注都是 Boss 减益", en: "Every blind has a Boss debuff" } },
];

/* ---------- 起始牌组 ---------- */
const DECKS = [
  { id: "classic", icon: "🂠",
    name: { zh: "经典牌组", en: "Classic Deck" },
    desc: { zh: "无修正", en: "No modifiers" },
    apply: g => {} },
  { id: "red", icon: "🟥",
    name: { zh: "红牌组", en: "Red Deck" },
    desc: { zh: "每回合弃牌次数 +1", en: "+1 discard per round" },
    apply: g => { g.bonusDiscards++; } },
  { id: "blue", icon: "🟦",
    name: { zh: "蓝牌组", en: "Blue Deck" },
    desc: { zh: "每回合出牌次数 +1", en: "+1 hand per round" },
    apply: g => { g.bonusHands++; } },
  { id: "yellow", icon: "🟨",
    name: { zh: "黄牌组", en: "Yellow Deck" },
    desc: { zh: "开局携带 $10", en: "Start with $10" },
    apply: g => { g.money = 10; } },
  { id: "ghost", icon: "👻",
    name: { zh: "幽灵牌组", en: "Ghost Deck" },
    desc: { zh: "开局携带 1 张随机塔罗牌", en: "Start with a random Tarot card" },
    apply: g => { g.consumables.push({ id: rnd(TAROTS).id, uid: "t0" }); } },
];

/* ---------- 跳过盲注的标签奖励 ---------- */
const SKIP_TAGS = [
  { id: "cash", icon: "💰",
    name: { zh: "金钱标签", en: "Cash Tag" },
    apply: g => { g.money += BALANCE.tagCash; return "+$" + BALANCE.tagCash; } },
  { id: "coupon", icon: "🎟",
    name: { zh: "优惠券标签", en: "Coupon Tag" },
    apply: g => { g.freeReroll++; return S("msg_free_reroll"); } },
  { id: "orbit", icon: "🪐",
    name: { zh: "星球标签", en: "Orbit Tag" },
    apply: g => {
      const k = rnd(Object.keys(HAND_TYPES));
      g.handLevels[k]++;
      return `${L(HAND_TYPES[k].name)} → Lv.${g.handLevels[k]}`;
    } },
  { id: "joker_tag", icon: "🎁",
    name: { zh: "小丑标签", en: "Joker Tag" },
    apply: g => {
      if (g.jokers.length >= g.maxJokers) { g.money += BALANCE.tagJokerFull; return "+$" + BALANCE.tagJokerFull; }
      const pool = JOKER_DEFS.filter(d => d.rarity === "common" && !g.jokers.some(j => j.id === d.id));
      const def = rnd(pool);
      g.jokers.push({ id: def.id, uid: "j" + Date.now() + Math.random().toString(36).slice(2, 5) });
      return `${def.icon} ${L(def.name)}`;
    } },
  { id: "voucher_tag", icon: "🏷",
    name: { zh: "折扣标签", en: "Voucher Tag" },
    apply: g => { g.voucherDiscount = true; return S("msg_tag_voucher"); } },
  { id: "investment_tag", icon: "📈",
    name: { zh: "投资标签", en: "Investment Tag" },
    apply: g => { g.investment = (g.investment || 0) + 1; return S("msg_tag_investment", BALANCE.investmentPayout); } },
  { id: "double_tag", icon: "♊",
    name: { zh: "加倍标签", en: "Double Tag" },
    apply: g => { g.doubleTag = (g.doubleTag || 0) + 1; return S("msg_tag_double"); } },
];

/* ---------- 成就 ---------- */
const ACHIEVEMENTS = [
  { id: "first_win", icon: "🏆",
    name: { zh: "初次通关", en: "First Victory" },
    desc: { zh: "击败全部 8 个底注", en: "Beat all 8 antes" } },
  { id: "all_decks", icon: "🌈",
    name: { zh: "全牌组制霸", en: "Deck Master" },
    desc: { zh: "用全部 5 种牌组各通关一次", en: "Win with all 5 decks" } },
  { id: "hidden_hand", icon: "🂠",
    name: { zh: "隐藏牌型", en: "Secret Hand" },
    desc: { zh: "打出五条 / 同花葫芦 / 同花五条", en: "Play Five of a Kind, Flush House or Flush Five" } },
  { id: "big_hand", icon: "💥",
    name: { zh: "十万暴击", en: "Six Figures" },
    desc: { zh: "单次出牌得分 ≥ 100,000", en: "Score 100,000+ in a single hand" } },
  { id: "endless12", icon: "♾️",
    name: { zh: "无尽行者", en: "Endless Walker" },
    desc: { zh: "无尽模式达到底注 12", en: "Reach Ante 12 in Endless mode" } },
  { id: "collector", icon: "📚",
    name: { zh: "图鉴大师", en: "Completionist" },
    desc: { zh: "图鉴集齐全部小丑牌", en: "See every Joker in the collection" } },
  { id: "rich", icon: "💰",
    name: { zh: "富甲一方", en: "Money Bags" },
    desc: { zh: "同时持有 $50", en: "Hold $50 at once" } },
  { id: "legendary", icon: "🎪",
    name: { zh: "传奇之主", en: "Legend Holder" },
    desc: { zh: "拥有一张传奇小丑牌", en: "Own a Legendary Joker" } },
  { id: "quick_win", icon: "⚡",
    name: { zh: "闪电战", en: "Blitz" },
    desc: { zh: "通关快速模式", en: "Win a Quick run" } },
  { id: "rush_win", icon: "👹",
    name: { zh: "屠魔者", en: "Boss Slayer" },
    desc: { zh: "通关 Boss Rush 模式", en: "Win a Boss Rush run" } },
  { id: "challenger", icon: "📅",
    name: { zh: "挑战者", en: "Challenger" },
    desc: { zh: "完成过今日挑战和每周挑战各一次", en: "Play both a Daily and a Weekly run" } },
  { id: "merchant", icon: "💱",
    name: { zh: "倒爷", en: "Wheeler Dealer" },
    desc: { zh: "单局卖出 5 张小丑牌", en: "Sell 5 Jokers in one run" } },
  { id: "iron_hand", icon: "🤜",
    name: { zh: "铁手", en: "Iron Hand" },
    desc: { zh: "不使用弃牌击败一个 Boss 盲注", en: "Beat a Boss Blind without discarding" } },
];

/* ---------- 帮助页 ---------- */
const HELP_PAGES = [
  { title: { zh: "基础流程", en: "The Basics" },
    body: {
      zh: `<b>目标</b>：每回合在限定出牌次数内，让回合分数达到目标分数。<br><br>
<b>计分公式</b>：<span class="hb">筹码 × 倍率</span>。牌型决定基础值（对子 ${HAND_TYPES.pair.chips}×${HAND_TYPES.pair.mult}、同花 ${HAND_TYPES.flush.chips}×${HAND_TYPES.flush.mult}…），打出的每张计分牌加筹码，小丑牌再叠加成。<br><br>
<b>回合结构</b>：每个底注依次是 小盲注 → 大盲注 → Boss盲注（带减益）。小/大盲注可跳过换随机标签奖励。通关后可进无尽模式。<br><br>
<b>三种模式</b>（开局与牌组一起选）：🎴 标准 8 底注 · ⚡ 快速 4 底注（约10分钟，目标更缓）· 👹 Boss Rush 每个盲注都带随机 Boss 减益（奖励 +$${BALANCE.bossRushRewardBonus} 补偿）。<br><br>
<b>挑战</b>：「今日/每周挑战」按日期生成全球统一种子，配合结束画面的分享链接和好友同局比进度。<br><br>
<b>操作</b>：点牌或按 1-9 选牌（≤5张），Enter 出牌，X 弃牌换新（次数有限）。`,
      en: `<b>Goal</b>: reach the target score each round within a limited number of hands.<br><br>
<b>Scoring</b>: <span class="hb">Chips × Mult</span>. The poker hand sets the base (Pair ${HAND_TYPES.pair.chips}×${HAND_TYPES.pair.mult}, Flush ${HAND_TYPES.flush.chips}×${HAND_TYPES.flush.mult}…), each scored card adds chips, then Jokers stack on top.<br><br>
<b>Structure</b>: each Ante is Small Blind → Big Blind → Boss Blind (with a debuff). Skip Small/Big for a random Tag reward. Win to unlock Endless.<br><br>
<b>Three modes</b> (picked with your deck): 🎴 Standard 8 antes · ⚡ Quick 4 antes (~10 min, gentler targets) · 👹 Boss Rush — every blind has a random Boss debuff (+$${BALANCE.bossRushRewardBonus} reward each).<br><br>
<b>Challenges</b>: Daily and Weekly runs use globally shared seeds — race friends on the same run via share links.<br><br>
<b>Controls</b>: click or press 1-9 to select up to 5 cards, Enter to play, X to discard.` } },
  { title: { zh: "商店", en: "The Shop" },
    body: {
      zh: `每次胜利后进商店，金钱来自奖励 + 剩余出牌数 + 利息（每 $${BALANCE.interestRate} 得 $1）。<br><br>
<b>🃏 小丑牌</b>：核心构筑，被动加成，最多 ${BALANCE.maxJokers} 张。结算按从左到右顺序——把 ×倍率 放右边收益更大（悬停用 ◀▶ 调整）。可能带版本：闪箔+${EDITIONS.foil.effect.chips}筹码 / 全息+${EDITIONS.holo.effect.mult}倍率 / 多彩×${EDITIONS.poly.effect.xmult}倍率。双击卖出。<br><br>
<b>🪐 星球牌</b>：永久升级一种牌型的基础值。<br>
<b>🔮 塔罗牌</b>：买入消耗品槽，双击使用。<br>
<b>📦 卡包</b>：3 选 1。<b>🏷 优惠券</b>：每种每局一次的永久升级。`,
      en: `After each win you visit the shop. Money comes from rewards + unused hands + interest ($1 per $${BALANCE.interestRate}).<br><br>
<b>🃏 Jokers</b>: your build, up to ${BALANCE.maxJokers}. They trigger left to right — put ×Mult jokers on the right (hover for ◀▶). May carry editions: Foil +${EDITIONS.foil.effect.chips} Chips / Holo +${EDITIONS.holo.effect.mult} Mult / Polychrome ×${EDITIONS.poly.effect.xmult} Mult. Double-click to sell.<br><br>
<b>🪐 Planets</b>: permanently upgrade one hand type.<br>
<b>🔮 Tarots</b>: stored as consumables, double-click to use.<br>
<b>📦 Packs</b>: pick 1 of 3. <b>🏷 Vouchers</b>: one-time permanent upgrades.` } },
  { title: { zh: "改造牌库", en: "Deck Sculpting" },
    body: {
      zh: `牌库整局持久——塔罗对牌的修改会保留到之后每个回合（点右下角「牌库」随时查看）。<br><br>
<b>目标型塔罗</b>需要在回合中先选中手牌再双击使用：太阳/星星/月亮/世界改花色，皇帝点数+1，恋人/战车/正义/恶魔附加增强，吊人销毁牌。<br><br>
<b>增强</b>：🔷加成+${ENH_CHIPS}筹码 · 🔺倍率+${ENH_MULT} · 🛡钢铁留手中×${ENH_STEEL_X} · 💰黄金回合结束+$${ENH_GOLD_MONEY}。<br><br>
<b>隐藏牌型</b>：把点数/花色改齐后可打出 <b>五条</b>（${HAND_TYPES.five_kind.chips}×${HAND_TYPES.five_kind.mult}）和 <b>同花葫芦</b>（${HAND_TYPES.flush_house.chips}×${HAND_TYPES.flush_house.mult}）——改牌流的终极目标。<br><br>
<b>🫧 幻灵牌</b>：商店塔罗位偶尔出现的高风险消耗品（销毁换钱、随机增强、复制牌、直接获得传奇小丑）。`,
      en: `Your deck persists for the whole run — tarot modifications stay for every later round (click "Deck" bottom-right to inspect).<br><br>
<b>Targeted tarots</b> are used mid-round on selected cards: Sun/Star/Moon/World change suits, Emperor raises rank, Lovers/Chariot/Justice/Devil add enhancements, Hanged Man destroys.<br><br>
<b>Enhancements</b>: 🔷 +${ENH_CHIPS} Chips · 🔺 +${ENH_MULT} Mult · 🛡 Steel ×${ENH_STEEL_X} while held · 💰 Gold +$${ENH_GOLD_MONEY} at round end.<br><br>
<b>Hidden hands</b>: sculpt ranks/suits to unlock <b>Five of a Kind</b> (${HAND_TYPES.five_kind.chips}×${HAND_TYPES.five_kind.mult}) and <b>Flush House</b> (${HAND_TYPES.flush_house.chips}×${HAND_TYPES.flush_house.mult}).<br><br>
<b>🫧 Spectrals</b>: risky consumables that occasionally replace the shop tarot (destroy for cash, random enhancement, copy cards, gain a Legendary Joker).` } },
  { title: { zh: "进阶机制", en: "Advanced" },
    body: {
      zh: `<b>重触发</b>：黑客/悲喜面具/黄昏让计分牌触发两次（筹码、增强、逐卡小丑全部重复）。<br>
<b>持有触发</b>：男爵(手中K ×1.5)、射月(手中Q +13倍率)——不出牌的牌也有价值。<br>
<b>规则改写</b>：四指(4张成同花/顺子)、抄近路(顺子可跳点)、飞溅(全部打出的牌计分)。<br>
<b>📐 蓝图</b>：复制右侧小丑的计分效果，可链式传递——排序就是构筑。<br>
<b>成长</b>：绿色小丑/坐公交/方形/闪卡越打越强，徒步者让计分牌永久+5筹码。<br><br>
<b>种子</b>：同种子同牌局。侧边栏可开今日挑战、输自定义种子；图鉴里可用历史种子复盘。`,
      en: `<b>Retrigger</b>: Hack / Sock and Buskin / Dusk score cards twice (chips, enhancements and per-card jokers all repeat).<br>
<b>Held triggers</b>: Baron (held Kings ×1.5), Shoot the Moon (held Queens +13 Mult) — unplayed cards matter.<br>
<b>Rule benders</b>: Four Fingers (4-card flushes/straights), Shortcut (straights may skip a rank), Splash (every played card scores).<br>
<b>📐 Blueprint</b>: copies the Joker to its right, chainable — ordering is building.<br>
<b>Scaling</b>: Green Joker / Ride the Bus / Square / Flash Card grow over time; Hiker permanently adds +5 Chips to scored cards.<br><br>
<b>Seeds</b>: same seed, same run. Daily challenge and custom seeds in the sidebar; replay past seeds from the Collection.` } },
];
