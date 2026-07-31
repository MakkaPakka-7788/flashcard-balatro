// @ts-nocheck —— 测试走 node 直跑，类型检查只覆盖游戏源码
/* =========================================================
   平衡实验 CLI —— 多进程分片 + 置信区间 + 三档机器人 + 受控实验

   node test/balance.js report  [--runs=500] [--bot=standard] [--deck=classic] [--ante=..] [--shards=N]
       批量仿真：胜率(Wilson 区间)、死亡底注/Boss 分布、分差、经济、牌型与小丑数据
   node test/balance.js tiers   [--runs=300]
       三档机器人(novice/standard/expert)各跑一遍，校验难度带
   node test/balance.js compare --ante-b=100,300,... [--runs=400]
       同种子配对 A/B：当前曲线 vs 候选曲线，输出逐种子胜负差
   node test/balance.js jokers  [--runs=40] [--rarity=all]
       单卡受控实验：开局白送小丑 X vs 空白组，测每张卡的边际底注增益
   node test/balance.js check   [--update]
       基线守护：对照 test/balance-baseline.json 的容差带，越界报错
   ========================================================= */
"use strict";
const { execFileSync, execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const MODE = args.find(a => !a.startsWith("--")) || "report";
const opt = (name, dflt) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const RUNS = parseInt(opt("runs", MODE === "jokers" ? "40" : MODE === "check" ? "150" : MODE === "tiers" ? "300" : "500"), 10);
const SHARDS = Math.max(1, parseInt(opt("shards", String(Math.min(8, os.cpus().length - 1))), 10));
const SEED0 = 10007, SEEDSTEP = 7919;

/* ---------- worker 模式：执行任务清单并输出 JSON ---------- */
if (MODE === "--worker" || args.includes("--worker")) {
  const jobsFile = opt("jobs", null);
  const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
  const { compileGame, enableFastClock, makeBot } = require("./harness");
  const api = compileGame();
  enableFastClock();
  const bots = {};
  (async () => {
    const out = [];
    for (const job of jobs) {
      if (job.ante) api.ANTE_BASE.splice(0, api.ANTE_BASE.length, ...job.ante);
      bots[job.bot] ||= makeBot(api, job.bot);
      const r = await bots[job.bot].simulate(job.seed, job.deck, { grantJoker: job.grantJoker, mode: job.mode });
      out.push({ ...job, ...r, handTypes: r.handTypes, jokersOwned: r.jokers });
    }
    process.stdout.write(JSON.stringify(out));
  })().catch(e => { console.error(e); process.exit(1); });
  return;
}

/* ---------- 父进程：分片执行任务 ---------- */
function runTasks(tasks) {
  const shards = Array.from({ length: SHARDS }, () => []);
  tasks.forEach((t, i) => shards[i % SHARDS].push(t));
  const t0 = Date.now();
  const results = [];
  const files = [];
  const procs = shards.filter(s => s.length).map((shard, i) => {
    const f = path.join(os.tmpdir(), `joker-balance-${process.pid}-${i}.json`);
    fs.writeFileSync(f, JSON.stringify(shard));
    files.push(f);
    return new Promise((res, rej) => {
      execFile(process.execPath, [__filename, "--worker", `--jobs=${f}`],
        { maxBuffer: 1 << 28 }, (err, stdout) => {
          if (err) return rej(err);
          results.push(...JSON.parse(stdout));
          res();
        });
    });
  });
  return Promise.all(procs).then(() => {
    files.forEach(f => { try { fs.unlinkSync(f); } catch (e) { /* 忽略 */ } });
    console.log(`(${tasks.length} 局 · ${SHARDS} 分片 · ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    return results;
  });
}

const seeds = n => Array.from({ length: n }, (_, i) => SEED0 + i * SEEDSTEP);
const mkTasks = (n, over = {}) => seeds(n).map(seed => ({
  seed, deck: opt("deck", "classic"), bot: opt("bot", "standard"),
  mode: opt("mode", "normal"),
  ante: opt("ante", null)?.split(",").map(Number) || null, ...over,
}));

/* Wilson 95% 置信区间 */
function wilson(k, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const e = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d;
  return [Math.max(0, c - e), Math.min(1, c + e)];
}
const pct = x => (x * 100).toFixed(1) + "%";

function summarize(rs, label = "") {
  const n = rs.length;
  const wins = rs.filter(r => r.result === "win").length;
  const losses = rs.filter(r => r.result === "lose");
  const [lo, hi] = wilson(wins, n);
  const avg = f => rs.reduce((s, r) => s + f(r), 0) / n;
  console.log(`\n—— ${label || "报告"} · ${n} 局 ——`);
  console.log(`胜率: ${wins}/${n} = ${pct(wins / n)}  [${pct(lo)}, ${pct(hi)}]`);
  const byAnte = {};
  losses.forEach(r => byAnte[r.ante] = (byAnte[r.ante] || 0) + 1);
  console.log("死亡底注分布:");
  Object.keys(byAnte).sort((a, b) => a - b).forEach(a => {
    console.log(`  底注 ${a}: ${"█".repeat(Math.round(byAnte[a] / n * 60))} ${byAnte[a]} (${pct(byAnte[a] / n)})`);
  });
  console.log(`平均死亡底注 ${avg(r => r.ante).toFixed(2)} · 死亡时分差 ${pct(1 - avg(r => r.result === "lose" ? r.scoreRatio : 1))} · 终局$${avg(r => r.money).toFixed(1)} · 小丑${avg(r => r.jokersOwned.length).toFixed(1)}`);
  // 分 Boss 死亡率（死亡数 / 遭遇数）
  const faced = {}, killed = {};
  rs.forEach(r => {
    r.bossesFaced.forEach(b => faced[b] = (faced[b] || 0) + 1);
    if (r.result === "lose" && r.deathBlind === 2 && r.deathBoss) killed[r.deathBoss] = (killed[r.deathBoss] || 0) + 1;
  });
  const bossRows = Object.keys(faced)
    .map(b => ({ b, faced: faced[b], rate: (killed[b] || 0) / faced[b] }))
    .sort((a, x) => x.rate - a.rate);
  console.log("Boss 击杀率（死亡/遭遇）:");
  bossRows.forEach(r => console.log(`  ${r.b.padEnd(9)} ${pct(r.rate).padStart(6)}  (${killed[r.b] || 0}/${r.faced})`));
  // 牌型使用
  const ht = {};
  rs.forEach(r => Object.entries(r.handTypes).forEach(([k, v]) => ht[k] = (ht[k] || 0) + v));
  const totalHands = Object.values(ht).reduce((a, b) => a + b, 0) || 1;
  console.log("牌型使用: " + Object.entries(ht).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${k} ${pct(v / totalHands)}`).join(" · "));
  return { n, wins, winRate: wins / n, ci: [lo, hi], avgDeathAnte: avg(r => r.ante), byAnte, bossRows };
}

(async () => {
  if (MODE === "report") {
    const rs = await runTasks(mkTasks(RUNS));
    summarize(rs, `${opt("bot", "standard")} · ${opt("deck", "classic")}`);
  }

  else if (MODE === "tiers") {
    for (const bot of ["novice", "standard", "expert"]) {
      const rs = await runTasks(mkTasks(RUNS, { bot }));
      summarize(rs, `机器人 ${bot}`);
    }
    console.log("\n机器人校准中心（标准模式同种子样本）: novice ~1% < standard ~36% < expert ~42%；小样本请以 Wilson 区间为准");
  }

  else if (MODE === "compare") {
    const anteB = opt("ante-b", null)?.split(",").map(Number);
    if (!anteB) { console.error("需要 --ante-b=100,300,..."); process.exit(1); }
    const A = await runTasks(mkTasks(RUNS));
    const B = await runTasks(mkTasks(RUNS, { ante: anteB }));
    const a = summarize(A, "A: 当前曲线");
    const b = summarize(B, "B: 候选曲线");
    // 同种子配对
    const byS = {};
    A.forEach(r => byS[r.seed] = { a: r });
    B.forEach(r => (byS[r.seed] ||= {}).b = r);
    let bBetter = 0, aBetter = 0, anteDelta = 0;
    Object.values(byS).forEach(({ a: ra, b: rb }) => {
      if (!ra || !rb) return;
      const va = ra.result === "win" ? 99 : ra.ante, vb = rb.result === "win" ? 99 : rb.ante;
      if (vb > va) bBetter++; else if (va > vb) aBetter++;
      anteDelta += Math.min(vb, 20) - Math.min(va, 20);
    });
    console.log(`\n配对对比: B更深 ${bBetter} 局 · A更深 ${aBetter} 局 · 平均底注差 ${(anteDelta / RUNS).toFixed(2)}`);
  }

  else if (MODE === "jokers") {
    const { compileGame } = require("./harness");
    const api = compileGame();
    const rarity = opt("rarity", "all");
    const ids = api.JOKER_DEFS.filter(d => rarity === "all" || d.rarity === rarity).map(d => d.id);
    const base = await runTasks(mkTasks(RUNS, { grantJoker: null }));
    const baseAvg = base.reduce((s, r) => s + (r.result === "win" ? 10 : r.ante), 0) / base.length;
    console.log(`空白组平均到达底注: ${baseAvg.toFixed(2)}（win 计为 10）`);
    const tasks = [];
    for (const id of ids) tasks.push(...mkTasks(RUNS, { grantJoker: id }));
    const rs = await runTasks(tasks);
    const rows = ids.map(id => {
      const sub = rs.filter(r => r.grantJoker === id);
      const avg = sub.reduce((s, r) => s + (r.result === "win" ? 10 : r.ante), 0) / sub.length;
      return { id, gain: avg - baseAvg, wins: sub.filter(r => r.result === "win").length };
    }).sort((a, b) => b.gain - a.gain);
    console.log("\n单卡边际底注增益（开局白送 vs 空白组，正=更强）:");
    rows.forEach(r => {
      const def = api.JOKER_BY_ID.get(r.id);
      const bar = r.gain >= 0 ? "+".repeat(Math.round(r.gain * 10)) : "-".repeat(Math.round(-r.gain * 10));
      console.log(`  ${(def.icon + " " + r.id).padEnd(18)} ${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(2)} ${bar}${r.wins ? ` (win×${r.wins})` : ""} $${def.cost} ${def.rarity}`);
    });
  }

  else if (MODE === "check") {
    const rs = await runTasks(mkTasks(RUNS));
    // 软锁守护：机器人以 stuck:* 收场 = 状态机无法推进，是回归的强信号。
    // 不能靠容差带兜底——少量软锁只会把胜率拉低几个百分点，仍在带内绿灯通过。
    const stuck = rs.filter(r => String(r.result).startsWith("stuck"));
    if (stuck.length) {
      console.error(`\n✗ ${stuck.length}/${rs.length} 局机器人软锁（状态机停摆）:`);
      stuck.slice(0, 10).forEach(r => console.error(`  seed=${r.seed} deck=${r.deck} → ${r.result}`));
      process.exit(1);
    }
    const s = summarize(rs, "基线检查");
    const basePath = path.join(__dirname, "balance-baseline.json");
    const current = {
      runs: s.n,
      winRate: +(s.winRate).toFixed(4),
      avgDeathAnte: +s.avgDeathAnte.toFixed(2),
      maxAnteShare: +Math.max(...Object.values(s.byAnte).map(v => v / s.n)).toFixed(3),
    };
    if (args.includes("--update") || !fs.existsSync(basePath)) {
      // 容差带：胜率 ±6pp、平均死亡底注 ±0.8、单底注死亡占比上限 = 当前+10pp
      const baseline = {
        winRate: [Math.max(0, current.winRate - 0.06), current.winRate + 0.06],
        avgDeathAnte: [current.avgDeathAnte - 0.8, current.avgDeathAnte + 0.8],
        maxAnteShare: Math.min(0.5, current.maxAnteShare + 0.1),
        generatedWith: current,
      };
      fs.writeFileSync(basePath, JSON.stringify(baseline, null, 2) + "\n");
      console.log("\n✔ 基线已写入 test/balance-baseline.json");
    } else {
      const b = JSON.parse(fs.readFileSync(basePath, "utf8"));
      const bad = [];
      if (current.winRate < b.winRate[0] || current.winRate > b.winRate[1])
        bad.push(`胜率 ${pct(current.winRate)} 超出带 [${pct(b.winRate[0])}, ${pct(b.winRate[1])}]`);
      if (current.avgDeathAnte < b.avgDeathAnte[0] || current.avgDeathAnte > b.avgDeathAnte[1])
        bad.push(`平均死亡底注 ${current.avgDeathAnte} 超出带 [${b.avgDeathAnte}]`);
      if (current.maxAnteShare > b.maxAnteShare)
        bad.push(`死亡尖峰 ${pct(current.maxAnteShare)} 超过上限 ${pct(b.maxAnteShare)}`);
      if (bad.length) {
        console.error("\n✗ 平衡基线越界（内容改动可能破坏了曲线，或需 --update 重定基线）:");
        bad.forEach(x => console.error("  " + x));
        process.exit(1);
      }
      console.log("\n✔ 平衡指标在基线容差带内");
    }
  }

  else {
    console.error(`未知模式: ${MODE}（可用: report / tiers / compare / jokers / check）`);
    process.exit(1);
  }
})().catch(e => { console.error("CRASH:", e); process.exit(1); });
