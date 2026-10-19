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
  await p.evaluate(() => {
    const S = window.__sim, st = S.path.stations[5];
    const same = S.aiTrains.find(a => a.dir === 1);
    same.s = st.stopS; same.v = 0; same.state = 'dwell'; same.dwellT = 4; same.dwellNeed = 20;
    same.idx = 5; same.doorT = 0; same.train.update(same.s, 0, 0);
    const f = st.frame;
    const pos = f.pos.clone().addScaledVector(f.right, -2.2).addScaledVector(f.up, 3.2).addScaledVector(f.tan, -30);
    const look = f.pos.clone().addScaledVector(f.tan, 20).addScaledVector(f.up, 1.2);
    S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], 55);
  });
  await new Promise(r => setTimeout(r, 2500));
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_ai_shot.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
