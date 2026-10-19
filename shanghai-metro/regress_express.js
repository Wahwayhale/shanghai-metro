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
  const menu = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.route-card')];
    cards[9].click();
    return {
      cards: cards.length,
      stops: document.getElementById('statStops').textContent,
      statRoutes: document.getElementById('statRoutes').textContent,
      title: cards[9].querySelector('.rc-title').innerText.split('\n')[0]
    };
  });
  await new Promise(r => setTimeout(r, 400));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  const brief = await p.evaluate(() => ({ stops: document.getElementById('brStops').textContent, sub: document.getElementById('brSub').textContent }));
  await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 800));
  const start = await p.evaluate(() => ({
    stopPlan: window.__sim.G.stopPlan ? [...window.__sim.G.stopPlan] : null,
    rtRows: document.querySelectorAll('#hudTT .tt-row').length,
    served: window.__sim.path.stations.map(s => [s.zh, s.served])
  }));
  const result = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    S.toggleATO(true);
    for (let i = 0; i < 1400; i++) {
      S.advance(1);
      if (G.results.length >= 5 && G.targetIdx === 7) break;
    }
    return {
      target: G.targetIdx, results: G.results.length, state: G.atoState,
      stops: G.results.map(r => r.zh),
      times: S.path.stations.map(s => [s.zh, s.served, s.schArr, s.schDep]),
      finalServed: !!S.path.stations[G.targetIdx] && S.path.stations[G.targetIdx].served
    };
  });
  await p.screenshot({ path: base + '/shanghai-metro/fix_express.png' });
  console.log(JSON.stringify({ menu, brief, start, result, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
