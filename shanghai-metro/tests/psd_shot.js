/* 屏蔽门近景：验证高度、开/关状态灯、门楣 */
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lineKey = process.argv[2] || '3号线';
const out = process.argv[3] || 'psd_close';
const openState = process.argv[4] !== 'closed';

(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'], defaultViewport: { width: 1280, height: 720 } });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 90000 });
  await sleep(2000);
  await p.evaluate(k => { const c = [...document.querySelectorAll('.route-card')].find(c => c.textContent.includes(k)); if (c) c.click(); }, lineKey);
  await sleep(400); await p.click('#startBtn'); await sleep(400); await p.click('#brGo');
  for (let i = 0; i < 90; i++) { await sleep(1200); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await sleep(1200);
  await p.evaluate((op) => {
    const S = window.__sim;
    if (S.G.onboardOpen) S.onboardFinish();
    const idx = 0, st = S.path.stations[idx];
    S.G.s = st.stopS; S.G.targetIdx = idx; S.G.stopState = op ? 'dwell' : 'stop';
    S.G.doorsOpen = op; S.G.doorT = op ? 1 : 0;
    const so0 = S.stationObjs[idx]; if (so0 && so0.psdL) so0.psdL.setOpen(op ? 1 : 0);
    S.snapTrain();
    const V = S.camera.position.constructor;
    const g = S.stationObjs[idx].group; g.updateMatrixWorld(true);
    /* 站在站台上，斜看屏蔽门：能看到门扇、门楣、门顶状态灯 */
    const pos = g.localToWorld(new V(-2.3, 1.9, -13));
    const look = g.localToWorld(new V(-4.1, 2.4, 3));
    S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], 62);
  }, openState);
  await sleep(2600);
  await p.screenshot({ path: base + '/shanghai-metro/shots/' + out + '.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
