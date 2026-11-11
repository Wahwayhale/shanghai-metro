/* 乘客流程回归：AI 开走本务车 → 站台等车 → 接管进站列车；以及自动限速开关 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await sleep(2500);
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await sleep(400); await p.click('#startBtn'); await sleep(400); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await sleep(800);
  await p.evaluate(() => { const S = window.__sim; if (S.G.onboardOpen) S.onboardFinish(); });

  const res = {}; const fail = [];
  const chk = (k, ok, info) => { res[k] = info === undefined ? ok : info; if (!ok) fail.push(k); };
  const key = code => p.evaluate(c => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c }));
  }, code);

  /* 自动限速开关：默认关闭 */
  chk('autoLimitDefaultOff', await p.evaluate(() => window.__sim.G.autoLimit === false));

  /* 下车 → 站台（开门状态） */
  await p.evaluate(() => {
    const S = window.__sim; S.G.s = S.path.stations[0].stopS; S.G.v = 0;
    S.G.doorsOpen = true; S.G.doorT = 1; S.G.stopState = 'dwell';
  });
  await sleep(300);
  await key('KeyF'); await sleep(400);
  chk('onPlatform', await p.evaluate(() => !!(window.__sim.G.walk && window.__sim.G.walk.active && !window.__sim.G.walk.inTrain)));

  /* 缩短接管计时，等 AI 接管 */
  await p.evaluate(() => { window.__sim.G.aiTakeoverDelay = 1; });
  for (let i = 0; i < 25; i++) { await sleep(1000); if (await p.evaluate(() => window.__sim.G.aiTakeover)) break; }
  const tk = await p.evaluate(() => ({ ai: !!window.__sim.G.aiTakeover, walk: !!(window.__sim.G.walk && window.__sim.G.walk.active), next: window.__sim.G.nextTrainNo || null, eta: window.__sim.G.nextTrainEta || null }));
  chk('aiTookOver', tk.ai, tk);
  chk('stillPassenger', tk.walk);
  chk('nextTrainScheduled', !!tk.next, tk);

  /* 按 G 打开接管面板 */
  await key('KeyG'); await sleep(600);
  const panel = await p.evaluate(() => {
    const box = document.getElementById('takeoverPanel');
    const items = box ? box.querySelectorAll('.tk-item').length : 0;
    return { open: box && !box.classList.contains('hidden'), items };
  });
  chk('takeoverPanelOpens', panel.open && panel.items > 0, panel);

  /* 接管一列 AI 车 */
  const took = await p.evaluate(() => {
    const S = window.__sim;
    const ai = S.aiTrains.find(a => a && !a.dead && a.train);
    if (!ai) return { ok: false };
    const no = ai.carNo;
    const ok = S.takeOverTrain(ai);
    return { ok, no, carNo: S.G.carNo, walk: !!(S.G.walk && S.G.walk.active), ato: S.G.ato, aiLeft: S.aiTrains.filter(a => !a.dead).length };
  });
  chk('tookOverTrain', took.ok && took.carNo === took.no && !took.walk && !took.ato, took);

  /* 自动限速打开后，超速会施加 ATP 制动 */
  const lim = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.autoLimit = true; G.lever = 1; G.v = (G.limit + 25) * 0.2778; G.eb = false; G.atpBrake = false;
    S.advance(1);
    return { brake: !!G.atpBrake || !!G.eb, limit: Math.round(G.limit) };
  });
  chk('autoLimitOnBrakes', lim.brake, lim);

  const lim2 = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.autoLimit = false; G.lever = 1; G.v = (G.limit + 25) * 0.2778; G.eb = false; G.atpBrake = false;
    S.advance(1);
    return { brake: !!G.atpBrake || !!G.eb };
  });
  chk('autoLimitOffNoBrake', !lim2.brake, lim2);

  await p.screenshot({ path: base + '/shanghai-metro/shots/passenger_flow.png' });
  console.log(JSON.stringify({ res, fail, errors: errs.slice(0, 5) }, null, 1));
  await b.close();
  if (fail.length || errs.length) process.exit(1);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
