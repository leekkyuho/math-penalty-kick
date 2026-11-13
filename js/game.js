(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /* =====================================================================
     DIFFICULTY — each gen() returns {text, answer, step}; step is the
     answer's granularity (1 or 0.1) used to build near-miss distractors.
  ===================================================================== */
  const LEVELS = {
    mid: { label: '중학년', grade: '3~4학년', gen() {
      const r = Math.random();
      if (r < 0.35) { const a = rnd(15, 79), b = rnd(12, 99 - a); return { text: `${a} + ${b} = ?`, answer: a + b, step: 1 }; }
      if (r < 0.7) { const a = rnd(30, 99), b = rnd(11, a - 5); return { text: `${a} − ${b} = ?`, answer: a - b, step: 1 }; }
      const a = rnd(2, 9), b = rnd(2, 9); return { text: `${a} × ${b} = ?`, answer: a * b, step: 1 };
    } },
    high: { label: '고학년', grade: '5~6학년', gen() {
      const r = Math.random();
      if (r < 0.2) { const a = rnd(3, 9), b = rnd(3, 9), c = rnd(5, 40); return { text: `${a} × ${b} + ${c} = ?`, answer: a * b + c, step: 1 }; }
      if (r < 0.36) { const a = rnd(3, 9), b = rnd(3, 9), c = rnd(a * b + 5, 99); return { text: `${c} − ${a} × ${b} = ?`, answer: c - a * b, step: 1 }; }
      if (r < 0.54) { const a = rnd(12, 49), b = rnd(2, 9); return { text: `${a} × ${b} = ?`, answer: a * b, step: 1 }; }
      if (r < 0.7) { const b = rnd(2, 9), q = rnd(3, 12); return { text: `${b * q} ÷ ${b} = ?`, answer: q, step: 1 }; }
      if (r < 0.86) { const a = rnd(11, 89), b = rnd(11, 89); return { text: `${(a / 10).toFixed(1)} + ${(b / 10).toFixed(1)} = ?`, answer: (a + b) / 10, step: 0.1 }; }
      const a = rnd(40, 99), b = rnd(11, a - 10); return { text: `${(a / 10).toFixed(1)} − ${(b / 10).toFixed(1)} = ?`, answer: (a - b) / 10, step: 0.1 };
    } },
  };
  const TOTAL = 10, TIME_LIMIT = 20;
  let level = 'mid';

  const fmt = (v, step) => step === 1 ? String(Math.round(v)) : (Math.round(v * 10) / 10).toFixed(1);
  // 4 distractors: 2 near-miss (±1..10 steps) + 2 further away; distinct and non-negative
  function buildChoices(q) {
    const s = q.step, seen = new Set([fmt(q.answer, s)]), out = [];
    const push = v => { v = Math.round(v / s) * s; if (v < 0) return; const k = fmt(v, s); if (seen.has(k)) return; seen.add(k); out.push(k); };
    let g = 0;
    while (out.length < 2 && g++ < 300) push(q.answer + pick([-1, 1]) * rnd(1, 10) * s);
    while (out.length < 4 && g++ < 600) push(q.answer + pick([-1, 1]) * rnd(11, 25) * s);
    while (out.length < 4 && g++ < 900) push(q.answer + rnd(1, 60) * s);
    return out;
  }

  /* =====================================================================
     SOUND — WebAudio synthesis only (works offline, no files).
  ===================================================================== */
  const Snd = (() => {
    let ctx = null, master, dry, wet, noiseBuf, muted = false, music = null;
    try { muted = localStorage.getItem('mp-muted') === '1'; } catch (e) {}
    function impulse(sec, decay) {
      const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      return b;
    }
    function init() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
          ctx = new AC();
          const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.25; comp.connect(ctx.destination);
          master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(comp);
          const conv = ctx.createConvolver(); conv.buffer = impulse(2.8, 2.4);
          wet = ctx.createGain(); wet.gain.value = 0.3; wet.connect(conv); conv.connect(master);
          dry = ctx.createGain(); dry.connect(master);
          noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch (e) { ctx = null; }
    }
    const ok = () => ctx && ctx.state !== 'closed';
    function bus(sendAmt) { const g = ctx.createGain(); g.connect(dry); if (sendAmt) { const s = ctx.createGain(); s.gain.value = sendAmt; g.connect(s); s.connect(wet); } return g; }
    function noise(t, dur, out, filt, f, q, peak, attack, decay) {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bq = ctx.createBiquadFilter(); bq.type = filt; bq.frequency.value = f; bq.Q.value = q || 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + (attack || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + (attack || 0.005) + decay);
      s.connect(bq); bq.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + (attack || 0.005) + decay + 0.05);
      return bq;
    }
    function tone(t, type, f0, f1, glide, peak, decay, out) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.05);
    }
    /* ---- effects ---- */
    const sfx = {
      kick() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.08); tone(t, 'sine', 150, 45, 0.12, 0.9, 0.28, o); noise(t, 0, o, 'highpass', 1800, 0.7, 0.35, 0.002, 0.04); },
      punch() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.15); tone(t, 'sine', 120, 55, 0.16, 0.8, 0.26, o); noise(t, 0, o, 'lowpass', 900, 0.8, 0.8, 0.003, 0.16); noise(t, 0, o, 'bandpass', 1400, 1.2, 0.35, 0.002, 0.08); },
      net() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.1); noise(t, 0, o, 'highpass', 2600, 0.6, 0.35, 0.01, 0.35); tone(t, 'sine', 90, 50, 0.2, 0.5, 0.3, o); },
      cheer() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.35);
        noise(t, 0, o, 'bandpass', 950, 0.6, 0.32, 0.25, 2.2); noise(t + 0.05, 0, o, 'bandpass', 2300, 0.9, 0.16, 0.3, 2.0); noise(t, 0, o, 'lowpass', 400, 0.6, 0.2, 0.2, 1.6);
        for (let i = 0; i < 6; i++) { const f = 500 + Math.random() * 500, s = t + 0.15 + Math.random() * 0.5; const ov = ctx.createOscillator(); ov.type = 'sawtooth'; ov.frequency.setValueAtTime(f, s); ov.frequency.linearRampToValueAtTime(f * 1.5, s + 0.35); ov.frequency.linearRampToValueAtTime(f * 1.2, s + 0.9);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 2; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(0.025, s + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1); ov.connect(bp); bp.connect(g); g.connect(o); ov.start(s); ov.stop(s + 1.2); } },
      ooh() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.35); noise(t, 0, o, 'bandpass', 520, 1.4, 0.16, 0.2, 1.3); },
      whistle(len) { if (!ok()) return; const t = ctx.currentTime, o = bus(0.12); len = len || 0.45;
        const ov = ctx.createOscillator(); ov.type = 'sine'; ov.frequency.value = 2950; const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 26; const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(ov.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + len); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.08);
        ov.connect(g); g.connect(o); ov.start(t); lfo.start(t); ov.stop(t + len + 0.1); lfo.stop(t + len + 0.1); },
      pop() { if (!ok()) return; const t = ctx.currentTime, o = bus(0.1); tone(t, 'triangle', 660, 990, 0.08, 0.25, 0.18, o); },
    };
    /* ---- orchestral fanfare + looping victory theme ---- */
    const N = n => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return 440 * Math.pow(2, (base + (+m[3] + 1) * 12 - 69) / 12); };
    function brass(t, f, dur, vel, out) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.1;
      lp.frequency.setValueAtTime(450, t); lp.frequency.exponentialRampToValueAtTime(2000 + vel * 2200, t + 0.07); lp.frequency.exponentialRampToValueAtTime(1300 + vel * 700, t + 0.45);
      const g = ctx.createGain(); const pk = vel * 0.11;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.035); g.gain.linearRampToValueAtTime(pk * 0.72, t + 0.2); g.gain.setValueAtTime(pk * 0.72, t + Math.max(0.21, dur)); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.3; const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(7, t + Math.min(0.5, dur)); lfo.connect(lg);
      for (const dt of [-9, 0, 9]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; lg.connect(o.detune); o.connect(lp); o.start(t); o.stop(t + dur + 0.3); }
      const sub = ctx.createOscillator(); sub.type = 'triangle'; sub.frequency.value = f / 2; const sg = ctx.createGain(); sg.gain.value = 0.5; sub.connect(sg); sg.connect(lp); sub.start(t); sub.stop(t + dur + 0.3);
      lfo.start(t); lfo.stop(t + dur + 0.3); lp.connect(g); g.connect(out);
    }
    function strings(t, f, dur, vel, out) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700; const g = ctx.createGain(); const pk = vel * 0.05;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + 0.45); g.gain.setValueAtTime(pk, t + dur); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.7);
      for (const dt of [-11, -3, 6, 12]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.8); }
      lp.connect(g); g.connect(out);
    }
    function bell(t, f, vel, out) { const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vel * 0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      for (const [m, a] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m; const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g); o.start(t); o.stop(t + 1.7); } g.connect(out); }
    function timp(t, f, vel, out) { tone(t, 'sine', f * 1.5, f, 0.06, vel * 0.75, 1.5, out); tone(t, 'sine', f * 2.02, f * 1.98, 0.06, vel * 0.18, 0.6, out); noise(t, 0, out, 'lowpass', 320, 0.7, vel * 0.3, 0.003, 0.22); }
    function snare(t, vel, out) { noise(t, 0, out, 'bandpass', 2300, 0.8, vel * 0.22, 0.002, 0.09); }
    function cymbal(t, vel, out) { noise(t, 0, out, 'highpass', 6500, 0.5, vel * 0.22, 0.01, 2.8); noise(t, 0, out, 'bandpass', 9500, 1.5, vel * 0.1, 0.01, 1.6); }
    function playVictory() {
      init(); if (!ok()) return; stopMusic(true);
      const out = ctx.createGain(); out.gain.value = 0.55; out.connect(dry); const send = ctx.createGain(); send.gain.value = 0.85; out.connect(send); send.connect(wet);
      const m = { out, timer: null, stopped: false }; music = m;
      const B = 0.6, t0 = ctx.currentTime + 0.15, at = b => t0 + b * B;
      for (let i = 0; i < 12; i++) snare(at(i / 12), 0.25 + i * 0.06, out);
      const mel = [[0, 'G4', 1 / 3], [1 / 3, 'G4', 1 / 3], [2 / 3, 'G4', 1 / 3], [1, 'C5', 1.5], [2.5, 'G4', 0.5], [3, 'E5', 1], [4, 'D5', 0.5], [4.5, 'C5', 0.5], [5, 'D5', 1.5], [6.5, 'B4', 0.5],
        [7, 'G4', 1 / 3], [7 + 1 / 3, 'G4', 1 / 3], [7 + 2 / 3, 'G4', 1 / 3], [8, 'C5', 1], [9, 'E5', 1], [10, 'G5', 3]];
      mel.forEach(([b, n, d]) => { brass(at(b), N(n), d * B, 1, out); brass(at(b), N(n) / 2, d * B, 0.45, out); });
      const ch = [[1, ['C3', 'G3', 'C4', 'E4'], 2], [3, ['C3', 'G3', 'C4', 'E4'], 2], [5, ['G2', 'D3', 'G3', 'B3'], 2], [7, ['G2', 'F3', 'B3', 'D4'], 1], [8, ['F2', 'C3', 'F3', 'A3'], 1], [9, ['G2', 'D3', 'G3', 'B3'], 1], [10, ['C2', 'G2', 'C3', 'E3', 'G3', 'C4'], 3]];
      ch.forEach(([b, ns, d]) => ns.forEach(n => { brass(at(b), N(n), d * B, 0.42, out); strings(at(b), N(n) * 2, d * B, 0.9, out); }));
      [[1, 'C2'], [3, 'C2'], [5, 'G1'], [7, 'G1'], [8, 'F1'], [9, 'G1']].forEach(([b, n]) => timp(at(b), N(n) * 2, 1, out));
      for (let i = 0; i < 8; i++) timp(at(9.5 + i / 16), N('G1') * 2, 0.35 + i * 0.05, out);
      timp(at(10), N('C2'), 1.2, out);
      for (let i = 0; i < 8; i++) snare(at(9 + i / 8), 0.3 + i * 0.08, out);
      cymbal(at(1), 1, out); cymbal(at(10), 1.3, out);
      // looping victory theme: C - Am - F - G, strings + bells + timpani
      let next = 14;
      const loop = b => {
        const prog = [['C3', 'E3', 'G3', 'C4'], ['A2', 'E3', 'A3', 'C4'], ['F2', 'C3', 'F3', 'A3'], ['G2', 'D3', 'G3', 'B3']];
        const arp = [['C5', 'E5', 'G5', 'E5'], ['A4', 'C5', 'E5', 'C5'], ['F4', 'A4', 'C5', 'A4'], ['G4', 'B4', 'D5', 'B4']];
        prog.forEach((c, i) => { c.forEach(n => strings(at(b + i * 2), N(n), 2 * B, 0.8, out)); brass(at(b + i * 2), N(c[0]) * 2, 0.4 * B, 0.35, out); timp(at(b + i * 2), N(c[0]), 0.5, out);
          arp[i].forEach((n, k) => bell(at(b + i * 2 + k * 0.5), N(n), 0.9, out)); });
      };
      loop(next); next += 8; loop(next); next += 8;          // first two rounds booked up front
      m.timer = setInterval(() => { if (m.stopped || !ok()) return; if (ctx.currentTime > at(next) - 2) { loop(next); next += 8; } }, 250);
    }
    function stopMusic(now) {
      const m = music; if (!m) return; music = null; m.stopped = true; clearInterval(m.timer);
      if (!ok()) return; const t = ctx.currentTime;
      m.out.gain.cancelScheduledValues(t); m.out.gain.setValueAtTime(m.out.gain.value, t); m.out.gain.linearRampToValueAtTime(0, t + (now ? 0.05 : 0.8));
      setTimeout(() => { try { m.out.disconnect(); } catch (e) {} }, 1200);
    }
    function setMuted(v) { muted = v; try { localStorage.setItem('mp-muted', v ? '1' : '0'); } catch (e) {} if (ok()) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(v ? 0 : 0.85, t, 0.03); } }
    return { init, sfx, playVictory, stopMusic, setMuted, get muted() { return muted; } };
  })();
  const soundBtn = $('soundBtn');
  function paintSound() { soundBtn.setAttribute('aria-pressed', String(!Snd.muted)); soundBtn.setAttribute('aria-label', Snd.muted ? '소리 꺼짐' : '소리 켜짐'); }
  soundBtn.addEventListener('click', () => { Snd.init(); Snd.setMuted(!Snd.muted); paintSound(); });
  paintSound();

  /* ---------------- scene geometry (artwork pixel space 2752×1536) ---------------- */
  const ZONES = {
    lt: { x: 825,  y: 648, r: 108, fill: 'url(#gWhite)', stroke: '#45206e', ext: '#311551', side: -1 },
    rt: { x: 2010, y: 640, r: 108, fill: 'url(#gCyan)',  stroke: '#123a7c', ext: '#0c2a5e', side: 1 },
    c:  { x: 1425, y: 590, r: 94,  fill: 'url(#gMint)',  stroke: '#0d4d36', ext: '#093a28', side: 0 },
    lb: { x: 825,  y: 947, r: 108, fill: 'url(#gGold)',  stroke: '#6e3800', ext: '#552a00', side: -1 },
    rb: { x: 2013, y: 945, r: 108, fill: 'url(#gGold)',  stroke: '#6e2c00', ext: '#552000', side: 1 },
  };
  const KEYS = Object.keys(ZONES);
  const BALL0 = { x: 1375.5, y: 1340 }, PIV = { x: 1498, y: 930 }, FEET_Y = 1118;
  // forearm rig: pivot at the sleeve cuff, rest direction (deg) and length to glove centre
  const ARM = { L: { M: { x: 1428.5, y: 900.5 }, a0: 138.3, len: 61, el: $('armL') }, R: { M: { x: 1576.5, y: 908.5 }, a0: 28.1, len: 73, el: $('armR') } };

  /* ---------------- badges ---------------- */
  const badgeEls = {};
  for (const k of KEYS) {
    const z = ZONES[k];
    const g = el('g', { transform: `translate(${z.x} ${z.y})`, class: 'zone-hit', 'aria-hidden': 'true' }, $('badges'));
    el('circle', { r: z.r + 14, fill: 'none', stroke: '#fff2a0', 'stroke-width': 12, opacity: 0, class: 'glow' }, g);
    el('circle', { r: z.r, fill: '#ffffff', 'fill-opacity': .1, stroke: '#ffffff', 'stroke-opacity': .78, 'stroke-width': 6 }, g);
    el('circle', { r: z.r * .74, fill: '#1c2236', 'fill-opacity': .17, stroke: '#ffffff', 'stroke-opacity': .3, 'stroke-width': 3 }, g);
    el('circle', { r: z.r * .56, fill: '#ffffff', 'fill-opacity': .1 }, g);
    el('ellipse', { cx: -z.r * .32, cy: -z.r * .5, rx: z.r * .36, ry: z.r * .15, fill: '#fff', opacity: .28, transform: 'rotate(-28)' }, g);
    const tg = el('g', { 'font-family': 'Arial Rounded MT Bold, Arial Black, Malgun Gothic, Apple SD Gothic Neo, sans-serif', 'font-weight': 900, 'text-anchor': 'middle', 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, g);
    const sh = el('text', { y: 12, fill: z.ext, stroke: z.ext, 'stroke-width': 18, transform: 'translate(0 11)' }, tg);
    const tx = el('text', { y: 12, fill: z.fill, stroke: z.stroke, 'stroke-width': 15 }, tg);
    g.addEventListener('click', () => shoot(k));
    badgeEls[k] = { sh, tx, glow: g.querySelector('.glow') };
  }
  function setBadge(k, val) {
    const b = badgeEls[k], z = ZONES[k];
    const fs = (val.length <= 2 ? 138 : val.length === 3 ? 108 : 88) * (z.r / 108);
    for (const t of [b.sh, b.tx]) { t.textContent = val; t.setAttribute('font-size', fs.toFixed(0)); t.setAttribute('dominant-baseline', 'middle'); }
    const p = $('p-' + k); p.querySelector('.n').textContent = val; p.setAttribute('aria-label', `${p.querySelector('.tag').textContent} ${val}`);
  }

  /* =====================================================================
     FACE — vector expressions painted over the artwork's face
     (sprite-local coords; skin patches use sampled skin tones)
  ===================================================================== */
  const face = $('face');
  function browPath(x1, y1, cx, cy, x2, y2, t1, t2) {
    const P = [], Q = [], n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * x1 + 2 * u * t * cx + t * t * x2, y = u * u * y1 + 2 * u * t * cy + t * t * y2;
      const dx = 2 * u * (cx - x1) + 2 * t * (x2 - cx), dy = 2 * u * (cy - y1) + 2 * t * (y2 - cy), l = Math.hypot(dx, dy) || 1;
      const w = (t1 + (t2 - t1) * t) / 2 * Math.sin(Math.PI * (0.18 + 0.82 * t)) ** 0.35;
      P.push([x - dy / l * w, y + dx / l * w]); Q.push([x + dy / l * w, y - dx / l * w]);
    }
    return 'M' + P.map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'L' + Q.reverse().map(p => p.map(v => v.toFixed(1)).join(',')).join('L') + 'Z';
  }
  function patches(g, keepBrows) {
    el('ellipse', { cx: 183, cy: 157, rx: 31, ry: 14, fill: 'url(#skMouth)', mask: 'url(#mSoft)' }, g);
    if (keepBrows) return;
    el('ellipse', { cx: 156, cy: 101.5, rx: 23, ry: 7.5, fill: 'url(#skBrowL)', mask: 'url(#mSoft)', transform: 'rotate(-13 156 101.5)' }, g);
    el('ellipse', { cx: 217, cy: 102, rx: 28, ry: 7.5, fill: 'url(#skBrowR)', mask: 'url(#mSoft)', transform: 'rotate(11 217 102)' }, g);
  }
  // upper lids, clipped to each eye so nothing paints outside the eye
  function lids(g, lo, li, ri, ro) {
    let c = el('g', { 'clip-path': 'url(#eyeL)' }, g);
    el('path', { d: `M130,96 L180,96 L180,${li} L130,${lo} Z`, fill: 'url(#skLidL)' }, c);
    el('path', { d: `M130,${lo} L180,${li}`, stroke: '#2b1a12', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, c);
    c = el('g', { 'clip-path': 'url(#eyeR)' }, g);
    el('path', { d: `M188,97 L240,97 L240,${ro} L188,${ri} Z`, fill: 'url(#skLidR)' }, c);
    el('path', { d: `M188,${ri} L240,${ro}`, stroke: '#2b1a12', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, c);
  }
  const brows = (g, L, R) => { el('path', { d: browPath(...L), fill: 'url(#browInk)' }, g); el('path', { d: browPath(...R), fill: 'url(#browInk)' }, g); };
  const FX = {};
  (function buildFaces() {
    // serious — level brows dipping inward, focused lids, flat mouth
    let g = FX.serious = el('g', {}, face); patches(g);
    lids(g, 110, 114, 115, 111);
    brows(g, [139, 101, 156, 97, 173, 104, 5.5, 8], [194, 105, 218, 97, 241, 100, 8, 5.5]);
    el('path', { d: 'M168,157 Q183,154.5 198,157', stroke: '#5b2c1f', 'stroke-width': 3.8, fill: 'none', 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M175,161.5 Q183,163 191,161.5', stroke: '#ffffff', 'stroke-opacity': .22, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }, g);
    // frustrated — steep brows, squinting lids, gritted teeth, anger mark + sweat
    g = FX.angry = el('g', { display: 'none' }, face); patches(g);
    lids(g, 109, 120, 121, 110);
    brows(g, [137, 95, 158, 98, 174, 108, 6.5, 9.5], [193, 109, 216, 99, 242, 94, 9.5, 6.5]);
    el('path', { d: 'M178,99 L180,106 M188,99 L186,106', stroke: '#8a5a44', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M164,153 Q183,148.5 202,153 L200,165 Q183,160.5 166,165 Z', fill: '#ffffff', stroke: '#4a1c12', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M165,159 Q183,155 201,159 M171,151.5 L171.5,163.5 M177,150.5 L177,162 M183,150 L183,161 M189,150.5 L189,162 M195,151.5 L194.5,163.5', stroke: '#9a7a70', 'stroke-width': 1.4, fill: 'none' }, g);
    const mark = el('g', { class: 'anger', transform: 'translate(262 58) scale(1.6)' }, g);
    el('path', { d: 'M-10,-3 Q-4,-4 -3,-10 M3,-10 Q4,-4 10,-3 M10,3 Q4,4 3,10 M-3,10 Q-4,4 -10,3', stroke: '#e42f24', 'stroke-width': 4.2, fill: 'none', 'stroke-linecap': 'round' }, mark);
    el('path', { d: 'M0,-14 Q9,0 0,7 Q-9,0 0,-14 Z', fill: '#bfe8ff', stroke: '#3f8fd0', 'stroke-width': 1.6, transform: 'translate(118 104)' }, g);
    // happy — raised brows, smiling lower lids, open grin, blush, sparkles
    g = FX.happy = el('g', { display: 'none' }, face); patches(g, true);
    let c = el('g', { 'clip-path': 'url(#eyeL)' }, g);
    el('path', { d: 'M130,142 L130,135 Q155,123 180,133 L180,142 Z', fill: 'url(#skCheekL)' }, c);
    el('path', { d: 'M130,135 Q155,123 180,133', stroke: '#3a2418', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }, c);
    c = el('g', { 'clip-path': 'url(#eyeR)' }, g);
    el('path', { d: 'M188,144 L188,136 Q213,124 240,134 L240,144 Z', fill: 'url(#skCheekR)' }, c);
    el('path', { d: 'M188,136 Q213,124 240,134', stroke: '#3a2418', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }, c);
    el('path', { d: 'M157,148 Q183,153 209,148 Q205,175 183,177 Q161,175 157,148 Z', fill: '#5e1a17', stroke: '#3e120d', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
    el('path', { d: 'M160,149.5 Q183,154 206,149.5 L204,156.5 Q183,160 162,156.5 Z', fill: '#ffffff' }, g);
    el('ellipse', { cx: 183, cy: 169, rx: 12, ry: 5.5, fill: '#e3685d' }, g);
    el('ellipse', { cx: 142, cy: 146, rx: 13, ry: 6, fill: '#ff6b6b', opacity: .32, mask: 'url(#mSoft)' }, g);
    el('ellipse', { cx: 227, cy: 147, rx: 14, ry: 6, fill: '#ff6b6b', opacity: .3, mask: 'url(#mSoft)' }, g);
    for (const [x, y, s] of [[96, 62, 1.3], [272, 44, 1.6], [292, 104, 1]]) el('path', { d: 'M0,-10Q1,-1 10,0Q1,1 0,10Q-1,1 -10,0Q-1,-1 0,-10Z', fill: '#fff27a', stroke: '#e0a000', 'stroke-width': 1.2, class: 'spk', transform: `translate(${x} ${y}) scale(${s})` }, g);
  })();
  let faceNow = 'serious';
  function setFace(name) { faceNow = name; for (const k in FX) FX[k].setAttribute('display', k === name ? 'inline' : 'none'); }

  /* ---------------- viewport fit ---------------- */
  const stage = $('stage'), scene = $('scene'), sceneBg = $('sceneBg'), view = $('view'), pads = $('pads');
  const VIEW = { x0: 0, y0: 0, vw: 2752, vh: 1536, k: 1, w: 0, h: 0 };
  function layout() {
    const W = window.innerWidth, H = document.documentElement.clientHeight || window.innerHeight;
    const natural = W * 1536 / 2080;
    const padH = Math.max(H * 0.33, Math.min(H - natural, H * 0.44));
    pads.style.height = Math.round(padH) + 'px';
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    const a = w / h; let vw, vh, x0, y0;
    if (a >= 2752 / 1536) { vh = 1536; vw = vh * a; x0 = 1376 - vw / 2; y0 = 0; }
    else { vw = Math.max(2080, 1536 * a); vh = vw / a; x0 = Math.min(Math.max(1405 - vw / 2, 0), 2752 - vw); y0 = 1536 - vh; }
    const vb = `${x0.toFixed(1)} ${y0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`;
    scene.setAttribute('viewBox', vb); sceneBg.setAttribute('viewBox', vb);
    VIEW.x0 = x0; VIEW.y0 = y0; VIEW.vw = vw; VIEW.vh = vh; VIEW.k = w / vw; VIEW.w = w; VIEW.h = h;
    $('msg').dataset.cx = (x0 + vw / 2).toFixed(0);
    if (window.__crowdResize) window.__crowdResize();
  }
  window.addEventListener('resize', layout); if (window.ResizeObserver) new ResizeObserver(layout).observe(document.body);

  /* ---------------- animation helpers ---------------- */
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPD = REDUCE ? 0.6 : 1;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angLerp = (a, b, t) => a + ((((b - a) % 360) + 540) % 360 - 180) * t;
  const eOut = t => 1 - Math.pow(1 - t, 3), eIn = t => t * t, eInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const eBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function tween(ms, fn, ease) { ease = ease || (t => t); return new Promise(res => { const d = ms * SPD, t0 = performance.now();
    (function step(now) { const r = Math.min(1, (now - t0) / d); fn(ease(r), r); if (r < 1) requestAnimationFrame(step); else res(); })(t0); }); }
  const wait = ms => new Promise(r => setTimeout(r, ms * SPD));

  /* ---------------- actors ---------------- */
  const ball = $('ball'), ballSpin = $('ballSpin'), bShadow = $('bShadow'), keeper = $('keeper'), kShadow = $('kShadow'), world = $('world');
  const ghosts = []; for (let i = 0; i < 6; i++) { const g = el('g', { opacity: 0 }, $('trail')); el('use', { href: '#ballImg' }, g); ghosts.push(g); }
  const kGhosts = []; for (let i = 0; i < 2; i++) { const g = el('g', { opacity: 0 }, $('kGhosts')); el('use', { href: '#rig' }, g); kGhosts.push(g); }
  const hist = [], khist = [];
  function setBall(x, y, s, rot, sx, sy) {
    ball.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(s * (sx || 1)).toFixed(3)} ${(s * (sy || 1)).toFixed(3)})`);
    ballSpin.setAttribute('transform', `rotate(${rot.toFixed(1)})`);
    hist.unshift({ x, y, s, rot }); if (hist.length > 14) hist.pop();
  }
  function trail(on) {
    ghosts.forEach((g, i) => { const h = hist[(i + 1) * 2]; if (!on || !h) { g.setAttribute('opacity', 0); return; }
      g.setAttribute('transform', `translate(${h.x.toFixed(1)} ${h.y.toFixed(1)}) scale(${(h.s * (1 - i * .05)).toFixed(3)}) rotate(${h.rot.toFixed(1)})`);
      g.setAttribute('opacity', (0.34 - i * 0.055).toFixed(3)); });
  }
  function setBallShadow(x, y, s, op) { bShadow.setAttribute('cx', x.toFixed(1)); bShadow.setAttribute('cy', y.toFixed(1)); bShadow.setAttribute('rx', (110 * s).toFixed(1)); bShadow.setAttribute('ry', (22 * s).toFixed(1)); bShadow.setAttribute('opacity', op.toFixed(3)); }

  const K = { dx: 0, dy: 0, ang: 0, sx: 1, sy: 1, air: 0 };
  const A = { L: { a: 138.3, s: 1 }, R: { a: 28.1, s: 1 } };
  let ghostOn = false;
  const kTransform = k => `translate(${k.dx.toFixed(1)} ${k.dy.toFixed(1)}) rotate(${k.ang.toFixed(2)} ${PIV.x} ${PIV.y}) translate(${PIV.x} ${FEET_Y}) scale(${k.sx.toFixed(3)} ${k.sy.toFixed(3)}) translate(${-PIV.x} ${-FEET_Y})`;
  function drawKeeper() {
    keeper.setAttribute('transform', kTransform(K));
    for (const s of ['L', 'R']) {
      const a = ARM[s], st = A[s], w = 1 + (st.s - 1) * 0.35;
      a.el.setAttribute('transform', `translate(${a.M.x} ${a.M.y}) rotate(${(st.a - a.a0).toFixed(2)}) rotate(${a.a0}) scale(${st.s.toFixed(3)} ${w.toFixed(3)}) rotate(${-a.a0}) translate(${-a.M.x} ${-a.M.y})`);
    }
    const lying = Math.min(1, Math.abs(K.ang) / 90);
    kShadow.setAttribute('cx', (PIV.x + K.dx).toFixed(1));
    kShadow.setAttribute('rx', (165 + 120 * lying).toFixed(1));
    kShadow.setAttribute('opacity', (0.38 * (1 - Math.min(0.7, K.air / 300))).toFixed(3));
    khist.unshift({ ...K }); if (khist.length > 8) khist.pop();
    kGhosts.forEach((g, i) => { const h = khist[(i + 1) * 3]; if (!ghostOn || !h) { g.setAttribute('opacity', 0); return; } g.setAttribute('transform', kTransform(h)); g.setAttribute('opacity', i ? 0.12 : 0.22); });
  }
  // world point -> body-local point (inverse of the keeper transform, squash ignored)
  function toLocal(p, k) { const x = p.x - k.dx - PIV.x, y = p.y - k.dy - PIV.y, r = -k.ang * Math.PI / 180; return { x: PIV.x + x * Math.cos(r) - y * Math.sin(r), y: PIV.y + x * Math.sin(r) + y * Math.cos(r) }; }
  // Plan a dive whose leading glove lands on (tx,ty) with a punch
  function divePlan(z, tx, ty) {
    let ang, lead;
    if (z.side === 0) { lead = pick(['L', 'R']); ang = lead === 'L' ? -9 : 9; }
    else { const vx = tx - PIV.x, vy = ty - PIV.y; ang = Math.atan2(vx, -vy) * 180 / Math.PI; const lim = ty > 800 ? 74 : 88; ang = Math.max(-lim, Math.min(lim, ang)); lead = ang < 0 ? 'R' : 'L'; }
    const ua = (z.side === 0 ? (lead === 'L' ? -100 : -80) : (lead === 'R' ? -68 : -112)) * Math.PI / 180;
    const reach = z.side === 0 ? 100 : 96;
    const M = ARM[lead].M, P = { x: M.x + reach * Math.cos(ua), y: M.y + reach * Math.sin(ua) };
    const r = ang * Math.PI / 180, vx = P.x - PIV.x, vy = P.y - PIV.y;
    const wx = vx * Math.cos(r) - vy * Math.sin(r), wy = vx * Math.sin(r) + vy * Math.cos(r);
    const dx = tx - PIV.x - wx, dy = ty - PIV.y - wy;
    const other = lead === 'L' ? 'R' : 'L';
    const otherA = z.side === 0 ? (other === 'L' ? 215 : -35) : (other === 'L' ? 165 : 15);
    return { dx, dy, ang, lead, leadA: ua * 180 / Math.PI, leadS: reach / ARM[lead].len, other, otherA, air: Math.max(0, -dy + (Math.abs(ang) > 45 ? 140 : 0)) };
  }

  /* =====================================================================
     STADIUM ATMOSPHERE — floodlight bloom & flares, LED boards, camera flashes
  ===================================================================== */
  const lampEls = [];
  (function buildLamps() {
    const L = $('lamps'), C = { x: 1400, y: 820 };
    for (const [x, y, real] of [[465, 198, 1], [2283, 198, 1], [-465, 198, 0], [3221, 198, 0]]) {
      const g = el('g', { transform: `translate(${x} ${y})` }, L);
      const halo = el('circle', { r: 300, fill: 'url(#lampGlow)' }, g);
      el('ellipse', { rx: 560, ry: 7, fill: 'url(#flareH)', opacity: .6 }, g);
      el('ellipse', { rx: 170, ry: 5, fill: 'url(#flareH)', opacity: .45, transform: 'rotate(90)' }, g);
      el('ellipse', { rx: 230, ry: 3.5, fill: 'url(#flareH)', opacity: .35, transform: 'rotate(32)' }, g);
      el('ellipse', { rx: 230, ry: 3.5, fill: 'url(#flareH)', opacity: .35, transform: 'rotate(-32)' }, g);
      if (real) for (const [k, r, c, o] of [[.32, 26, '#9fe0ff', .16], [.55, 46, '#ffd28a', .1], [.78, 16, '#c7a6ff', .2], [.9, 60, '#9fe0ff', .06]])
        el('circle', { cx: ((C.x - x) * k).toFixed(0), cy: ((C.y - y) * k).toFixed(0), r, fill: c, opacity: o }, g);
      lampEls.push(halo);
    }
  })();
  // clouds for the extended sky above the artwork (seen on tall portrait screens)
  const skyClouds = [];
  for (const [cx, cy, w, s] of [[520, -260, 520, 1], [1650, -520, 640, 2], [2350, -180, 420, 3], [900, -820, 560, 4], [2100, -1050, 480, 5]]) {
    const g = el('g', { transform: `translate(${cx} ${cy})`, opacity: .92 }, $('skyClouds'));
    let seed = s * 97; const r1 = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let k = 0; k < 8; k++) { const t = k / 7, hump = Math.sin(Math.PI * t), rr = w * (0.14 + 0.16 * hump) * (0.85 + r1() * 0.3);
      el('ellipse', { cx: ((t - .5) * w * .9).toFixed(0), cy: (-hump * w * .1 + (r1() - .5) * 20).toFixed(0), rx: (rr * 1.25).toFixed(0), ry: rr.toFixed(0), fill: 'url(#puff)' }, g); }
    skyClouds.push({ g, cx, cy, v: 4 + s * 1.5 });
  }
  const ledRuns = [...document.querySelectorAll('.ledRun')].map(g => {
    const bx = +g.parentNode.querySelector('rect').getAttribute('x');
    const parts = [['★ MATH CUP 2026  ', '#ffd84a'], ['수학 승부차기  ', '#ffffff'], ['★ GOAL!  ', '#6fe3ff'], ['집중해서 슛!  ', '#ff8ac2'], ['★ FAIR PLAY  ', '#9dff8a'], ['우리 반 화이팅!  ', '#ffffff']];
    const mk = () => { const t = el('text', { y: g.dataset.y, 'font-size': 64, 'paint-order': 'stroke', 'stroke-linejoin': 'round', 'letter-spacing': 3 }, g);
      for (const [s, c] of parts) { const sp = el('tspan', { fill: c, stroke: c, 'stroke-opacity': .32, 'stroke-width': 12 }, t); sp.textContent = s; } return t; };
    const a = mk(), b = mk(); let w = 1900; try { w = a.getComputedTextLength() || w; } catch (e) {}
    a.setAttribute('x', bx); b.setAttribute('x', bx + w);
    return { g, w, speed: +g.dataset.speed };
  });
  ledRuns.forEach((L, i) => { L.phase = i * L.w * 0.45; });
  const flashPool = [];
  for (let i = 0; i < 8; i++) { const g = el('g', { opacity: 0 }, $('flashes')); el('circle', { r: 34, fill: 'url(#flashG)' }, g); el('path', { d: 'M0,-46 Q3,-3 46,0 Q3,3 0,46 Q-3,3 -46,0 Q-3,-3 0,-46Z', fill: '#ffffff', opacity: .85 }, g); flashPool.push({ g, t0: -1 }); }
  const STANDS = [[-380, 370], [2430, 3080]];
  let nextFlash = 0;
  function ambient(now) {
    if (!document.hidden) {
      const t = now / 1000;
      lampEls.forEach((h, i) => h.setAttribute('opacity', (0.86 + 0.14 * Math.sin(t * 2.1 + i * 1.7)).toFixed(3)));
      $('beams').setAttribute('opacity', (0.8 + 0.2 * Math.sin(t * 0.7)).toFixed(3));
      for (const L of ledRuns) L.g.setAttribute('transform', `translate(${(-((t * L.speed + L.phase) % L.w)).toFixed(1)} 0)`);
      for (const c of skyClouds) c.g.setAttribute('transform', `translate(${(((c.cx + t * c.v + 1400) % 3600) - 1400 + 300).toFixed(1)} ${c.cy})`);
      if (now > nextFlash) {
        const f = flashPool.find(p => p.t0 < 0);
        if (f) { const s = pick(STANDS); f.x = rnd(s[0], s[1]); f.y = rnd(470, 900); f.s = 0.5 + Math.random() * 0.7; f.t0 = now; }
        nextFlash = now + 90 + Math.random() * 380;
      }
      for (const f of flashPool) { if (f.t0 < 0) continue; const r = (now - f.t0) / 220; if (r >= 1) { f.t0 = -1; f.g.setAttribute('opacity', 0); continue; }
        f.g.setAttribute('opacity', (r < .2 ? r / .2 : 1 - (r - .2) / .8).toFixed(3)); f.g.setAttribute('transform', `translate(${f.x} ${f.y}) scale(${(f.s * (0.6 + 0.6 * r)).toFixed(3)})`); }
    }
    requestAnimationFrame(ambient);
  }
  if (!REDUCE) requestAnimationFrame(ambient);

  /* =====================================================================
     CROWD — several hundred fans on a canvas between the artwork and the goal.
     Seat masks baked from the art keep them behind the net, fence and posts;
     side stands are rendered at low resolution so they share the art's depth of field.
     Every fan has a look and a personality: they fidget, hold their breath,
     celebrate and despair in their own way (and the keeper's orange section reacts the other way round).
  ===================================================================== */
  const Crowd = (() => {
    const cv = $('crowd'), ctx = cv.getContext('2d');
    const REG = {
      L: { x: 0, y: 470, w: 412, h: 476, src: SEAT_MASKS.L, blur: true },
      R: { x: 2350, y: 470, w: 402, h: 476, src: SEAT_MASKS.R, blur: true },
      C: { x: 1080, y: 540, w: 700, h: 370, src: SEAT_MASKS.C, blur: false },
      Lm: { x: -412, y: 470, w: 412, h: 476, of: 'L', flip: true, blur: true },    // mirrored edge stands: own fans
      Rm: { x: 2752, y: 470, w: 402, h: 476, of: 'R', flip: true, blur: true }
    };
    const HAZE = { L: .2, R: .2, Lm: .24, Rm: .24, C: .14 };
    const BLUR = 0.42, SPR = 2;
    let seed = 20261110; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rr = (a, b) => a + (b - a) * rand(), rp = a => a[Math.floor(rand() * a.length)];
    const pickW = w => { let s = 0; for (const k in w) s += w[k]; let r = rand() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
    const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
      return `rgb(${r | 0},${g | 0},${b | 0})`; };
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const sin = Math.sin, cos = Math.cos, ab = Math.abs, TAU = Math.PI * 2;

    /* ---------- looks ---------- */
    const SKIN = ['#f7d6b8', '#efc39d', '#e2ad84', '#c98d62', '#a86d47', '#7d4f32'];
    const HAIR = ['#2b1d16', '#3b2a20', '#5a3a24', '#7b5133', '#c79a5b', '#1b1b1f', '#2b1d16', '#d8c08a'];
    const HOME = ['#3aa8ff', '#1f7fe0', '#ffffff', '#4fc3f7', '#17366e', '#ffd23f', '#3aa8ff', '#1f7fe0'];
    const MISC = ['#e5484d', '#39b26b', '#8b5cf6', '#ff7eb3', '#9aa4b2', '#f2f2f2', '#2c2f38', '#ffb020', '#00b3a4'];
    const AWAY = ['#ff8a1f', '#ff6a00', '#ff8a1f', '#2a2a2e'];
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w * SPR); c.height = Math.ceil(h * SPR); const g = c.getContext('2d'); g.scale(SPR, SPR); g.lineCap = 'round'; g.lineJoin = 'round'; return [c, g]; };
    function torsoSprite(a) {                                   // frame x -15..15, y -28..6 (seat at 0,0)
      const [c, g] = mk(30, 34); g.translate(15, 28);
      g.fillStyle = a.skinD; g.fillRect(-3.2, -27, 6.4, 7);
      const grd = g.createLinearGradient(-12, -22, 12, 6); grd.addColorStop(0, shade(a.shirt, .22)); grd.addColorStop(.55, a.shirt); grd.addColorStop(1, shade(a.shirt, -.3));
      g.beginPath(); g.moveTo(-12.5, 6); g.lineTo(-12.5, -13); g.quadraticCurveTo(-12.5, -22, -4, -22.5); g.lineTo(4, -22.5); g.quadraticCurveTo(12.5, -22, 12.5, -13); g.lineTo(12.5, 6); g.closePath();
      g.fillStyle = grd; g.fill();
      g.save(); g.clip(); g.fillStyle = a.trim;
      if (a.pat === 1) { g.fillRect(-13, -12, 26, 3.2); g.fillRect(-13, -4, 26, 3.2); }
      else if (a.pat === 2) g.fillRect(-2.6, -23, 5.2, 30);
      else if (a.pat === 3) g.fillRect(-13, -23, 26, 4.6);
      g.restore();
      g.beginPath(); g.moveTo(-4.5, -22.4); g.quadraticCurveTo(0, -16.5, 4.5, -22.4); g.strokeStyle = shade(a.shirt, -.38); g.lineWidth = 1.4; g.stroke();
      if (a.scarf) { g.fillStyle = a.scarf[0]; g.beginPath(); g.ellipse(0, -22, 8.2, 3.3, 0, 0, TAU); g.fill(); g.fillRect(2.4, -22, 4.2, 12.5);
        g.fillStyle = a.scarf[1]; g.fillRect(2.4, -15.5, 4.2, 2.2); g.fillRect(2.4, -11.5, 4.2, 1.6); g.fillRect(-5.5, -23.6, 2.2, 3); g.fillRect(-.8, -24, 2.2, 3); }
      return c;
    }
    function headSprite(a) {                                    // frame x -13..13, y -26..2 around the neck
      const [c, g] = mk(26, 28); g.translate(13, 26);
      const cy = -10, R = 9.6;
      g.fillStyle = a.hairC;
      if (a.hair === 2) { g.beginPath(); g.ellipse(0, cy + 2.5, R + 1.7, R + 2.6, 0, 0, TAU); g.fill(); }
      if (a.hair === 4) { g.beginPath(); g.arc(0, cy - R - 1.2, 4.2, 0, TAU); g.fill(); }
      g.fillStyle = a.skinD; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * (R - .4), cy + 1, 2.4, 0, TAU); g.fill(); }
      const fg = g.createRadialGradient(-3, cy - 3.5, 1, 0, cy, R + 1); fg.addColorStop(0, shade(a.skin, .2)); fg.addColorStop(.6, a.skin); fg.addColorStop(1, a.skinD);
      g.fillStyle = fg; g.beginPath(); g.arc(0, cy, R, 0, TAU); g.fill();
      g.fillStyle = '#2a1a14'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 3.3, cy + .6, 1.15, 1.5, 0, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,110,110,.26)'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 5.7, cy + 3.5, 1.9, 0, TAU); g.fill(); }
      g.strokeStyle = '#7a3b2b'; g.lineWidth = .9; g.beginPath(); g.arc(0, cy + 3.4, 2.1, .3, Math.PI - .3); g.stroke();
      g.fillStyle = a.hairC;
      if (a.hair === 5) {                                       // cap
        g.fillStyle = a.cap; g.beginPath(); g.arc(0, cy - 1.6, R + .9, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = shade(a.cap, -.32); g.beginPath(); g.ellipse(0, cy - 1.8, R + 2.6, 2.3, 0, 0, TAU); g.fill();
        g.fillStyle = shade(a.cap, .4); g.beginPath(); g.arc(0, cy - R - .4, 1.4, 0, TAU); g.fill();
      } else if (a.hair === 6) {                                // receding, grey sides
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * (R - 1), cy - 1, 2.3, 4.2, 0, 0, TAU); g.fill(); }
      } else {
        g.beginPath(); g.arc(0, cy, R + .9, Math.PI * 1.02, Math.PI * 1.98);
        g.quadraticCurveTo(R - 1, cy - 3, 5, cy - 4.3); g.quadraticCurveTo(1, cy - 2.4, -2, cy - 4.7); g.quadraticCurveTo(-6, cy - 3, -R - .9, cy - .4); g.closePath(); g.fill();
        if (a.hair === 3) { g.beginPath(); for (let i = 0; i < 5; i++) { const x = -7 + i * 3.5; g.moveTo(x - 2.5, cy - R + 2.2); g.lineTo(x + rr(-1, 1), cy - R - 3.4 - rand() * 1.6); g.lineTo(x + 2.5, cy - R + 2.2); } g.fill(); }
        if (a.hair === 2) { g.fillRect(-R - 1, cy - 2, 3.3, 10.5); g.fillRect(R - 2.3, cy - 2, 3.3, 10.5); }
        g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, cy, R - 1.6, Math.PI * 1.2, Math.PI * 1.45); g.stroke();
      }
      return c;
    }

    /* ---------- arms: two-bone IK toward a hand target, elbows out ---------- */
    const L1 = 12, L2 = 11.5, HAND = [0, 0];
    function limb(g, sx, sy, tx, ty, side, sleeve, skin) {
      let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy); const mx = L1 + L2 - .4;
      if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; } if (d < 1) d = 1;
      const a0 = Math.atan2(dy, dx), b = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const e1x = sx + L1 * cos(a0 + b), e1y = sy + L1 * sin(a0 + b), e2x = sx + L1 * cos(a0 - b), e2y = sy + L1 * sin(a0 - b);
      const first = side * e1x + .45 * e1y > side * e2x + .45 * e2y;
      const ex = first ? e1x : e2x, ey = first ? e1y : e2y, hx = sx + dx, hy = sy + dy;
      // bare arm (reads against the blue seats), short sleeve on top, then the hand
      g.strokeStyle = skin; g.lineWidth = 4.8; g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.lineTo(hx, hy); g.stroke();
      g.strokeStyle = sleeve; g.lineWidth = 6.6; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (ex - sx) * .42, sy + (ey - sy) * .42); g.stroke();
      g.fillStyle = skin; g.beginPath(); g.arc(hx, hy, 3.3, 0, TAU); g.fill();
      HAND[0] = hx; HAND[1] = hy;
    }

    /* ---------- poses: [lift, lean, headX, headY, lhX, lhY, rhX, rhY, mouth, flag, scarf] ---------- */
    const N = 11, REST = [0, 0, 0, 0, -8, -4, 8, -4, 0, 0, 0];
    const put = (o, y, r, hx, hy, lx, ly, rx, ry, m, fl, sc) => { o[0] = y; o[1] = r; o[2] = hx; o[3] = hy; o[4] = lx; o[5] = ly; o[6] = rx; o[7] = ry; o[8] = m; o[9] = fl || 0; o[10] = sc || 0; return o; };
    const rest = (o, f) => put(o, 0, 0, 0, 0, -8, -4, 8, -4, 0, f.flag ? .32 : 0);
    const burst = (c, len) => sm(0, .25, c) * (1 - sm(len - .25, len, c));      // short repeated actions
    const IDLE = {
      still: (t, f, o) => rest(o, f),
      bob: (t, f, o) => put(o, -1.6 * ab(sin(t * 2.6)), 0, 0, .7 * sin(t * 5.2), -8, -4, 8, -4, 0),
      chat: (t, f, o) => put(o, 0, .07 * sin(t * .8), 1.6 * sin(t * .8 + .6), .5 * sin(t * 3), -8, -4, 8, -4, sin(t * 7) > .35 ? .35 : 0),
      clapSlow: (t, f, o) => { const c = t % 7, w = burst(c, 1.6), k = .5 + .5 * cos(TAU * 3.2 * c);
        return put(o, 0, 0, 0, 0, -8 + (8 - 1.4 - 4.6 * k) * w, -4 - 10 * w, 8 - (8 - 1.4 - 4.6 * k) * w, -4 - 10 * w, 0); },
      wave: (t, f, o) => { const c = t % 8.5, w = burst(c, 1.9);
        return put(o, 0, -.04 * w, 0, 0, -8 + (-8 + 5 * sin(TAU * 2.2 * c)) * w, -4 - 42 * w, 8, -4, .4 * w); },
      chin: (t, f, o) => put(o, 0, .04, .5, 1.2, -8, -4, 3, -24, 0),
      phone: (t, f, o) => put(o, -1, 0, 0, -1.2, -6, -10, 7 + .6 * sin(t * 1.3), -40, 0),
      flag: (t, f, o) => put(o, 0, 0, 0, 0, 3, -20, 12, -26, 0, .3 + .16 * sin(t * 1.3)),
    };
    const GOAL = {
      jumpV: (t, f, o) => { const j = ab(sin(Math.PI * f.q * t)), a = f.amp; return put(o, -13 * a * j, 0, 0, -.8 * j, -18 - 2 * j, -50 - 3 * j, 18 + 2 * j, -50 - 3 * j, 1); },
      waveArms: (t, f, o) => { const w = sin(TAU * f.q * .45 * t + f.p); return put(o, -3 - 2 * ab(sin(Math.PI * f.q * t)), .07 * w, 1.5 * w, 0, -15 + 9 * w, -48, 15 + 9 * w, -48, 1); },
      clapUp: (t, f, o) => { const c = .5 + .5 * cos(TAU * f.q * t); return put(o, -5, 0, 0, -1, -(1.6 + 6 * c), -47, 1.6 + 6 * c, -47, .8); },
      pump: (t, f, o) => { const u = .5 + .5 * sin(TAU * f.q * .8 * t); return put(o, -2.5 * u, -.05 * f.sd, 0, 0, -9, -12, 15, -26 - 22 * u, 1); },
      fists: (t, f, o) => { const b = ab(sin(Math.PI * f.q * t)); return put(o, -10 * b * f.amp, 0, 0, 0, -8, -22 + 2 * b, 8, -22 + 2 * b, 1); },
      point: (t, f, o) => { const b = ab(sin(Math.PI * f.q * t)); return put(o, -6 * b, .06, .8, 0, -16, -47, 25, -32, 1); },
      standClap: (t, f, o) => { const c = .5 + .5 * cos(TAU * f.q * t); return put(o, -6, 0, 0, 0, -(1.5 + 5.5 * c), -16, 1.5 + 5.5 * c, -16, .6); },
      scarf: (t, f, o) => { if (!f.ap.scarf) return GOAL.jumpV(t, f, o); const b = ab(sin(Math.PI * f.q * t)), s = 2 * sin(TAU * f.q * t);
        return put(o, -4 * b, 0, 0, 0, -19, -49 + s, 19, -49 - s, 1, 0, 1); },
      flagWave: (t, f, o) => put(o, -4 * ab(sin(Math.PI * f.q * t)), 0, 0, 0, -14, -44, 13, -36, 1, .9 * sin(TAU * 1.5 * t + f.p) - .1),
    };
    const MISS = {
      // mouth < 0 = frown
      headHands: (t, f, o) => put(o, 1.5, .03 * sin(t * 3 + f.p), 0, 1.5, -9, -37, 9, -37, t < .6 ? .9 * (1 - t / .6) : -sm(.6, .9, t)),
      facepalm: (t, f, o) => f.sd > 0 ? put(o, 2, .08, 1.2, 2.5, -8, -4, 3, -31, -1) : put(o, 2, -.08, -1.2, 2.5, -3, -31, 8, -4, -1),
      slump: (t, f, o) => put(o, 3, 0, 0, 4, -9, 0, 9, 0, -1),
      shrug: (t, f, o) => put(o, -2, 0, 0, -1, -22, -15, 22, -15, -.7),
      crossArms: (t, f, o) => put(o, 1, 0, 0, 2, 7, -12, -7, -11, -1),
      ooh: (t, f, o) => { const k = sm(.75, 1.2, t); return put(o, 3 * k, 0, 0, -1 + 4 * k, -3 - 6 * k, -27 + 27 * k, 3 + 6 * k, -27 + 27 * k, 1 - 2 * k); },
      politeClap: (t, f, o) => { const c = .5 + .5 * cos(TAU * 1.9 * t); return put(o, 0, 0, 0, 1, -(1.4 + 5 * c), -15, 1.4 + 5 * c, -15, 0); },   // "next time!"
      bend: (t, f, o) => put(o, 3, 0, 0, 5, -5, -27, 5, -27, -1),
    };
    const TENSE = {
      clasp: (t, f, o) => put(o, -2, 0, 0, -1, -1.8, -25, 1.8, -25, 0),
      rise: (t, f, o) => put(o, -5, 0, 0, -1, -9, -8, 9, -8, 0),
      lean: (t, f, o) => put(o, -1, 0, 0, 1.8, -8, -6, 8, -6, 0),
      bite: (t, f, o) => put(o, -1, 0, 0, 0, -2, -27, 2, -27, 0),
      none: (t, f, o) => IDLE[f.idle](t, f, o),
    };
    const W_IDLE = { still: 58, bob: 14, chat: 10, clapSlow: 6, wave: 5, chin: 5 };
    const W_GOAL = { jumpV: 26, waveArms: 14, clapUp: 12, pump: 14, fists: 10, point: 7, standClap: 9 };
    const W_MISS = { headHands: 30, facepalm: 12, slump: 16, shrug: 12, crossArms: 7, ooh: 10, politeClap: 8, bend: 7 };
    const W_TENSE = { clasp: 30, rise: 20, lean: 18, bite: 10, none: 22 };

    /* ---------- fans ---------- */
    const pool = { home: [], away: [] };
    function look(shirt, away) {
      const skin = rp(SKIN), white = shirt === '#ffffff' || shirt === '#f2f2f2';
      const a = { shirt, skin, skinD: shade(skin, -.16), hairC: rp(HAIR), hair: rp([0, 0, 0, 0, 2, 2, 3, 3, 4, 5, 5, 5, 6]), pat: rand() < .45 ? rp([1, 2, 3]) : 0,
        trim: white ? rp(['#1f7fe0', '#3aa8ff', '#e5484d']) : (rand() < .6 ? '#ffffff' : shade(shirt, -.35)),
        cap: away ? rp(['#ff8a1f', '#2a2a2e']) : rp(['#1f7fe0', '#ffd23f', '#e5484d', '#ffffff', '#17366e']),
        scarf: rand() < .2 ? (away ? ['#ff8a1f', '#2a2a2e'] : rp([['#1f7fe0', '#ffffff'], ['#ffd23f', '#1f7fe0'], ['#3aa8ff', '#17366e'], ['#e5484d', '#ffffff']])) : null };
      if (a.hair === 6) a.hairC = rp(['#9a9aa3', '#c9c9cf', '#5a3a24']);
      a.sleeve = shade(shirt, -.12);
      a.torso = torsoSprite(a); a.head = headSprite(a);
      const [c, g] = mk(44, 58); g.translate(22, 50);              // pre-composed resting fan
      g.drawImage(a.torso, -15, -28, 30, 34); g.drawImage(a.head, -13, -49, 26, 28);
      limb(g, -11, -18, -8, -4, -1, a.sleeve, a.skin); limb(g, 11, -18, 8, -4, 1, a.sleeve, a.skin);
      a.rest = c; return a;
    }
    const FLAGS_H = [['#1f7fe0', '#ffffff'], ['#ffd23f', '#1f7fe0'], ['#3aa8ff', '#ffffff'], ['#e5484d', '#ffffff']];
    function makeFan(x, y, k, away) {
      const f = { x, y, k, away, ap: rp(away ? pool.away : pool.home), p: rand() * TAU, q: rr(2.1, 3.3), amp: rr(.8, 1.2), dl: rr(0, .42), dur: rr(1.9, 3.1), sd: rand() < .5 ? -1 : 1,
        idle: REDUCE ? 'still' : pickW(W_IDLE), goal: pickW(W_GOAL), miss: pickW(W_MISS), tense: pickW(W_TENSE), cur: { st: 'idle', t0: 0 }, prev: null, flag: null, phone: false };
      const r = rand();
      if (r < (away ? .09 : .035)) { f.flag = away ? ['#ff8a1f', '#2a2a2e'] : rp(FLAGS_H); f.idle = REDUCE ? 'still' : 'flag'; f.goal = 'flagWave'; }
      else if (r < (away ? .12 : .075) && !REDUCE) { f.phone = true; f.idle = 'phone'; }
      if (f.ap.scarf && rand() < .55) f.goal = 'scarf';
      return f;
    }
    const fans = { L: [], R: [], C: [], Lm: [], Rm: [] };
    function alphaAt(R, x, y) { const u = Math.floor((R.flip ? R.x + R.w - x : x - R.x) / R.w * R.mw), v = Math.floor((y - R.y) / R.h * R.mh);
      if (u < 0 || v < 0 || u >= R.mw || v >= R.mh) return 0; return R.md[(v * R.mw + u) * 4 + 3]; }
    function rows(key, x0, x1, y0, y1, step, k0, k1, awayAt) {
      const R = REG[key];
      for (let y = y0; y <= y1;) {
        const k = k0 + (k1 - k0) * (y - y0) / Math.max(1, y1 - y0), sp = 25 * k;
        for (let x = x0 + rand() * sp; x <= x1; x += sp * rr(.92, 1.1)) {
          if (rand() < .07) continue;                                              // empty seat
          const fx = x + rr(-2.5, 2.5), fy = y + rr(-1.5, 1.5), fk = k * rr(.9, 1.1);
          const vis = Math.max(alphaAt(R, fx, fy - 12 * fk), alphaAt(R, fx, fy - 33 * fk), alphaAt(R, fx - 7 * fk, fy - 20 * fk), alphaAt(R, fx + 7 * fk, fy - 20 * fk));
          if (vis < 90) continue;                                                  // nobody sits inside a wall
          fans[key].push(makeFan(fx, fy, fk, !!(awayAt && awayAt(fx, fy) && rand() < .82)));
        }
        y += step * k;
      }
      fans[key].sort((a, b) => a.y - b.y);
    }

    /* ---------- state ---------- */
    const P = new Array(N).fill(0), T1 = new Array(N).fill(0), T2 = new Array(N).fill(0);
    function evalState(f, s, now, out) {
      IDLE[f.idle](now + f.p, f, out);
      if (s.st === 'idle') return out;
      const t = now - s.t0; if (t <= 0) return out;
      let beh, env;
      if (s.st === 'tense') { beh = TENSE[f.tense]; env = sm(0, .22, t); }
      else { const happy = (s.st === 'goal') !== f.away, d = f.dur * (s.soft ? .7 : 1);
        beh = happy ? GOAL[f.goal] : MISS[f.miss]; env = sm(0, .16, t) * (1 - sm(d - .55, d, t)); }
      if (env <= 0) return out;
      beh(t, f, T1);
      for (let i = 0; i < N; i++) out[i] += (T1[i] - out[i]) * env;
      return out;
    }
    function fanPose(f, now, out) {
      const c = f.cur;
      if (f.prev && now < c.t0) return evalState(f, f.prev, now, out);
      evalState(f, c, now, out);
      if (f.prev) { const w = sm(0, .22, now - c.t0);
        if (w < 1) { evalState(f, f.prev, now, T2); for (let i = 0; i < N; i++) out[i] = T2[i] + (out[i] - T2[i]) * w; } else f.prev = null; }
      return out;
    }
    const isRest = (f, p) => !f.flag && !f.phone && ab(p[0]) + ab(p[1]) * 20 + ab(p[2]) + ab(p[3]) + ab(p[4] + 8) + ab(p[5] + 4) + ab(p[6] - 8) + ab(p[7] + 4) + ab(p[8]) < .08;

    /* ---------- drawing ---------- */
    let S = 1, ready = false, dirty = true;
    function drawFan(g, f, R, sc, now) {
      fanPose(f, now, P);
      const k = f.k * sc, cs = cos(P[1]) * k, sn = sin(P[1]) * k;
      g.setTransform(cs, sn, -sn, cs, (f.x - R.x) * sc, (f.y + P[0] * f.k - R.y) * sc);
      const a = f.ap;
      if (isRest(f, P)) { g.drawImage(a.rest, -22, -50, 44, 58); return; }
      g.drawImage(a.torso, -15, -28, 30, 34);
      g.drawImage(a.head, P[2] - 13, P[3] - 49, 26, 28);
      if (P[8] > .2) { g.fillStyle = '#5a1616'; g.beginPath(); g.ellipse(P[2], P[3] - 28.6, 2.3, .9 + 2 * P[8], 0, 0, TAU); g.fill(); }
      else if (P[8] < -.3) { g.fillStyle = a.skin; g.beginPath(); g.ellipse(P[2], P[3] - 29.1, 3, 1.8, 0, 0, TAU); g.fill();
        g.strokeStyle = '#7a3b2b'; g.lineWidth = .95; g.beginPath(); g.arc(P[2], P[3] - 26.5, 2.2, Math.PI + .5, TAU - .5); g.stroke(); }
      limb(g, -11, -18, P[4], P[5], -1, a.sleeve, a.skin); const lx = HAND[0], ly = HAND[1];
      limb(g, 11, -18, P[6], P[7], 1, a.sleeve, a.skin); const rx = HAND[0], ry = HAND[1];
      if (P[10] > .5 && a.scarf) { g.lineWidth = 5; g.strokeStyle = a.scarf[0]; g.beginPath(); g.moveTo(lx, ly - 1); g.lineTo(rx, ry - 1); g.stroke();
        g.setLineDash([3.4, 3.4]); g.strokeStyle = a.scarf[1]; g.stroke(); g.setLineDash([]); }
      if (f.phone) { g.fillStyle = '#1d2230'; g.fillRect(rx - 2.7, ry - 8.5, 5.4, 9); g.fillStyle = '#d6edff'; g.fillRect(rx - 1.9, ry - 7.7, 3.8, 6.8); }
      if (f.flag) {
        const an = P[9], ux = sin(an), uy = -cos(an), px = -uy, py = ux, tx = rx + ux * 40, ty = ry + uy * 40, wv = sin(now * 7 + f.p) * 3.2;
        g.strokeStyle = '#e6e6e6'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(rx - ux * 5, ry - uy * 5); g.lineTo(tx, ty); g.stroke();
        const cl = (c, a0, a1) => { g.fillStyle = c; g.beginPath();
          g.moveTo(tx - ux * a0, ty - uy * a0); g.quadraticCurveTo(tx - ux * a0 + px * 12, ty - uy * a0 + py * 12 + wv, tx - ux * (a0 + 2) + px * 25, ty - uy * (a0 + 2) + py * 25 - wv * .5);
          g.lineTo(tx - ux * (a1 + 2) + px * 25, ty - uy * (a1 + 2) + py * 25 - wv * .5); g.quadraticCurveTo(tx - ux * a1 + px * 12, ty - uy * a1 + py * 12 + wv, tx - ux * a1, ty - uy * a1); g.closePath(); g.fill(); };
        cl(f.flag[0], 0, 16); cl(f.flag[1], 5.5, 10.5);
      }
    }
    const visible = R => R.x < VIEW.x0 + VIEW.vw && R.x + R.w > VIEW.x0;
    function drawRegion(key, now) {
      const R = REG[key], o = R.off; if (!o || !(R.on = visible(R))) return;
      const g = o.g, W = o.c.width, H = o.c.height; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.imageSmoothingEnabled = true;
      for (const f of fans[key]) drawFan(g, f, R, o.sc, now);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = HAZE[key]; g.fillStyle = '#5d86b8'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;   // aerial haze
      g.globalCompositeOperation = 'destination-in';
      if (R.flip) g.setTransform(-1, 0, 0, 1, W, 0);
      g.drawImage(R.mask, 0, 0, W, H); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    }
    function compose() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.setTransform(S, 0, 0, S, -VIEW.x0 * S, -VIEW.y0 * S);
      for (const key in REG) { const R = REG[key]; if (R.off && R.on) ctx.drawImage(R.off.c, R.x, R.y, R.w, R.h); }
    }
    function render(now) { for (const key in REG) drawRegion(key, now); compose(); dirty = false; }
    function resize() {
      if (!VIEW.w || !VIEW.h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5), W = Math.max(1, Math.round(VIEW.w * dpr)), H = Math.max(1, Math.round(VIEW.h * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      S = VIEW.k * dpr;
      for (const key in REG) { const R = REG[key], sc = S * (R.blur ? BLUR : 1), w = Math.max(1, Math.ceil(R.w * sc)), h = Math.max(1, Math.ceil(R.h * sc));
        if (!R.off) { const c = document.createElement('canvas'); R.off = { c, g: c.getContext('2d') }; }
        if (R.off.c.width !== w || R.off.c.height !== h) { R.off.c.width = w; R.off.c.height = h; }
        R.off.sc = sc; }
      dirty = true; if (ready) render(REDUCE ? stillNow : performance.now() / 1000);   // resizing clears the canvas: repaint at once
    }
    window.__crowdResize = resize;

    /* ---------- loop: 60fps while reacting, 30fps idle, auto-throttle on slow devices ---------- */
    let hot = 0, last = 0, cost = 4, stillNow = 0, prevMs = 0, dtAvg = 16.7, slow = 0;
    function frame(ms) {
      requestAnimationFrame(frame);
      const dt = prevMs ? Math.min(100, ms - prevMs) : 16.7; prevMs = ms; dtAvg = dtAvg * .9 + dt * .1;
      if (!ready || document.hidden) return;
      if (ms < hot && ms > hot - 4000 && dtAvg > 24) slow = Math.max(slow, dtAvg > 40 ? 2 : 1);   // device struggling: thin out crowd frames
      const gap = ms < hot ? [0, 33, 66][slow] : 50;                  // reacting: full rate · idle fidgeting: 20fps
      if (!dirty && ms - last < gap - 2) return;
      last = ms; const t0 = performance.now(); render(ms / 1000); cost = cost * .9 + (performance.now() - t0) * .1;
    }
    function set(st, opts) {
      if (!ready) return;
      const soft = !!(opts && opts.soft);
      if (REDUCE) {                         // one still frame of the reaction, then back to calm
        if (st === 'tense') return;
        for (const k in fans) for (const f of fans[k]) { f.prev = null; f.cur = { st, t0: -.7, soft }; }
        stillNow = 0; render(0);
        clearTimeout(set.tm); set.tm = setTimeout(() => { for (const k in fans) for (const f of fans[k]) f.cur = { st: 'idle', t0: 0 }; render(0); }, 2600);
        return;
      }
      const now = performance.now() / 1000;
      for (const k in fans) for (const f of fans[k]) { f.prev = f.cur; f.cur = { st, t0: now + (st === 'tense' ? f.dl * .4 : f.dl), soft }; }
      hot = performance.now() + 4600;
    }

    /* ---------- boot: masks → looks → seats ---------- */
    let pending = 3;
    for (const key in REG) { if (REG[key].of) continue; const im = new Image(); im.onload = () => { REG[key].mask = im; if (--pending === 0) boot(); }; im.src = REG[key].src; }
    function boot() {
      try {
        for (const key in REG) { const R = REG[key]; if (R.of) continue; const c = document.createElement('canvas'); c.width = R.mask.naturalWidth; c.height = R.mask.naturalHeight;
          const g = c.getContext('2d'); g.drawImage(R.mask, 0, 0); R.md = g.getImageData(0, 0, c.width, c.height).data; R.mw = c.width; R.mh = c.height; }
        for (const key in REG) { const R = REG[key]; if (R.of) { const B = REG[R.of]; R.mask = B.mask; R.md = B.md; R.mw = B.mw; R.mh = B.mh; } }
        for (let i = 0; i < 64; i++) pool.home.push(look(rand() < .7 ? rp(HOME) : rp(MISC), false));
        for (let i = 0; i < 14; i++) pool.away.push(look(rp(AWAY), true));
        rows('C', 1090, 1772, 618, 904, 26, .76, .92);
        rows('L', 4, 410, 536, 935, 24, .95, 1.15);
        rows('R', 2386, 2750, 536, 935, 24, .95, 1.15, (x, y) => x > 2440 && y > 680);
        rows('Lm', -410, -4, 536, 935, 24, .95, 1.15);
        rows('Rm', 2754, 3150, 536, 935, 24, .95, 1.15, (x, y) => x < 3064 && y > 680);
        ready = true; resize(); render(0);
        if (!REDUCE) requestAnimationFrame(frame);
      } catch (e) { cv.style.display = 'none'; }
    }
    return { set, fans, render: () => render(performance.now() / 1000), get cost() { return cost; }, _i: { GOAL, MISS, TENSE, IDLE, pool, drawFan } };
  })();

  /* idle breathing / sway */
  let idle = true, idleT0 = performance.now();
  (function idleLoop(now) {
    if (idle) { const t = (now - idleT0) / 1000;
      K.dy = Math.sin(t * 2.4) * 5; K.dx = Math.sin(t * 1.1) * 14; K.sy = 1 + Math.sin(t * 2.4 + 1) * 0.012; K.sx = 1; K.ang = Math.sin(t * 1.1) * 1.2; K.air = 0;
      A.L.a = 138.3 + Math.sin(t * 2.4) * 4; A.R.a = 28.1 - Math.sin(t * 2.4) * 4; A.L.s = A.R.s = 1; drawKeeper(); }
    requestAnimationFrame(idleLoop);
  })(performance.now());

  /* ---------------- messages ---------------- */
  const msg = $('msg'); let msgAnim = 0;
  function say(main, sub, gold) {
    $('msgMain').textContent = main; $('msgShadow').textContent = main; $('msgSub').textContent = sub;
    const fs = main.length > 5 ? 150 : 210; $('msgMain').setAttribute('font-size', fs); $('msgShadow').setAttribute('font-size', fs);
    $('msgMain').setAttribute('fill', gold ? 'url(#gGold)' : 'url(#gCyan)'); $('msgMain').setAttribute('stroke', gold ? '#6b3600' : '#0f2f66');
    $('msgShadow').setAttribute('fill', gold ? '#6b3600' : '#0f2f66'); $('msgShadow').setAttribute('stroke', gold ? '#6b3600' : '#0f2f66');
    const cx = +msg.dataset.cx || 1400, cy = 1235, id = ++msgAnim;
    tween(380, t => { if (id !== msgAnim) return; msg.setAttribute('transform', `translate(${cx} ${cy}) scale(${lerp(.4, 1, t).toFixed(3)})`); msg.setAttribute('opacity', Math.min(1, t * 2).toFixed(2)); }, eBack);
  }
  function hush() { const id = ++msgAnim; tween(180, t => { if (id === msgAnim) msg.setAttribute('opacity', (1 - t).toFixed(2)); }); }

  /* ---------------- effects ---------------- */
  const fx = $('fx'), fxTop = $('fxTop');
  function netHit(x, y) {
    const flash = el('circle', { cx: x, cy: y, r: 40, fill: 'url(#flash)' }, fx);
    const rings = [0, 1, 2].map(() => el('circle', { cx: x, cy: y, r: 30, fill: 'none', stroke: '#ffffff', 'stroke-width': 10, opacity: 0 }, fx));
    tween(700, (t, r) => {
      flash.setAttribute('r', (40 + 190 * eOut(r)).toFixed(1)); flash.setAttribute('opacity', (1 - r).toFixed(2));
      rings.forEach((c, i) => { const rr = Math.max(0, Math.min(1, r * 1.4 - i * .2)); c.setAttribute('r', (30 + 220 * eOut(rr)).toFixed(1)); c.setAttribute('opacity', (rr > 0 ? (1 - rr) * .8 : 0).toFixed(2)); });
    }).then(() => { flash.remove(); rings.forEach(c => c.remove()); });
  }
  function punchBurst(x, y) {
    const g = el('g', { transform: `translate(${x} ${y})` }, fxTop);
    const pts = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? 46 : 110, a = i / 16 * Math.PI * 2 + 0.2; pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
    const star = el('polygon', { points: pts.join(' '), fill: '#fff6b0', stroke: '#ffb300', 'stroke-width': 8, 'stroke-linejoin': 'round' }, g);
    const core = el('circle', { r: 46, fill: 'url(#flash)' }, g);
    const lines = el('g', { stroke: '#ffffff', 'stroke-width': 9, 'stroke-linecap': 'round' }, g);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; el('line', { x1: (Math.cos(a) * 120).toFixed(1), y1: (Math.sin(a) * 120).toFixed(1), x2: (Math.cos(a) * 175).toFixed(1), y2: (Math.sin(a) * 175).toFixed(1) }, lines); }
    tween(320, (t, r) => { const s = lerp(.35, 1.15, eOut(r)); star.setAttribute('transform', `scale(${s.toFixed(3)}) rotate(${(r * 25).toFixed(1)})`); core.setAttribute('transform', `scale(${(s * 1.4).toFixed(3)})`);
      lines.setAttribute('transform', `scale(${lerp(.6, 1.3, eOut(r)).toFixed(3)})`); g.setAttribute('opacity', (r < .5 ? 1 : 1 - (r - .5) * 2).toFixed(2)); }).then(() => g.remove());
  }
  function shake(power) {
    if (REDUCE) return Promise.resolve();
    // shake every layer together (art, crowd, foreground) — units → css px
    return tween(320, (t, r) => { const a = power * (1 - r) * VIEW.k; view.style.transform = `translate(${(Math.sin(r * 60) * a).toFixed(2)}px,${(Math.cos(r * 47) * a * .6).toFixed(2)}px)`; })
      .then(() => { view.style.transform = ''; });
  }
  function confetti(cx) {
    if (REDUCE) return;
    const g = $('confetti'), colors = ['#ffd21f', '#ff6b6b', '#4fc3f7', '#9b5de5', '#2fbf8f', '#ffffff', '#ff9f1c'], parts = [];
    for (let i = 0; i < 70; i++) {
      const p = el('rect', { width: rnd(14, 26), height: rnd(8, 14), fill: pick(colors), rx: 3 }, g);
      parts.push({ p, x: cx + rnd(-500, 500), y: rnd(-300, 0), vx: rnd(-6, 6), vy: rnd(6, 16), rot: rnd(0, 360), vr: rnd(-12, 12), sw: Math.random() * 6 });
    }
    tween(1700, (t, r) => { parts.forEach(q => { const k = r * 100; q.p.setAttribute('transform', `translate(${(q.x + q.vx * k + Math.sin(k / 6 + q.sw) * 30).toFixed(1)} ${(q.y + q.vy * k).toFixed(1)}) rotate(${(q.rot + q.vr * k).toFixed(0)})`); q.p.setAttribute('opacity', (r < .8 ? 1 : (1 - r) * 5).toFixed(2)); }); })
      .then(() => { g.textContent = ''; });
  }
  function glow(k) { const gl = badgeEls[k].glow; tween(1400, (t, r) => gl.setAttribute('opacity', (Math.abs(Math.sin(r * Math.PI * 3)) * .95).toFixed(2))).then(() => gl.setAttribute('opacity', 0)); }

  /* ---------------- timer ---------------- */
  const ring = $('ring'), tNum = $('tNum'), timerBox = $('timer'), CIRC = 2 * Math.PI * 34;
  ring.style.strokeDasharray = CIRC.toFixed(2);
  let tId = null, left = TIME_LIMIT, deadline = 0;
  function paintTimer() {
    tNum.textContent = Math.max(0, Math.ceil(left));
    ring.style.strokeDashoffset = (CIRC * (1 - Math.max(0, left) / TIME_LIMIT)).toFixed(2);
    timerBox.classList.toggle('hurry', left <= 5 && left > 0 && tId !== null);
  }
  function startTimer() { stopTimer(); left = TIME_LIMIT; deadline = performance.now() + TIME_LIMIT * 1000; tId = setInterval(() => { left = (deadline - performance.now()) / 1000; if (left <= 0) { left = 0; stopTimer(); paintTimer(); timeUp(); } else paintTimer(); }, 100); paintTimer(); }
  function stopTimer() { if (tId !== null) { clearInterval(tId); tId = null; } timerBox.classList.remove('hurry'); }

  /* ---------------- game state ---------------- */
  const S = { i: 0, score: 0, res: [], q: null, ans: '', correct: null, recent: [] };
  const padBtns = [...document.querySelectorAll('.pad')];
  let busy = true;
  padBtns.forEach(b => b.addEventListener('click', () => shoot(b.dataset.zone)));
  function lock(on) { busy = on; padBtns.forEach(b => b.disabled = on); pads.classList.toggle('locked', on); }
  function board() { $('sbNow').textContent = Math.min(S.i + 1, TOTAL); $('sbScore').textContent = S.score + '골'; }
  function setEquation(text) {
    const eq = $('eq'), sh = $('eqShadow');
    for (const t of [eq, sh]) { t.textContent = text; t.setAttribute('font-size', 172); }
    try { const w = eq.getComputedTextLength(); if (w > 790) { const fs = Math.floor(172 * 790 / w); eq.setAttribute('font-size', fs); sh.setAttribute('font-size', fs); } } catch (e) {}
  }

  function nextQuestion() {
    if (S.i >= TOTAL) return showResult();
    S.q = LEVELS[level].gen();
    let z; do { z = pick(KEYS); } while (S.recent.length >= 2 && S.recent.every(r => r === z));   // never the same spot 3× in a row
    S.recent.push(z); if (S.recent.length > 2) S.recent.shift();
    S.correct = z; S.ans = fmt(S.q.answer, S.q.step);
    const wrong = buildChoices(S.q).sort(() => Math.random() - .5);
    KEYS.filter(k => k !== z).forEach((k, i) => setBadge(k, wrong[i])); setBadge(z, S.ans);
    setEquation(S.q.text); board();
    padBtns.forEach(b => b.classList.remove('hit', 'reveal'));
    setFace('serious');
    lock(false); startTimer();
  }

  async function resetActors() {
    const p = { ...K }, aL = A.L.a, aR = A.R.a, sL = A.L.s, sR = A.R.s;
    ball.setAttribute('opacity', 0);
    await tween(420, t => { K.dx = lerp(p.dx, 0, t); K.dy = lerp(p.dy, 0, t) - 18 * Math.sin(Math.PI * t); K.ang = lerp(p.ang, 0, t); K.sx = K.sy = 1; K.air = lerp(p.air, 0, t);
      A.L.a = angLerp(aL, 138.3, t); A.R.a = angLerp(aR, 28.1, t); A.L.s = lerp(sL, 1, t); A.R.s = lerp(sR, 1, t); drawKeeper(); }, eInOut);
    hist.length = 0; trail(false);
    setBall(BALL0.x, BALL0.y, 1, 0); setBallShadow(1352, 1450, 1, .42);
    await tween(260, t => { ball.setAttribute('opacity', t.toFixed(2)); setBall(BALL0.x, BALL0.y, lerp(.6, 1, t), 0); }, eBack);
    idleT0 = performance.now(); idle = true;
  }

  async function timeUp() {
    if (busy) return; lock(true); idle = false;
    Snd.sfx.whistle(0.55); Crowd.set('miss', { soft: true });
    $('p-' + S.correct).classList.add('reveal'); glow(S.correct);
    say('휘슬!', `정답은 ${S.ans}이에요`, false);
    await tween(420, (t, r) => { K.dy = -50 * Math.sin(r * Math.PI); K.dx = 0; K.ang = 0; drawKeeper(); });
    await wait(1500); hush();
    S.res[S.i] = 'time'; S.i++; board();
    await resetActors(); nextQuestion();
  }

  // after the contact: fall to the grass, spring back up, then react
  async function recoverAndReact(happy) {
    const p = { ...K }, lying = Math.abs(p.ang) > 40;
    const landDy = lying ? 128 : 0;
    await tween(260, t => { K.dy = lerp(p.dy, landDy, t); K.ang = p.ang * (1 + .06 * t); K.air = lerp(p.air, 0, t); drawKeeper(); }, eIn);
    ghostOn = false;
    if (lying) await wait(120);
    const q = { ...K }, aL = A.L.a, aR = A.R.a, sL = A.L.s, sR = A.R.s;
    const standX = Math.max(-560, Math.min(560, q.dx * 0.86));
    await tween(330, t => { K.dx = lerp(q.dx, standX, t); K.dy = lerp(q.dy, 0, t) - 40 * Math.sin(Math.PI * t); K.ang = lerp(q.ang, 0, t);
      A.L.a = angLerp(aL, 150, t); A.R.a = angLerp(aR, 16, t); A.L.s = lerp(sL, 1, t); A.R.s = lerp(sR, 1, t); K.sy = lerp(1.04, 1, t); drawKeeper(); }, eOut);
    if (happy) {
      // fist pump + two hops
      const lead = K.dx < 0 ? 'L' : 'R';
      await tween(900, (t, r) => { const hop = Math.abs(Math.sin(r * Math.PI * 2)); K.dy = -46 * hop; K.sy = 1 + 0.04 * hop;
        A[lead].a = angLerp(lead === 'L' ? 150 : 16, lead === 'L' ? 250 : -70, Math.min(1, r * 4)); A[lead].s = 1.25 + 0.08 * Math.sin(r * Math.PI * 6); drawKeeper(); });
    } else {
      // frustrated: stamp + head shake, arms dropped
      await tween(900, (t, r) => { K.ang = Math.sin(r * Math.PI * 6) * 5 * (1 - r); K.dy = r < .25 ? -30 * Math.sin(r / .25 * Math.PI) : 0; K.sy = r > .22 && r < .32 ? .95 : 1;
        A.L.a = angLerp(150, 105, Math.min(1, r * 3)); A.R.a = angLerp(16, 75, Math.min(1, r * 3)); drawKeeper(); });
    }
  }

  async function shoot(k) {
    if (busy) return; lock(true); stopTimer(); idle = false;
    Snd.init();
    const z = ZONES[k], goal = k === S.correct;
    $('p-' + k).classList.add('hit');
    // keeper dives to the shot's zone on a save, to the other side on a goal
    let kz = z;
    if (goal) { const opts = KEYS.filter(o => o !== k && (z.side === 0 ? ZONES[o].side !== 0 : ZONES[o].side === -z.side)); kz = ZONES[pick(opts)]; }
    const dir = z.side || pick([-1, 1]);
    const tx = z.x + rnd(-14, 14), ty = z.y + rnd(-10, 10);
    const ktx = goal ? kz.x : tx, kty = goal ? kz.y : ty;
    const plan = divePlan(kz, ktx, kty);
    const start = { ...K }, a0L = A.L.a, a0R = A.R.a;
    hist.length = 0;

    // 1) wind-up: ball squash, keeper crouches and focuses — the stands hold their breath
    Snd.sfx.kick(); Crowd.set('tense');
    await tween(130, t => { setBall(BALL0.x, BALL0.y + 6 * t, 1, 0, 1 + .07 * t, 1 - .08 * t); K.sy = 1 - .06 * t; K.sx = 1 + .03 * t;
      K.dx = lerp(start.dx, 0, t); K.dy = lerp(start.dy, 0, t); K.ang = lerp(start.ang, 0, t); drawKeeper(); }, eOut);

    // 2) flight (curved, 4 spins + trail) while the keeper launches; lead fist cocks back then punches
    const cxp = (BALL0.x + tx) / 2 - dir * rnd(60, 140), cyp = Math.min(BALL0.y, ty) - (z.y < 800 ? 170 : 90);
    const flight = tween(560, (t, r) => {
      const u = 1 - t, x = u * u * BALL0.x + 2 * u * t * cxp + t * t * tx, y = u * u * BALL0.y + 2 * u * t * cyp + t * t * ty;
      setBall(x, y, lerp(1, .4, t), dir * 1440 * eOut(r), r < .12 ? 1 - .1 * (1 - r / .12) : 1, 1); trail(true);
      setBallShadow(lerp(1352, tx, t), lerp(1450, 1104, t), lerp(1, .45, t), .42 * (1 - .55 * Math.sin(Math.PI * Math.min(1, t * 1.1))));
    }, t => 1 - Math.pow(1 - t, 1.7));
    const lead = plan.lead, other = plan.other;
    const cock = lead === 'L' ? 175 : -12;
    const dive = (async () => {
      await wait(60); ghostOn = true;
      await tween(450, (t, r) => {
        K.dx = lerp(0, plan.dx, t); K.dy = lerp(0, plan.dy, t) - (z.side === 0 ? 0 : 70 * Math.sin(Math.PI * r)); K.ang = lerp(0, plan.ang, t);
        K.sx = lerp(.97, 1, t); K.sy = lerp(.94, 1.05, t); K.air = lerp(0, plan.air, t);
        const pr = Math.max(0, (r - .55) / .45);                  // punch phase in the last 45%
        A[lead].a = r < .55 ? angLerp(lead === 'L' ? a0L : a0R, cock, eOut(r / .55)) : angLerp(cock, plan.leadA, eOut(pr));
        A[lead].s = r < .55 ? lerp(1, .9, r / .55) : lerp(.9, plan.leadS * 1.12, eOut(pr));
        A[other].a = angLerp(other === 'L' ? a0L : a0R, plan.otherA, eOut(r)); A[other].s = 1;
        drawKeeper();
      }, eOut);
    })();
    await Promise.all([flight, dive]);

    if (goal) {
      S.score++; S.res[S.i] = 'goal'; board();
      setFace('angry'); Crowd.set('goal');
      Snd.sfx.net(); Snd.sfx.cheer();
      netHit(tx, ty); shake(14); confetti(+msg.dataset.cx || 1400);
      say('골인!', pick(['정확한 슛이에요!', '완벽한 코스!', '골키퍼가 꼼짝 못했어요!', '멋진 슈팅!']), true);
      const fall = tween(520, (t, r) => { setBall(tx + dir * 8 * t, ty + 34 * t, lerp(.4, .34, t), dir * (1440 + 120 * t)); trail(r < .3); setBallShadow(tx, 1104, .45, .3 * (1 - t)); }, eOut);
      await Promise.all([fall, recoverAndReact(false)]);
    } else {
      S.res[S.i] = 'save';
      setFace('happy'); Crowd.set('miss');
      Snd.sfx.punch(); setTimeout(() => Snd.sfx.ooh(), 120);
      punchBurst(tx, ty); shake(10);
      // punch snap: fist pops forward then settles
      const ls = A[lead].s; tween(160, (t, r) => { A[lead].s = ls * (1 + .14 * Math.sin(Math.PI * r)); }, t => t);
      $('p-' + S.correct).classList.add('reveal'); glow(S.correct);
      say('골키퍼의 선방!', `정답은 ${S.ans}! 조금만 더 집중해봐요`, false);
      const out = z.side === 0 ? pick([-1, 1]) : dir, ex = tx + out * 520, ey = 1250;
      const rebound = (async () => {
        await tween(470, (t, r) => { const y = lerp(ty, ey, t) - 300 * Math.sin(Math.PI * t) * (1 - t * .35);
          setBall(lerp(tx, ex, t), y, lerp(.4, .86, t), dir * 1440 - out * 1100 * r); trail(true);
          setBallShadow(lerp(tx, ex, t), lerp(1104, ey + 100, t), lerp(.45, .85, t), .35); }, t => 1 - Math.pow(1 - t, 1.4));
        await tween(300, (t, r) => { const y = ey - 70 * Math.sin(Math.PI * r); setBall(ex + out * 70 * r, y, .86, -out * 1100 - out * 220 * r); trail(false); setBallShadow(ex + out * 70 * r, ey + 100, .85, .35); });
      })();
      await Promise.all([rebound, recoverAndReact(true)]);
    }
    await wait(250); hush();
    S.i++;
    await resetActors();
    setFace('serious');
    nextQuestion();
  }

  /* ---------------- screens ---------------- */
  const ballSvg = (miss) => `<svg viewBox="-118 -118 236 236" class="${miss ? 'miss' : ''}" aria-hidden="true"><use href="#ballImg"/></svg>`;
  function startGame(lv) {
    if (lv) level = lv;
    Snd.init(); Snd.stopMusic(); Snd.sfx.whistle(0.35);
    stopCeremony();
    Object.assign(S, { i: 0, score: 0, res: [], recent: [] });
    $('intro').hidden = true; $('result').hidden = true;
    nextQuestion();
  }
  function showIntro() { stopCeremony(); Snd.stopMusic(); $('result').hidden = true; $('intro').hidden = false; lock(true); }
  function showResult() {
    stopTimer(); lock(true);
    const s = S.score;
    if (s === TOTAL) return showCeremony();
    $('resScore').textContent = `${s}골 성공!`;
    $('resMsg').textContent = s >= 7 ? '멋진 해트트릭! 조금만 더 연습하면 만점이에요.' : '유효 슈팅이 좋았어요! 다음 경기에서 꼭 승리합시다.';
    $('resShots').innerHTML = S.res.map(r => ballSvg(r !== 'goal')).join('');
    $('result').hidden = false; $('againBtn').focus();
  }
  document.querySelectorAll('.lvl').forEach(b => b.addEventListener('click', () => startGame(b.dataset.level)));
  $('againBtn').addEventListener('click', () => startGame());
  $('levelBtn').addEventListener('click', showIntro);
  $('cerAgain').addEventListener('click', () => startGame());
  $('cerLevelBtn').addEventListener('click', showIntro);

  /* ---------------- trophy ceremony: rays, spotlights, confetti + fireworks canvas, fanfare ---------------- */
  const cer = $('ceremony'), cv = $('cfx'); let cerRAF = 0;
  function showCeremony() {
    $('cerLevel').textContent = `${LEVELS[level].label} · ${S.score}골 / ${TOTAL}골`;
    $('cerShots').innerHTML = S.res.map((r, i) => ballSvg(false).replace('<svg ', `<svg style="animation-delay:${(1.9 + i * .07).toFixed(2)}s" `)).join('');
    cer.hidden = false; $('cerAgain').focus();
    Snd.playVictory();
    if (!REDUCE) runCelebration();
  }
  function stopCeremony() { cer.hidden = true; cancelAnimationFrame(cerRAF); cerRAF = 0; }
  function runCelebration() {
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0; const fit = () => { W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }; fit();
    const colors = ['#ffd21f', '#ff5e7e', '#4fc3f7', '#9b5de5', '#2fd38f', '#ffffff', '#ff9f1c'];
    const conf = [], sparks = [];
    for (let i = 0; i < 140; i++) conf.push({ x: Math.random() * W, y: -Math.random() * H, w: 6 + Math.random() * 8, h: 4 + Math.random() * 5, vy: 1.4 + Math.random() * 2.4, vx: -0.6 + Math.random() * 1.2, r: Math.random() * 6, vr: -0.15 + Math.random() * 0.3, c: pick(colors), sw: Math.random() * 6 });
    let last = performance.now(), nextFw = last + 900;
    function firework(now) {
      const x = W * (0.15 + Math.random() * 0.7), y = H * (0.12 + Math.random() * 0.3), c = pick(colors), n = 54;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, sp = 2.2 + Math.random() * 2.6; sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c }); }
      nextFw = now + 650 + Math.random() * 700;
    }
    function frame(now) {
      if (cer.hidden) return;
      if (cv.clientWidth !== W || cv.clientHeight !== H) fit();
      const dt = Math.min(3, (now - last) / 16.7); last = now;
      ctx.clearRect(0, 0, W, H);
      if (now > nextFw) firework(now);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.045 * dt; p.vx *= 0.985; p.life -= 0.012 * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; } ctx.globalAlpha = p.life; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over';
      for (const p of conf) { p.y += p.vy * dt; p.x += (p.vx + Math.sin(now / 600 + p.sw) * 0.6) * dt; p.r += p.vr * dt; if (p.y > H + 20) { p.y = -20; p.x = Math.random() * W; }
        ctx.globalAlpha = 1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, Math.abs(Math.cos(now / 300 + p.sw))); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); }
      cerRAF = requestAnimationFrame(frame);
    }
    cancelAnimationFrame(cerRAF); cerRAF = requestAnimationFrame(frame);
  }

  // opening still frame = the reference artwork's example question
  const demo = { lt: '28', rt: '39', c: '42', lb: '45', rb: '51' };
  for (const k of KEYS) setBadge(k, demo[k]);
  setBallShadow(1352, 1450, 1, .42); setFace('serious');
  layout(); paintTimer(); lock(true);

  if (/debug/.test(location.hash)) window.__dbg = { Crowd, Snd, setFace, K, A, drawKeeper, divePlan, ZONES, S, showCeremony, stopIdle: () => { idle = false; }, scene, toLocal, setLevel: l => { level = l; } };
})();
