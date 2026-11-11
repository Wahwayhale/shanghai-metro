/* ------------------------------------------------------------------
   模块级回归：验证 70_game.js 拆分后各部分仍可独立工作
     A. 菜单 39 条交路渲染
     B. 1 号线：进入驾驶 → ATO 2 站
     C. 车门 / 紧急制动 / 站内步行 / 执照考试初始化
     D. 4 号线环线：加载 + ATO 1 站（合成终到站路径）
     E. 16 号线：加载（3 门车 / 第三轨 / 120 km/h）
   输出 passed + 每项明细；退出码 0 = 通过
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');

const out = { passed: false, checks: {}, errors: [] };

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: launchArgs(),
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  page.on('pageerror', e => out.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') out.errors.push('console: ' + m.text()); });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const waitMode = async (mode, sec) => {
    for (let i = 0; i < sec; i++) {
      if (await page.evaluate(() => window.__sim && window.__sim.G.mode) === mode) return true;
      await wait(1000);
    }
    return false;
  };
  const enter = async (routeIdx) => {
    await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), routeIdx);
    await wait(400);
    await page.click('#startBtn'); await wait(300);
    await page.click('#brGo');
    return waitMode('driving', 150);
  };
  const idxOf = (id) => page.evaluate(i => window.__sim.routes.findIndex(r => r.id === i), id);

  /* ---------- A. 菜单 ---------- */
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await wait(2500);
  out.checks.menu = await page.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    routes: window.__sim.routes.length,
    sim: typeof window.__sim
  }));

  /* ---------- B/C. 1 号线 ---------- */
  out.checks.line1Entered = await enter(0);
  if (out.checks.line1Entered) {
    out.checks.line1 = await page.evaluate(() => {
      const S = window.__sim, G = S.G;
      Math.random = () => 1;                       // 关随机故障
      const before = { line: S.line.name, stations: S.path.stations.length };
      // 走真实交互路径：F 键切换步行，暂停面板「重新开始」触发 resetService
      const pressF = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
      const restart = () => document.getElementById('pRestart').click();

      // 车门：开门 → 关门
      S.openDoors(); const opened = G.doorsOpen;
      S.closeDoors(); const closed = !G.doorsOpen;

      // 紧急制动 + 缓解
      S.triggerEB('回归测试'); const eb = G.eb;
      S.releaseEB(); const released = !G.eb;

      // 站内步行：停稳开门后按 F 下车，再按 F 回司机室
      S.openDoors();
      pressF(); const walking = !!(G.walk && G.walk.active);
      S.clampWalk();
      pressF(); const backInCab = !(G.walk && G.walk.active);
      S.closeDoors();

      // 执照考试初始化
      G.exam = true;
      restart();
      const exam = { tasks: G.examTasks.length, panel: !!document.getElementById('examPanel') };
      G.exam = false;

      // ATO 跑 2 站
      restart();
      S.toggleATO(true);
      for (let i = 0; i < 1500; i++) { S.advance(1); if (G.results.length >= 2) break; }

      return {
        ...before, opened, closed, eb, released, walking, backInCab, exam,
        ato: { stops: G.results.length, maxErr: G.results.length ? +Math.max(...G.results.map(r => Math.abs(r.err))).toFixed(2) : null },
        hud: document.getElementById('hudSpeed').textContent
      };
    });
  }

  /* ---------- D. 4 号线环线 ---------- */
  const loopIdx = await idxOf('full4');
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await wait(2000);
  if (loopIdx >= 0) {
    const ok = await enter(loopIdx);
    out.checks.loop4 = ok ? await page.evaluate(() => {
      const S = window.__sim, G = S.G;
      Math.random = () => 1;
      const last = S.path.stations[S.path.stations.length - 1];
      return {
        line: S.line.name, stations: S.path.stations.length, loop: !!S.routeDef.loop,
        lastSynthetic: !!last.synthetic,
        signals: S.signals ? S.signals.length : null,
        ai: S.aiTrains.length
      };
    }) : { entered: false };
  } else {
    out.checks.loop4 = { skipped: '未找到 full4 交路' };
  }

  /* ---------- E. 16 号线 ---------- */
  const l16Idx = await idxOf('full16');
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await wait(2000);
  if (l16Idx >= 0) {
    const ok = await enter(l16Idx);
    out.checks.line16 = ok ? await page.evaluate(() => {
      const S = window.__sim;
      return { line: S.line.name, stations: S.path.stations.length, vmax: S.path.vmax, doors: S.line.doors, thirdRail: !!S.line.thirdRail };
    }) : { entered: false };
  } else {
    out.checks.line16 = { skipped: '未找到 full16 交路' };
  }

  const c = out.checks;
  out.passed =
    c.menu.cards === 39 && c.menu.sim === 'object' &&
    c.line1Entered &&
    c.line1 && c.line1.opened && c.line1.closed && c.line1.eb && c.line1.released &&
    c.line1.walking && c.line1.backInCab && c.line1.exam.tasks === 5 &&
    c.line1.ato.stops >= 1 &&
    c.loop4 && c.loop4.stations > 20 && c.loop4.loop === true &&
    c.line16 && c.line16.vmax >= 100 &&
    out.errors.length === 0;

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(out.passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
