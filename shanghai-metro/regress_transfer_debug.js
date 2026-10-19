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
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
  await new Promise(r => setTimeout(r, 400));
  const before = await p.evaluate(() => {
    const S = window.__sim, G = S.G, st = S.path.stations[0], f = st.frame;
    if (G.walk) G.walk.pos.copy(f.pos).addScaledVector(f.right, -3).addScaledVector(f.up, 2.76).addScaledVector(f.tan, 90);
    const ri = S.routes.findIndex(r => S.lines[r.line] && S.lines[r.line].name === '10号线' && r.id.startsWith('full'));
    return {
      mode: G.mode, walk: G.walk && { active: G.walk.active, station: G.walk.station, tpHidden: G.walk.tpHidden },
      tr: st.tr, ri, route: ri >= 0 ? { id: S.routes[ri].id, title: S.routes[ri].title, line: S.lines[S.routes[ri].line].name } : null,
      panel: !document.getElementById('transferPanel').classList.contains('hidden'),
      list: document.getElementById('transferList').innerHTML.slice(0, 300)
    };
  });
  await p.evaluate(() => window.__sim.showTransferPanel());
  await new Promise(r => setTimeout(r, 300));
  const direct = await p.evaluate(() => ({
    panel: !document.getElementById('transferPanel').classList.contains('hidden'),
    lines: [...document.querySelectorAll('.tp-line')].map(x => x.dataset.line),
    list: document.getElementById('transferList').innerHTML.slice(0, 300)
  }));
  await p.screenshot({ path: base + '/shanghai-metro/fix_transfer_debug.png' });
  console.log(JSON.stringify({ before, direct, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
