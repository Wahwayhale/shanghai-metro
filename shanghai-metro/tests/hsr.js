/* HSR main-scene regression: entry, state, panto/VCB interlock, no page errors. */
const puppeteer = require('puppeteer-core');
const { PAGE_URL, CHROME } = require('./testenv');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.click('#hsrPreviewBtn');
  await new Promise(r => setTimeout(r, 2200));

  const info = await page.evaluate(() => ({
    mode: window.__sim && window.__sim.G && window.__sim.G.mode,
    hsr: !!window.__hsrMain,
    stations: (window.__sim && window.__sim.G && window.__sim.G.hsr && window.__sim.G.hsr.stops.length + 1) || 0,
    sys: (document.getElementById('hmSys') || {}).textContent || '',
    door: (document.getElementById('hmDoor') || {}).textContent || '',
    speed: (document.getElementById('hmSpeed') || {}).textContent || ''
  }));
  const fail = [];
  if (info.mode !== 'hsr') fail.push('mode != hsr: ' + info.mode);
  if (!info.hsr) fail.push('__hsrMain missing');
  if (info.stations < 3) fail.push('stop count ' + info.stations);
  if (!/受电弓/.test(info.sys)) fail.push('panto HUD missing');
  if (!/车门/.test(info.door)) fail.push('door HUD missing');
  if (info.speed !== '0') fail.push('initial speed ' + info.speed);

  await page.click('#hmPanto');
  await new Promise(r => setTimeout(r, 1000));
  const down = await page.evaluate(() => document.getElementById('hmSys').textContent);
  if (!/降/.test(down) || !/分/.test(down)) fail.push('panto-down interlock: ' + down);
  await page.click('#hmPanto');
  await new Promise(r => setTimeout(r, 1000));
  const up = await page.evaluate(() => document.getElementById('hmSys').textContent);
  if (!/升/.test(up) || !/分/.test(up)) fail.push('panto-up should leave VCB open: ' + up);
  await page.click('#hmVcb');
  await new Promise(r => setTimeout(r, 1000));
  const closed = await page.evaluate(() => document.getElementById('hmSys').textContent);
  if (!/升/.test(closed) || !/合/.test(closed)) fail.push('VCB close after panto up: ' + closed);

  await page.keyboard.down('w');
  await new Promise(r => setTimeout(r, 1600));
  await page.keyboard.up('w');
  const moving = await page.evaluate(() => window.__sim.G.hsr.v);
  if (!(moving > 0.05)) fail.push('traction did not move train: v=' + moving);

  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.up('Space');
  const stopped = await page.evaluate(() => ({ v: window.__sim.G.hsr.v, state: document.getElementById('hmState').textContent }));
  if (stopped.v > 0.05) fail.push('emergency brake did not stop: v=' + stopped.v);

  await page.evaluate(() => {
    const st = window.__sim.G.hsr;
    st.stopped = true; st.v = 0; st.stopErr = 0; st.doorT = 1;
  });
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.down('w');
  await new Promise(r => setTimeout(r, 900));
  await page.keyboard.up('w');
  const doorState = await page.evaluate(() => ({ v: window.__sim.G.hsr.v, idx: window.__sim.G.hsr.stopIdx, stopped: window.__sim.G.hsr.stopped }));
  if (doorState.v > 0.05 || doorState.idx !== 0) fail.push('door interlock failed: ' + JSON.stringify(doorState));
  await page.click('#hmDepart');
  await new Promise(r => setTimeout(r, 700));
  const afterDepart = await page.evaluate(() => ({ idx: window.__sim.G.hsr.stopIdx, stopped: window.__sim.G.hsr.stopped }));
  if (afterDepart.idx !== 1 || afterDepart.stopped) fail.push('depart failed: ' + JSON.stringify(afterDepart));

  await page.screenshot({ path: 'shots/hsr-regression.png' }).catch(() => {});
  console.log(JSON.stringify({ ok: fail.length === 0 && errors.length === 0, info, pantoDown: down, pantoUp: up, fail, errors: errors.slice(0, 4) }, null, 1));
  await browser.close();
  process.exit(fail.length === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
