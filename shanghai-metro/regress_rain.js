const puppeteer = require('puppeteer-core');
const path = require('path');
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
  await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(() => document.querySelector('#weatherGroup button[data-v="rain"]').click());
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await new Promise(r => setTimeout(r, 400));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400)); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 800));
  const info = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.targetIdx = 6;
    G.s = S.path.stations[6].stopS - 45;
    G.v = 0; G.lever = 0; G.eb = false; G.stopState = 'run'; G.doorsOpen = false; G.doorT = 0;
    G.weather = 'rain';
    return { weather: G.weather, y: S.path.frameAt(G.s).pos.y, drops: S.train.rainDrops.length, visible: S.train.rainDropPlane.visible };
  });
  await new Promise(r => setTimeout(r, 2500));
  const after = await p.evaluate(() => {
    const tr = window.__sim.train;
    const d = tr.rainDropCtx.getImageData(0, 0, 256, 128).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return {
      visible: tr.rainDropPlane.visible, opacity: tr.rainGlass.material.opacity,
      painted, planeVisible: tr.rainDropPlane.visible, planeY: tr.rainDropPlane.position.y,
      weather: window.__sim.G.weather, underground: window.__sim.path.frameAt(window.__sim.G.s).pos.y < -2
    };
  });
  await p.screenshot({ path: base + '/shanghai-metro/fix_rain.png' });
  console.log(JSON.stringify({ info, after, errors: errs.slice(0, 4) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
