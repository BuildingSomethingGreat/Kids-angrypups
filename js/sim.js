/*
 * Angry Pups — physics simulation.
 *
 * Pure game logic on top of planck.js (a Box2D port). No DOM access, so the
 * exact same code runs in the browser and in the Node test harness
 * (tools/simtest.js) that checks every level is stable and winnable.
 *
 * Units are SI: metres, kilograms, seconds, newtons. y points up, the
 * tabletop is y = 0.
 *
 * The science the game is built on:
 *   - Slingshot = spring.  Hooke's law  F = k·x  (x = how far you pull back).
 *     The band really pushes the ball every physics step until it passes the
 *     rest point, so launch speed comes out of the simulation, not a formula.
 *   - Stored energy ½kx² becomes kinetic energy ½mv², so v ≈ x·√(k/m):
 *     heavier balls launch slower but carry more momentum p = m·v.
 *   - Damage = impulse (force × time) delivered in a collision, read straight
 *     from the physics solver. Tough foam needs several big impulses.
 */
(function (root) {
  'use strict';

  var pl = root.planck;
  var Vec2 = pl.Vec2;

  var PHYS = {
    g: 9.8, // m/s²
    k: 100, // slingshot band stiffness, N/m
    maxPull: 2.0, // m
    minPull: 0.3, // m — smaller pulls are treated as "cancel"
    dt: 1 / 120, // fixed physics step, s
    velIters: 10,
    posIters: 8,
    impactSpeed: 0.9, // m/s closing speed before a touch counts as an impact
    damageFloor: 1.0, // N·s of every impact the foam soaks up harmlessly
    settleSeconds: 1.6, // quiet pre-roll so towers settle before play
  };

  // Rest point of the pouch, between the two dowel tops (see game.js SLING).
  var SLING_REST = { x: 4.61, y: 1.8 };

  var BALLS = {
    s: { key: 's', name: 'Zip', label: 'Small', weight: 'light', r: 0.3, m: 0.5, restitution: 0.38, sprite: 'ball_s' },
    m: { key: 'm', name: 'Bop', label: 'Medium', weight: 'medium', r: 0.45, m: 1.0, restitution: 0.33, sprite: 'ball_m' },
    l: { key: 'l', name: 'Chonk', label: 'Large', weight: 'heavy', r: 0.62, m: 2.0, restitution: 0.28, sprite: 'ball_l' },
  };

  var MATS = {
    foam: { density: 0.8, friction: 0.75, restitution: 0.08, hpBase: 4, hpArea: 4, breakScore: 500, label: 'Foam' },
    dense: { density: 1.4, friction: 0.8, restitution: 0.05, hpBase: 8, hpArea: 8, breakScore: 1000, label: 'Dense foam' },
    taped: { density: 1.0, friction: 0.8, restitution: 0.05, hpBase: 13, hpArea: 12, breakScore: 1500, label: 'Taped foam' },
  };

  // Physics bodies for the pups (sprites are drawn a little larger, see game.js).
  var PUPS = {
    biscuit: { name: 'Biscuit', w: 0.84, h: 1.06, mass: 0.8 },
    marsh: { name: 'Marshmallow', w: 0.88, h: 1.1, mass: 0.8 },
  };
  var PUP_HP = 5;
  var HELMET_HP = 14;

  var SCORE = { damage: 10, pup: 5000, helmetPup: 8000, ballLeft: 10000 };

  function chamferBox(w, h, c) {
    var x = w / 2, y = h / 2;
    return [
      Vec2(-x + c, -y), Vec2(x - c, -y), Vec2(x, -y + c), Vec2(x, y - c),
      Vec2(x - c, y), Vec2(-x + c, y), Vec2(-x, y - c), Vec2(-x, -y + c),
    ];
  }

  // Deterministic random so crack patterns match between runs.
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return (s >>> 0) / 4294967296;
    };
  }

  function makeCracks(w, h, seed) {
    var r = rng(seed);
    var out = [];
    for (var n = 0; n < 4; n++) {
      // Start on an edge, wander inward.
      var side = Math.floor(r() * 4);
      var x = (r() - 0.5) * w, y = (r() - 0.5) * h;
      if (side === 0) x = -w / 2; else if (side === 1) x = w / 2; else if (side === 2) y = -h / 2; else y = h / 2;
      var pts = [[x, y]];
      var ang = Math.atan2(-y, -x) + (r() - 0.5) * 1.2;
      var len = Math.min(w, h) * (0.35 + r() * 0.45) + Math.max(w, h) * 0.15;
      var segs = 3 + Math.floor(r() * 3);
      for (var i = 0; i < segs; i++) {
        ang += (r() - 0.5) * 1.1;
        x += Math.cos(ang) * len / segs;
        y += Math.sin(ang) * len / segs;
        x = Math.max(-w / 2, Math.min(w / 2, x));
        y = Math.max(-h / 2, Math.min(h / 2, y));
        pts.push([x, y]);
      }
      out.push(pts);
    }
    return out;
  }

  function Sim(level, opts) {
    opts = opts || {};
    this.level = level;
    this.world = new pl.World({ gravity: Vec2(0, -PHYS.g) });
    this.events = [];
    this.time = 0;
    this.score = 0;
    this.state = 'settling';
    this.damageEnabled = false;
    this.ammo = {};
    var self = this;
    level.balls.forEach(function (k) { self.ammo[k] = (self.ammo[k] || 0) + 1; });
    this.loaded = level.balls[0];
    this.ball = null; // active projectile body
    this.spent = []; // projectiles from earlier turns
    this.flightTime = 0;
    this.slowTime = 0;
    this.settleTime = 0;
    this.winTimer = 0;
    this.nextId = 1;
    this.pendingDamage = [];
    this.stats = {
      shots: 0, maxForce: 0, maxSpeed: 0, maxMomentum: 0, maxImpulse: 0,
      pupsKO: 0, blocksBroken: 0, launches: [],
    };
    this.shotImpulse = 0;

    // Ground: the foam-board tabletop.
    var ground = this.world.createBody({ type: 'static' });
    ground.createFixture(pl.Edge(Vec2(-40, 0), Vec2(160, 0)), { friction: 0.9, restitution: 0.05 });
    ground.setUserData({ kind: 'ground', id: 0 });
    this.ground = ground;

    level.objects.forEach(function (o, i) { self.addObject(o, i); });
    // A ball this far past the last object can't hit anything any more.
    this.maxX = Math.max.apply(null, level.objects.map(function (o) { return o.x + (o.w || (o.r || 0.5) * 2); })) + 9;

    this.world.on('pre-solve', function (contact) { self._preSolve(contact); });
    this.world.on('post-solve', function (contact, impulse) { self._postSolve(contact, impulse); });

    // Let the structures settle with damage switched off.
    if (!opts.noSettle) {
      var steps = Math.round(PHYS.settleSeconds / PHYS.dt);
      for (var s = 0; s < steps; s++) this.world.step(PHYS.dt, PHYS.velIters, PHYS.posIters);
    }
    this.events.length = 0;
    this.damageEnabled = true;
    this.state = 'ready';
  }

  Sim.prototype.addObject = function (o, index) {
    var w = this.world;
    var data, body;
    if (o.t === 'box') {
      var mat = MATS[o.mat || 'foam'];
      var y = o.b !== undefined ? o.b + o.h / 2 : o.y;
      body = w.createBody({ type: 'dynamic', position: Vec2(o.x, y), angle: o.a || 0 });
      body.createFixture(pl.Polygon(chamferBox(o.w, o.h, Math.min(0.05, o.w * 0.12, o.h * 0.12))), {
        density: mat.density, friction: mat.friction, restitution: mat.restitution,
      });
      var hp = mat.hpBase + mat.hpArea * o.w * o.h;
      data = { kind: 'block', shape: 'box', w: o.w, h: o.h, mat: o.mat || 'foam', hp: hp, maxHp: hp, cracks: makeCracks(o.w, o.h, index * 7919 + 13) };
    } else if (o.t === 'disc') {
      var dm = MATS[o.mat || 'foam'];
      var dy = o.b !== undefined ? o.b + o.r : o.y;
      body = w.createBody({ type: 'dynamic', position: Vec2(o.x, dy) });
      body.createFixture(pl.Circle(o.r), { density: dm.density, friction: dm.friction, restitution: dm.restitution });
      body.setAngularDamping(1.2);
      var dhp = dm.hpBase + dm.hpArea * Math.PI * o.r * o.r;
      data = { kind: 'block', shape: 'disc', r: o.r, w: o.r * 2, h: o.r * 2, mat: o.mat || 'foam', hp: dhp, maxHp: dhp, cracks: makeCracks(o.r * 1.6, o.r * 1.6, index * 7919 + 29) };
    } else if (o.t === 'pup') {
      var P = PUPS[o.kind];
      var py = o.b !== undefined ? o.b + P.h / 2 : o.y;
      body = w.createBody({ type: 'dynamic', position: Vec2(o.x, py), angle: o.a || 0 });
      var area = P.w * P.h;
      body.createFixture(pl.Polygon(chamferBox(P.w, P.h, 0.16)), { density: P.mass / area, friction: 0.85, restitution: 0.1 });
      body.setAngularDamping(0.6);
      var php = o.helmet ? HELMET_HP : PUP_HP;
      data = { kind: 'pup', pup: o.kind, w: P.w, h: P.h, helmet: !!o.helmet, wasHelmet: !!o.helmet, hp: php, maxHp: php, hurtT: 0 };
    } else {
      return null;
    }
    data.id = this.nextId++;
    data.body = body;
    body.setUserData(data);
    return body;
  };

  Sim.prototype.forEachBody = function (fn) {
    for (var b = this.world.getBodyList(); b; b = b.getNext()) {
      var d = b.getUserData();
      if (d && d.kind !== 'ground') fn(b, d);
    }
  };

  Sim.prototype.pupsAlive = function () {
    var n = 0;
    this.forEachBody(function (b, d) { if (d.kind === 'pup' && !d.dead) n++; });
    return n;
  };

  Sim.prototype.ammoLeft = function () {
    var n = 0;
    for (var k in this.ammo) n += this.ammo[k];
    return n;
  };

  Sim.prototype.select = function (type) {
    if (this.state !== 'ready' || !this.ammo[type]) return false;
    this.loaded = type;
    return true;
  };

  // ---- Slingshot maths (shared with the trajectory preview and the HUD)
  Sim.clampPull = function (px, py, ballR) {
    var len = Math.hypot(px, py);
    if (len > PHYS.maxPull) { px *= PHYS.maxPull / len; py *= PHYS.maxPull / len; }
    // Keep the ball above the tabletop.
    var minY = ballR + 0.05 - SLING_REST.y;
    if (py < minY) py = minY;
    return { x: px, y: py, len: Math.hypot(px, py) };
  };

  Sim.launchInfo = function (type, pullLen) {
    var B = BALLS[type];
    var F = PHYS.k * pullLen; // Hooke's law
    var v = pullLen * Math.sqrt(PHYS.k / B.m); // ½kx² = ½mv²
    return { m: B.m, x: pullLen, F: F, v: v, p: B.m * v, E: 0.5 * PHYS.k * pullLen * pullLen, a: F / B.m };
  };

  // Integrate the same way Box2D does (semi-implicit Euler) so the dotted
  // preview matches the real flight until something is hit.
  Sim.predict = function (type, pull, seconds, everyN) {
    var B = BALLS[type];
    var dt = PHYS.dt, n = Math.round(seconds / dt);
    var x = SLING_REST.x + pull.x, y = SLING_REST.y + pull.y, vx = 0, vy = 0;
    var dirx = -pull.x, diry = -pull.y;
    var band = true;
    var pts = [];
    for (var i = 0; i < n; i++) {
      var ax = 0, ay = -PHYS.g;
      if (band) {
        ax += PHYS.k * (SLING_REST.x - x) / B.m;
        ay += PHYS.k * (SLING_REST.y - y) / B.m;
      }
      vx += ax * dt; vy += ay * dt;
      x += vx * dt; y += vy * dt;
      if (band && ((x - SLING_REST.x) * dirx + (y - SLING_REST.y) * diry) >= 0) band = false;
      if (!band && i % (everyN || 6) === 0) pts.push({ x: x, y: y });
      if (y < B.r) break;
    }
    return pts;
  };

  Sim.prototype.fire = function (pull) {
    if (this.state !== 'ready' || !this.ammo[this.loaded]) return false;
    var B = BALLS[this.loaded];
    var p = Sim.clampPull(pull.x, pull.y, B.r);
    if (p.len < PHYS.minPull) return false;
    var body = this.world.createBody({
      type: 'dynamic', bullet: true,
      position: Vec2(SLING_REST.x + p.x, SLING_REST.y + p.y),
    });
    body.createFixture(pl.Circle(B.r), { density: B.m / (Math.PI * B.r * B.r), friction: 0.6, restitution: B.restitution });
    body.setAngularDamping(0.4);
    body.setUserData({ kind: 'ball', ball: this.loaded, r: B.r, id: this.nextId++, body: body });
    this.ammo[this.loaded]--;
    this.ball = body;
    this.bandDir = { x: -p.x, y: -p.y };
    this.state = 'band';
    this.flightTime = 0;
    this.slowTime = 0;
    this.shotImpulse = 0;
    var info = Sim.launchInfo(this.loaded, p.len);
    this.stats.shots++;
    this.stats.maxForce = Math.max(this.stats.maxForce, info.F);
    this.currentShot = { type: this.loaded, m: B.m, x: p.len, F: info.F, vPredicted: info.v, v: 0, p: 0, impulse: 0 };
    this.stats.launches.push(this.currentShot);
    this.events.push({ type: 'release', x: body.getPosition().x, y: body.getPosition().y, F: info.F, ball: this.loaded });
    return true;
  };

  Sim.prototype._preSolve = function (contact) {
    if (!this.damageEnabled) { contact.__ap = 0; return; }
    var wm = contact.getWorldManifold(null);
    if (!wm || !wm.pointCount) { contact.__ap = 0; return; }
    var a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody();
    var p = wm.points[0];
    var va = a.getLinearVelocityFromWorldPoint(p);
    var vb = b.getLinearVelocityFromWorldPoint(p);
    var n = wm.normal;
    contact.__ap = -((vb.x - va.x) * n.x + (vb.y - va.y) * n.y);
    contact.__px = p.x; contact.__py = p.y;
  };

  Sim.prototype._postSolve = function (contact, impulse) {
    if (!this.damageEnabled || !(contact.__ap > PHYS.impactSpeed)) return;
    var imp = 0;
    for (var i = 0; i < impulse.normalImpulses.length; i++) imp += impulse.normalImpulses[i];
    if (imp < 0.35) return;
    var da = contact.getFixtureA().getBody().getUserData();
    var db = contact.getFixtureB().getBody().getUserData();
    this.pendingDamage.push({ a: da, b: db, imp: imp, x: contact.__px, y: contact.__py, speed: contact.__ap });
    contact.__ap = 0; // one impact per collision
  };

  Sim.prototype._damage = function (d, amount, x, y) {
    if (!d || d.dead || d.hp === undefined || amount <= 0) return;
    d.hp -= amount;
    var pts = Math.round(amount * SCORE.damage);
    this.score += pts;
    if (d.kind === 'pup') {
      d.hurtT = 1.1;
      if (d.helmet && d.hp <= d.maxHp / 2) {
        d.helmet = false;
        var hp0 = d.body.getPosition();
        this.events.push({ type: 'helmetPop', x: hp0.x, y: hp0.y + d.h / 2, pup: d.pup });
      }
      if (d.hp > 0) this.events.push({ type: 'pupHurt', x: x, y: y, pup: d.pup, amount: amount });
    }
    if (d.hp <= 0) this.kill(d);
  };

  Sim.prototype.kill = function (d) {
    if (d.dead) return;
    d.dead = true;
    var b = d.body, pos = b.getPosition();
    var ev = { x: pos.x, y: pos.y, angle: b.getAngle(), w: d.w, h: d.h, vx: b.getLinearVelocity().x, vy: b.getLinearVelocity().y };
    if (d.kind === 'pup') {
      var pts = d.wasHelmet ? SCORE.helmetPup : SCORE.pup;
      this.score += pts;
      this.stats.pupsKO++;
      ev.type = 'pupKO'; ev.pup = d.pup; ev.points = pts;
    } else {
      var mat = MATS[d.mat];
      this.score += mat.breakScore;
      this.stats.blocksBroken++;
      ev.type = 'break'; ev.mat = d.mat; ev.shape = d.shape; ev.r = d.r; ev.points = mat.breakScore;
    }
    this.events.push(ev);
    this.toDestroy = this.toDestroy || [];
    this.toDestroy.push(b);
  };

  Sim.prototype._applyDamage = function () {
    var list = this.pendingDamage;
    this.pendingDamage = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var dmg = e.imp - PHYS.damageFloor;
      var involvesBall = (e.a && e.a.kind === 'ball') || (e.b && e.b.kind === 'ball');
      var bd = this.ball && this.ball.getUserData();
      if (bd && this.currentShot && (e.a === bd || e.b === bd)) {
        this.currentShot.impulse = Math.max(this.currentShot.impulse, e.imp);
      }
      this.stats.maxImpulse = Math.max(this.stats.maxImpulse, e.imp);
      this.events.push({ type: 'impact', x: e.x, y: e.y, imp: e.imp, speed: e.speed, ball: involvesBall, kinds: [e.a && e.a.kind, e.b && e.b.kind] });
      if (dmg > 0) {
        this._damage(e.a, dmg, e.x, e.y);
        this._damage(e.b, dmg, e.x, e.y);
      }
    }
  };

  Sim.prototype._destroyQueued = function () {
    if (!this.toDestroy) return;
    for (var i = 0; i < this.toDestroy.length; i++) this.world.destroyBody(this.toDestroy[i]);
    this.toDestroy.length = 0;
  };

  Sim.prototype.isSettled = function (limit) {
    var settled = true;
    this.forEachBody(function (b) {
      if (!settled || !b.isAwake()) return;
      var v = b.getLinearVelocity();
      if (Math.hypot(v.x, v.y) > limit || Math.abs(b.getAngularVelocity()) > limit * 2) settled = false;
    });
    return settled;
  };

  // Advance exactly one fixed physics step.
  Sim.prototype.step = function () {
    var dt = PHYS.dt;
    this.time += dt;
    var ball = this.ball;

    if (this.state === 'band' && ball) {
      var pos = ball.getPosition();
      var m = BALLS[this.loaded].m;
      ball.applyForceToCenter(Vec2(PHYS.k * (SLING_REST.x - pos.x), PHYS.k * (SLING_REST.y - pos.y)), true);
      void m;
    }

    this.world.step(dt, PHYS.velIters, PHYS.posIters);
    this._applyDamage();
    this._destroyQueued();

    // Remove anything that fell off the world.
    var self = this;
    this.forEachBody(function (b, d) {
      var p = b.getPosition();
      if (p.y < -8 || p.x > 120 || p.x < -30) {
        if (d.kind === 'ball') return; // handled below
        if (!d.dead) self.kill(d);
      }
      if (d.kind === 'pup' && d.hurtT > 0) d.hurtT -= dt;
    });
    this._destroyQueued();

    if (this.state === 'band' && ball) {
      var bp = ball.getPosition();
      if ((bp.x - SLING_REST.x) * this.bandDir.x + (bp.y - SLING_REST.y) * this.bandDir.y >= 0) {
        var v = ball.getLinearVelocity();
        var speed = Math.hypot(v.x, v.y);
        var B = BALLS[this.loaded];
        this.currentShot.v = speed;
        this.currentShot.p = speed * B.m;
        this.stats.maxSpeed = Math.max(this.stats.maxSpeed, speed);
        this.stats.maxMomentum = Math.max(this.stats.maxMomentum, speed * B.m);
        this.state = 'flight';
        this.events.push({ type: 'launch', x: bp.x, y: bp.y, v: speed, p: speed * B.m, ball: this.loaded });
      }
    }

    if (this.state === 'flight' && ball) {
      this.flightTime += dt;
      var lv = ball.getLinearVelocity();
      var sp = Math.hypot(lv.x, lv.y);
      this.slowTime = sp < 0.35 ? this.slowTime + dt : 0;
      var bpos = ball.getPosition();
      var gone = bpos.x > this.maxX || bpos.x < -20 || bpos.y < -6;
      if (this.slowTime > 0.9 || gone || this.flightTime > 9) {
        this.state = 'settle';
        this.settleTime = 0;
      }
    }

    if (this.state === 'settle') {
      this.settleTime += dt;
      if ((this.settleTime > 0.5 && this.isSettled(0.12)) || this.settleTime > 4) this._endTurn();
    }

    // Victory as soon as the last pup is down (after a short beat).
    if (this.state !== 'won' && this.state !== 'lost' && this.pupsAlive() === 0) {
      if (this.state !== 'winwait') { this.state = 'winwait'; this.winTimer = 0; }
      this.winTimer += dt;
      if (this.winTimer > 1.6) this._win();
    }
  };

  Sim.prototype._removeBall = function () {
    if (!this.ball) return;
    var p = this.ball.getPosition();
    this.events.push({ type: 'ballGone', x: p.x, y: p.y, ball: this.ball.getUserData().ball });
    this.world.destroyBody(this.ball);
    this.ball = null;
  };

  Sim.prototype._endTurn = function () {
    this._removeBall();
    if (this.pupsAlive() === 0) return this._win();
    if (this.ammoLeft() === 0) {
      this.state = 'lost';
      this.events.push({ type: 'lost' });
      return;
    }
    if (!this.ammo[this.loaded]) {
      for (var k in this.ammo) if (this.ammo[k]) { this.loaded = k; break; }
    }
    this.state = 'ready';
    this.events.push({ type: 'ready', ball: this.loaded });
  };

  Sim.prototype._win = function () {
    if (this.state === 'won') return;
    var left = this.ammoLeft();
    var bonus = left * SCORE.ballLeft;
    this.score += bonus;
    this.state = 'won';
    this.events.push({ type: 'won', ballsLeft: left, bonus: bonus });
  };

  Sim.prototype.drainEvents = function () {
    var e = this.events;
    this.events = [];
    return e;
  };

  root.AP = root.AP || {};
  root.AP.Sim = Sim;
  root.AP.PHYS = PHYS;
  root.AP.BALLS = BALLS;
  root.AP.MATS = MATS;
  root.AP.PUPS = PUPS;
  root.AP.SLING_REST = SLING_REST;
  root.AP.SCORE = SCORE;
})(typeof window !== 'undefined' ? window : globalThis);
