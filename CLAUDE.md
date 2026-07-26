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
4. **存档加字段**：`saveGame` 的 `v` 升版本 + `loadGame` 用 `??` 给默认值 + 加旧档迁移测试（现 v6，已有 v2/v3/v4/v5 用例；v6 起商店货架随档保存）
5. **改数值先跑仿真**：见下方平衡流程；`balance.js check` 越出基线容差带会报错

## 测试（三层）

```bash
node test/test.js          # 全量回归（~365 断言 + 3 局整局模拟，约 1 分钟）
node test/test.js --fast   # 秒级：快进时钟 + 跳过整局模拟（日常迭代用，提交前跑全量）
python3 test/e2e.py        # 浏览器 E2E 15 项（需 playwright + chromium-headless-shell；macOS 上用 python3.13）
```

`test/harness.js`：DOM 桩 + 源码编译 + 快进时钟 + 三档策略机器人(novice/standard/expert)，test.js 与 balance.js 共用。新增全局符号要给测试用时，加进 harness 的 module.exports 列表。

push 后 GitHub Actions（`.github/workflows/test.yml`）自动跑全量回归 + `balance.js check` + ESLint。`eslint.config.mjs` 按六个源文件的顶层声明自动生成全局白名单——新增全局符号无需改它。

## 平衡调参流程

数值全部集中在 `defs.js` 的 `BALANCE`。流程：改数值 → 跑仿真对比 → 采纳则在数值旁写注释记录数据依据 → `check` 确认。

```bash
node test/balance.js report --runs=500 [--mode=quick|boss_rush] [--bot=novice|expert]
node test/balance.js compare --ante-b=100,300,...   # 同种子配对 A/B
node test/balance.js jokers --runs=300              # 单卡边际底注增益（约 22 分钟）
node test/balance.js check [--update]               # 基线守护（test/balance-baseline.json）
```

已知校准点：白板小丑增益 +0.21 是"占槽替换基准"；机器人盲区（不付费刷新/不打4张同花/无构筑协同），闪卡、四指、抄近路、蓝图、男爵、飞溅、三张重触发卡的单卡数据失真，**不要据此调价**。难度阶梯：快速 ~10% > 标准 ~3% > Boss Rush ~1.7%（standard 机器人胜率）。

## 其他约定

- localStorage 键：`joker_save_v1`(存档) / `joker_save_parked`(搁置位) / `joker_stats_v1`(跨局统计与成就) / `joker_lang` / `joker_muted` / `joker_music` / `joker_tips_v1`
- 破坏性操作一律"两次点击确认"模式（卖小丑/用消耗品/重新开局）
- 死局兜底：`checkDeadEnd()`（ui.js）在出牌/弃牌/开局/读档四条路径后统一判定"无牌可打"并按当前分数结算——牌库可被吊人/献祭缩到极小，别再让单条路径自行处理
- 今日/每周挑战种子均按 UTC 日期生成（v1.3.0 起今日挑战由本地日期改为 UTC）
- 提交信息用英文、正文列要点；README 中文为主带英文简介段
- 用户习惯：每轮改动完成后询问再 push；commit 由本仓库约定的协作流程生成
