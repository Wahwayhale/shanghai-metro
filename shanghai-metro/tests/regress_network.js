const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

async function waitDriving(page, limit = 220) {
  for (let i = 0; i < limit; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') return true;
  }
  return false;
}
async function start(page, idx) {
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await new Promise(r => setTimeout(r, 300));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#brGo');
  const ok = await waitDriving(page);
  if (!ok) return { ok: false };
  return { ok: true, info: await page.evaluate(() => {
    const S = window.__sim;
    return {
      line: S.line.name, route: S.routeDef.title,
      stations: S.path.stations.length,
      lenKm: +(S.path.length / 1000).toFixed(1),
      ai: S.aiTrains.length, signals: S.signals.length,
      objs: S.stationObjs.filter(Boolean).length,
      start: S.routeDef.start, vmax: S.path.vmax,
      firstTT: document.querySelector('#hudTT .tt-row')?.innerText.replace(/\n/g, ' ')
    };
  })};
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
  const menu = await p.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    titles: [...document.querySelectorAll('.route-card')].slice(0, 6).map(c => c.querySelector('.rc-title')?.innerText.split('\n')[0]),
    statRoutes: document.getElementById('statRoutes').textContent
  }));
  const results = {};
  results.full1 = await start(p, 0);
  await p.screenshot({ path: base + '/shanghai-metro/shots/net_full1.png' });
  await p.reload({ waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 2200));
  results.full16 = await start(p, 14);
  await p.reload({ waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 2200));
  results.fullCF = await start(p, 19);
  await p.reload({ waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 2200));
  results.full11 = await start(p, 9);
  await p.screenshot({ path: base + '/shanghai-metro/shots/net_full11.png' });
  await p.reload({ waitUntil: 'load', timeout: 120000 }); await new Promise(r => setTimeout(r, 2200));
  results.l4full = await start(p, 24);
  console.log(JSON.stringify({ menu, results, errors: errs.slice(0, 8) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
