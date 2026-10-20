/* ------------------------------------------------------------------
   P3 真实度回归：轮轨黏着 / 再生制动 / 进路表 / 车钩峰值

   用磁浮线（露天、2 站）在雨天满牵引起步：
   - 黏着 μ=0.18 应触发空转，加速度被压到平台
   - 制动应产生再生回馈，净能耗 < 牵引能耗
   - 进路表覆盖每站，锁闭进路时敌对请求被拒绝
   - 车钩峰值方向与加速度一致（起动拉伸、制动压缩）
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: launchArgs(),
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 180000 });
  await sleep(3000);
  const idx = await page.evaluate(() => window.__sim.routes.findIndex(r => r.id === 'fullCF'));
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await sleep(400);
  await page.evaluate(() => {
    document.querySelector('#weatherGroup button[data-v="rain"]').click();
    document.querySelector('#modeGroup button[data-v="single"]').click();
    document.getElementById('startBtn').click();
  });
  await sleep(400);
  await page.evaluate(() => document.getElementById('brGo').click());
  for (let k = 0; k < 2400; k++) {
    if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') break;
    await sleep(100);
  }

  const run = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    Math.random = () => 0.99;
    G.autoQuality = false;
    /* 关门 → 等门锁释放 → 满牵引 5 s */
    S.closeDoors();
    S.advance(4);
    S.setLever(1);
    S.advance(5);
    const accel = {
      v: +(G.v * 3.6).toFixed(1),
      slipping: G.slipping,
      warned: G._slipWarned,
      couplerTension: G.couplerPeak ? G.couplerPeak.tension : 0,
      energyTraction: +G.energyTraction.toFixed(2)
    };
    /* 制动 8 s → 再生回馈 */
    S.setLever(-1);
    S.advance(8);
    const brake = {
      v: +(G.v * 3.6).toFixed(1),
      regen: +G.regen.toFixed(2),
      energyTraction: +G.energyTraction.toFixed(2),
      energyNet: +G.energy.toFixed(2),
      regenOn: G.regenOn,
      couplerCompression: G.couplerPeak ? G.couplerPeak.compression : 0
    };
    return { accel, brake };
  });

  const ix = await page.evaluate(() => {
    const S = window.__sim, IX = S.IX;
    const table = S.interlockTable;
    const locksKeep = IX.locks;
    IX.locks = ['revA'];
    const conflict = S.interlockCheck('both');
    const free = S.interlockCheck('S1-main');
    IX.locks = locksKeep;
    return {
      routes: table ? table.routes.length : 0,
      stations: S.path.stations.length,
      hasStationRoute: !!(table && table.byId['S1-main']),
      revAConflicts: table ? table.matrix.revA.slice() : [],
      conflict,
      free
    };
  });

  const passed =
    run.accel.slipping === true && run.accel.warned === true &&
    run.accel.v > 8 && run.accel.v < 23 &&
    run.accel.couplerTension > 0 &&
    run.brake.regen > 0 && run.brake.energyNet < run.brake.energyTraction &&
    run.brake.regenOn === false && run.brake.couplerCompression < 0 &&
    ix.routes === ix.stations + 3 && ix.hasStationRoute &&
    ix.revAConflicts.includes('S0-main') &&
    ix.conflict.ok === false && /敌对/.test(ix.conflict.reason) &&
    ix.free.ok === true &&
    errors.length === 0;

  console.log(JSON.stringify({ passed, run, ix, errors: errors.slice(0, 6) }, null, 1));
  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
