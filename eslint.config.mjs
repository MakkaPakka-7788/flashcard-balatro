/* 零构建仓库的 dev-only 静态检查（运行: npx --yes eslint@9 . ；CI 自动执行）。
   六个源文件共享顶层作用域，no-undef 可拦截"引用了不存在的全局符号"的笔误——
   这是 classic <script> 架构在运行时之外唯一的防线。
   全局白名单直接扫描各源文件的顶层声明生成，新增全局符号无需改本文件。 */
import fs from "node:fs";

const SOURCES = ["i18n.js", "defs.js", "engine.js", "audio.js", "ui.js", "main.js"];
const shared = {};
for (const f of SOURCES) {
  const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
  for (const m of src.matchAll(/^(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    shared[m[1]] = "writable";
  }
}

const browserGlobals = Object.fromEntries([
  "window", "document", "localStorage", "navigator", "location", "history",
  "performance", "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "URLSearchParams", "AudioContext", "btoa", "atob", "escape", "unescape",
  "alert", "prompt", "confirm", "fetch", "console", "matchMedia",
].map(k => [k, "readonly"]));

export default [
  { ignores: ["test/**"] },
  {
    files: SOURCES,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...browserGlobals, ...shared },
    },
    rules: { "no-undef": "error" },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { self: "readonly", caches: "readonly", fetch: "readonly", console: "readonly" },
    },
    rules: { "no-undef": "error" },
  },
];
