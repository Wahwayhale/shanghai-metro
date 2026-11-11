/* 车厢自由进入 / 就座 / 离车 AI 接管 / 接管任意列车 回归 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await sleep(400);
  await p.click('#startBtn'); await sleep(400); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await sleep(800);
  await p.evaluate(() => { const S = window.__sim; if (S.G.onboardOpen) S.onboardFinish(); });
  const key = code => p.evaluate(c => { window.dispatchEvent(new KeyboardEvent('keydown', { code: c })); window.dispatchEvent(new KeyboardEvent('keyup', { code: c })); }, code);
  const res = {};
  const fail = [];
  const check = (name, ok, info) => { res[name] = info === undefined ? ok : info; if (!ok) fail.push(name); };

  /* 开门停稳后下车 */
  await p.evaluate(() => { const S = window.__sim; S.G.s = S.path.stations[0].stopS; S.G.v = 0; S.G.doorsOpen = true; S.G.doorT = 1; S.G.stopState = 'dwell'; });
  await sleep(300);
  await key('KeyF'); await sleep(400);
  check('walkActive', await p.evaluate(() => !!window.__sim.G.walk.active));

  /* E 进入车厢 */
  const entered = await p.evaluate(() => { const S = window.__sim; return S.walkInteractE() && !!S.G.walk.inTrain; });
  check('enteredCar', entered);
  const pax = await p.evaluate(() => { const c = window.__sim.train.cars[window.__sim.G.walk.inTrain.carIdx]; return { seats: (c.seatSpots || []).length, total: c.passengerCount ? c.passengerCount.total : 0, seated: c.passengerCount ? c.passengerCount.seated : 0 }; });
  check('carHasSeatedPassengers', pax.seats > 0 && pax.seated > 0, pax);

  /* 就座 / 站立 */
  await p.evaluate(() => window.__sim.walkInteractE()); await sleep(200);
  check('seated', await p.evaluate(() => !!window.__sim.G.walk.inTrain.seated));
  await p.evaluate(() => window.__sim.walkInteractE()); await sleep(200);
  check('stoodUp', await p.evaluate(() => !window.__sim.G.walk.inTrain.seated));

  /* 车厢内走动并穿过贯通道 */
  const car0 = await p.evaluate(() => window.__sim.G.walk.inTrain.carIdx);
  await p.evaluate(() => { const it = window.__sim.G.walk.inTrain; it.lx = 0; it.lz = -12; window.__sim.clampWalk(); });
  const car1 = await p.evaluate(() => window.__sim.G.walk.inTrain.carIdx);
  check('crossedGangway', car1 === car0 + 1, { car0, car1 });

  /* 离车后 AI 接管（缩短计时） */
  await p.evaluate(() => { window.__sim.G.aiTakeoverDelay = 1; });
  for (let i = 0; i < 30; i++) { await sleep(1000); if (await p.evaluate(() => window.__sim.G.aiTakeover)) break; }
  check('aiTakeover', await p.evaluate(() => !!window.__sim.G.aiTakeover && !!window.__sim.G.ato),
    await p.evaluate(() => ({ away: window.__sim.G.walk && window.__sim.G.walk.awayTimer, ai: window.__sim.G.aiTakeover, ato: window.__sim.G.ato, paused: window.__sim.G.paused, mode: window.__sim.G.mode })));

  /* 接管任意 AI 列车 */
  const ais = await p.evaluate(() => window.__sim.aiTrains.filter(a => a && !a.dead && a.train).length);
  check('hasAiTrains', ais > 0, ais);
  if (ais > 0) {
    const tk = await p.evaluate(() => {
      const S = window.__sim; const ai = S.aiTrains.find(a => a && !a.dead && a.train);
      const no = ai.carNo; const ok = S.takeOverTrain(ai);
      return { ok, carNo: S.G.carNo, no, walk: !!(S.G.walk && S.G.walk.active), ato: S.G.ato };
    });
    check('tookOverAi', tk.ok && tk.carNo === tk.no && !tk.walk && !tk.ato, tk);
  }

  console.log(JSON.stringify({ res, fail, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
  if (fail.length || errs.length) process.exit(1);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
