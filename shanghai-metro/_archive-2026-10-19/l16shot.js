const puppeteer = require('puppeteer-core'); const path = require('path');
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
  await new Promise(r => setTimeout(r, 2000));
  await p.evaluate(() => { document.querySelectorAll('.route-card')[8].click(); });
  await new Promise(r => setTimeout(r, 600));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  await p.click('#brGo');
  for (let i = 0; i < 140; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 1200));
  console.log('DOORS', JSON.stringify(await p.evaluate(() => {
    const S = window.__sim;
    return { doors: S.line.doors, vmax: S.path.vmax, carDoors: S.train.doorSets[0].list.length, psd: S.stationObjs[0] ? S.stationObjs[0].psdL.leaves.length : 0 };
  })));
  await p.evaluate(() => {
    const S = window.__sim; const V = S.camera.position.constructor;
    const g = S.stationObjs[0].group; g.updateMatrixWorld(true);
    const pos = g.localToWorld(new V(-8.5, 3.2, 16));
    const look = g.localToWorld(new V(-5.4, 1.9, -6));
    S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], 58);
  });
  await new Promise(r => setTimeout(r, 2400));
  await p.screenshot({ path: base + '/shanghai-metro/l16_side.png' });
  await p.evaluate(() => { const S = window.__sim; S.setFreeCam(null); S.G.camMode = 1; S.snapCam(); });
  await new Promise(r => setTimeout(r, 2200));
  await p.screenshot({ path: base + '/shanghai-metro/l16_chase.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
