#!/usr/bin/env node
/*
 * Headless checks for every level, using the exact game physics:
 *   1. Stability: untouched, nothing breaks, no pup gets hurt, nothing drifts.
 *   2. Winnability: a greedy "player" searches shots turn by turn and must be
 *      able to clear the level with the balls provided.
 *
 *   node tools/simtest.js            # all levels
 *   node tools/simtest.js 3          # one level
 */
'use strict';
const path = require('path');
globalThis.planck = require(path.join(__dirname, '..', 'vendor', 'planck.min.js'));
require(path.join(__dirname, '..', 'js', 'sim.js'));
require(path.join(__dirname, '..', 'js', 'levels.js'));
const { Sim, LEVELS, PHYS } = globalThis.AP;

function runUntilTurnEnds(sim, maxSeconds) {
  const steps = Math.round((maxSeconds || 16) / PHYS.dt);
  for (let i = 0; i < steps; i++) {
    sim.step();
    if (sim.state === 'ready' || sim.state === 'won' || sim.state === 'lost') return;
  }
}

function play(level, shots) {
  const sim = new Sim(level);
  for (const s of shots) {
    if (sim.state !== 'ready') break;
    sim.select(s.type);
    if (!sim.fire(s.pull)) return { sim, invalid: true };
    runUntilTurnEnds(sim);
  }
  return { sim };
}

function stability(level) {
  const sim = new Sim(level);
  const start = new Map();
  sim.forEachBody((b, d) => start.set(d.id, { x: b.getPosition().x, y: b.getPosition().y }));
  let events = 0;
  for (let i = 0; i < 8 / PHYS.dt; i++) {
    sim.step();
    events += sim.drainEvents().filter((e) => e.type !== 'impact').length;
  }
  let drift = 0;
  sim.forEachBody((b, d) => {
    const s = start.get(d.id);
    if (s) drift = Math.max(drift, Math.hypot(b.getPosition().x - s.x, b.getPosition().y - s.y));
  });
  return { ok: events === 0 && drift < 0.05 && sim.pupsAlive() === level.objects.filter((o) => o.t === 'pup').length, events, drift };
}

function candidates(ammo, rand) {
  const out = [];
  const types = Object.keys(ammo).filter((k) => ammo[k] > 0);
  for (const type of types) {
    for (let i = 0; i < 26; i++) {
      // Angle of the launch direction: pull points the opposite way.
      const ang = (-10 + rand() * 80) * Math.PI / 180;
      const len = 0.6 + rand() * (PHYS.maxPull - 0.6);
      out.push({ type, pull: { x: -Math.cos(ang) * len, y: -Math.sin(ang) * len } });
    }
  }
  return out;
}

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function greedy(level, seed) {
  const rand = mulberry(seed);
  const chosen = [];
  let base = play(level, []).sim;
  let hits = 0, tries = 0;
  while (base.state === 'ready') {
    let best = null;
    for (const c of candidates(base.ammo, rand)) {
      const r = play(level, chosen.concat([c]));
      tries++;
      const s = r.sim;
      const ko = level.objects.filter((o) => o.t === 'pup').length - s.pupsAlive();
      if (ko > 0) hits++;
      const val = ko * 1e6 + s.score;
      if (!best || val > best.val) best = { val, c, s };
    }
    chosen.push(best.c);
    base = best.s;
  }
  return { chosen, won: base.state === 'won', score: base.score, shots: chosen.length, ballsLeft: base.ammoLeft(), stats: base.stats, hitRate: hits / tries };
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const only = args.find((a) => /^\d+$/.test(a)) ? Number(args.find((a) => /^\d+$/.test(a))) : null;
const seedArg = args.find((a) => a.startsWith('--seed='));
const seedOffset = seedArg ? Number(seedArg.slice(7)) : 0;
const solutions = {};
let failed = false;
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  const st = stability(level);
  const t0 = Date.now();
  const g = greedy(level, 1234 + level.id + seedOffset);
  const ms = Date.now() - t0;
  console.log(
    `L${level.id} ${level.name.padEnd(14)} stable=${st.ok} (drift ${st.drift.toFixed(3)}m, events ${st.events})  ` +
    `greedy: ${g.won ? 'WON' : 'lost'} score=${g.score} shots=${g.shots} left=${g.ballsLeft} ` +
    `stars=${g.won ? 1 + (g.score >= level.stars[0]) + (g.score >= level.stars[1]) : 0} ` +
    `pupHitRate=${(g.hitRate * 100).toFixed(0)}%  maxF=${g.stats.maxForce.toFixed(0)}N maxV=${g.stats.maxSpeed.toFixed(1)} ` +
    `maxJ=${g.stats.maxImpulse.toFixed(1)}Ns broken=${g.stats.blocksBroken} (${ms}ms)`
  );
  if (!st.ok || !g.won) failed = true;
  solutions[level.id] = g.chosen;
}
if (json) require('fs').writeFileSync('/tmp/solutions.json', JSON.stringify(solutions));
process.exit(failed ? 1 : 0);
