/* =========================================================
   小丑牌 · JOKER — 音效与生成式 BGM (WebAudio)
   静音状态持久化于 localStorage("joker_muted")，M 键统一开关。
   ========================================================= */
"use strict";

/* ---------- 音效 (WebAudio) ---------- */
const AudioFX = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem("joker_muted") === "1"; } catch (e) { /* 忽略 */ }
  const ac = () => {
    ctx ||= new (window.AudioContext || window["webkitAudioContext"])();
    if (ctx.state === "suspended") ctx.resume();   // 浏览器自动播放策略
    return ctx;
  };
  function tone(freq, dur, type = "sine", vol = .18, when = 0) {
    if (muted) return;
    try {
      const c = ac(), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime + when);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + when + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + when); o.stop(c.currentTime + when + dur);
    } catch (e) { /* 忽略 */ }
  }
  /* 生成式 BGM：小调琶音 + 低音垫，节奏随底注加快；无音频文件。
     M 键静音是总开关；🎵 按钮可单独关 BGM 保留音效。 */
  let musicTimer = null, mStep = 0;
  let musicOff = false;
  try { musicOff = localStorage.getItem("joker_music") === "0"; } catch (e) { /* 忽略 */ }
  const CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];   // Am F C G
  function startMusic() {
    if (musicTimer) return;
    const tick = () => {
      const ante = (typeof G !== "undefined" && G.ante) || 1;
      if (!muted && !musicOff && !(typeof document !== "undefined" && document.hidden)) {
        const chord = CHORDS[Math.floor(mStep / 8) % CHORDS.length];
        const deg = chord[Math.floor(Math.random() * chord.length)] + (Math.random() < .3 ? 12 : 0);
        tone(220 * Math.pow(2, deg / 12), .38, "sine", .035);
        if (mStep % 8 === 0) tone(110 * Math.pow(2, chord[0] / 12), 1.3, "triangle", .04);
        mStep++;
      }
      musicTimer = setTimeout(tick, Math.max(170, 300 - Math.min(ante, 10) * 12));
    };
    tick();
  }

  return {
    startMusic,
    musicEnabled: () => !musicOff,
    toggleMusic: () => {
      musicOff = !musicOff;
      try { localStorage.setItem("joker_music", musicOff ? "0" : "1"); } catch (e) { /* 忽略 */ }
      return !musicOff;
    },
    toggleMute: () => {
      muted = !muted;
      try { localStorage.setItem("joker_muted", muted ? "1" : "0"); } catch (e) { /* 忽略 */ }
      return muted;
    },
    select: () => tone(520, .08, "triangle", .12),
    deselect: () => tone(380, .08, "triangle", .1),
    chip: i => tone(600 + i * 90, .1, "square", .07),
    joker: () => { tone(700, .1, "triangle", .12); tone(1050, .12, "triangle", .1, .06); },
    play: () => tone(440, .12, "triangle", .14),
    discard: () => tone(240, .12, "sawtooth", .08),
    buy: () => { tone(660, .1, "sine", .14); tone(880, .14, "sine", .12, .08); },
    money: () => { tone(880, .08, "square", .08); tone(1320, .1, "square", .07, .05); },
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .22, "triangle", .14, i * .1)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, .3, "sawtooth", .1, i * .14)),
    boss: () => { tone(150, .4, "sawtooth", .12); tone(147, .4, "sawtooth", .1, .05); },
  };
})();
