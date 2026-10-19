const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
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
  const result = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    S.toggleATO(true);
    const snaps = [];
    for (let i = 0; i < 1200; i++) {
      S.advance(1);
      if (i % 120 === 0) snaps.push({ t: i, s: Math.round(G.s), v: Math.round(G.v * 3.6), st: G.stopState, ato: G.atoState, tgt: G.targetIdx, res: G.results.length });
      if (G.targetIdx >= S.path.stations.length - 1 && G.results.length >= S.path.stations.length - 1) break;
    }
    return {
      target: G.targetIdx, results: G.results.length, mode: G.mode, paused: G.paused,
      state: G.atoState, ato: G.ato, doors: G.doorsOpen, doorT: G.doorT,
      stops: G.results.map(r => ({ zh: r.zh, err: +r.err.toFixed(2) })),
      snaps
    };
  });
  console.log(JSON.stringify({ result, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
