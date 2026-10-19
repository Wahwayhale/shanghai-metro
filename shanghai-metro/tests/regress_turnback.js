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
  const idx = await p.evaluate(() => [...document.querySelectorAll('.route-card')].findIndex(c => c.querySelector('.rc-title')?.innerText.includes('南京东路') && c.querySelector('.rc-title')?.innerText.includes('张江高科')));
  await p.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  let ok = false;
  for (let i = 0; i < 180; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') { ok = true; break; } }
  await new Promise(r => setTimeout(r, 600));
  const setup = await p.evaluate(() => {
    const S = window.__sim, G = S.G, P = S.path;
    const last = P.stations.length - 1;
    G.targetIdx = last;
    G.s = P.stations[last].stopS;
    G.v = 0; G.lever = 0; G.eb = false;
    G.stopState = 'dwell'; G.doorsOpen = true; G.doorT = 1;
    S.train.setDoorT(1);
    S.aiTrains.forEach(a => { a.s = 0; a.v = 0; });
    S.finishService();
    return {
      mode: G.mode, target: G.targetIdx, last: P.stations[last].zh,
      reverseBtn: getComputedStyle(document.getElementById('resReverse')).display,
      occupied: S.IX.occupied()
    };
  });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => document.getElementById('resReverse').click());
  await new Promise(r => setTimeout(r, 500));
  const started = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    return { mode: G.mode, turnback: !!G.turnback, activeIx: S.IX.active, s: Math.round(G.s), targetS: G.turnback ? G.turnback.target : null };
  });
  const stepped = await p.evaluate(() => window.__sim.advanceTurnback(30));
  let reversed = false;
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await p.evaluate(() => {
      const S = window.__sim;
      return S ? { mode: S.G.mode, reverse: !!S.G.reverse, first: S.path && S.path.stations[0]?.zh, line: S.line.name } : null;
    });
    if (st && st.mode === 'driving' && st.reverse) { reversed = true; break; }
  }
  const after = reversed ? await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    return { mode: G.mode, reverse: G.reverse, line: S.line.name, first: S.path.stations[0].zh, last: S.path.stations[S.path.stations.length - 1].zh, target: G.targetIdx };
  }) : null;
  console.log(JSON.stringify({ ok, setup, started, stepped, reversed, after, errors: errs.slice(0, 6) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
