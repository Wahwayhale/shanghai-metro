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
  const menu = await p.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    statRoutes: document.getElementById('statRoutes').textContent,
    titles: [...document.querySelectorAll('.route-card')].slice(0, 7).map(c => c.querySelector('.rc-title')?.innerText.split('\n')[0]),
    stats: [...document.querySelectorAll('.route-card')].slice(0, 7).map(c => c.querySelector('.rc-meta')?.innerText.replace(/\n/g, ' '))
  }));
  await p.evaluate(() => document.querySelectorAll('.route-card')[3].click());
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  let ok = false;
  for (let i = 0; i < 220; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') { ok = true; break; } }
  const full4 = ok ? await p.evaluate(() => {
    const S = window.__sim;
    return {
      line: S.line.name, route: S.routeDef.title, loop: S.routeDef.loop,
      stations: S.path.stations.length, objs: S.stationObjs.filter(Boolean).length,
      lenKm: +(S.path.length / 1000).toFixed(1), status: S.G.mode
    };
  }) : null;
  console.log(JSON.stringify({ menu, ok, full4, errors: errs.slice(0, 6) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
