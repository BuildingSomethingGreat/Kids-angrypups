#!/usr/bin/env node
/*
 * Plays every level in a real browser through the touch/mouse input path,
 * using winning shots found by tools/simtest.js (--json writes them to
 * /tmp/solutions.json). Saves a screenshot of each Lab Report.
 *
 *   node tools/simtest.js --json && node tools/playtest.js [outDir]
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.argv[2] || '/tmp/playtest';
const solutions = JSON.parse(fs.readFileSync('/tmp/solutions.json', 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  let results = [];

  for (const id of Object.keys(solutions)) {
    await page.goto(BASE + '#level=' + id);
    await page.reload();
    await page.waitForSelector('#loading.done');
    await page.waitForSelector('[data-act="go"]', { timeout: 8000 });
    await page.waitForTimeout(500);
    if (id === '2') await page.screenshot({ path: `${OUT}/L${id}-mission.png` });
    await page.click('[data-act="go"]', { force: true });

    for (const [i, shot] of solutions[id].entries()) {
      await page.waitForFunction(() => window.AP.Game.sim.state === 'ready', null, { timeout: 30000 });
      await page.waitForTimeout(1600); // let the camera return
      await page.evaluate((t) => window.AP.Game.selectBall(t), shot.type);
      const geo = await page.evaluate(() => {
        const G = window.AP.Game, r = window.AP.SLING_REST;
        return { x: (r.x - G.cam.x) * G.s + G.W / 2, y: G.groundY - r.y * G.s, k: window.AP.PHYS.maxPull / G.dragPx };
      });
      const tx = geo.x + shot.pull.x / geo.k, ty = geo.y - shot.pull.y / geo.k;
      await page.mouse.move(geo.x, geo.y);
      await page.mouse.down();
      for (let s = 1; s <= 10; s++) {
        await page.mouse.move(geo.x + (tx - geo.x) * s / 10, geo.y + (ty - geo.y) * s / 10);
        await page.waitForTimeout(16);
      }
      if (i === 0) await page.screenshot({ path: `${OUT}/L${id}-aim.png` });
      await page.mouse.up();
      if (i === 0) {
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${OUT}/L${id}-hit.png` });
      }
    }
    const end = await page.waitForFunction(() => {
      const s = window.AP.Game.sim.state;
      return (s === 'won' || s === 'lost') && document.querySelector('#modal.show') ? s : null;
    }, null, { timeout: 40000 }).then((h) => h.jsonValue()).catch(() => 'timeout');
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/L${id}-end.png` });
    const info = await page.evaluate(() => ({ score: window.AP.Game.sim.score, pups: window.AP.Game.sim.pupsAlive(), shots: window.AP.Game.sim.stats.shots }));
    results.push({ level: id, end, ...info });
    console.log('level', id, end, JSON.stringify(info));
  }
  if (errors.length) console.log('ERRORS:\n  ' + errors.join('\n  '));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
