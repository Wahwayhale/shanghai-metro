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
  const info = await p.evaluate(() => {
    const S = window.__sim, f = S.path.stations[0].frame;
    const at = f.pos.clone().addScaledVector(f.right, 14).addScaledVector(f.up, 14).addScaledVector(f.tan, 47);
    const cam = at.clone().addScaledVector(f.right, 16).addScaledVector(f.up, 4.2).addScaledVector(f.tan, -8);
    const look = at.clone().addScaledVector(f.up, 2.2);
    S.setFreeCam([cam.x, cam.y, cam.z], [look.x, look.y, look.z], 52);
    return { station: S.path.stations[0].zh, stY: S.path.stations[0].y, atY: +at.y.toFixed(2), camY: +cam.y.toFixed(2) };
  });
  await new Promise(r => setTimeout(r, 2000));
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_exit.png' });
  console.log(JSON.stringify({ info, errors: errs.slice(0, 4) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
