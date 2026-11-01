/*
 * Angry Pups — rendering, camera, touch input and effects.
 * Physics and rules live in sim.js; screens and HUD live in main.js.
 */
(function (root) {
  'use strict';

  var AP = root.AP;
  var Sim = AP.Sim, PHYS = AP.PHYS, BALLS = AP.BALLS, REST = AP.SLING_REST, ATLAS = AP.ATLAS, Audio = AP.Audio;

  var PUP_PX_PER_M = 250; // sprite pixels per metre for the pup art
  var SLING = { left: 1.66, width: 3.4 };
  SLING.height = SLING.width * ATLAS.frames.sling.h / ATLAS.frames.sling.w;
  var ANCHORS = ATLAS.meta.sling.anchors.map(function (a) {
    return { x: SLING.left + a.x * SLING.width, y: SLING.height * (1 - a.y) - 0.02 };
  });
  var BG_SEAM = 985 / 1152; // row of the background art where objects stand
  var OUTLINE = '#2a2140';
  var TAU = Math.PI * 2;

  var G = {
    canvas: null, ctx: null, dpr: 1, W: 1, H: 1, groundY: 1, s: 30,
    cam: { x: 12, target: 12, mode: 'aim', vx: 0 },
    sim: null, level: null, levelMaxX: 24, levelMinX: 14,
    img: {}, patterns: {},
    particles: [], shake: 0, slowmo: 0, t: 0, acc: 0,
    aim: null, pan: null,
    trail: [], prevTrail: [], trailT: 0,
    pouch: { x: REST.x, y: REST.y, vx: 0, vy: 0 },
    listeners: {}, running: false, paused: false, inputEnabled: false,
    showHint: false, readyDelay: 0, lastShot: null, offscreen: null,
    lastTime: 0,
  };

  // ---------- kid-friendly "more or less" words for the physics numbers
  G.WORDS = {
    pull: [[0.05, 'none'], [0.3, 'a little'], [0.6, 'some'], [0.9, 'a lot'], [Infinity, 'all the way!']],
    push: [[0.05, 'none'], [0.3, 'small'], [0.6, 'medium'], [0.9, 'big'], [Infinity, 'HUGE!']],
    speed: [[0.5, '–'], [9, 'slow'], [16, 'medium'], [23, 'fast'], [Infinity, 'super fast!']],
    hit: [[1, '–'], [3, 'tap'], [6, 'bonk'], [10, 'BAM!'], [Infinity, 'KABOOM!']],
  };
  G.word = function (value, scale) {
    for (var i = 0; i < scale.length; i++) if (value < scale[i][0]) return scale[i][1];
    return scale[scale.length - 1][1];
  };

  // ---------- tiny event emitter
  G.on = function (name, fn) { (G.listeners[name] = G.listeners[name] || []).push(fn); };
  G.emit = function (name, data) { (G.listeners[name] || []).forEach(function (fn) { fn(data); }); };

  // ---------- loading
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('Could not load ' + src)); };
      im.src = src;
    });
  }

  G.load = function () {
    var small = Math.max(root.innerWidth, root.innerHeight) < 1000;
    return Promise.all([
      loadImage('assets/sprites/atlas.webp'),
      loadImage(small ? 'assets/img/bg-sm.webp' : 'assets/img/bg.webp'),
    ]).then(function (imgs) {
      G.img.atlas = imgs[0];
      G.img.bg = imgs[1];
      buildPatterns();
    });
  };

  function foamTile(base, bead, shade, seed) {
    var c = document.createElement('canvas');
    c.width = c.height = 192;
    var x = c.getContext('2d');
    x.fillStyle = base;
    x.fillRect(0, 0, 192, 192);
    var r = seed;
    function rnd() { r = (r * 16807) % 2147483647; return r / 2147483647; }
    for (var i = 0; i < 520; i++) {
      var px = rnd() * 192, py = rnd() * 192, rad = 3 + rnd() * 5;
      for (var ox = -192; ox <= 192; ox += 192) {
        for (var oy = -192; oy <= 192; oy += 192) {
          var cx = px + ox, cy = py + oy;
          if (cx < -10 || cx > 202 || cy < -10 || cy > 202) continue;
          var g = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
          g.addColorStop(0, bead);
          g.addColorStop(0.75, base);
          g.addColorStop(1, shade);
          x.fillStyle = g;
          x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
        }
      }
    }
    return c;
  }

  function buildPatterns() {
    var ctx = G.ctx;
    var tiles = {
      foam: foamTile('#f3eef4', '#ffffff', 'rgba(170,150,185,0.55)', 7),
      taped: foamTile('#efe9ef', '#ffffff', 'rgba(160,140,175,0.6)', 11),
      dense: foamTile('#b9bfcc', '#d7dbe4', 'rgba(90,96,120,0.55)', 23),
    };
    for (var k in tiles) {
      var p = ctx.createPattern(tiles[k], 'repeat');
      if (p.setTransform && root.DOMMatrix) p.setTransform(new DOMMatrix().scale(1.4 / 192));
      G.patterns[k] = p;
    }
  }

  // ---------- canvas & camera
  G.init = function (canvas) {
    G.canvas = canvas;
    G.ctx = canvas.getContext('2d');
    G.resize();
    root.addEventListener('resize', G.resize);
    if (root.visualViewport) root.visualViewport.addEventListener('resize', G.resize);
    bindInput(canvas);
    requestAnimationFrame(frame);
  };

  G.resize = function () {
    var w = G.canvas.clientWidth || root.innerWidth;
    var h = G.canvas.clientHeight || root.innerHeight;
    G.dpr = Math.min(root.devicePixelRatio || 1, w * h > 1400000 ? 1.5 : 2);
    G.W = w; G.H = h;
    G.canvas.width = Math.round(w * G.dpr);
    G.canvas.height = Math.round(h * G.dpr);
    G.portrait = h > w * 1.05;
    // Portrait phones: the table front becomes a control deck under the play area.
    G.groundY = G.portrait ? Math.round(h * 0.66) : Math.round(h - Math.max(40, Math.min(150, h * 0.14)));
    computeScale();
    G.s = targetScale();
  };

  // Two zoom levels: "view" fits the whole level (used while aiming) and
  // "action" is close enough to enjoy the impact (used while the ball flies).
  // On landscape screens they are usually the same.
  function computeScale() {
    var span = (G.levelMaxX + 2.4) - 0.6;
    var cap = G.groundY / 7.4;
    var sFit = G.W / span;
    var sMin = G.portrait ? 34 : 30;
    G.sAct = Math.min(Math.max(sFit, sMin), cap);
    G.sView = Math.min(G.sAct, Math.max(sFit, 12));
    G.dragPx = Math.max(100, Math.min(180, Math.min(G.W, G.H) * 0.28));
  }

  function targetScale() {
    return G.cam.mode === 'follow' ? G.sAct : G.sView;
  }

  function halfView() { return G.W / (2 * G.s); }

  function clampCam(x) {
    var hw = halfView();
    var lo = 0.4 + hw, hi = G.levelMaxX + 3 - hw;
    if (lo > hi) return (lo + hi) / 2;
    return Math.max(lo, Math.min(hi, x));
  }

  function camTarget() {
    var c = G.cam, hw = halfView();
    if (c.mode === 'aim') return clampCam(1.0 + hw);
    if (c.mode === 'overview') return clampCam((G.levelMinX + G.levelMaxX) / 2);
    if (c.mode === 'follow') {
      var b = G.sim && G.sim.ball;
      if (b) return clampCam(b.getPosition().x + hw * 0.15);
      return c.target;
    }
    return c.target; // free
  }

  function w2s(x, y) {
    return [(x - G.cam.x) * G.s + G.W / 2 + G.shakeX, G.groundY - y * G.s + G.shakeY];
  }
  function s2w(px, py) {
    return [(px - G.W / 2) / G.s + G.cam.x, (G.groundY - py) / G.s];
  }

  // ---------- level lifecycle
  G.startLevel = function (level) {
    G.level = level;
    G.sim = new Sim(level);
    var minX = 1e9, maxX = -1e9;
    level.objects.forEach(function (o) {
      var hw = (o.w || (o.r ? o.r * 2 : 1)) / 2;
      minX = Math.min(minX, o.x - hw); maxX = Math.max(maxX, o.x + hw);
    });
    G.levelMinX = minX; G.levelMaxX = maxX;
    G.cam.mode = 'overview';
    computeScale();
    G.s = targetScale();
    G.particles = [];
    G.trail = []; G.prevTrail = [];
    G.aim = null; G.pan = null;
    G.shake = 0; G.slowmo = 0; G.acc = 0;
    G.pouch = { x: REST.x, y: REST.y, vx: 0, vy: 0 };
    G.cam.mode = 'overview';
    G.cam.x = G.cam.target = clampCam((minX + maxX) / 2);
    G.running = true; G.paused = false;
    G.inputEnabled = false;
    G.showHint = level.id === 1;
    G.readyDelay = 0;
    G.lastShot = null;
    G.emit('ammo');
  };

  G.beginPlay = function () {
    G.inputEnabled = true;
    G.cam.mode = 'aim';
    Audio.play('whoosh');
  };

  G.stop = function () { G.running = false; G.sim = null; G.inputEnabled = false; };

  G.selectBall = function (type) {
    if (!G.sim || !G.sim.select(type)) return false;
    Audio.play('select');
    G.emit('ammo');
    return true;
  };

  // Info for the science panel.
  G.labInfo = function () {
    var sim = G.sim;
    if (!sim) return null;
    var type = sim.loaded;
    if (G.aim && G.aim.pull) {
      var li = Sim.launchInfo(type, G.aim.pull.len);
      li.type = type; li.live = true;
      return li;
    }
    if (G.lastShot) return G.lastShot;
    var base = Sim.launchInfo(type, 0);
    base.type = type;
    return base;
  };

  // ---------- input
  function pointerPos(e) {
    var r = G.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function bindInput(cv) {
    cv.addEventListener('pointerdown', function (e) {
      if (!G.running || G.paused || !G.inputEnabled || !G.sim) return;
      var p = pointerPos(e);
      var ballS = w2s(REST.x, REST.y);
      var wpt = s2w(p[0], p[1]);
      var near = Math.hypot(p[0] - ballS[0], p[1] - ballS[1]) < Math.max(80, 1.6 * G.s);
      if (G.sim.state === 'ready' && (near || wpt[0] < REST.x + 2.2)) {
        G.aim = { id: e.pointerId, sx: p[0], sy: p[1], pull: { x: 0, y: 0, len: 0 }, lastStep: 0 };
        G.cam.mode = 'aim';
        G.showHint = false;
        Audio.unlock();
      } else {
        G.pan = { id: e.pointerId, x: p[0], camX: G.cam.x, moved: false };
      }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      e.preventDefault();
    });

    cv.addEventListener('pointermove', function (e) {
      var p = pointerPos(e);
      if (G.aim && e.pointerId === G.aim.id) {
        var k = PHYS.maxPull / G.dragPx;
        var B = BALLS[G.sim.loaded];
        G.aim.pull = Sim.clampPull((p[0] - G.aim.sx) * k, -(p[1] - G.aim.sy) * k, B.r);
        var step = Math.floor(G.aim.pull.len / 0.25);
        if (step !== G.aim.lastStep) {
          G.aim.lastStep = step;
          Audio.play('stretch', { amount: G.aim.pull.len / PHYS.maxPull, gate: 35 });
        }
      } else if (G.pan && e.pointerId === G.pan.id) {
        var dx = p[0] - G.pan.x;
        if (Math.abs(dx) > 6) G.pan.moved = true;
        if (G.pan.moved) {
          G.cam.mode = 'free';
          G.cam.target = clampCam(G.pan.camX - dx / G.s);
        }
      }
    });

    function end(e) {
      if (G.aim && e.pointerId === G.aim.id) {
        var pull = G.aim.pull;
        G.aim = null;
        if (pull.len >= PHYS.minPull && G.sim && G.sim.fire(pull)) {
          var li = Sim.launchInfo(G.sim.loaded, pull.len);
          li.type = G.sim.loaded;
          G.lastShot = li;
          G.pouch.x = REST.x + pull.x; G.pouch.y = REST.y + pull.y;
          G.emit('ammo');
        } else {
          G.pouch.x = REST.x + pull.x; G.pouch.y = REST.y + pull.y;
          G.pouch.vx = G.pouch.vy = 0;
        }
      }
      if (G.pan && e.pointerId === G.pan.id) G.pan = null;
    }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', function (e) {
      if (!G.running) return;
      G.cam.mode = 'free';
      G.cam.target = clampCam(G.cam.target + (e.deltaX || e.deltaY) / G.s);
      e.preventDefault();
    }, { passive: false });
  }

  // ---------- particles
  function addP(p) {
    p.t = 0;
    if (G.particles.length > 420) G.particles.shift();
    G.particles.push(p);
  }

  function burstCrumbs(x, y, w, h, angle, n, vx, vy, mat) {
    var c = Math.cos(angle), s = Math.sin(angle);
    for (var i = 0; i < n; i++) {
      var lx = (Math.random() - 0.5) * w, ly = (Math.random() - 0.5) * h;
      addP({
        kind: 'crumb', mat: mat,
        x: x + lx * c - ly * s, y: y + lx * s + ly * c,
        vx: vx * 0.4 + (Math.random() - 0.5) * 5, vy: vy * 0.4 + Math.random() * 5 + 1,
        size: 0.06 + Math.random() * 0.16, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
        life: 1.2 + Math.random() * 1.0,
      });
    }
    for (var j = 0; j < 5; j++) {
      addP({ kind: 'dust', x: x + (Math.random() - 0.5) * w, y: y + (Math.random() - 0.5) * h, vx: (Math.random() - 0.5) * 1.2, vy: Math.random() * 0.8, size: 0.25 + Math.random() * 0.3, life: 0.7 + Math.random() * 0.4 });
    }
  }

  function stars(x, y, n, spread) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = (spread || 3) * (0.5 + Math.random());
      addP({ kind: 'star', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + 2, size: 0.12 + Math.random() * 0.1, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, life: 0.7 + Math.random() * 0.4, g: 0.4 });
    }
  }

  function popup(x, y, text, opts) {
    opts = opts || {};
    addP({ kind: 'text', x: x, y: y, vx: 0, vy: opts.vy || 1.4, text: text, size: opts.size || 0.55, color: opts.color || '#ffffff', stroke: opts.stroke || '#6b1fa8', life: opts.life || 1.1, g: 0 });
  }

  function updateParticles(dt) {
    var ps = G.particles;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps.splice(i, 1); continue; }
      var grav = p.g !== undefined ? p.g : 1;
      if (p.kind === 'dust' || p.kind === 'ring') grav = 0;
      if (p.kind === 'text') { p.vy *= Math.pow(0.15, dt); grav = 0; }
      p.vy -= PHYS.g * grav * dt;
      p.x += (p.vx || 0) * dt;
      p.y += (p.vy || 0) * dt;
      if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
      if ((p.kind === 'crumb' || p.kind === 'helmet') && p.y < p.size * 0.5) {
        p.y = p.size * 0.5;
        p.vy = -p.vy * 0.3; p.vx *= 0.6; p.vr *= 0.6;
      }
    }
  }

  // ---------- simulation events -> juice
  function handleEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      switch (e.type) {
        case 'release':
          Audio.play('launch', { amount: e.F / (PHYS.k * PHYS.maxPull) });
          Audio.buzz(12);
          G.cam.mode = 'follow';
          G.prevTrail = G.trail; G.trail = [];
          G.emit('release', e);
          break;
        case 'launch':
          if (G.lastShot) { G.lastShot.vMeasured = e.v; G.lastShot.pMeasured = e.p; }
          G.emit('launch', e);
          break;
        case 'impact': {
          if (e.imp < 1.0) break;
          var k = Math.min(1, e.imp / 14);
          Audio.play('thud', { amount: k, gate: 55 });
          if (e.imp > 2.5) {
            for (var d = 0; d < 2 + k * 5; d++) addP({ kind: 'dust', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.2, size: 0.15 + k * 0.3, life: 0.5 + Math.random() * 0.3 });
            G.shake = Math.min(14, G.shake + e.imp * 0.6);
          }
          if (e.ball && e.imp > 2.5) {
            var hw = G.word(e.imp, G.WORDS.hit);
            if (hw !== 'tap') popup(e.x, e.y + 0.4, hw === 'bonk' ? 'BONK!' : hw, { size: e.imp > 10 ? 0.5 : 0.4, color: '#ffe066', stroke: '#3b1d5e', life: 1.0, vy: 1.6 });
            if (G.lastShot) G.lastShot.impulse = Math.max(G.lastShot.impulse || 0, e.imp);
            if (e.imp > 6) addP({ kind: 'ring', x: e.x, y: e.y, size: 0.2, grow: 3 + k * 4, life: 0.35 });
          }
          if (e.imp > 4) Audio.buzz(Math.round(10 + k * 25));
          break;
        }
        case 'break':
          burstCrumbs(e.x, e.y, e.w, e.h, e.angle, Math.round(8 + Math.min(16, e.w * e.h * 10)), e.vx, e.vy, e.mat);
          popup(e.x, e.y + 0.3, '+' + e.points, { size: 0.42 });
          Audio.play('crunch', { amount: 0.8, gate: 40 });
          Audio.buzz(18);
          G.shake = Math.min(16, G.shake + 5);
          break;
        case 'pupHurt':
          Audio.play('yip', { gate: 160 });
          stars(e.x, e.y + 0.4, 3, 2);
          break;
        case 'helmetPop':
          Audio.play('helmet');
          addP({ kind: 'helmet', x: e.x, y: e.y, vx: (Math.random() - 0.3) * 3, vy: 6, size: 0.7, rot: 0, vr: 9 * (Math.random() < 0.5 ? -1 : 1), life: 2.2 });
          G.emit('toast', 'Helmet knocked off!');
          break;
        case 'pupKO':
          Audio.play('ko');
          Audio.play('poof');
          Audio.buzz([30, 40, 30]);
          addP({ kind: 'ko', pup: e.pup, x: e.x, y: e.y - e.h / 2, angle: e.angle, vx: 0, vy: 0, g: 0, life: 1.1, size: 1 });
          addP({ kind: 'ring', x: e.x, y: e.y, size: 0.3, grow: 5, life: 0.45 });
          stars(e.x, e.y, 9, 4);
          for (var q = 0; q < 8; q++) addP({ kind: 'dust', x: e.x + (Math.random() - 0.5) * 0.8, y: e.y + (Math.random() - 0.5) * 0.8, vx: (Math.random() - 0.5) * 2.5, vy: Math.random() * 1.5, size: 0.35 + Math.random() * 0.35, life: 0.8 });
          popup(e.x, e.y + 0.9, '+' + e.points, { size: 0.62, color: '#ffffff', stroke: '#d1157a' });
          G.shake = Math.min(18, G.shake + 7);
          if (G.sim.pupsAlive() === 0) G.slowmo = 0.9;
          G.emit('pupKO', e);
          break;
        case 'ballGone':
          for (var b = 0; b < 6; b++) addP({ kind: 'dust', x: e.x + (Math.random() - 0.5) * 0.6, y: Math.max(0.2, e.y + (Math.random() - 0.5) * 0.6), vx: (Math.random() - 0.5) * 1.5, vy: Math.random(), size: 0.3 + Math.random() * 0.25, life: 0.6 });
          break;
        case 'ready':
          G.readyDelay = 0.35;
          G.pouch.x = REST.x; G.pouch.y = REST.y + 0.6; G.pouch.vy = -3;
          G.emit('ammo');
          G.emit('ready', e);
          break;
        case 'won':
          G.cam.mode = 'overview';
          G.emit('won', e);
          break;
        case 'lost':
          G.cam.mode = 'overview';
          G.emit('lost', e);
          break;
      }
    }
  }

  // ---------- main loop
  function frame(now) {
    var dt = Math.min(0.05, ((now - (G.lastTime || now)) / 1000) || 0);
    G.lastTime = now;
    if (G.running && !G.paused && G.sim) update(dt);
    if (G.sim) render(dt);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    G.t += dt;
    var ts = 1;
    if (G.slowmo > 0) { G.slowmo -= dt; ts = 0.32; }
    var sdt = dt * ts;
    G.acc += sdt;
    var n = 0;
    while (G.acc >= PHYS.dt && n < 10) { G.sim.step(); G.acc -= PHYS.dt; n++; }
    if (n >= 10) G.acc = 0;
    handleEvents(G.sim.drainEvents());
    updateParticles(sdt);

    if (G.readyDelay > 0) {
      G.readyDelay -= dt;
      if (G.readyDelay <= 0 && G.cam.mode !== 'free') G.cam.mode = 'aim';
    }

    // Ball trail
    var ball = G.sim.ball;
    if (ball && (G.sim.state === 'flight' || G.sim.state === 'band')) {
      G.trailT -= sdt;
      if (G.trailT <= 0) {
        G.trailT = 0.045;
        var bp = ball.getPosition();
        G.trail.push({ x: bp.x, y: bp.y, r: ball.getUserData().r });
        if (G.trail.length > 160) G.trail.shift();
      }
    }

    // Pouch spring (visual only) once the ball has left it.
    var pch = G.pouch;
    if (!(G.aim) && !(G.sim.state === 'band')) {
      var kx = 260, damp = 9;
      pch.vx += (-(pch.x - REST.x) * kx - pch.vx * damp) * dt;
      pch.vy += (-(pch.y - REST.y) * kx - pch.vy * damp) * dt;
      pch.x += pch.vx * dt; pch.y += pch.vy * dt;
    } else if (G.sim.state === 'band' && ball) {
      var p = ball.getPosition();
      pch.x = p.x; pch.y = p.y; pch.vx = ball.getLinearVelocity().x; pch.vy = ball.getLinearVelocity().y;
    }

    // Camera: zoom first (anchored on the tabletop), then pan.
    var c = G.cam;
    var st = targetScale();
    G.s += (st - G.s) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs(st - G.s) < 0.01) G.s = st;
    if (c.mode !== 'free') c.target = camTarget();
    else c.target = clampCam(c.target);
    var rate = c.mode === 'follow' ? 5 : 3.2;
    c.x += (c.target - c.x) * (1 - Math.exp(-dt * rate));
    G.shake *= Math.pow(0.0025, dt);
    if (G.shake < 0.2) G.shake = 0;
  }

  // ---------- drawing helpers
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFrame(ctx, key, x, y, w, h) {
    var f = ATLAS.frames[key];
    ctx.drawImage(G.img.atlas, f.x, f.y, f.w, f.h, x, y, w, h);
  }

  function lineW(px) { return Math.max(px, 0.04 * G.s) / G.s; }

  function drawBackground(ctx) {
    var bg = G.img.bg;
    var scale = G.groundY / (bg.height * BG_SEAM);
    var bw = bg.width * scale, bh = bg.height * scale;
    var bx = G.W / 2 - bw / 2 - (G.cam.x - 12) * G.s * 0.22 + G.shakeX * 0.4;
    var k0 = Math.floor(-bx / bw) - 1;
    for (var k = k0; k < k0 + 4; k++) {
      var x = bx + k * bw;
      if (x > G.W || x + bw < 0) continue;
      if (k % 2 !== 0) {
        ctx.save(); ctx.translate(x + bw, 0); ctx.scale(-1, 1);
        ctx.drawImage(bg, 0, 0, bw + 1, bh);
        ctx.restore();
      } else {
        ctx.drawImage(bg, x, 0, bw + 1, bh);
      }
    }
    if (bh < G.H) {
      var deck = ctx.createLinearGradient(0, bh - 1, 0, G.H);
      deck.addColorStop(0, '#38373f');
      deck.addColorStop(1, '#1d1828');
      ctx.fillStyle = deck;
      ctx.fillRect(0, bh - 1, G.W, G.H - bh + 1);
    }
    // Calm the wall down a touch so white foam pops.
    var gr = ctx.createLinearGradient(0, 0, 0, G.groundY);
    gr.addColorStop(0, 'rgba(36,18,58,0.30)');
    gr.addColorStop(0.7, 'rgba(36,18,58,0.10)');
    gr.addColorStop(1, 'rgba(36,18,58,0.0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, G.W, G.groundY);
  }

  function drawShadow(ctx, x, y, w) {
    var lift = Math.max(0, y);
    var a = 0.32 * Math.max(0, 1 - lift / 4);
    if (a <= 0.01) return;
    var sp = w2s(x, 0);
    var rw = (w * 0.55 + lift * 0.12) * G.s, rh = Math.max(3, 0.13 * G.s);
    var g = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], rw);
    g.addColorStop(0, 'rgba(20,10,30,' + a + ')');
    g.addColorStop(1, 'rgba(20,10,30,0)');
    ctx.save();
    ctx.translate(sp[0], sp[1]); ctx.scale(1, rh / rw); ctx.translate(-sp[0], -sp[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], rw, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBand(ctx, ax, ay, bx, by, stretch) {
    var a = w2s(ax, ay), b = w2s(bx, by);
    var wpx = Math.max(2.5, (0.12 - 0.05 * stretch) * G.s);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5a3a1f';
    ctx.lineWidth = wpx + 2.5;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = '#d8a46a';
    ctx.lineWidth = wpx;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,190,0.6)';
    ctx.lineWidth = Math.max(1, wpx * 0.3);
    ctx.beginPath(); ctx.moveTo(a[0], a[1] - wpx * 0.2); ctx.lineTo(b[0], b[1] - wpx * 0.2); ctx.stroke();
  }

  function pouchGeom() {
    var r = BALLS[G.sim.loaded].r;
    var px = G.pouch.x, py = G.pouch.y;
    if (G.aim) { px = REST.x + G.aim.pull.x; py = REST.y + G.aim.pull.y; }
    var mx = (ANCHORS[0].x + ANCHORS[1].x) / 2, my = (ANCHORS[0].y + ANCHORS[1].y) / 2;
    var dx = px - mx, dy = py - my, len = Math.hypot(dx, dy);
    var ux = len > 0.05 ? dx / len : -1, uy = len > 0.05 ? dy / len : 0;
    var stretch = Math.min(1, Math.hypot(px - REST.x, py - REST.y) / PHYS.maxPull);
    return { x: px, y: py, ux: ux, uy: uy, r: r, back: { x: px + ux * r * 0.85, y: py + uy * r * 0.85 }, stretch: stretch };
  }

  function drawPouch(ctx, pg) {
    var c = w2s(pg.back.x, pg.back.y);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(-Math.atan2(pg.uy, pg.ux));
    var w = pg.r * 0.55 * G.s, h = pg.r * 1.75 * G.s;
    ctx.fillStyle = '#1b1820';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.ellipse(-w * 0.2, -h * 0.15, w * 0.35, h * 0.25, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBall(ctx, type, x, y, angle, squash) {
    var B = BALLS[type];
    var c = w2s(x, y);
    var d = B.r * 2 * 1.07 * G.s;
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(-angle);
    if (squash) ctx.scale(1 + squash, 1 - squash);
    drawFrame(ctx, B.sprite, -d / 2, -d / 2, d, d);
    ctx.restore();
  }

  function drawBlock(ctx, b, d) {
    var p = b.getPosition(), a = b.getAngle();
    var c = w2s(p.x, p.y);
    var s = G.s;
    if (d._shownHp === undefined) d._shownHp = d.hp;
    if (d.hp < d._shownHp - 0.05) { d._flash = 0.14; d._shownHp = d.hp; }
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(-a);
    if (d._flash > 0) { var j = d._flash * 0.25 * s; ctx.translate((Math.random() - 0.5) * j, (Math.random() - 0.5) * j); }
    ctx.scale(s, s);
    // shape
    if (d.shape === 'disc') { ctx.beginPath(); ctx.arc(0, 0, d.r, 0, TAU); }
    else roundRect(ctx, -d.w / 2, -d.h / 2, d.w, d.h, 0.07);
    ctx.fillStyle = G.patterns[d.mat] || '#eee';
    ctx.fill();
    // world-fixed lighting (light from top-left)
    var lx = 0.45, ly = 1;
    var ca = Math.cos(a), sa = Math.sin(a);
    var dx = lx * ca - ly * sa, dy = lx * sa + ly * ca;
    var ext = Math.max(d.w, d.h) / 2;
    var g = ctx.createLinearGradient(-dx * ext, -dy * ext, dx * ext, dy * ext);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(70,40,100,0.30)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (d.mat === 'taped') drawTape(ctx, d);
    drawCracks(ctx, d);
    if (d._flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (d._flash * 4) + ')'; ctx.fillRect(-ext - 1, -ext - 1, ext * 2 + 2, ext * 2 + 2); }
    ctx.restore();
    ctx.lineWidth = lineW(1.6);
    ctx.strokeStyle = OUTLINE;
    if (d.shape === 'disc') {
      ctx.stroke();
      // disc face ring so it reads as a cylinder end
      ctx.beginPath(); ctx.arc(0, 0, d.r * 0.68, 0, TAU);
      ctx.strokeStyle = 'rgba(120,100,150,0.35)'; ctx.lineWidth = lineW(1.2); ctx.stroke();
    } else {
      ctx.stroke();
    }
    ctx.restore();
    if (d._flash > 0) d._flash -= 1 / 60;
  }

  function drawTape(ctx, d) {
    var long = d.w >= d.h;
    var L = long ? d.w : d.h, T = long ? d.h : d.w;
    var bands = L > 2.5 ? [-0.3, 0.3] : [0];
    ctx.save();
    if (!long) ctx.rotate(Math.PI / 2);
    for (var i = 0; i < bands.length; i++) {
      var x = bands[i] * L, bw = Math.min(0.32, L * 0.22);
      var g = ctx.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
      g.addColorStop(0, '#8b93a3'); g.addColorStop(0.35, '#e9edf3'); g.addColorStop(0.6, '#b9c0cc'); g.addColorStop(1, '#7c8494');
      ctx.fillStyle = g;
      ctx.fillRect(x - bw / 2, -T / 2 - 0.05, bw, T + 0.1);
      ctx.strokeStyle = 'rgba(60,60,80,0.35)';
      ctx.lineWidth = 0.012;
      for (var k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - bw / 2, -T / 2 + T * k / 4); ctx.lineTo(x + bw / 2, -T / 2 + T * k / 4 + 0.02); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawCracks(ctx, d) {
    var frac = d.hp / d.maxHp;
    if (frac > 0.75) return;
    var count = frac > 0.5 ? 2 : frac > 0.25 ? 3 : 4;
    ctx.lineJoin = 'round';
    for (var i = 0; i < count; i++) {
      var pts = d.cracks[i];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], -pts[0][1]);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], -pts[j][1]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = lineW(2.6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(58,40,82,0.85)';
      ctx.lineWidth = lineW(1.3) * (frac > 0.25 ? 1 : 1.6);
      ctx.stroke();
    }
  }

  function pupKey(d) {
    if (d.helmet) return d.pup + '_helmet';
    if (d.hurtT > 0) return d.pup + '_hurt';
    return d.pup + '_angry';
  }

  function drawPup(ctx, b, d) {
    var p = b.getPosition(), a = b.getAngle();
    var c = w2s(p.x, p.y);
    var key = pupKey(d);
    var f = ATLAS.frames[key];
    var sw = f.w / PUP_PX_PER_M, sh = f.h / PUP_PX_PER_M;
    var s = G.s;
    var breathe = 1 + 0.028 * Math.sin(G.t * 3.1 + d.id * 1.7);
    ctx.save();
    ctx.translate(c[0], c[1]);
    ctx.rotate(-a);
    ctx.scale(s, s);
    if (d.hurtT > 0) ctx.translate(Math.sin(G.t * 70) * 0.025, 0);
    ctx.translate(0, d.h / 2 + 0.03);
    ctx.scale(1 / Math.sqrt(breathe), breathe);
    drawFrame(ctx, key, -sw / 2, -sh, sw, sh);
    ctx.restore();
  }

  function drawStar(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var rr = i % 2 ? r * 0.45 : r, an = i * Math.PI / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
    }
    ctx.closePath();
  }

  function drawParticles(ctx) {
    var s = G.s;
    for (var i = 0; i < G.particles.length; i++) {
      var p = G.particles[i];
      var c = w2s(p.x, p.y);
      var life = p.t / p.life;
      var fade = life > 0.7 ? 1 - (life - 0.7) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(c[0], c[1]);
      switch (p.kind) {
        case 'crumb':
          ctx.rotate(p.rot);
          var z = p.size * s;
          roundRect(ctx, -z / 2, -z / 2, z, z * 0.8, z * 0.3);
          ctx.fillStyle = p.mat === 'dense' ? '#c3c8d4' : '#f7f3f8';
          ctx.fill();
          ctx.lineWidth = 1.2; ctx.strokeStyle = OUTLINE; ctx.stroke();
          break;
        case 'dust':
          var r = p.size * s * (0.6 + life * 0.9);
          ctx.globalAlpha = 0.55 * (1 - life);
          ctx.fillStyle = '#fff4fb';
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
          break;
        case 'ring':
          ctx.globalAlpha = 0.8 * (1 - life);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1.5, 0.08 * s * (1 - life));
          ctx.beginPath(); ctx.arc(0, 0, (p.size + p.grow * life) * s, 0, TAU); ctx.stroke();
          break;
        case 'star':
          ctx.rotate(p.rot);
          drawStar(ctx, p.size * s);
          ctx.fillStyle = '#ffd23f'; ctx.fill();
          ctx.lineWidth = 1.2; ctx.strokeStyle = '#7a4a00'; ctx.stroke();
          break;
        case 'text':
          var pop = life < 0.15 ? 0.6 + life / 0.15 * 0.55 : life < 0.25 ? 1.15 - (life - 0.15) * 1.5 : 1;
          var fs = Math.max(12, p.size * s) * pop;
          ctx.font = fs + 'px "Lilita One", system-ui, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(3, fs * 0.22);
          ctx.strokeStyle = p.stroke; ctx.strokeText(p.text, 0, 0);
          ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
          break;
        case 'ko': {
          var f = ATLAS.frames[p.pup + '_ko'];
          var sw = f.w / PUP_PX_PER_M * s, sh = f.h / PUP_PX_PER_M * s;
          var rise = Math.sin(Math.min(1, life * 1.4) * Math.PI / 2) * 0.8 * s;
          var sc = life < 0.12 ? 0.7 + life / 0.12 * 0.4 : 1.1 - Math.min(0.1, (life - 0.12));
          ctx.translate(0, -rise);
          ctx.rotate(-p.angle * (1 - life) + Math.sin(G.t * 8) * 0.06);
          ctx.scale(sc, sc);
          drawFrame(ctx, p.pup + '_ko', -sw / 2, -sh, sw, sh);
          break;
        }
        case 'helmet': {
          ctx.rotate(p.rot);
          var hw = p.size * s * 0.5;
          var hg = ctx.createLinearGradient(-hw, -hw * 0.6, hw, hw * 0.4);
          hg.addColorStop(0, '#f4f6fa'); hg.addColorStop(0.5, '#a9b0bd'); hg.addColorStop(1, '#6e7686');
          ctx.fillStyle = hg;
          ctx.beginPath();
          for (var k = 0; k <= 20; k++) {
            var an = Math.PI + k / 20 * Math.PI;
            var rr = hw * (k % 2 ? 0.92 : 1);
            ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr * 0.75);
          }
          ctx.closePath(); ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
  }

  function drawPreview(ctx) {
    var sim = G.sim;
    // Trail of the current shot (bright) or the last one (faint, to aim against).
    var tr = G.trail;
    var old = sim.state === 'ready';
    ctx.fillStyle = old ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.75)';
    for (var i = 0; i < tr.length; i += 1) {
      var c = w2s(tr[i].x, tr[i].y);
      var r = Math.max(1.5, (i % 3 === 0 ? 0.09 : 0.055) * G.s);
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, TAU); ctx.fill();
    }
    if (!G.aim || G.aim.pull.len < PHYS.minPull) return;
    var pts = Sim.predict(sim.loaded, G.aim.pull, 1.6, 4);
    var dist = 0, maxD = 9.5;
    for (var j = 0; j < pts.length; j++) {
      if (j > 0) dist += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
      if (dist > maxD) break;
      var a = 1 - dist / maxD;
      var cc = w2s(pts[j].x, pts[j].y);
      var rad = Math.max(2, (0.11 - 0.05 * (dist / maxD)) * G.s);
      ctx.fillStyle = 'rgba(42,33,64,' + (0.55 * a) + ')';
      ctx.beginPath(); ctx.arc(cc[0], cc[1], rad + 1.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * a) + ')';
      ctx.beginPath(); ctx.arc(cc[0], cc[1], rad, 0, TAU); ctx.fill();
    }
  }

  function drawForceGauge(ctx) {
    if (!G.aim || G.aim.pull.len < 0.05) return;
    var li = Sim.launchInfo(G.sim.loaded, G.aim.pull.len);
    var frac = li.x / PHYS.maxPull;
    var c = w2s((ANCHORS[0].x + ANCHORS[1].x) / 2, ANCHORS[0].y + 0.75);
    var w = 164, h = 46;
    var x = Math.round(c[0] - w / 2), y = Math.round(c[1] - h);
    x = Math.max(8, Math.min(G.W - w - 8, x));
    if (y < 64) y = 64;
    ctx.save();
    ctx.fillStyle = 'rgba(28,16,48,0.82)';
    roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '17px "Lilita One", system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Push:', x + 10, y + 15);
    ctx.textAlign = 'right';
    ctx.fillStyle = frac > 0.9 ? '#ffd23f' : '#ffc6ec';
    ctx.fillText(G.word(frac, G.WORDS.push), x + w - 10, y + 15);
    // meter in the slingshot's own pink/purple
    var bx = x + 10, by = y + 28, bw = w - 20, bh = 8;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
    var g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#7b2fd0'); g.addColorStop(1, '#ff2e93');
    ctx.fillStyle = g;
    roundRect(ctx, bx, by, Math.max(8, bw * frac), bh, 4); ctx.fill();
    ctx.restore();
  }

  function drawHint(ctx) {
    if (!G.showHint || !G.inputEnabled || G.sim.state !== 'ready' || G.aim) return;
    var t = (G.t % 2.2) / 2.2;
    var e = t < 0.6 ? t / 0.6 : 1;
    e = 1 - Math.pow(1 - e, 3);
    var dx = -1.5 * e, dy = -0.7 * e;
    var c0 = w2s(REST.x, REST.y), c1 = w2s(REST.x + dx, REST.y + dy);
    ctx.save();
    ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c1[0], c1[1]); ctx.stroke();
    ctx.setLineDash([]);
    // fingertip
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c1[0], c1[1], 14, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff2e93';
    ctx.beginPath(); ctx.arc(c1[0], c1[1], 6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.font = '18px "Lilita One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5; ctx.strokeStyle = '#2a2140';
    var tx = Math.max(90, c0[0]), ty = Math.max(90, c0[1] - 1.2 * G.s - 30);
    ctx.strokeText('Pull back & let go!', tx, ty);
    ctx.fillStyle = '#fff'; ctx.fillText('Pull back & let go!', tx, ty);
    ctx.restore();
  }

  function drawOffscreen(ctx) {
    var b = G.sim.ball;
    if (!b) return;
    var p = b.getPosition();
    var c = w2s(p.x, p.y);
    if (c[1] > 0 && c[0] < G.W) return;
    var x = Math.min(G.W - 24, Math.max(24, c[0]));
    var y = Math.max(70, Math.min(G.groundY - 20, c[1]));
    ctx.save();
    ctx.fillStyle = 'rgba(28,16,48,0.8)';
    ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px "Lilita One", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c[1] <= 0 ? '↑' + Math.round(p.y) + 'm' : '→', x, y);
    ctx.restore();
  }

  function render() {
    var ctx = G.ctx, sim = G.sim;
    G.shakeX = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    G.shakeY = G.shake ? (Math.random() - 0.5) * G.shake : 0;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = 'high';
    drawBackground(ctx);

    // contact shadows
    sim.forEachBody(function (b, d) {
      var p = b.getPosition();
      drawShadow(ctx, p.x, p.y - (d.h || (d.r || 0.4) * 2) / 2, d.w || d.r * 2);
    });
    drawShadow(ctx, SLING.left + SLING.width / 2, 0, SLING.width * 0.95);

    // slingshot body + back band + pouch
    var s0 = w2s(SLING.left, SLING.height);
    drawFrame(ctx, 'sling', s0[0], s0[1], SLING.width * G.s, SLING.height * G.s);
    var pg = pouchGeom();
    var showLoaded = sim.state === 'ready' && G.readyDelay <= 0.15;
    drawBand(ctx, ANCHORS[0].x, ANCHORS[0].y, pg.back.x, pg.back.y, pg.stretch);
    drawPouch(ctx, pg);

    drawPreview(ctx);

    // bodies
    sim.forEachBody(function (b, d) {
      if (d.kind === 'block') drawBlock(ctx, b, d);
    });
    sim.forEachBody(function (b, d) {
      if (d.kind === 'pup') drawPup(ctx, b, d);
    });
    sim.forEachBody(function (b, d) {
      if (d.kind === 'ball') {
        var p = b.getPosition(), v = b.getLinearVelocity();
        var sq = sim.state === 'band' ? Math.min(0.12, Math.hypot(v.x, v.y) * 0.006) : 0;
        drawBall(ctx, d.ball, p.x, p.y, b.getAngle(), sq);
      }
    });
    if (showLoaded) {
      var wob = G.aim ? 0 : Math.sin(G.t * 4) * 0.015;
      drawBall(ctx, sim.loaded, pg.x, pg.y + wob, G.aim ? -G.aim.pull.x * 0.08 : 0, 0);
    }
    drawBand(ctx, ANCHORS[1].x, ANCHORS[1].y, pg.back.x, pg.back.y, pg.stretch);

    drawParticles(ctx);
    drawForceGauge(ctx);
    drawHint(ctx);
    drawOffscreen(ctx);
  }

  root.AP.Game = G;
  root.AP.SLING = SLING;
})(window);
