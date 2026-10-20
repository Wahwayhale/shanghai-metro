/* ------------------------------------------------------------------
   P1-3 / P1-5 回归：AI 按图运行 + 正晚点显示 + 晚点曲线

   流程：4 号线 → ATO 跑若干站（同时 AI 按图运行）→
         统计 AI 到站偏差 → 检查 HUD 正晚点 → 打开 ATS 看偏差列 →
         结束值乘，检查结算页晚点曲线。

   退出码 0 = 通过。
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: launchArgs(),
    defaultViewport: { width: 1600, height: 900 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 180000 });
  await sleep(3000);

  /* 选 4 号线（full4：27 站，运行图 52 个车次） */
  const idx = await page.evaluate(() => window.__sim.routes.findIndex(r => r.id === 'full4'));
  if (idx < 0) throw new Error('找不到 full4 交路');
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await sleep(400);
  await page.evaluate(() => document.getElementById('startBtn').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('brGo').click());
  for (let k = 0; k < 2400; k++) {
    if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') break;
    await sleep(100);
  }

  /* 关闭随机故障与自动画质，保证确定性 */
  await page.evaluate(() => {
    const S = window.__sim;
    if (S.G.onboardOpen) S.onboardFinish();
    Math.random = () => 0.99;
    S.G.autoQuality = false;
    S.toggleATO(true);
  });

  const aiSched = await page.evaluate(() => window.__sim.G.aiSched || null);
  const ttStats = await page.evaluate(() => window.__sim.ttStats);

  /* 跑 900 s 仿真：AI 按图运行，玩家 ATO 正常办客 */
  const run = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    for (let i = 0; i < 900; i++) {
      S.advance(1);
      if (G.results.length >= 6) break;
    }
    const ais = S.aiTrains.map(a => ({
      carNo: a.carNo,
      bound: !!a.service,
      logged: a.arrLog.length,
      delays: a.arrLog.map(x => x.delay),
      lastDelay: a.delay
    }));
    return {
      simClock: Math.round(G.clock),
      playerStops: G.results.length,
      playerDepDelays: G.results.map(r => (r.depDelay == null ? null : Math.round(r.depDelay))),
      ais,
      minGap: (() => {
        let m = Infinity;
        for (const a of S.aiTrains) if (a.service) m = Math.min(m, a.s);
        return m === Infinity ? null : m;
      })()
    };
  });

  const boundAis = run.ais.filter(a => a.bound);
  const delays = boundAis.flatMap(a => a.delays).map(v => Math.abs(v));
  delays.sort((a, b) => a - b);
  const p95 = delays.length ? delays[Math.min(delays.length - 1, Math.floor(delays.length * 0.95))] : null;
  const maxAbs = delays.length ? Math.max(...delays) : null;

  /* HUD 正晚点：把时钟推后 50 s 制造晚点，读主 HUD 的读数 */
  const hud = await page.evaluate(() => {
    const S = window.__sim;
    S.G.clock += 50;
    S.advance(0.1);
    return {
      text: document.getElementById('hudPunc')?.textContent,
      cls: document.getElementById('hudPunc')?.className,
      clock: document.getElementById('hudTime')?.textContent
    };
  });

  /* ATS 面板：偏差列 */
  await page.evaluate(() => document.getElementById('atsBtn').click());
  await sleep(600);
  const ats = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.ats-row')].map(r => ({
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      dev: r.querySelector('.ats-dev')?.textContent || '',
      devCls: r.querySelector('.ats-dev')?.className || ''
    }));
    return { rows, subtitle: document.getElementById('atsSub')?.textContent };
  });
  await page.screenshot({ path: 'shots/p13_ats.png' });
  await page.evaluate(() => document.getElementById('atsClose').click());

  /* 结算页：结束值乘，检查晚点曲线画布 */
  const results = await page.evaluate(() => {
    const S = window.__sim;
    S.finishService();
    const cv = document.getElementById('resDelay');
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) painted++;
    return {
      mode: S.G.mode,
      stops: S.G.results.length,
      delays: S.G.results.map(r => (r.depDelay == null ? null : Math.round(r.depDelay))),
      painted
    };
  });
  await sleep(300);
  await page.screenshot({ path: 'shots/p15_results.png' });

  const passed =
    !!ttStats && ttStats.services > 0 &&
    aiSched && aiSched.bound >= 1 &&
    boundAis.length >= 1 && delays.length >= 5 &&
    p95 != null && p95 <= 8 &&
    hud.text && /正点|晚点|早点/.test(hud.text) &&
    ats.rows.length >= 2 && ats.rows.every(r => r.dev !== '') &&
    results.mode === 'results' && results.painted > 200 &&
    errors.length === 0;

  console.log(JSON.stringify({
    passed,
    ttStats, aiSched, simClock: run.simClock,
    ai: run.ais,
    aiArrivals: delays.length, aiP95: p95, aiMax: maxAbs,
    hud, ats: { subtitle: ats.subtitle, rows: ats.rows.slice(0, 3) },
    results: { mode: results.mode, stops: results.stops, delays: results.delays, painted: results.painted },
    errors: errors.slice(0, 6)
  }, null, 1));

  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
