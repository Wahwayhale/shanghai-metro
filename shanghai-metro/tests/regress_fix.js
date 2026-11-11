const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

async function waitDriving(page, limit = 160) {
  for (let i = 0; i < limit; i++) {
    await new Promise(r => setTimeout(r, 1000));
    if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') return true;
  }
  return false;
}
async function startRoute(page, idx, exam = false) {
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await new Promise(r => setTimeout(r, 500));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 400));
  if (exam) await page.evaluate(() => document.querySelectorAll('#modeGroup button')[1].click());
  await page.click('#brGo');
  return await waitDriving(page);
}

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));

  const menu = await p.evaluate(() => {
    document.querySelectorAll('.route-card')[3].click();
    return {
      cards: document.querySelectorAll('.route-card').length,
      l4eStops: document.getElementById('statStops').textContent,
      statRoutes: document.getElementById('statRoutes').textContent
    };
  });
  await new Promise(r => setTimeout(r, 300));
  const dual = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.route-card')];
    return { l4eCard: cards[3]?.classList.contains('dual'), l34Card: cards[5]?.classList.contains('dual') };
  });
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await new Promise(r => setTimeout(r, 200));
  const shakeBefore = await p.evaluate(() => window.__sim.G.shakeOn);
  await p.evaluate(() => document.querySelector('#shakeGroup button[data-v="off"]').click());
  const shakeAfter = await p.evaluate(() => window.__sim.G.shakeOn);
  await p.evaluate(() => document.querySelector('#shakeGroup button[data-v="on"]').click());

  const ok0 = await startRoute(p, 0, true);
  const normal = await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    const aiDoors = S.aiTrains.map(a => a.train.doorSets.length);
    // 牵引故障限速
    G.fault = { type: 'traction', name: '牵引逆变器', warned: true };
    G.v = 20;
    S.advance(0.3);
    const faultLimit = G.limit;
    G.fault = null; G.v = 0; G.eb = false; G.lever = 0;
    // 考试：到 1 号站停车，不开门直接发车
    G.targetIdx = 1;
    G.s = S.path.stations[1].stopS - 2;
    G.v = 0; G.lever = 0; G.eb = false;
    G.stopState = 'run'; G.doorsOpen = false; G.doorT = 0;
    S.advance(0.3);
    const stopped = G.stopState;
    G.lever = 1;
    S.advance(2.5);
    const doorTask = G.examTasks.find(t => t.id === 'door');
    // ATP EB 计数
    S.triggerEB('ATP 超速防护动作');
    const atpTask = G.examTasks.find(t => t.id === 'atp');
    return {
      aiDoors, faultLimit, stopped,
      targetAfterDepart: G.targetIdx,
      doorOk: doorTask ? doorTask.ok : null,
      atpOk: atpTask ? atpTask.ok : null,
      exam: G.exam
    };
  });

  // 环线终到
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  const okLoop = await startRoute(p, 4, false);
  const loop = await p.evaluate(() => {
    const S = window.__sim, G = S.G, P = S.path;
    const last = P.stations.length - 1;
    G.targetIdx = last;
    G.s = P.stations[last].stopS - 2;
    G.v = 0; G.lever = 0; G.eb = false;
    G.stopState = 'run'; G.doorsOpen = false; G.doorT = 0;
    S.advance(0.3);
    S.openDoors();
    S.advance(1.2);
    return {
      n: P.stations.length, target: G.targetIdx,
      psd0: S.stationObjs[0].psdL.t,
      doorT: G.doorT,
      lastSynthetic: !!P.stations[last].synthetic
    };
  });
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_loop.png' });

  // 16 号线
  await p.reload({ waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  const ok16 = await startRoute(p, 8, false);
  const l16 = await p.evaluate(() => {
    const S = window.__sim;
    return {
      vmax: S.path.vmax, thirdRail: !!S.line.thirdRail,
      aiVmax: S.aiTrains.map(a => a.vmax),
      aiDoors: S.aiTrains.map(a => a.train.doorSets.length),
      cabSpeedo: !!S.train.cabDisplay
    };
  });
  await p.screenshot({ path: base + '/shanghai-metro/shots/fix_l16.png' });

  console.log(JSON.stringify({ menu, dual, shakeBefore, shakeAfter, ok0, normal, okLoop, loop, ok16, l16, errors: errs.slice(0, 8) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
