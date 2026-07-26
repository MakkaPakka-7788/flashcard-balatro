#!/usr/bin/env python3
"""浏览器级 E2E 冒烟测试。

依赖: pip install playwright && playwright install chromium-headless-shell
运行: python3 test/e2e.py

覆盖: 开局/出牌计分 → 中途刷新恢复 → 牌库查看 → 帮助 → 商店/卡包 →
      牌组选择 → 键盘操作 → 分享链接 → 深链(?seed/?daily) → 商店刷新恢复 →
      死局判负 → 消息堆叠 → 键盘选牌 → 塔罗即时生效 → 英文界面 → 全程无 JS 错误
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri()

errors = []
checks = []


def check(name, ok, detail=""):
    checks.append((name, ok))
    print(("✓" if ok else "✗ FAIL"), name, detail)


with sync_playwright() as p:
    # CI / 沙箱可用 PW_CHROMIUM 指定系统 Chromium，免下载浏览器
    exe = os.environ.get("PW_CHROMIUM")
    browser = p.chromium.launch(executable_path=exe) if exe else p.chromium.launch()
    page = browser.new_page()
    page.on("pageerror", lambda e: errors.append("PAGEERROR: " + str(e)))
    page.on("console", lambda m: errors.append("CONSOLE: " + m.text) if m.type == "error" else None)

    # --- 开局与出牌 ---
    page.goto(URL)
    page.wait_for_timeout(500)
    check("盲注选择可见", page.is_visible("#blind-select"))
    page.click("button[data-i='0']")
    page.wait_for_timeout(800)
    check("发满8张手牌", page.locator("#hand .card").count() == 8)
    cards = page.locator("#hand .card")
    cards.nth(0).click()
    cards.nth(1).click()
    page.click("#play-btn")
    page.wait_for_timeout(6500)
    score = page.evaluate("() => G.roundScore")
    check("出牌得分", score > 0, f"score={score}")

    # --- 中途刷新恢复 ---
    snap = page.evaluate("() => ({ hand: G.hand.map(c=>c.rank+c.suit).join(','), score: G.roundScore })")
    page.reload()
    page.wait_for_timeout(700)
    after = page.evaluate("() => ({ hand: G.hand.map(c=>c.rank+c.suit).join(','), score: G.roundScore, state: G.state })")
    check("刷新后恢复回合", after["state"] == "playing" and after["hand"] == snap["hand"] and after["score"] == snap["score"])

    # --- 牌库查看 / 帮助 ---
    page.click("#deck-info")
    page.wait_for_timeout(200)
    check("牌库查看器4行花色", page.locator("#deck-grid .dv-row").count() == 4)
    page.keyboard.press("Escape")
    page.click("#help-btn")
    page.wait_for_timeout(200)
    check("帮助弹层可见", page.is_visible("#help"))
    page.click("#help-next-btn")
    title = page.text_content("#help-title")
    check("帮助翻页", "2/" in title, title)
    page.keyboard.press("Escape")

    # --- 商店 / 卡包（注入状态直达） ---
    r = page.evaluate("""() => {
      G.money = 99; openShop();
      const kinds = G.shopStock.map(i => i.kind);
      openPack('buffoon'); showPackOverlay();
      const packVisible = !document.getElementById('pack-open').classList.contains('hidden');
      pickPack(0);
      return { kinds, packVisible, jokers: G.jokers.length };
    }""")
    check("商店含全部品类", all(k in r["kinds"] for k in ["joker", "planet", "pack", "voucher"]), str(r["kinds"]))
    check("卡包3选1入手", r["packVisible"] and r["jokers"] >= 1)
    page.keyboard.press("Enter")   # 下一回合 → 盲注选择
    page.wait_for_timeout(300)
    check("Enter进入盲注选择", page.evaluate("() => G.state") == "blind-select")

    # --- 牌组选择 + 分享链接 ---
    page.click("#new-run-btn")
    page.click("#new-run-btn")
    page.wait_for_timeout(300)
    check("牌组5选1", page.locator("#deck-options .shop-item").count() == 5)
    page.locator("#deck-options .buy-btn").nth(3).click()   # 黄牌组
    page.wait_for_timeout(300)
    check("黄牌组开局$10", page.evaluate("() => G.money") == 10)
    link = page.evaluate("() => shareLink()")
    seed = page.evaluate("() => G.seed")
    check("分享链接含种子", f"seed={seed}" in link and "deck=yellow" in link, link)

    # --- URL 种子深链 ---
    page.goto(URL + "?seed=13579&deck=red")
    page.wait_for_timeout(600)
    r = page.evaluate("() => ({ seed: G.seed, deck: G.deckId, discards: G.bonusDiscards })")
    check("URL深链开局", r["seed"] == 13579 and r["deck"] == "red" and r["discards"] == 1, str(r))

    # --- 每日挑战深链（manifest shortcut 用） ---
    page.goto(URL + "?daily=1")
    page.wait_for_timeout(600)
    check("daily深链直达今日挑战", page.evaluate("() => G.seed === todaySeed()"))

    # --- v6+: 商店中刷新恢复同一货架 ---
    snap = page.evaluate("""() => {
      G.money = 50; openShop();
      G.shopStock[0].sold = true; G.rerollCost = 9; saveGame();
      return G.shopStock.map(i => (i.def.id || i.def.kind) + ':' + !!i.sold).join(',');
    }""")
    page.reload()
    page.wait_for_timeout(700)
    r = page.evaluate("() => ({ state: G.state, stock: G.shopStock.map(i => (i.def.id || i.def.kind) + ':' + !!i.sold).join(','), cost: G.rerollCost })")
    check("商店刷新恢复同一货架", r["state"] == "shop" and r["stock"] == snap and r["cost"] == 9, str(r))

    # --- 死局：弃光极小牌库 → 判负而非胜利 ---
    page.evaluate("""() => {
      localStorage.removeItem('joker_save_v1');
      newGameState(883);
      G.masterDeck = G.masterDeck.slice(0, 6);
      G.boss = BOSSES[0];
      startBlind(0);
      G.selected = new Set(G.hand.map(c => c.id));
      discard();
    }""")
    page.wait_for_timeout(1600)
    check("死局判负弹结算", page.evaluate("() => G.state") == "over" and page.is_visible("#end-screen"))

    # --- flash 消息堆叠 + aria-live ---
    n = page.evaluate("""() => {
      flashMessage('一'); flashMessage('二');
      const box = document.getElementById('flash-stack');
      return { c: box.children.length, live: box.getAttribute('aria-live') };
    }""")
    check("消息堆叠含aria-live", n["c"] >= 2 and n["live"] == "polite", str(n))

    # --- 卡牌键盘可达：焦点 + Enter 选中（不误触全局出牌） ---
    page.evaluate("() => { localStorage.removeItem('joker_save_v1'); document.getElementById('end-screen').classList.add('hidden'); newGame(7); startBlind(0); }")
    page.wait_for_timeout(400)
    page.focus("#hand .card")
    page.keyboard.press("Enter")
    page.wait_for_timeout(150)
    check("焦点卡牌Enter选中", page.evaluate("() => G.selected.size") == 1 and page.evaluate("() => G.state") == "playing")

    # --- 力量塔罗回合中即时生效 ---
    check("力量塔罗立即+1弃牌", page.evaluate("""() => {
      const b = G.discardsLeft;
      TAROTS.find(t => t.id === 'strength').apply(G);
      return G.discardsLeft === b + 1;
    }"""))

    # --- 英文界面 ---
    page.evaluate("() => localStorage.setItem('joker_lang', 'en')")
    page.reload()
    page.wait_for_timeout(600)
    check("英文界面", page.evaluate("() => document.title") == "JOKER — a Balatro-like")
    page.evaluate("() => { localStorage.setItem('joker_lang', 'zh'); localStorage.removeItem('joker_save_v1'); }")

    browser.close()

failed = [n for n, ok in checks if not ok]
if errors:
    print("\nJS 错误:")
    for e in errors:
        print(" ", e)
print(f"\n结果: {len(checks) - len(failed)}/{len(checks)} 通过" + (f", JS错误 {len(errors)}" if errors else ""))
sys.exit(1 if (failed or errors) else 0)
