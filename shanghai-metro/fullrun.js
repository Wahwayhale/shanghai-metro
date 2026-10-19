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
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('C ' + m.text()); });
  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: base + '/shanghai-metro/f_menu.png' });

  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 600));
  await page.click('#brGo');
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 1500));
    if (await page.evaluate(() => window.__sim.G.mode) === 'driving') break;
  }
  await new Promise(r => setTimeout(r, 2000));

  // 脚本跑完全程
  const res = await page.evaluate(() => {
    const S = window.__sim, G = S.G, P = S.path;
    const log = [];
    G.doorsOpen = false; G.doorT = 0; G.stopState = 'stop';
    S.closeDoors();
    for (let i = 1; i < P.stations.length; i++) {
      G.targetIdx = i;
      G.s = P.stations[i].stopS - 133;
      G.v = 16.6; G.lever = -1; G.eb = false; G.doorsOpen = false; G.doorT = 0;
      G.stopState = 'run';
      G.clock = P.stations[i].schArr - 2;
      let t = 0, st;
      while (t < 30) { st = S.advance(0.2); t += 0.2; if (st.v < 0.02) break; }
      G.lever = 0;
      S.openDoors();
      S.advance(0.5);
      G.clock += 28;
      S.closeDoors();
      S.advance(1);
      G.lever = 0.9; S.advance(1.5);
      log.push(i + ':' + (G.s - P.stations[i].stopS).toFixed(1) + '/' + G.stopState + '/' + G.results.length);
    }
    G.finishTimer = -1;
    S.finishService();
    return { log, results: G.results.map(r => r.zh + ':' + r.err.toFixed(1) + ':' + Math.round(r.punc)), mode: G.mode };
  });
  console.log(JSON.stringify(res, null, 1));
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: base + '/shanghai-metro/f_results.png' });
  console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
