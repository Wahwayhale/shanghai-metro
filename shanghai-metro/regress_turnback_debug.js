const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  const idx = await p.evaluate(() => [...document.querySelectorAll('.route-card')].findIndex(c => c.querySelector('.rc-title')?.innerText.includes('南京东路') && c.querySelector('.rc-title')?.innerText.includes('张江高科')));
  await p.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  for (let i = 0; i < 160; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 600));
  await p.evaluate(() => {
    const S = window.__sim, G = S.G, P = S.path, last = P.stations.length - 1;
    G.targetIdx = last; G.s = P.stations[last].stopS; G.v = 0; G.lever = 0; G.eb = false;
    G.stopState = 'dwell'; G.doorsOpen = true; G.doorT = 1; S.train.setDoorT(1);
    S.aiTrains.forEach(a => { a.s = 0; a.v = 0; });
    S.finishService();
  });
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate(() => document.getElementById('resReverse').click());
  for (let i = 0; i < 16; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await p.evaluate(() => {
      const S = window.__sim, G = S.G;
      return { mode: G.mode, s: Math.round(G.s), v: +(G.v).toFixed(2), tb: G.turnback ? { phase: G.turnback.phase, s: Math.round(G.turnback.s), target: Math.round(G.turnback.target), t: +G.turnback.t.toFixed(1) } : null, reverse: !!G.reverse, load: document.getElementById('loadStep').textContent };
    });
    console.log(i, JSON.stringify(st));
    if (st.mode === 'driving' && st.reverse) break;
  }
  console.log('ERR', JSON.stringify(errs.slice(0, 6)));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
