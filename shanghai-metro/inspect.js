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
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 600));
  await page.click('#brGo');
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const m = await page.evaluate(() => window.__sim.G.mode);
    if (m === 'driving') break;
    if (m === 'menu') { console.log('back to menu'); break; }
  }
  await new Promise(r => setTimeout(r, 4000));
  const info = await page.evaluate(() => {
    const S = window.__sim;
    return {
      mode: S.G.mode, s: +S.G.s.toFixed(1), target: S.G.targetIdx,
      stations: S.stationObjs.length, route: Math.round(S.path.length),
      line: S.line.name, calls: S.renderer.info.render.calls,
      cam: S.camera.position.toArray().map(n => +n.toFixed(1)),
      fpsSample: S.renderer.info.render.frame
    };
  });
  console.log('INFO', JSON.stringify(info), 'ERRORS', JSON.stringify(errs.slice(0, 6)));
  await page.screenshot({ path: base + '/shanghai-metro/v_cab.png' });

  await page.evaluate(() => { window.__sim.G.camMode = 1; });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: base + '/shanghai-metro/v_chase.png' });

  await page.evaluate(() => { window.__sim.G.camMode = 2; window.__sim.G.orbit = { az: 2.1, el: 0.22, dist: 30 }; });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: base + '/shanghai-metro/v_orbit.png' });

  // 侧窗视角
  await page.evaluate(() => { window.__sim.G.camMode = 0; window.__sim.G.yaw = 1.0; window.__sim.G.pitch = -0.05; });
  await new Promise(r => setTimeout(r, 3500));
  await page.screenshot({ path: base + '/shanghai-metro/v_side.png' });

  await browser.close();
  console.log('done');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
