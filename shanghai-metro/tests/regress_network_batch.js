const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const idxs = (process.argv[2] || '1,2,4,5,6,7,8,9,11,12').split(',').map(Number);

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const out = [];
  for (const idx of idxs) {
    if (!out.length) await p.goto(file, { waitUntil: 'load', timeout: 120000 });
    else await p.reload({ waitUntil: 'load', timeout: 120000 });
    await new Promise(r => setTimeout(r, 2200));
    const menu = await p.evaluate(() => ({ cards: document.querySelectorAll('.route-card').length }));
    if (menu.cards <= idx) { out.push({ idx, ok: false, reason: 'no card' }); continue; }
    const title = await p.evaluate(i => document.querySelectorAll('.route-card')[i].querySelector('.rc-title')?.innerText.split('\n')[0], idx);
    await p.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
    await new Promise(r => setTimeout(r, 300));
    await p.click('#startBtn');
    await new Promise(r => setTimeout(r, 300));
    await p.click('#brGo');
    let ok = false;
    for (let k = 0; k < 160; k++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await p.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') { ok = true; break; }
      if (await p.evaluate(() => document.getElementById('loadStep')?.textContent.includes('失败'))) break;
    }
    let info = null;
    if (ok) info = await p.evaluate(() => {
      const S = window.__sim;
      return { line: S.line.name, route: S.routeDef.title, stations: S.path.stations.length, lenKm: +(S.path.length / 1000).toFixed(1), ai: S.aiTrains.length };
    });
    out.push({ idx, title, ok, info, errors: errs.slice(-3) });
    console.log(JSON.stringify(out[out.length - 1]));
  }
  console.log('SUMMARY', JSON.stringify({ total: out.length, ok: out.filter(x => x.ok).length, errors: errs.slice(0, 6) }));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
