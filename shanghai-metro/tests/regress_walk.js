const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await new Promise(r => setTimeout(r, 400));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400)); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 800));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
  await new Promise(r => setTimeout(r, 400));
  const entered = await p.evaluate(() => {
    const G = window.__sim.G;
    return { active: !!(G.walk && G.walk.active), stop: G.stopState, doors: G.doorsOpen, y: G.walk ? +G.walk.pos.y.toFixed(2) : null, mode: G.mode, paused: G.paused };
  });
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })));
  await new Promise(r => setTimeout(r, 4300));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })));
  await new Promise(r => setTimeout(r, 300));
  const walked = await p.evaluate(() => {
    const S = window.__sim, G = S.G, w = G.walk;
    return {
      active: w.active, tip: w.tip,
      pos: [+w.pos.x.toFixed(2), +w.pos.y.toFixed(2), +w.pos.z.toFixed(2)],
      status: document.getElementById('hudStatus').textContent,
      mode: G.mode, paused: G.paused,
      camera: [+S.camera.position.x.toFixed(2), +S.camera.position.y.toFixed(2), +S.camera.position.z.toFixed(2)]
    };
  });
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_walk.png' });
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
  await new Promise(r => setTimeout(r, 300));
  const exited = await p.evaluate(() => ({ active: !!(window.__sim.G.walk && window.__sim.G.walk.active), mode: window.__sim.G.mode }));
  console.log(JSON.stringify({ entered, walked, exited, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
