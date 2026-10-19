const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=900,560'],
    defaultViewport: { width: 900, height: 560 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @' + (e.stack || '').split('\n')[1]));
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
  await new Promise(r => setTimeout(r, 1500));

  const log = await page.evaluate(() => {
    const S = window.__sim, G = S.G, P = S.path;
    const out = [];
    // 站 1 前 320m，60km/h
    G.targetIdx = 1;
    G.s = P.stations[1].stopS - 152;
    G.v = 60 / 3.6;
    G.lever = 0; G.eb = false; G.doorsOpen = false; G.doorT = 0;
    G.stopState = 'run';
    G.clock = P.stations[1].schArr - 25;
    S.snapTrain();
    out.push(['init', S.advance(0.1).v.toFixed(2), (P.stations[1].stopS - G.s).toFixed(0)]);
    // 惰行 1s
    out.push(['coast', JSON.stringify(S.advance(1))]);
    // 常用制动
    S.setLever(-0.95);
    let t = 0, st;
    while (t < 24) { st = S.advance(0.2); t += 0.2; if (st.v < 0.05) break; }
    out.push(['brake', t.toFixed(1), JSON.stringify(st), 'err=' + (G.s - P.stations[1].stopS).toFixed(2)]);
    G.lever = 0;
    // 开门
    S.openDoors();
    out.push(['open', G.stopState, G.doorsOpen, S.advance(1).doors.toFixed(2)]);
    // 关门发车
    S.closeDoors();
    S.advance(1);
    S.setLever(0.9);
    S.advance(2);
    out.push(['depart', G.stopState, G.targetIdx, G.v.toFixed(2)]);
    out.push(['results', JSON.stringify(G.results)]);
    return out;
  });
  log.forEach(l => console.log(l.join(' | ')));
  console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
