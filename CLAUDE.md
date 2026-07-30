# 小丑牌 · JOKER — 项目备忘（给未来的开发会话）

Balatro 风格纯前端卡牌游戏。**零依赖、零构建**：classic `<script>` 标签共享顶层作用域，打开 `index.html` 即玩。部署在 GitHub Pages（`git push` 即发布）。

## 架构与加载顺序（不可打乱）

```
i18n.js   → LANG / L(双语对象取值) / S(模板文案) / STR 字典
defs.js   → GAME_VERSION、BALANCE(全部可调数值)、卡牌/Boss/模式/成就等纯数据定义
engine.js → G(全局状态)、RNG、存档、牌型判定、纯函数计分 computeScoring、跨局统计
audio.js  → AudioFX(音效 + 生成式 BGM)
ui.js     → 渲染 / 动画 / 流程(playHand、商店、弹层)
main.js   → 事件绑定 / 键盘 / PWA 注册 / 启动（必须最后）
```

- 不用 ES modules；跨文件靠全局约定。函数声明随处可调，顶层 const 只在运行时被引用所以顺序安全
- `computeScoring(cards, g)` 是**纯函数**，返回完整计分步骤序列；`playHand` 只负责播放动画。改计分逻辑只改它，测试直接断言 total
- 影响玩法的随机一律用播种的 `rng()`/`rnd()`（同种子同牌局是核心承诺）；纯视觉随机(彩带/BGM)用 `Math.random`

## 铁律（有测试强制）

1. **改任何静态资源必须升版本**：`defs.js` 的 `GAME_VERSION` 与 `sw.js` 的 `CACHE = "joker-" + 版本` 必须一致，且相对 git HEAD 资源有改动时 CACHE 必须已升级——`test/test.js` 会拦截
2. **i18n**：所有玩家可见文案走 `S("key")` 或 `data-i18n`，键必须在 `i18n.js` 且中英齐全——有覆盖测试
3. **新增小丑牌**必须在 `test/test.js` 的触发审计 `SCEN` 表里加"目标场景真正生效"的断言（规则改写/成长类进 `AUDIT_EXEMPT` 并写单测）
4. **存档加字段**：`saveGame` 的 `v` 升版本 + `loadGame` 用 `??` 给默认值 + 加旧档迁移测试（现 v8，已有 v2-v7 用例；v6 起商店货架、v7 起结算屏与出牌意图、v8 起每日/每周挑战标志随档保存）
5. **改数值先跑仿真**：见下方平衡流程；`balance.js check` 越出基线容差带会报错

## 测试（三层）

```bash
node test/test.js          # 全量回归（~422 断言 + 3 局整局模拟，约 1 分钟）
node test/test.js --fast   # 秒级：快进时钟 + 跳过整局模拟（日常迭代用，提交前跑全量）
python3 test/e2e.py        # 浏览器 E2E 23 项（需 playwright + chromium-headless-shell；macOS 上用 python3.13；可用 PW_CHROMIUM 指定系统浏览器）
```

`test/harness.js`：DOM 桩 + 源码编译 + 快进时钟 + 三档策略机器人(novice/standard/expert)，test.js 与 balance.js 共用。新增全局符号要给测试用时，加进 harness 的 module.exports 列表。

push 后 GitHub Actions（`.github/workflows/test.yml`）自动跑全量回归 + `balance.js check` + tsc 类型检查 + ESLint + 浏览器 E2E。`eslint.config.mjs` 按六个源文件的顶层声明自动生成全局白名单——新增全局符号无需改它。

类型检查已开（jsconfig `checkJs` + JSDoc，CI 跑 `npx tsc --noEmit`）：新增小丑/消耗品回调字段先登记进 defs.js 的 `JokerDef` / `ConsumableDef` typedef；测试文件用 `// @ts-nocheck` 豁免；DOM 宽松访问用 `/** @type {any} */` 局部放行，别全局关检查。

## 平衡调参流程

数值全部集中在 `defs.js` 的 `BALANCE`。流程：改数值 → 跑仿真对比 → 采纳则在数值旁写注释记录数据依据 → `check` 确认。

```bash
node test/balance.js report --runs=500 [--mode=quick|boss_rush] [--bot=novice|expert]
node test/balance.js compare --ante-b=100,300,...   # 同种子配对 A/B
node test/balance.js jokers --runs=300              # 单卡边际底注增益（约 22 分钟）
node test/balance.js check [--update]               # 基线守护（test/balance-baseline.json）
```

已知校准点：机器人现已穷举真实计分（含 Boss、持有触发、规则改写）、对未知牌堆做不消耗 RNG 的弃牌抽样，并按构筑选择商店/卡包；仍不做跨回合牌库概率规划，也不评估跳盲标签的长期价值。2026-07 的标准模式同种子样本：novice ~1%、standard ~34-36%、expert ~42%（100-150 局，具体看 Wilson 区间）。机器人策略升级后旧版单卡边际增益不可直接比较，调价前需重跑 `jokers` 实验。

## 其他约定

- localStorage 键：`joker_save_v1`(存档) / `joker_save_parked`(搁置位) / `joker_stats_v1`(跨局统计与成就) / `joker_lang` / `joker_muted` / `joker_music` / `joker_tips_v1` / `joker_errors_v1`(最近5条JS错误，随导出码附带)
- 破坏性操作一律"两次点击确认"模式（卖小丑/用消耗品/重新开局），统一走 ui.js 的 `confirmTwice`（全局同刻只允许一个武装确认）
- 死局兜底：`checkDeadEnd()`（ui.js）在出牌/弃牌/开局/读档/用消耗品五条路径后统一判定"无牌可打"并按当前分数结算——牌库可被吊人/献祭缩到极小，别再让单条路径自行处理
- 导入的"存档码"按敌意输入对待：`loadGame` 用 `sanitizeCards` 白名单重建卡牌字段（masterDeck/mid.hand/mid.deck），cashout.lines 强制字符串二元组 + 渲染端 esc，pendingPack 按定义表过滤失效 id
- 今日/每周挑战种子均按 UTC 日期生成（v1.3.0 起今日挑战由本地日期改为 UTC）
- 提交信息用英文、正文列要点；README 中文为主带英文简介段
- 用户习惯：每轮改动完成后询问再 push；commit 由本仓库约定的协作流程生成
