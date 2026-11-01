/*
 * Angry Pups — sound effects, synthesised live with the Web Audio API
 * (no audio files to download, works offline).
 */
(function (root) {
  'use strict';

  var A = {
    ctx: null,
    master: null,
    muted: false,
    _noise: null,
    _last: {},
  };

  A.unlock = function () {
    if (!A.ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.8;
      var comp = A.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      A.master.connect(comp);
      comp.connect(A.ctx.destination);
      // One second of white noise, reused by every noisy sound.
      var len = A.ctx.sampleRate;
      var buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      A._noise = buf;
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.03);
  };

  function env(g, t, a, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
  }

  function osc(type, f0, f1, t, dur, peak, dest) {
    var c = A.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, 0.006, peak, dur);
    o.connect(g); g.connect(dest || A.master);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, peak, type, f0, f1, q, dest) {
    var c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = A._noise;
    f.type = type || 'bandpass';
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 1;
    env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || A.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // Rate-limit so a pile-up of impacts doesn't turn into noise soup.
  function gate(name, ms) {
    var now = performance.now();
    if (A._last[name] && now - A._last[name] < ms) return false;
    A._last[name] = now;
    return true;
  }

  var S = {
    click: function (t) { osc('sine', 900, 500, t, 0.07, 0.25); },
    select: function (t) { osc('triangle', 660, 660, t, 0.06, 0.2); osc('triangle', 990, 990, t + 0.06, 0.08, 0.2); },
    stretch: function (t, o) {
      var f = 140 + 260 * (o.amount || 0);
      osc('sawtooth', f, f * 1.08, t, 0.05, 0.05);
      noise(t, 0.04, 0.05, 'bandpass', 1800 + 1500 * (o.amount || 0), null, 6);
    },
    launch: function (t, o) {
      var k = o.amount || 0.5;
      osc('triangle', 260, 90, t, 0.28, 0.35 * (0.5 + k));
      noise(t, 0.38, 0.35 * (0.4 + k), 'bandpass', 2600, 380, 1.2);
    },
    thud: function (t, o) {
      var k = Math.min(1, o.amount || 0.3);
      osc('sine', 150 + 60 * k, 55, t, 0.16 + 0.1 * k, 0.25 + 0.5 * k);
      noise(t, 0.09, 0.15 + 0.35 * k, 'lowpass', 900, 300, 0.7);
    },
    crunch: function (t, o) {
      var k = Math.min(1, o.amount || 0.6);
      for (var i = 0; i < 4; i++) noise(t + i * 0.035 + Math.random() * 0.02, 0.12, 0.35 * k, 'bandpass', 1400 + Math.random() * 1800, 600, 2);
      osc('sine', 120, 50, t, 0.22, 0.45 * k);
    },
    yip: function (t) {
      var o = osc('triangle', 720, 1150, t, 0.16, 0.28);
      o.frequency.exponentialRampToValueAtTime(820, t + 0.2);
      osc('sine', 1450, 1700, t + 0.02, 0.08, 0.08);
    },
    ko: function (t) {
      var o = osc('triangle', 980, 380, t, 0.55, 0.3);
      var lfo = A.ctx.createOscillator(), lg = A.ctx.createGain();
      lfo.frequency.value = 9; lg.gain.value = 40;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 0.6);
      noise(t + 0.05, 0.35, 0.25, 'lowpass', 2400, 400, 0.8);
    },
    helmet: function (t) {
      [1180, 1870, 2650, 3420].forEach(function (f, i) { osc('sine', f, f * 0.995, t, 0.5 - i * 0.08, 0.16 - i * 0.03); });
      noise(t, 0.05, 0.2, 'highpass', 4000, null, 0.7);
    },
    poof: function (t) { noise(t, 0.3, 0.3, 'lowpass', 3000, 300, 0.8); },
    win: function (t) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        osc('triangle', f, f, t + i * 0.11, 0.32, 0.28);
        osc('sine', f * 2, f * 2, t + i * 0.11, 0.2, 0.06);
      });
      osc('triangle', 1318.5, 1318.5, t + 0.48, 0.7, 0.22);
      osc('triangle', 1046.5, 1046.5, t + 0.48, 0.7, 0.18);
    },
    lose: function (t) {
      [392, 370, 349, 311].forEach(function (f, i) {
        var g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(A.master);
        g.connect(lp);
        osc('sawtooth', f, i === 3 ? f * 0.94 : f, t + i * 0.32, i === 3 ? 0.8 : 0.28, 0.12, g);
        g.gain.value = 1;
      });
    },
    star: function (t, o) { var f = 880 * Math.pow(1.26, o.amount || 0); osc('triangle', f, f, t, 0.25, 0.25); osc('sine', f * 2, f * 2, t, 0.18, 0.08); },
    whoosh: function (t) { noise(t, 0.45, 0.18, 'bandpass', 500, 2400, 1); },
  };

  // ---- Background music: a soft marimba loop (C – Am – F – G), scheduled ahead.
  var M = { on: false, bus: null, timer: 0, next: 0, step: 0 };
  var BPM = 100, EIGHTH = 60 / BPM / 2;
  var CHORDS = [
    [48, [60, 64, 67, 72]], [45, [57, 60, 64, 69]],
    [41, [57, 60, 65, 69]], [43, [59, 62, 67, 71]],
  ];
  var ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  function hz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function marimba(t, note, vel) {
    var c = A.ctx, f = hz(note);
    [[1, 1], [4, 0.18], [10, 0.05]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vel * p[1], t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (p[0] === 1 ? 0.55 : 0.12));
      o.connect(g); g.connect(M.bus);
      o.start(t); o.stop(t + 0.6);
    });
  }

  function schedule() {
    if (!M.on) return;
    while (M.next < A.ctx.currentTime + 0.25) {
      var t = M.next, s = M.step;
      var bar = Math.floor(s / 8) % CHORDS.length, i = s % 8;
      var ch = CHORDS[bar];
      marimba(t, ch[1][ARP[i]] + (i === 3 && bar % 2 ? 12 : 0), i % 2 ? 0.05 : 0.08);
      if (i === 0 || i === 4) {
        var o = A.ctx.createOscillator(), g = A.ctx.createGain();
        o.type = 'triangle'; o.frequency.value = hz(ch[0]);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + EIGHTH * 3.5);
        o.connect(g); g.connect(M.bus); o.start(t); o.stop(t + EIGHTH * 4);
      }
      if (i % 2 === 1) noise(t, 0.05, 0.035, 'highpass', 7000, null, 0.7, M.bus);
      M.next += EIGHTH;
      M.step++;
    }
  }

  A.startMusic = function () {
    if (!A.ctx || M.on) return;
    if (!M.bus) {
      M.bus = A.ctx.createGain();
      var delay = A.ctx.createDelay(), fb = A.ctx.createGain(), wet = A.ctx.createGain();
      delay.delayTime.value = EIGHTH * 3; fb.gain.value = 0.25; wet.gain.value = 0.22;
      M.bus.connect(A.master);
      M.bus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(A.master);
    }
    M.bus.gain.cancelScheduledValues(A.ctx.currentTime);
    M.bus.gain.setValueAtTime(0.0001, A.ctx.currentTime);
    M.bus.gain.exponentialRampToValueAtTime(0.5, A.ctx.currentTime + 1.5);
    M.on = true;
    M.next = A.ctx.currentTime + 0.1;
    M.timer = setInterval(schedule, 60);
    schedule();
  };

  // Duck the music under menus and results.
  A.musicLevel = function (v) {
    if (!M.bus) return;
    M.bus.gain.setTargetAtTime(Math.max(0.0001, v * 0.5), A.ctx.currentTime, 0.25);
  };

  A.play = function (name, opts) {
    if (!A.ctx || A.muted || !S[name]) return;
    opts = opts || {};
    if (opts.gate && !gate(name, opts.gate)) return;
    try { S[name](A.ctx.currentTime + 0.005, opts); } catch (e) { /* ignore audio hiccups */ }
  };

  A.buzz = function (ms) {
    if (A.muted) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* not supported */ } }
  };

  root.AP = root.AP || {};
  root.AP.Audio = A;
})(window);
