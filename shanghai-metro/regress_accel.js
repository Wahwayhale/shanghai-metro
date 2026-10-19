const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

async function waitDriving(p) {
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await p.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') return true;
  }
  return false;
}
async function startL2(p) {
  await p.evaluate(() => document.querySelectorAll('.route-card')[21].click());
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  return waitDriving(p);
}
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
  const ok1 = await startL2(p);
  const accel = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.targetIdx = 1;
    G.s = S.path.stations[0].stopS;
    G.stopState = 'stop'; G.doorsOpen = true; G.doorT = 1;
    S.closeDoors();
    // 先等车门完全关闭，再测纯牵引加速
    for (let i = 0; i < 60 && G.doorT > 0.02; i++) S.advance(0.1);
    G.lever = 1; G.eb = false;
    const marks = {}; let t = 0;
    const targets = [40, 60, 80];
    while (t < 60 && targets.length) {
      S.advance(0.1); t += 0.1;
      const kmh = G.v * 3.6;
      while (targets.length && kmh >= targets[0]) { marks[targets.shift()] = +t.toFixed(1); }
    }
    return { marks, speed: +(G.v * 3.6).toFixed(1), s: Math.round(G.s), target: G.targetIdx };
  });
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2200));
  const ok2 = await startL2(p);
  const ato = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    Math.random = () => 1; // 关掉随机故障，单测 ATO 控速/停站
    S.toggleATO(true);
    for (let i = 0; i < 1200; i++) {
      S.advance(1);
      if (G.results.length >= 7 && G.targetIdx >= S.path.stations.length - 1) break;
    }
    return {
      target: G.targetIdx, results: G.results.length, state: G.atoState,
      stops: G.results.map(r => ({ zh: r.zh, err: +r.err.toFixed(2) }))
    };
  });
  console.log(JSON.stringify({ ok1, accel, ok2, ato, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
