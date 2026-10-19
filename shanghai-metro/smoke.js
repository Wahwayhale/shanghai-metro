/* ------------------------------------------------------------------
   冒烟回归：一次跑完最重要的三项
     1. 页面能加载，菜单 39 条交路全部渲染
     2. 能进入驾驶模式，__sim 调试接口可用
     3. ATO 全程跑通，停站有结果、控制台无报错
   用法：node smoke.js           （或 npm run smoke）
   退出码 0 = 通过，1 = 失败
   ------------------------------------------------------------------ */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME } = require('./testenv');

const EXPECT_ROUTES = 39;

async function waitMode(p, mode, sec) {
  for (let i = 0; i < sec; i++) {
    if (await p.evaluate(() => window.__sim && window.__sim.G.mode) === mode) return true;
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));

  const routes = await page.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    first: document.querySelector('.route-card .rc-title')?.innerText.split('\n')[0],
    sim: typeof window.__sim
  }));

  const started = await (async () => {
    await page.evaluate(() => document.querySelectorAll('.route-card')[0].click());
    await new Promise(r => setTimeout(r, 300));
    await page.click('#startBtn');
    await new Promise(r => setTimeout(r, 300));
    await page.click('#brGo');
    return waitMode(page, 'driving', 120);
  })();

  let run = null;
  if (started) {
    run = await page.evaluate(() => {
      const S = window.__sim, G = S.G;
      Math.random = () => 1;                 // 关掉随机故障，只验主链路
      S.toggleATO(true);
      for (let i = 0; i < 1500; i++) {
        S.advance(1);
        if (G.results.length >= 3) break;
      }
      return {
        line: S.line.name,
        stations: S.path.stations.length,
        stops: G.results.length,
        maxErr: G.results.length ? +Math.max(...G.results.map(r => Math.abs(r.err))).toFixed(2) : null,
        speed: +(G.v * 3.6).toFixed(1),
        target: G.targetIdx
      };
    });
  }

  const passed = routes.cards === EXPECT_ROUTES && routes.sim === 'object' && started &&
                 !!run && run.stops >= 1 && errors.length === 0;

  console.log(JSON.stringify({
    passed,
    routes,
    started,
    run,
    errors: errors.slice(0, 6)
  }, null, 1));

  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch(e => {
  console.error('FATAL', e.stack || e.message);
  process.exit(1);
});
