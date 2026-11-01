#!/usr/bin/env node
/*
 * Browser smoke test + screenshots on phone-sized screens.
 *   python3 -m http.server 8765 &   (from the repo root)
 *   node tools/smoke.js [outDir]
 */
'use strict';
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.argv[2] || '/tmp/shots';
fs.mkdirSync(OUT, { recursive: true });

async function drag(page, from, to, steps) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps);
    await page.waitForTimeout(16);
  }
}

async function run(name, viewport, opts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport, deviceScaleFactor: opts.dpr || 2, isMobile: !!opts.mobile, hasTouch: !!opts.mobile,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#loading.done', { timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}-1-title.png` });

  await page.click('#btn-play', { force: true });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-2-mission.png` });
  await page.click('[data-act="go"]', { force: true });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}-3-ready.png` });

  // Aim: grab the ball and pull back-left.
  const ball = await page.evaluate(() => {
    const G = window.AP.Game, r = window.AP.SLING_REST;
    return [(r.x - G.cam.x) * G.s + G.W / 2, G.groundY - r.y * G.s];
  });
  const pull = opts.pull || [-95, 40];
  await drag(page, ball, [ball[0] + pull[0], ball[1] + pull[1]], 12);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/${name}-4-aim.png` });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}-5-flight.png` });
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${OUT}/${name}-6-impact.png` });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/${name}-7-after.png` });
  const state = await page.evaluate(() => ({ state: window.AP.Game.sim.state, score: window.AP.Game.sim.score, pups: window.AP.Game.sim.pupsAlive(), s: window.AP.Game.s }));
  console.log(name, JSON.stringify(state));
  if (errors.length) console.log(name, 'ERRORS:\n  ' + errors.join('\n  '));
  await browser.close();
  return errors;
}

(async () => {
  let errs = [];
  errs = errs.concat(await run('phone-land', { width: 844, height: 390 }, { mobile: true, dpr: 3 }));
  errs = errs.concat(await run('phone-port', { width: 390, height: 844 }, { mobile: true, dpr: 3 }));
  errs = errs.concat(await run('desktop', { width: 1440, height: 900 }, { dpr: 1, pull: [-160, 70] }));
  process.exit(errs.length ? 1 : 0);
})();
