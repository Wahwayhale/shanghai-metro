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
    stations: (window.HSR_DATA && window.HSR_DATA.STATIONS && window.HSR_DATA.STATIONS.length) || 0,
    run: (window.HSR_DATA && window.HSR_DATA.RUN) || 0,
    segments: (window.HSR_DATA && window.HSR_DATA.SEGMENTS && window.HSR_DATA.SEGMENTS.length) || 0,
    limits: (window.HSR_DATA && window.HSR_DATA.BASE_LIMITS && window.HSR_DATA.BASE_LIMITS.length) || 0,
    sys: (document.getElementById('hmSys') || {}).textContent || '',
    door: (document.getElementById('hmDoor') || {}).textContent || '',
    speed: (document.getElementById('hmSpeed') || {}).textContent || '',
    sched: (document.getElementById('hmSched') || {}).textContent || '',
    punc: (document.getElementById('hmPunc') || {}).textContent || ''
  }));
  const fail = [];
  if (info.mode !== 'hsr') fail.push('mode != hsr: ' + info.mode);
  if (!info.hsr) fail.push('__hsrMain missing');
  if (info.stations !== 23) fail.push('station count ' + info.stations);
  if (info.run !== 1302000) fail.push('RUN ' + info.run);
  if (info.segments < 6) fail.push('segments ' + info.segments);
  if (info.limits < 4) fail.push('limits ' + info.limits);
  if (!/受电弓/.test(info.sys)) fail.push('panto HUD missing');
  if (!/车门/.test(info.door)) fail.push('door HUD missing');
  if (info.speed !== '0') fail.push('initial speed ' + info.speed);
  if (!/计划 20:14/.test(info.sched)) fail.push('schedule HUD: ' + info.sched);
  if (!/正晚点/.test(info.punc)) fail.push('punctuality HUD: ' + info.punc);

  await page.keyboard.press('F1');
  await new Promise(r => setTimeout(r, 300));
  const helpOpen = await page.evaluate(() => !document.getElementById('hsrHelp').classList.contains('hidden'));
  if (!helpOpen) fail.push('F1 help did not open');
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 300));
  const helpClosed = await page.evaluate(() => ({ hidden: document.getElementById('hsrHelp').classList.contains('hidden'), mode: window.__sim.G.mode }));
  if (!helpClosed.hidden) fail.push('Esc did not close help');
  if (helpClosed.mode !== 'hsr') fail.push('Esc exited HSR while closing help: ' + helpClosed.mode);

  const wiperPos = await page.evaluate(() => {
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, sw = window.__sim.G.hsr.cabGroup.userData.wiperSwitch;
    const v = new T.Vector3(); sw.getWorldPosition(v); v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.click(wiperPos.x, wiperPos.y);
  await new Promise(r => setTimeout(r, 300));
  const wiperOff = await page.evaluate(() => window.__sim.G.hsr.wipersOn);
  if (wiperOff !== false) fail.push('wiper switch off failed: ' + wiperOff);
  await page.mouse.click(wiperPos.x, wiperPos.y);
  await new Promise(r => setTimeout(r, 300));
  const wiperOn = await page.evaluate(() => window.__sim.G.hsr.wipersOn);
  if (wiperOn !== true) fail.push('wiper switch on failed: ' + wiperOn);

  const lightPos = await page.evaluate(() => {
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, sw = window.__sim.G.hsr.cabGroup.userData.lightSwitch;
    const v = new T.Vector3(); sw.getWorldPosition(v); v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.click(lightPos.x, lightPos.y);
  await new Promise(r => setTimeout(r, 300));
  const lightOff = await page.evaluate(() => window.__sim.G.hsr.cabGroup.userData.cabLamp.intensity);
  if (lightOff !== 0) fail.push('light switch off failed: ' + lightOff);
  await page.mouse.click(lightPos.x, lightPos.y);
  await new Promise(r => setTimeout(r, 300));
  const lightOn = await page.evaluate(() => window.__sim.G.hsr.cabGroup.userData.cabLamp.intensity);
  if (lightOn < 0.5) fail.push('light switch on failed: ' + lightOn);

  const dirPos = await page.evaluate(() => {
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, kn = window.__sim.G.hsr.cabGroup.userData.dirKnob;
    const v = new T.Vector3(); kn.getWorldPosition(v); v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.click(dirPos.x, dirPos.y);
  await new Promise(r => setTimeout(r, 300));
  const dir0 = await page.evaluate(() => window.__sim.G.hsr.dir);
  if (dir0 !== 0) fail.push('direction not 0: ' + dir0);
  await page.mouse.click(dirPos.x, dirPos.y);
  await new Promise(r => setTimeout(r, 300));
  const dir1 = await page.evaluate(() => window.__sim.G.hsr.dir);
  if (dir1 !== 1) fail.push('direction not restored: ' + dir1);

  const ebPos = await page.evaluate(() => {
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, btn = window.__sim.G.hsr.cabGroup.userData.ebButton;
    const v = new T.Vector3(); btn.getWorldPosition(v); v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(ebPos.x, ebPos.y); await page.mouse.down(); await new Promise(r => setTimeout(r, 400));
  const ebDown = await page.evaluate(() => window.__sim.G.hsr.touchEb);
  await page.mouse.up();
  if (ebDown !== 1) fail.push('3D EB not pressed: ' + ebDown);

  const levPos = await page.evaluate(() => {
    const T = window.__HSR_THREE, cam = window.__hsrMainCamera, lev = window.__sim.G.hsr.cabGroup.userData.levers[0];
    const v = new T.Vector3(); lev.getWorldPosition(v); v.project(cam);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight };
  });
  await page.mouse.move(levPos.x, levPos.y); await page.mouse.down(); await new Promise(r => setTimeout(r, 400));
  const levDown = await page.evaluate(() => window.__sim.G.hsr.touchThrottle);
  await page.mouse.up();
  if (levDown !== 1) fail.push('3D lever not pressed: ' + levDown);

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

  for (let i = 0; i < 2; i++) { await page.click('#hmView'); await new Promise(r => setTimeout(r, 1000)); }
  await new Promise(r => setTimeout(r, 800));
  const cam = await page.evaluate(() => ({ mode: window.__sim.G.hsr.camMode, label: document.getElementById('hmView').textContent }));
  if (cam.mode !== 1) fail.push('camera mode ' + cam.mode);
  if (!/车尾/.test(cam.label)) fail.push('camera label ' + cam.label);

  await page.evaluate(() => { window.__sim.G.hsr.yaw = 1.0; window.__sim.G.hsr.pitch = 0.2; });
  await page.click('#hmLook');
  await new Promise(r => setTimeout(r, 400));
  const look = await page.evaluate(() => ({ yaw: window.__sim.G.hsr.yaw, pitch: window.__sim.G.hsr.pitch }));
  if (Math.abs(look.yaw) > 0.001 || Math.abs(look.pitch) > 0.001) fail.push('look reset failed: ' + JSON.stringify(look));

  await page.evaluate(() => { const st = window.__sim.G.hsr; st.stopped = false; st.x = 1275000; st.v = 300 / 3.6; });
  await new Promise(r => setTimeout(r, 600));
  const atp = await page.evaluate(() => ({ v: window.__sim.G.hsr.v, stopped: window.__sim.G.hsr.stopped, state: document.getElementById('hmState').textContent }));
  if (!/ATP制动/.test(atp.state)) fail.push('ATP state: ' + JSON.stringify(atp));
  if (atp.v >= 300 / 3.6) fail.push('ATP did not brake: v=' + atp.v);

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

  await page.evaluate(() => {
    const st = window.__sim.G.hsr;
    st.stopped = false; st.doorT = 0; st.v = 0;
    st.x = st.stops[st.stopIdx].x - 0.4;
  });
  await new Promise(r => setTimeout(r, 1500));
  const stopInfo = await page.evaluate(() => ({ stopped: window.__sim.G.hsr.stopped, err: window.__sim.G.hsr.stopErr, result: window.__sim.G.hsr.result, dwell: document.getElementById('hmDwell').textContent, park: document.getElementById('hmPark').textContent, hud: document.getElementById('hmErr').textContent }));
  if (!stopInfo.stopped) fail.push('stop detection failed');
  if (!(Math.abs(stopInfo.err) <= 1.0)) fail.push('stop error out of range: ' + stopInfo.err);
  if (!/停站/.test(stopInfo.hud)) fail.push('stop HUD missing: ' + stopInfo.hud);
  if (!stopInfo.result) fail.push('final result not shown');
  if (!/停站|可发车/.test(stopInfo.dwell)) fail.push('dwell missing: ' + stopInfo.dwell);
  if (!/施加/.test(stopInfo.park)) fail.push('parking brake missing: ' + stopInfo.park);

  await page.screenshot({ path: 'shots/hsr-regression.png' }).catch(() => {});
  console.log(JSON.stringify({ ok: fail.length === 0 && errors.length === 0, info, pantoDown: down, pantoUp: up, fail, errors: errors.slice(0, 4) }, null, 1));
  await browser.close();
  process.exit(fail.length === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
