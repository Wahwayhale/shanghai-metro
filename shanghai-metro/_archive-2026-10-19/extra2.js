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
  await p.evaluate(() => { document.querySelectorAll('.route-card')[2].click(); });
  await new Promise(r => setTimeout(r, 600));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  await p.click('#brGo');
  for (let i = 0; i < 140; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 1200));
  const shot = async (name, from, to, fov) => {
    await p.evaluate(([f, t, fv]) => {
      const S = window.__sim; const V = S.camera.position.constructor;
      const g = S.stationObjs[0].group; g.updateMatrixWorld(true);
      const pos = g.localToWorld(new V(...f)), look = g.localToWorld(new V(...t));
      S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], fv);
    }, [from, to, fov]);
    await new Promise(r => setTimeout(r, 2400));
    await p.screenshot({ path: base + '/shanghai-metro/y_' + name + '.png' });
  };
  await shot('tr', [0.6, 2.35, 62], [0.2, 1.9, 92], 60);
  await shot('pav', [9, 3.2, 40], [15, -2.5, 14], 62);
  await shot('pis', [-2.6, 2.35, 44], [0, 3.3, 30], 50);
  console.log('ERR', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
