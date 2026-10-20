/* ------------------------------------------------------------------
   P4 产品化回归：新手引导 / 触屏手柄

   移动端横屏（844×390，触摸）：
   1. 首次进驾驶出现 3 步引导，走完后写入 sm_onboarded
   2. 触屏手柄出现，桌面手柄栏隐藏
   3. 触屏开门/拖手柄/ATO 均能驱动列车
   4. ATO 能完成一次停站；停稳后触屏开门

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
    defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 180000 });
  await sleep(3000);
  const idx = await page.evaluate(() => window.__sim.routes.findIndex(r => r.id === 'fullCF'));
  await page.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await sleep(300);
  await page.evaluate(() => {
    window.__sim.G.sessionSeed = 424242;
    document.querySelector('#modeGroup button[data-v="single"]').click();
    document.getElementById('startBtn').click();
  });
  await sleep(300);
  await page.evaluate(() => document.getElementById('brGo').click());
  if (!await waitDriving(page)) throw new Error('未进入驾驶模式');

  /* ---- 1. 首次引导 ---- */
  const guide1 = await page.evaluate(() => ({
    visible: !document.getElementById('onboard').classList.contains('hidden'),
    title: document.getElementById('obTitle').textContent,
    dots: [...document.querySelectorAll('#obDots i')].filter(x => x.classList.contains('on')).length,
    touch: document.body.classList.contains('touch-mode'),
    touchPad: getComputedStyle(document.getElementById('touch')).display,
    bottomHidden: getComputedStyle(document.querySelector('.hud-bottom')).display
  }));
  await page.evaluate(() => { document.getElementById('obNext').click(); document.getElementById('obNext').click(); });
  const guide2 = await page.evaluate(() => document.getElementById('obTitle').textContent);
  await page.evaluate(() => document.getElementById('obNext').click());
  const guide3 = await page.evaluate(() => ({
    hidden: document.getElementById('onboard').classList.contains('hidden'),
    saved: localStorage.getItem('sm_onboarded')
  }));

  /* ---- 2. 触屏操作 ---- */
  const touch = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    const track = document.getElementById('tTrack');
    const r = track.getBoundingClientRect();
    const ev = (type, x) => track.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: r.top + r.height / 2, bubbles: true, pointerId: 7, pointerType: 'touch'
    }));
    /* 先点开门按钮关门（初始门是开的） */
    document.getElementById('tDoor').click();
    const doorsClosed = !G.doorsOpen;
    /* 拖到 85% 位置 = 牵引 */
    ev('pointerdown', r.left + r.width * 0.5);
    ev('pointermove', r.left + r.width * 0.85);
    ev('pointerup', r.left + r.width * 0.85);
    const lever = G.lever;
    S.advance(7);            // 关门动画约 3 s，剩下 4 s 才真正施加牵引
    const v = G.v;
    /* ATO */
    document.getElementById('tAto').click();
    const ato = G.ato;
    return { doorsClosed, lever, v, ato, leverText: document.getElementById('tLeverTxt').textContent };
  });

  /* ---- 3. ATO 完成一次停站，再触屏开门 ---- */
  const stop = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    let arrived = false;
    for (let i = 0; i < 700; i++) {
      S.advance(1);
      if ((G.stopState === 'stop' || G.stopState === 'dwell') && G.targetIdx > 0) { arrived = true; break; }
    }
    const beforeOpen = { arrived, state: G.stopState, target: G.targetIdx, doors: G.doorsOpen };
    document.getElementById('tDoor').click();
    return {
      beforeOpen,
      doors: G.doorsOpen,
      speed: Math.round(G.v * 3.6),
      touchSpeed: document.getElementById('tSpeed').textContent,
      doorLabel: document.getElementById('tDoor').textContent,
      atoOn: document.getElementById('tAto').classList.contains('on')
    };
  });

  await sleep(500);
  await page.screenshot({ path: 'shots/p4_touch.png' });

  const passed =
    guide1.visible && /1 \/ 3/.test(guide1.title) && guide1.dots === 1 &&
    guide1.touch === true && guide1.touchPad === 'flex' && guide1.bottomHidden === 'none' &&
    /3 \/ 3/.test(guide2) &&
    guide3.hidden && guide3.saved === '1' &&
    touch.doorsClosed && touch.lever > 0.5 && touch.v > 0.5 && touch.ato === true &&
    stop.beforeOpen.arrived && stop.doors === true && stop.speed === 0 &&
    errors.length === 0;

  console.log(JSON.stringify({ passed, guide1, guide2, guide3, touch, stop, errors: errors.slice(0, 6) }, null, 1));
  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
