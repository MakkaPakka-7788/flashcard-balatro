# 小丑牌 · JOKER

Balatro 风格的纯前端网页卡牌游戏，无任何依赖，打开 `index.html` 即玩。中/英双语（侧边栏切换）。支持 PWA：部署到 HTTPS 后可安装到桌面/手机并离线游玩。

**在线试玩 / Play online:** https://azoway.github.io/balatro_game/

![对局截图 / Gameplay](screenshot.png)

> **English**: A Balatro-style roguelike deckbuilder in pure vanilla JS — zero dependencies, zero build step, just open `index.html`. Full English UI (toggle in the sidebar). Features: 12 poker hands incl. hidden ones, 54 Jokers across 6 mechanic classes (retriggers, scaling, held-in-hand, rule-benders, Blueprint copying, card growth) incl. 5 Legendaries, editions, tarot/spectral consumables that permanently sculpt your deck, booster packs, vouchers, 14 boss blinds, 5 starting decks, endless mode, daily runs, seeded share links (`?seed=…&deck=…`), achievements, collection & run history, offline PWA. Dev: `node test/test.js` (380 assertions incl. bot-driven full-run sims), `node test/balance.js` (win-rate / death-ante reports), `python3 test/e2e.py` (browser E2E).

## 玩法

- 开局选择模式与起始牌组（经典 / 红:+1弃牌 / 蓝:+1出牌 / 黄:开局$10 / 幽灵:带塔罗），从 8 张手牌中选至多 5 张出牌，按扑克牌型计分（筹码 × 倍率）
- 三种模式：**标准**（8 底注）、**⚡快速**（4 底注抽稀曲线，约 10 分钟一局）、**👹Boss Rush**（每个盲注都带随机 Boss 减益，开打才揭晓）；分享链接与深链支持 `&mode=`
- 侧边栏「今日挑战」「每周挑战」按 UTC 日期/ISO 周号生成全球统一种子，配合分享链接与好友同局比进度
- 12 种牌型：标准 10 种之上还有隐藏牌型**五条**（120×12）和**同花葫芦**（140×14）——只有用塔罗改造牌库才可能打出；12 张星球牌一一对应
- 每个底注需依次击败小盲注 / 大盲注 / Boss 盲注（14 种 Boss 减益：禁花色/人头、基础值减半、限制补牌、随机禁用小丑等，同局不重复）；共 8 个底注，通关后可进入无尽模式
- 跳过小盲/大盲换随机标签（7 种：金钱/免费刷新/牌型升级/白嫖小丑/优惠券折扣/投资/加倍）；商店塔罗位偶尔出现高风险的幻灵牌（销毁换钱、随机增强、复制牌、直接获得传奇小丑）
- 54 张小丑牌（含 5 张传奇：卡尼奥/特里布莱/约里克/奇科/佩尔科），机制包括：逐卡加成、重触发（黑客/悲喜面具/黄昏）、成长型（绿色小丑/坐公交/冰淇淋/方形/闪卡）、**持有触发**（男爵/射月/高举拳头按留在手中的牌生效）、**牌型规则改写**（四指: 4张成同花顺子；抄近路: 顺子可跳点；飞溅: 全牌计分）、**蓝图**（复制右侧小丑）、**徒步者**（计分牌永久+5筹码，写入整局牌库）；商店小丑随机附带版本（闪箔 +50 筹码 / 全息 +10 倍率 / 多彩 ×1.5 倍率）
- 回合胜利后进入商店：小丑牌（可用 ◀▶ 调整结算顺序）、星球牌（升级牌型）、塔罗牌（消耗品）、卡包（3 选 1）、优惠券（永久升级：槽位 / 刷新费 / 利息上限等，每种每局限购一次）
- 塔罗牌分两类：即时型（金钱翻倍、出牌/弃牌/手牌上限 +1 等）和目标型（回合中选中手牌后使用：改花色、点数 +1、附加增强、销毁牌）
- 卡牌增强 4 种：加成牌（+30 筹码）、倍率牌（+4 倍率）、钢铁牌（留在手中 ×1.5 倍率）、黄金牌（回合结束在手中 +$3）
- 牌库整局持久，点击右下角「牌库」可随时查看整副牌的现状与增强
- 金钱有利息（每 $5 得 $1，上限 $5，可用优惠券提到 $10）
- 侧边栏「❓ 玩法说明」内置 4 页图文教程；关键节点（首次商店/目标塔罗/Boss）有一次性提示；Boss 开局有登场横幅
- 结束画面可复制分享链接（`?seed=xxx&deck=yyy`），打开即复现同一局
- 13 个成就（含快速/Boss Rush 通关、每日+每周挑战者、倒爷、铁手等），图鉴页展示；图鉴收录小丑、塔罗·幻灵、优惠券三个分区；「导出/导入进度」可跨设备迁移存档与战绩
- 开挑战/新局时进行中的对局自动搁置，结束后一键恢复，进度不再互斥
- 生成式 BGM（WebAudio 琶音，节奏随底注加快，无音频文件），`M` 键总静音，「🎵」按钮可单独关音乐留音效

## 操作

| 按键 | 功能 |
|------|------|
| 鼠标点击 / `1`-`9` | 选牌（商店中为购买，卡包中为选取） |
| `Enter` | 出牌 / 选择盲注 / 商店进入下一回合 |
| `X` | 弃牌 / 跳过盲注 / 放弃卡包 |
| `R` / `S` | 按点数 / 花色排序（商店中 `R` 为刷新） |
| `Esc` | 取消选牌 / 关闭弹层 |
| `M` | 静音（自动记忆） |
| 计分中点击屏幕 | 4 倍速快进 |
| 点击消耗品 ×2 | 使用塔罗牌 |
| 点击小丑牌 ×2 | 卖出；悬停出现 ◀▶ 可调顺序 |

进度自动保存在浏览器 localStorage（含回合中的手牌与牌库），刷新后可从中断处继续。跨局战绩、小丑图鉴与最近 10 局历史（可一键用原种子复盘）见侧边栏「图鉴」。

## 种子与每日挑战

牌局随机使用可播种 RNG（mulberry32），同一种子可复现整局。侧边栏「今日挑战」按当天 UTC 日期生成固定种子（全球同一天同一局）；点击「种子」一行可输入自定义种子开局。

## 结构

```
index.html    页面骨架
style.css     样式（含竖屏手机适配）
i18n.js       国际化（zh/en 字典、L/S 工具）
defs.js       数据定义（牌型 / Boss / 小丑 / 星球 / 塔罗 / 卡包 / 优惠券 / 版本 / 牌组 / 模式 / 标签）
engine.js     引擎（RNG / 状态 / 存档 / 牌型判定 / 纯函数计分 / 卡包 / 跨局统计）
audio.js      音效与生成式 BGM (WebAudio)
ui.js         渲染 / 动画 / 流程
main.js       事件绑定 / 键盘 / PWA 注册 / 启动（必须最后加载）
sw.js         Service Worker（网络优先、缓存兜底）
manifest.json PWA 清单
jsconfig.json checkJs 类型检查 + 编辑器智能提示（JSDoc typedef，CI 强制 tsc --noEmit）
```

## 开发

```bash
node test/test.js                  # 回归测试：牌型/计分/塔罗/商店/存档迁移/SW校验 + 机器人整局模拟
python3 test/e2e.py                # 浏览器 E2E（需 playwright + chromium-headless-shell）

# 平衡实验 CLI（多进程分片，500 局约 40 秒）
node test/balance.js report --runs=500            # 胜率(Wilson区间)/死亡分布/分Boss击杀率/分差/经济
node test/balance.js report --mode=boss_rush      # 按模式仿真（quick / boss_rush）
node test/balance.js tiers --runs=300             # 三档机器人(novice/standard/expert)难度带校验
node test/balance.js compare --ante-b=100,300,... # 同种子配对 A/B 对比候选目标曲线
node test/balance.js jokers --runs=40             # 单卡受控实验：逐小丑测边际底注增益
node test/balance.js check                        # 基线守护：越出容差带即报错（--update 重定基线）
```

仓库配有 GitHub Actions（`.github/workflows/test.yml`）：push / PR 自动跑全量回归、平衡基线守护、tsc 类型检查、ESLint 与浏览器 E2E（`eslint.config.mjs` 按六个源文件的顶层声明自动生成全局白名单，本地 `npx eslint .` 可跑）。

所有可调数值集中在 `defs.js` 的 `BALANCE` 对象。`test/test.js` 会校验 sw.js 资源清单，并在静态资源相对 HEAD 有改动而 `CACHE` 版本未升级时报错；`test/balance-baseline.json` 记录平衡容差带，内容改动破坏曲线时 `check` 模式会拦截。
