/* ------------------------------------------------------------------
   运营日浏览器回归（P2-1 / P2-2 / P2-3 / P2-4）

   用磁浮线（2 站，单段约 5 分钟）跑完整流程：
   1. 开运营日 → 时段编排与种子可复现
   2. 事件时间轴：故障 / 大客流 / 临时限速 / 调度指令
   3. 第 1 段结束 → 段间交接 → 第 2 段反向
   4. 中途保存 → 刷新 → 继续运营日
   5. 第 2 段结束 → 运营日结算（逐段对账 + 存档清理）

   退出码 0 = 通过。
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME, launchArgs } = require('./testenv');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitDriving(p) {
  for (let k = 0; k < 2400; k++) {
    if (await p.evaluate(() => window.__sim && window.__sim.G.mode) === 'driving') return true;
    await sleep(100);
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: launchArgs(),
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 180000 });
  await sleep(3000);
  const idx = await page.evaluate(() => window.__sim.routes.findIndex(r => r.id === 'fullCF'));
  if (idx < 0) throw new Error('找不到 fullCF 交路');
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await sleep(400);
  await page.evaluate(() => document.getElementById('startBtn').click());
  await sleep(400);
  await page.evaluate(() => {
    window.__sim.G.sessionSeed = 424242;
    window.__sim.G.sessionMinutes = 10;     // 短运营日：2 段即可跑完
    document.querySelector('#modeGroup button[data-v="day"]').click();
    document.getElementById('brGo').click();
  });
  if (!await waitDriving(page)) throw new Error('未能进入驾驶模式');

  /* ---- 1. 时段编排 / 种子可复现 ---- */
  const start = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    const svc = S.playerService;
    const legSeconds = Math.max(180, Math.round(svc.endSec - svc.startSec));
    const exp = S.buildSessionPlan({
      seed: 424242, diff: G.diff, legSeconds,
      reverseAllowed: !(S.routeDef.loop || S.routeDef.stopPlan),
      targetSec: 600
    });
    return {
      playMode: G.playMode,
      hud: document.getElementById('hudDuty').textContent,
      legCount: G.session.legCount,
      legSeconds,
      events: G.session.plan.events.length,
      sameSeed: JSON.stringify(exp.events) === JSON.stringify(G.session.plan.events),
      seed: G.session.seed,
      phase: G.session.phase
    };
  });

  /* ---- 2. 事件时间轴四类事件 ---- */
  const events = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    const s = G.session;
    const keepEvents = s.events, keepCursor = s.cursor;
    const fire = (ev, sec) => {
      s.events = [Object.assign({ id: 'test', legIndex: s.legIndex, atSec: 0 }, ev, { at: G.clock + 0.5 })];
      s.cursor = 0;
      S.advance(sec);
    };
    /* 故障 */
    G.fault = null;
    fire({ kind: 'fault', faultType: 'traction', faultName: '牵引逆变器' }, 1.5);
    const fault = G.fault && { type: G.fault.type, name: G.fault.name };
    G.fault = null; G.sigMode = 'cbtc';
    /* 临时限速 */
    fire({ kind: 'slowzone', limit: 35, duration: 60 }, 1.5);
    const slow = G.slowzone ? { limit: G.slowzone.limit, effective: G.limit } : null;
    G.slowzone = null;
    /* 大客流 */
    const so = S.stationObjs[0];
    const before = so && so.crowd ? so.crowd.waitingCount : -1;
    fire({ kind: 'crowd', surge: 12 }, 1.5);
    const crowd = {
      before,
      after: so && so.crowd ? so.crowd.waitingCount : -1,
      counted: s.legCrowds,
      station: s.crowdStation
    };
    /* 调度指令 */
    fire({ kind: 'dispatch', text: '测试：注意前方区间' }, 1.5);
    const dispatch = s.dispatch.length;
    /* 还原时间轴 */
    s.events = keepEvents; s.cursor = keepCursor;
    return { fault, slow, crowd, dispatch };
  });

  /* ---- 3. 第一段跑完 → 段间交接 ---- */
  const leg1 = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    if (G.onboardOpen) S.onboardFinish();
    Math.random = () => 0.99;
    G.autoQuality = false;
    if (G.onboardOpen) S.onboardFinish();
    S.toggleATO(true);
    let faultsSeen = 0;
    for (let i = 0; i < 2000; i++) {
      S.advance(1);
      /* 模拟司机处置：故障一出现就按 L（否则牵引/制动锁定会让 ATO 停在区间） */
      if (G.fault) { faultsSeen++; S.clearFault(); }
      if (G.mode === 'results') break;
    }
    return {
      mode: G.mode,
      faultsSeen,
      phase: G.session.phase,
      log: G.session.log.length,
      title: document.getElementById('resTitle').textContent,
      sessText: document.getElementById('resSession').innerText.replace(/\s+/g, ' ').slice(0, 220),
      nextLabel: document.getElementById('resReverse').textContent,
      menuLabel: document.getElementById('resMenu').textContent,
      clock: Math.round(G.clock)
    };
  });
  await page.screenshot({ path: 'shots/p2_intermission.png' });

  await page.evaluate(() => document.getElementById('resReverse').click());
  if (!await waitDriving(page)) throw new Error('交班后未进入驾驶');
  await sleep(600);
  const leg2 = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    return {
      reverse: G.reverse,
      legIndex: G.session.legIndex,
      hud: document.getElementById('hudDuty').textContent,
      clock: Math.round(G.clock),
      start: S.path.startSec,
      first: S.path.stations[0].zh
    };
  });

  /* ---- 4. 中途保存 / 继续 ---- */
  const saved = await page.evaluate(() => {
    const S = window.__sim;
    S.sessionSave(true);
    const raw = localStorage.getItem('sm_session');
    return { has: !!raw, clock: Math.round(S.G.clock), s: Math.round(S.G.s), leg: S.G.session.legIndex };
  });
  await page.reload({ waitUntil: 'load' });
  await sleep(3500);
  const prompt = await page.evaluate(() => {
    const b = document.getElementById('resumeDay');
    return { visible: b && !b.classList.contains('hidden'), text: b ? b.innerText.replace(/\s+/g, ' ') : '' };
  });
  let restored = null;
  if (prompt.visible) {
    await page.evaluate(() => document.getElementById('resumeDay').click());
    if (!await waitDriving(page)) throw new Error('继续运营日失败');
    await sleep(600);
    restored = await page.evaluate(() => {
      const S = window.__sim, G = S.G;
      return {
        clock: Math.round(G.clock), s: Math.round(G.s),
        leg: G.session.legIndex, phase: G.session.phase,
        hud: document.getElementById('hudDuty').textContent
      };
    });
  }

  /* ---- 5. 第二段跑完 → 运营日结算 ---- */
  const final = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.autoQuality = false;
    S.toggleATO(true);
    let faultsSeen = 0;
    for (let i = 0; i < 2000; i++) {
      S.advance(1);
      if (G.fault) { faultsSeen++; S.clearFault(); }
      if (G.mode === 'results') break;
    }
    return {
      mode: G.mode,
      faultsSeen,
      phase: G.session.phase,
      legs: G.session.log.length,
      title: document.getElementById('resTitle').textContent,
      grade: document.getElementById('resGrade').textContent,
      score: document.getElementById('resScore').textContent,
      punc: document.getElementById('resPunc').textContent,
      sessText: document.getElementById('resSession').innerText.replace(/\s+/g, ' ').slice(0, 320),
      saveCleared: !localStorage.getItem('sm_session'),
      sessions: document.querySelectorAll('#resSession .sess-leg').length
    };
  });
  await page.screenshot({ path: 'shots/p2_final.png' });

  const passed =
    start.playMode === 'day' && /运营日 1\//.test(start.hud) &&
    start.legCount >= 2 && start.sameSeed &&
    events.fault && events.fault.type === 'traction' &&
    events.slow && events.slow.limit === 35 && events.slow.effective <= 35 &&
    events.crowd && events.crowd.after > events.crowd.before && events.crowd.counted >= 1 &&
    events.dispatch >= 1 &&
    leg1.mode === 'results' && leg1.phase === 'intermission' && leg1.log === 1 &&
    /第 1 段完成/.test(leg1.title) && /开始下一段/.test(leg1.nextLabel) &&
    leg2.reverse === true && leg2.legIndex === 1 && /运营日 2\//.test(leg2.hud) &&
    saved.has && prompt.visible && restored &&
    Math.abs(restored.clock - saved.clock) <= 2 && Math.abs(restored.s - saved.s) <= 2 &&
    restored.leg === saved.leg &&
    final.mode === 'results' && final.phase === 'done' && final.legs === 2 &&
    /运营日结算/.test(final.title) && final.saveCleared &&
    final.sessions === 3 && // 表头 + 2 段
    errors.length === 0;

  console.log(JSON.stringify({
    passed, start, events, leg1, leg2, saved, prompt, restored, final,
    errors: errors.slice(0, 6)
  }, null, 1));

  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
