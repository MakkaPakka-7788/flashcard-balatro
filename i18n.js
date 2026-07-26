/* =========================================================
   小丑牌 · JOKER — 国际化（zh / en）
   L(obj)  : 取 {zh, en} 双语对象的当前语言值
   S(key, ...args) : 取界面文案模板并填充 {0} {1} …
   最先加载；语言偏好存 localStorage("joker_lang")，切换后刷新页面生效。
   ========================================================= */
"use strict";

let LANG = "zh";
try { LANG = localStorage.getItem("joker_lang") === "en" ? "en" : "zh"; } catch (e) { /* 忽略 */ }

const L = v => (v && typeof v === "object") ? (v[LANG] ?? v.zh) : v;

const STR = {
  game_title:        { zh: "小丑牌 · JOKER", en: "JOKER — a Balatro-like" },

  /* 盲注选择 */
  blind_select_title:{ zh: "选择盲注", en: "Choose your Blind" },
  select_btn:        { zh: "选择", en: "Select" },
  skip_btn:          { zh: "跳过 🎁", en: "Skip 🎁" },
  done_mark:         { zh: "✔ 已完成", en: "✔ Cleared" },
  upcoming:          { zh: "即将到来", en: "Upcoming" },
  reward_word:       { zh: "奖励", en: "Reward" },

  /* 侧边栏 / 主界面 */
  target_label:      { zh: "目标分数", en: "Score at least" },
  round_score_label: { zh: "回合分数", en: "Round score" },
  hands_label:       { zh: "出牌", en: "Hands" },
  discards_label:    { zh: "弃牌", en: "Discards" },
  ante_label:        { zh: "底注", en: "Ante" },
  round_label:       { zh: "回合", en: "Round" },
  jokers_label:      { zh: "小丑牌", en: "Jokers" },
  consumables_label: { zh: "消耗品", en: "Consumables" },
  deck_label:        { zh: "牌库", en: "Deck" },
  run_info_btn:      { zh: "牌型等级", en: "Hand Levels" },
  new_run_btn:       { zh: "重新开局", en: "New Run" },
  daily_btn:         { zh: "今日挑战", en: "Daily Run" },
  weekly_btn:        { zh: "每周挑战", en: "Weekly Run" },
  week_suffix:       { zh: " · 每周挑战", en: " · Weekly" },
  weekly_start:      { zh: "📅 每周挑战 · 种子 {0}", en: "📅 Weekly Run · Seed {0}" },
  bossrush_hint:     { zh: "👹 随机 Boss 减益", en: "👹 Random Boss debuff" },
  update_ready:      { zh: "🔄 新版本已就绪，点击此处刷新", en: "🔄 New version ready — tap to refresh" },
  run_parked:        { zh: "⏸ 已搁置当前对局，本局结束后可恢复", en: "⏸ Current run parked — restore it after this one ends" },
  restore_run_btn:   { zh: "⏪ 恢复被搁置的对局", en: "⏪ Restore parked run" },
  music_btn_on:      { zh: "🎵 音乐 开", en: "🎵 Music on" },
  music_btn_off:     { zh: "🎵 音乐 关", en: "🎵 Music off" },
  consumables_col_title: { zh: "塔罗 · 幻灵", en: "Tarots · Spectrals" },
  vouchers_col_title:{ zh: "优惠券", en: "Vouchers" },
  collection_btn:    { zh: "图鉴", en: "Collection" },
  confirm_abandon:   { zh: "确认放弃本局?", en: "Abandon this run?" },
  hotkeys:           { zh: "快捷键: 1-9选牌/购买 · Enter出牌/确认 · X弃牌/跳过 · R/S排序 · Esc取消 · M静音 · 计分中点击加速",
                       en: "Hotkeys: 1-9 select/buy · Enter play/confirm · X discard/skip · R/S sort · Esc cancel · M mute · click to speed up scoring" },
  sort_label:        { zh: "排序", en: "Sort" },
  sort_rank_btn:     { zh: "点数", en: "Rank" },
  sort_suit_btn:     { zh: "花色", en: "Suit" },
  play_btn:          { zh: "出牌", en: "Play" },
  discard_btn:       { zh: "弃牌", en: "Discard" },
  seed_word:         { zh: "种子", en: "Seed" },
  today_suffix:      { zh: " · 今日挑战", en: " · Daily" },
  seed_prompt:       { zh: "输入种子开始新局（将放弃当前进度，留空取消）:",
                       en: "Enter a seed to start a new run (abandons current progress, empty to cancel):" },
  seed_start:        { zh: "🎲 种子 {0}", en: "🎲 Seed {0}" },
  daily_start:       { zh: "📅 今日挑战 · 种子 {0}", en: "📅 Daily Run · Seed {0}" },

  /* 计分 / 回合 */
  mult_word:         { zh: "倍率", en: "Mult" },
  chips_word:        { zh: "筹码", en: "Chips" },
  psychic_need5:     { zh: "🔮 通灵者：必须打出 5 张牌!", en: "🔮 The Psychic: you must play 5 cards!" },
  all_debuffed_name: { zh: "🚫 全部禁用", en: "🚫 All debuffed" },
  all_debuffed_flash:{ zh: "🚫 打出的牌全部被禁用，本次得 0 分!", en: "🚫 All played cards are debuffed — 0 points!" },
  hook_flash:        { zh: "🪝 钩子弃掉了你 2 张手牌!", en: "🪝 The Hook discarded 2 of your cards!" },
  accelerate:        { zh: "⏩ 加速", en: "⏩ Speed up" },
  muted:             { zh: "🔇 已静音", en: "🔇 Muted" },
  unmuted:           { zh: "🔊 声音开启", en: "🔊 Sound on" },

  /* 结算 */
  round_won_title:   { zh: "回合胜利!", en: "Round won!" },
  defeat_word:       { zh: "击败", en: "Defeated" },
  hands_left_bonus:  { zh: "剩余出牌次数", en: "Remaining hands" },
  interest_line:     { zh: "利息 (每${1}得$1, 上限${0})", en: "Interest ($1 per ${1}, cap ${0})" },
  gold_cards_line:   { zh: "💰 手中黄金牌 ×{0}", en: "💰 Gold cards in hand ×{0}" },
  eaten_flash:       { zh: "{0} 被吃掉了!", en: "{0} was eaten!" },
  cashout_collect:   { zh: "收取", en: "Cash out" },

  /* 商店 */
  shop_title:        { zh: "🛒 商 店", en: "🛒 SHOP" },
  buy_btn:           { zh: "购买", en: "Buy" },
  sold_out:          { zh: "已售", en: "Sold" },
  upgrade_word:      { zh: "升级", en: "Upgrade" },
  reroll_free:       { zh: "刷新 (免费 ×{0})", en: "Reroll (free ×{0})" },
  reroll_cost:       { zh: "刷新 ${0}", en: "Reroll ${0}" },
  next_round_btn:    { zh: "下一回合 ➜", en: "Next round ➜" },
  sold_flash:        { zh: "卖出 {0} +${1}", en: "Sold {0} +${1}" },
  shop_owned_title:  { zh: "我的小丑牌 · 点两次出售", en: "Your Jokers · click twice to sell" },
  sell_again:        { zh: "再点一次卖出 ${0}", en: "Click again to sell ${0}" },
  click_sell:        { zh: "点击卖出 ${0}", en: "Click to sell ${0}" },
  move_joker_tip:    { zh: "调整结算顺序", en: "Change scoring order" },
  current_word:      { zh: "当前", en: "Now" },

  /* 塔罗 / 消耗品 */
  tarot_label:       { zh: "塔罗牌", en: "Tarot" },
  click_use:         { zh: "点击使用", en: "Click to use" },
  select_first_use:  { zh: "选中手牌后点击使用", en: "Select cards in hand, then click to use" },
  use_again:         { zh: "再点一次使用", en: "Click again to use" },
  use_again_target:  { zh: "再点一次对选中手牌使用", en: "Click again to use on selected cards" },
  only_in_round:     { zh: "🔒 只能在回合中对手牌使用", en: "🔒 Can only be used on cards during a round" },
  need_select:       { zh: "请先选中 {0} 张手牌", en: "Select {0} card(s) in hand first" },
  msg_suit_change:   { zh: "{0} 张牌变为 {1}", en: "{0} card(s) converted to {1}" },
  msg_rank_up:       { zh: "{0} 张牌点数 +1", en: "{0} card(s) rank +1" },
  msg_enhanced:      { zh: "{0} 变为{1}", en: "{0} became a {1}" },
  msg_destroyed:     { zh: "销毁 {0} 张牌", en: "Destroyed {0} card(s)" },
  msg_discard_up:    { zh: "弃牌上限 {0}", en: "Discard limit {0}" },
  msg_hands_up:      { zh: "出牌上限 {0}", en: "Hand limit {0}" },
  msg_handsize_up:   { zh: "手牌上限 {0}", en: "Hand size {0}" },
  msg_free_reroll:   { zh: "下次商店可免费刷新 1 次", en: "Next shop reroll is free" },

  /* 传奇小丑 */
  msg_chicot_disable:{ zh: "🤡 奇科：{0} 的效果已失效", en: "🤡 Chicot: {0} effect disabled" },
  msg_perkeo_copy:   { zh: "🍷 佩尔科复制了 {0}", en: "🍷 Perkeo duplicated {0}" },

  /* 计分特效 */
  again_word:        { zh: "↻ 再次触发!", en: "↻ Again!" },

  /* 牌组选择 */
  deck_select_title: { zh: "选择起始牌组", en: "Choose your Deck" },
  cancel_btn:        { zh: "取消", en: "Cancel" },

  /* 对局历史 */
  history_title:     { zh: "最近对局", en: "Recent Runs" },
  replay_tip:        { zh: "用该种子重开一局", en: "Replay this seed" },

  /* 幻灵牌 */
  spectral_label:    { zh: "幻灵牌", en: "Spectral" },
  cannot_use:        { zh: "当前无法使用", en: "Can't use this right now" },
  dead_end:          { zh: "⚠️ 无牌可打，本回合就此结算！", en: "⚠️ No playable hands left — the round ends now!" },
  msg_copied:        { zh: "复制了 2 张 {0} 进牌库", en: "Added 2 copies of {0} to your deck" },

  /* 标签 */
  msg_tag_voucher:   { zh: "下张优惠券半价", en: "Next voucher is half price" },
  msg_tag_investment:{ zh: "击败下个Boss +$15", en: "+$15 after beating the next Boss" },
  msg_tag_double:    { zh: "下一个标签效果 ×2", en: "Next tag triggers twice" },
  investment_line:   { zh: "投资标签兑现", en: "Investment payout" },

  /* 帮助 / 引导 */
  help_btn:          { zh: "❓ 玩法说明", en: "❓ How to Play" },
  prev_btn:          { zh: "◀ 上一页", en: "◀ Prev" },
  next_btn:          { zh: "下一页 ▶", en: "Next ▶" },
  tip_shop:          { zh: "💡 第一次进商店：小丑牌是核心构筑，钱留 $5 的倍数可以吃利息", en: "💡 First shop: Jokers are your build — keeping multiples of $5 earns interest" },
  tip_tarot:         { zh: "💡 目标型塔罗要在回合中先选中手牌，再双击消耗品使用", en: "💡 Targeted tarots: select cards in hand mid-round, then double-click the consumable" },
  tip_boss:          { zh: "💡 Boss 盲注带减益，效果显示在左侧盲注面板", en: "💡 Boss blinds have a debuff — shown in the blind panel on the left" },

  /* 分享 */
  share_btn:         { zh: "🔗 复制分享链接", en: "🔗 Copy share link" },
  share_copied:      { zh: "🔗 链接已复制，同种子同牌局", en: "🔗 Link copied — same seed, same run" },
  share_manual:      { zh: "复制此链接分享:", en: "Copy this link to share:" },

  /* 卡包 */
  pick_one:          { zh: "3 选 1", en: "Pick 1 of 3" },
  choose_btn:        { zh: "选择", en: "Choose" },
  pack_skip_btn:     { zh: "放弃卡包", en: "Skip pack" },
  pack_taken:        { zh: "获得 {0}", en: "Got {0}" },
  slots_full:        { zh: "槽位已满!", en: "Slots are full!" },

  /* 牌库查看 */
  deck_view_title:   { zh: "牌库一览", en: "Deck Overview" },
  deck_hint_playing: { zh: "灰色 = 本回合已抽走 · 图标 = 增强", en: "Grey = already drawn this round · icon = enhancement" },
  deck_hint_all:     { zh: "整局牌库 · 图标 = 增强", en: "Full run deck · icon = enhancement" },
  close_btn:         { zh: "返回", en: "Back" },

  /* 成就 */
  achievements_title:{ zh: "成就", en: "Achievements" },
  achievement_unlocked: { zh: "成就解锁", en: "Achievement unlocked" },

  /* 存档迁移 */
  export_btn:        { zh: "导出进度", en: "Export save" },
  import_btn:        { zh: "导入进度", en: "Import save" },
  export_copied:     { zh: "📋 进度码已复制，在其他设备「导入进度」粘贴即可", en: "📋 Save code copied — paste it via \"Import save\" on another device" },
  export_manual:     { zh: "复制此进度码:", en: "Copy this save code:" },
  import_prompt:     { zh: "粘贴进度码（将覆盖当前进度与战绩）:", en: "Paste save code (overwrites current progress and stats):" },
  import_bad:        { zh: "⚠ 进度码无效", en: "⚠ Invalid save code" },

  /* 图鉴 / 统计 */
  collection_title:  { zh: "图鉴 · 战绩", en: "Collection · Stats" },
  stats_line:        { zh: "局数 {0} · 通关 {1} · 最高底注 {2} · 最佳出牌 {3} · 图鉴 {4}/{5}",
                       en: "Runs {0} · Wins {1} · Best ante {2} · Best hand {3} · Collection {4}/{5}" },

  /* 牌型等级 */
  hand_levels_title: { zh: "牌型等级", en: "Hand Levels" },

  /* 结束 */
  win_title:         { zh: "🎉 通关胜利!", en: "🎉 You win!" },
  lose_title:        { zh: "游戏结束", en: "Game over" },
  win_detail:        { zh: "你击败了全部 {0} 个底注!<br>最终资金: ${1}", en: "You beat all {0} antes!<br>Final money: ${1}" },
  fell_at:           { zh: "倒在了", en: "Defeated at" },
  endless_word:      { zh: "无尽模式", en: "Endless" },
  ante_word:         { zh: "底注", en: "Ante" },
  short_by:          { zh: "差 {0} 分", en: "{0} points short" },
  rounds_word:       { zh: "回合数", en: "Rounds" },
  fav_hand:          { zh: "最常出牌型", en: "Most played" },
  best_play:         { zh: "最佳出牌", en: "Best hand" },
  restart_btn:       { zh: "再来一局", en: "Play again" },
  endless_btn:       { zh: "♾️ 无尽模式", en: "♾️ Endless mode" },
  endless_start:     { zh: "♾️ 无尽模式!目标分数将持续增长", en: "♾️ Endless mode! Targets keep growing" },

  /* 存档 */
  msg_restored:      { zh: "📂 已恢复上局进度", en: "📂 Progress restored" },
  msg_restored_blind:{ zh: "📂 已恢复上局进度（回到盲注选择）", en: "📂 Progress restored (back to blind select)" },
  msg_restored_shop: { zh: "📂 已恢复上局进度（回到商店）", en: "📂 Progress restored (back to the shop)" },
};

function S(key, ...args) {
  let s = L(STR[key]) ?? key;
  args.forEach((a, i) => { s = s.replaceAll(`{${i}}`, a); });
  return s;
}
