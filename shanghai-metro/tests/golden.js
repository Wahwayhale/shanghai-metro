/* ------------------------------------------------------------------
   金样回归：把当前数值行为冻结成基线，任何改动后逐字段对比。

   为什么需要它：smoke 只断言「菜单 39 卡 + 至少停 1 站 + 无报错」，
   regress_modules 断言的是结构量（站数、门数）。停站误差从 0.17 m
   变成 0.31 m 两者都能过。这个用例就是补那个漏洞。

   工作原理：
   - Math.random 打桩为常量，消除随机故障
   - 用固定步长 __sim.advance() 推进，不用真实时钟
   - 记录每站 {err, stopScore, punc, arrClock, depDelay} + 全程能耗/最高速度
   - 结果与 tests/golden/<route>.json 对比，容差 1e-3

   用法：
     node tests/golden.js            对比基线（CI 用）
     node tests/golden.js --update   重新生成基线（确认改动符合预期后）
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');

const GOLDEN_DIR = path.join(__dirname, 'golden');
const UPDATE = process.argv.includes('--update');
const TOL = 1e-3;

/* 三条代表性交路：全线单向 / 环线合成终到站 / 三开门第三轨 */
const CASES = [
  { id: 'full1', label: '1 号线全线', maxStops: 6 },
  { id: 'full4', label: '4 号线环线', maxStops: 6 },
  { id: 'full16', label: '16 号线', maxStops: 5 }
];

/* 比较两个数值数组，返回首个越界项 */
function diffNum(a, b, key) {
  if (typeof a !== 'number' || typeof b !== 'number') {
    return a === b ? null : { key, golden: a, actual: b };
  }
  if (Math.abs(a - b) > TOL) return { key, golden: a, actual: b, delta: +(b - a).toFixed(6) };
  return null;
}

function compare(golden, actual) {
  const diffs = [];
  for (const k of ['stops', 'maxErr', 'avgStopScore', 'energy', 'vMax']) {
    const d = diffNum(golden[k], actual[k], k);
    if (d) diffs.push(d);
  }
  const n = Math.max(golden.results.length, actual.results.length);
  for (let i = 0; i < n; i++) {
    const g = golden.results[i], a = actual.results[i];
    if (!g) { diffs.push({ key: `results[${i}]`, golden: null, actual: a.zh }); continue; }
    if (!a) { diffs.push({ key: `results[${i}]`, golden: g.zh, actual: null }); continue; }
    if (g.zh !== a.zh) { diffs.push({ key: `results[${i}].zh`, golden: g.zh, actual: a.zh }); continue; }
    for (const k of ['err', 'stopScore', 'arrT']) {
      const d = diffNum(g[k], a[k], `results[${i}].${k} (${g.zh})`);
      if (d) diffs.push(d);
    }
  }
  return diffs;
}

(async () => {
  if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: launchArgs(),
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const report = { passed: true, cases: [] };

  for (const c of CASES) {
    await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
    await wait(2200);

    const idx = await page.evaluate(id => window.__sim.routes.findIndex(r => r.id === id), c.id);
    if (idx < 0) {
      report.cases.push({ id: c.id, label: c.label, skipped: '未找到该交路' });
      report.passed = false;
      continue;
    }

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
    if (!ok) {
      report.cases.push({ id: c.id, label: c.label, skipped: '未能进入驾驶模式' });
      report.passed = false;
      continue;
    }

    const actual = await page.evaluate(async (maxStops) => {
      const S = window.__sim, G = S.G;
      Math.random = () => 1;                       // 消除随机故障

      /* 冻结 rAF 主循环：否则真实帧的 dt 会并发写入 G.clock 与物理状态，
         造成 arrClock 每次跑都差几毫秒，基线永远对不上。
         冻结后只有 __sim.advance() 以固定步长推进，结果完全确定。 */
      window.requestAnimationFrame = () => 0;
      await new Promise(r => setTimeout(r, 120));  // 等已排队的那一帧执行完

      /* 冻结前难免已跑了几帧真实 dt，给 G.clock 一个随机偏移。
         resetService() 里值乘开始时刻的确定值是 path.startSec - 30，
         这里归一回该值——G.clock 只影响计时与时刻表、不参与物理，
         归一后所有时间量完全确定，物理行为不受影响。 */
      const t0 = S.path.startSec - 30;
      G.clock = t0;
      if (G.onboardOpen) S.onboardFinish();         // 新手引导（P4-2）

      S.toggleATO(true);                            // ATO 全程
      let vMax = 0;
      for (let i = 0; i < 3000; i++) {
        S.advance(1);
        vMax = Math.max(vMax, G.v * 3.6);
        if (G.results.length >= maxStops) break;
      }
      const rs = G.results;
      return {
        stops: rs.length,
        results: rs.map(r => ({
          zh: r.zh,
          err: +r.err.toFixed(4),
          stopScore: +r.stopScore.toFixed(4),
          arrT: +(r.arrClock - t0).toFixed(3),      // 相对值乘开始，消除初始帧差
          depDelay: r.depDelay === undefined ? null : +r.depDelay.toFixed(3)
        })),
        maxErr: rs.length ? +Math.max(...rs.map(r => Math.abs(r.err))).toFixed(4) : null,
        avgStopScore: rs.length ? +(rs.reduce((a, r) => a + r.stopScore, 0) / rs.length).toFixed(4) : null,
        energy: +G.energy.toFixed(3),
        vMax: +vMax.toFixed(2)
      };
    }, c.maxStops);

    const file = path.join(GOLDEN_DIR, c.id + '.json');
    if (UPDATE || !fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(actual, null, 2), 'utf8');
      report.cases.push({ id: c.id, label: c.label, written: true, stops: actual.stops, maxErr: actual.maxErr });
    } else {
      const golden = JSON.parse(fs.readFileSync(file, 'utf8'));
      const diffs = compare(golden, actual);
      report.cases.push({
        id: c.id, label: c.label, ok: diffs.length === 0,
        stops: actual.stops, maxErr: actual.maxErr,
        diffs: diffs.slice(0, 6)
      });
      if (diffs.length) report.passed = false;
    }
  }

  if (errors.length) { report.passed = false; }
  report.errors = errors.slice(0, 6);

  console.log(JSON.stringify(report, null, 1));
  await browser.close();
  process.exit(report.passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
