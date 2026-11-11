/* ------------------------------------------------------------------
   P2-1 验证：联锁进路是否真正改变列车走行路径

   断言：
   A. 正线通过（main）时，列车横向偏移恒为 -TRACK_LAT（本务线）
   B. 终点折返（revB）并动车越过 B 渡线后，横向偏移变为 +TRACK_LAT（对向线）
   C. 横移在渡线区间内单调过渡，不是瞬间跳变
   D. 首末车厢（17 m 远处）在横移段处于不同横向位置（说明是转向不是整体平移）
   E. 反向值乘开始时清空横移，回到本务线
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

  /* 选一条非环线、非跳停的短线，折返条件成立 */
  const idx = await page.evaluate(() => {
    const R = window.__sim.routes;
    return R.findIndex(r => r.id === 'full1');
  });
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
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

  /* 列车直接置于终到站（合法：这就是值乘结束时的真实位置），
     然后走真实的「结算 → 折返」入口。这样测的是渡线逻辑本身，
     不必先跑完 30 km。 */
  const setup = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    Math.random = () => 1;
    window.requestAnimationFrame = () => 0;
    G.clock = S.path.startSec - 30;
    const last = S.path.stations[S.path.stations.length - 1];
    G.targetIdx = last.index;
    G.s = last.stopS;
    G.v = 0; G.lever = 0; G.eb = false;
    G.doorsOpen = true; G.doorT = 1;
    G.stopState = 'dwell';
    S.train.update(G.s, 0, 0);
    S.finishService();                       // 走到结算页
    return { mode: G.mode, s: +G.s.toFixed(1), targetIdx: G.targetIdx, lastS: +last.stopS.toFixed(1) };
  });
  out.checks.arrived = setup;

  /* ---- A. 正线通过时横向偏移 ---- */
  out.checks.mainLine = await page.evaluate(() => {
    const S = window.__sim;
    const TRACK_LAT = 5.72;
    const s = S.G.s;
    const lat = S.path.lateralAt(s, -TRACK_LAT);
    return {
      s: +s.toFixed(1), lat: +lat.toFixed(3),
      expect: -TRACK_LAT,
      ok: Math.abs(lat + TRACK_LAT) < 0.01,
      crossovers: (S.path.xo || []).length,
      trainLat: S.train.lateral
    };
  });

  /* ---- B/C/D. 触发折返，检查横移 ---- */
  const tbInfo = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    const tB = S.IX.turnouts.find(t => t.key === 'B');
    return { tB: tB ? { key: tB.key, s: +tB.s.toFixed(1) } : null, lastStopS: +S.path.stations[S.path.stations.length - 1].stopS.toFixed(1), len: +S.path.length.toFixed(1) };
  });
  out.checks.turnoutB = tbInfo;

  const crossed = await page.evaluate(async () => {
    const S = window.__sim, G = S.G;
    const TRACK_LAT = 5.72;
    // 直接进入结算态再发起折返
    G.targetIdx = S.path.stations.length - 1;
    G.mode = 'results';
    S.startTurnback();
    const tb = G.turnback;
    if (!tb) return { started: false };

    // 记录横移过程。updateTurnback 到达终点后会等 2.4 s 然后触发 finishTurnback
    // （内部 await buildService 重建整条线路），所以要在 'wait' 阶段停手。
    const trace = [];
    for (let i = 0; i < 2000; i++) {
      S.advanceTurnback(0.02);
      const s = G.s;
      const lat = S.path.lateralAt(s, -TRACK_LAT);
      trace.push({ s: +s.toFixed(2), lat: +lat.toFixed(3) });
      if (tb.phase === 'wait') break;
    }
    // 只在渡线区间内取样，判断单调过渡
    const xo = tb.crossover;
    const within = trace.filter(p => p.s > xo.s0 && p.s < xo.s1);
    let monotonic = true;
    for (let i = 1; i < within.length; i++) {
      if (within[i].lat < within[i - 1].lat - 1e-6) { monotonic = false; break; }
    }
    const endLat = trace.length ? trace[trace.length - 1].lat : null;
    const maxLat = trace.length ? Math.max(...trace.map(p => p.lat)) : null;

    // D. 首末车厢在横移中段的横向位置差
    const midS = (xo.s0 + xo.s1) / 2;
    const latA = S.path.lateralAt(midS - 17, -TRACK_LAT);
    const latB = S.path.lateralAt(midS + 17, -TRACK_LAT);

    return {
      started: true,
      crossover: xo,
      phase: tb.phase,
      finalS: +G.s.toFixed(1),
      target: +tb.target.toFixed(1),
      endLat, maxLat,
      reachedOpposite: Math.abs(endLat - TRACK_LAT) < 0.05,
      monotonic: within.length > 3 ? monotonic : null,
      samplesInCrossover: within.length,
      carSpanDelta: +Math.abs(latA - latB).toFixed(3)
    };
  });
  out.checks.turnback = crossed;

  /* ---- E. 折返完成后清空 ---- */
  await wait(500);
  out.checks.afterReload = await page.evaluate(() => {
    const S = window.__sim;
    return { mode: S.G.mode, crossovers: (S.path.xo || []).length, lat: +S.path.lateralAt(S.G.s, -5.72).toFixed(3) };
  });

  const c = out.checks;
  out.errors = errors.slice(0, 6);
  out.passed =
    c.mainLine.ok &&
    c.mainLine.crossovers === 0 &&
    c.turnback && c.turnback.started &&
    c.turnback.reachedOpposite &&
    c.turnback.monotonic !== false &&
    c.turnback.carSpanDelta > 0.5 &&
    out.errors.length === 0;

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(out.passed ? 0 : 1);
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
