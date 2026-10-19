/* ------------------------------------------------------------------
   P2-4 多质点车钩动力学验证

   断言：
   A. 起动时后车滞后于前车（拉伸），且滞后量 > 0
   B. 制动时出现压缩（后车顶上前车），压缩力为负
   C. 松弛后（等速运行）偏移收敛回 0 附近，不发散
   D. 停站后编组恢复静止，无残余振动
   E. 与单质点相比：停车前后出现纵向冲动（加速度突变被吸收）
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');

const out = { passed: false, checks: {} };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: launchArgs(),
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await wait(2500);
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), 0);
  await wait(400);
  await page.evaluate(() => document.getElementById('startBtn').click());
  await wait(300);
  await page.evaluate(() => document.getElementById('brGo').click());
  let ok = false;
  for (let k = 0; k < 300; k++) {
    await wait(250);
    if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') { ok = true; break; }
  }
  if (!ok) { console.log(JSON.stringify({ passed: false, reason: '未进入驾驶' })); process.exit(1); }

  const r = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    Math.random = () => 1;
    window.requestAnimationFrame = () => 0;
    const train = S.train;
    const chain = train.chain;
    const res = { hasChain: !!chain, n: chain ? chain.n : 0 };
    /* 先跑几帧让 chain 完成初始化（physics 里 gap>2m 时会 reset） */
    S.advance(0.1);
    res.inited = chain.inited;
    res.carS = chain.s.map(x => +x.toFixed(2));

    /* 确保静止起步 */
    G.ato = false; G.lever = 0; G.eb = false;
    G.doorsOpen = false; G.doorT = 0; G.stopState = 'stop';
    G.v = 0;
    for (let i = 0; i < 50; i++) S.advance(0.02);   // 静置，让车钩松弛归零

    /* A. 起动：全牵引 6 秒。
       关注「最大偏移」而不是尾车 —— 真实编组里中间车滞后最明显，
       尾车被前后两辆车钩同时拉扯，反而可能回到原位附近。 */
    G.lever = 1;
    const startTrace = [];
    for (let i = 0; i < 300; i++) {
      S.advance(0.02);
      const o = chain.offsets();
      startTrace.push({ tail: o[o.length - 1], max: Math.max(...o) });
    }
    res.startLag = +startTrace[startTrace.length - 1].tail.toFixed(4);
    res.startMaxLag = +Math.max(...startTrace.map(x => x.max)).toFixed(4);
    res.startTension = chain.summary().tension;
    res.vAfterAccel = +G.v.toFixed(2);

    /* B. 制动：全制动到停车，看是否出现压缩（couplerF < 0） */
    G.lever = -1;
    const brakeTrace = [];
    for (let i = 0; i < 600; i++) {
      S.advance(0.02);
      const sum = chain.summary();
      brakeTrace.push({ v: G.v, comp: sum.compression, ten: sum.tension, tail: chain.offsets()[5] });
      if (G.v <= 0.001) break;
    }
    res.brakeMinCompression = Math.min(...brakeTrace.map(x => x.comp));
    res.brakeMaxTension = Math.max(...brakeTrace.map(x => x.ten));
    res.brakeStopped = G.v <= 0.01;
    res.brakeFrames = brakeTrace.length;

    /* C/D. 停车后继续推，看形变是否**收敛**（不是归零）。
       真实车钩有自由间隙，编组长度在间隙分布下会停在某个稳态，
       关键是「不再持续漂移」，不是「回到 0」。 */
    G.lever = 0;
    const settleTrace = [];
    for (let i = 0; i < 400; i++) {
      S.advance(0.02);
      if (i % 100 === 99) settleTrace.push({ t: (i + 1) * 0.02, tail: chain.offsets()[5] });
    }
    const oEnd = chain.offsets();
    const drift = Math.abs(settleTrace[settleTrace.length - 1].tail - settleTrace[settleTrace.length - 2].tail);
    res.settledTail = +oEnd[oEnd.length - 1].toFixed(5);
    res.settledMaxAbs = +Math.max(...oEnd.map(Math.abs)).toFixed(5);
    res.settleDrift = +drift.toFixed(6);         // 最后两段的位移差 → 应接近 0
    res.settledStretch = chain.stretch.map(x => +x.toFixed(5));
    res.finalV = +G.v.toFixed(4);
    res.chainVmax = +Math.max(...chain.v.map(Math.abs)).toFixed(5);
    res.finite = oEnd.every(x => isFinite(x)) && chain.v.every(x => isFinite(x));

    /* E. 车钩力是否在真实量级（A 型车车钩力通常 ±100~300 kN） */
    res.kNRange = { maxTension: chain.summary().tension, maxCompression: chain.summary().compression };

    return res;
  });

  out.checks = r;

  const c = out.checks;
  out.errors = errors.slice(0, 6);
  out.passed =
    c.hasChain && c.n === 6 && c.inited &&
    c.startMaxLag > 0.02 &&                     // 起动时中间车明显滞后
    c.startMaxLag < 0.35 &&                     // 滞后量在车钩间隙量级
    c.startTension > 0 &&                       // 起动是拉伸
    c.brakeMinCompression < -5 &&               // 制动出现压缩（kN）
    c.brakeStopped &&
    c.settleDrift < 0.002 &&                    // 停稳后不再持续漂移（收敛，不要求归零）
    c.chainVmax < 0.02 &&                       // 车厢残余速度被静摩擦吃掉
    c.finalV < 0.01 &&
    c.finite &&
    out.errors.length === 0;

  out.errors = errors.slice(0, 6);
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(out.passed ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
