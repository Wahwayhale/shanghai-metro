const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' | ' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('C ' + m.text()); });
  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#brGo');
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 1500));
    if (await page.evaluate(() => window.__sim.G.mode) === 'driving') break;
  }
  await new Promise(r => setTimeout(r, 2000));

  // 跳到龙阳路（高架）
  await page.evaluate(() => {
    const S = window.__sim;
    const i = 6;
    S.G.targetIdx = i;
    S.G.s = S.path.stations[i].stopS;
    S.G.v = 0; S.G.lever = 0; S.G.doorsOpen = false; S.G.doorT = 0;
    S.G.stopState = 'stop'; S.G.clock = S.path.stations[i].schDep;
    S.G.stopErr = 0;
    S.train.update(S.G.s, 0, 0);
    S.train.setDoors(false);
    S.snapTrain(); S.snapCam();
  });
  await page.evaluate(() => window.__sim.snapCam());
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: base + '/shanghai-metro/h_cab.png' });

  await page.evaluate(() => { window.__sim.G.camMode = 1; window.__sim.snapCam(); });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: base + '/shanghai-metro/h_chase.png' });

  await page.evaluate(() => { window.__sim.G.camMode = 2; window.__sim.G.orbit = { az: 2.5, el: 0.18, dist: 30 }; window.__sim.snapCam(); });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: base + '/shanghai-metro/h_orbit.png' });

  await page.evaluate(() => { window.__sim.G.camMode = 3; window.__sim.snapCam(); });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: base + '/shanghai-metro/h_platform.png' });

  const stats = await page.evaluate(() => {
    const S = window.__sim; let meshes = 0, tris = 0;
    S.scene.traverse(o => { if (o.isMesh) { meshes++; const g = o.geometry; if (g && g.index) tris += g.index.count / 3; else if (g && g.attributes.position) tris += g.attributes.position.count / 3; } });
    return { meshes, tris: Math.round(tris) };
  });
  console.log('STATS', JSON.stringify(stats));
  console.log('ERRORS', JSON.stringify(errs.slice(0, 8)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
