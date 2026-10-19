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
  await new Promise(r => setTimeout(r, 1200));

  const setup = await p.evaluate(() => {
    const S = window.__sim, st = S.path.stations[5];
    const same = S.aiTrains.find(a => a.dir === 1);
    const opp = S.aiTrains.find(a => a.dir === -1);
    for (const a of [same, opp]) {
      a.s = st.stopS; a.v = 0; a.state = 'dwell'; a.dwellT = 1; a.dwellNeed = 12;
      a.idx = 5; a.holdT = 0; a.doorT = 0;
      a.train.update(a.s, 0, 0);
    }
    return { same: same.carNo, opp: opp.carNo, stop: st.stopS };
  });
  await new Promise(r => setTimeout(r, 2500));
  const result = await p.evaluate(() => {
    const S = window.__sim;
    const same = S.aiTrains.find(a => a.dir === 1);
    const opp = S.aiTrains.find(a => a.dir === -1);
    const set = same.train.doorSets[0];
    const arr = set.mesh.instanceMatrix.array;
    const zAt = i => +arr[i * 16 + 14].toFixed(3);
    return {
      same: { state: same.state, doorT: same.train.doorT, psdL: S.stationObjs[5].psdL.t, psdR: S.stationObjs[5].psdR.t, track: same.lateral },
      opp: { state: opp.state, doorT: opp.train.doorT, psdL: S.stationObjs[5].psdL.t, psdR: S.stationObjs[5].psdR.t, track: opp.lateral },
      doorSets: same.train.doorSets.length,
      sideZ: { left: zAt(0), right: zAt(8), leftSide: set.list[0].side, rightSide: set.list[8].side }
    };
  });
  console.log(JSON.stringify({ setup, result, errors: errs.slice(0, 4) }, null, 1));
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_ai_psd.png' });
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
