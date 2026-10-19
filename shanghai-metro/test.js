const puppeteer = require('puppeteer-core');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const shot = n => base + '/shanghai-metro/' + n;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1440,810', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 810 }
  });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => logs.push('[PAGEERROR] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 8).join('\n')));
  page.on('requestfailed', r => logs.push('[REQFAIL] ' + r.url().slice(0, 140) + ' ' + (r.failure() && r.failure().errorText)));

  await page.goto(file, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise(r => setTimeout(r, 6000));

  const menuInfo = await page.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    dist: document.getElementById('statDist').textContent,
    stops: document.getElementById('statStops').textContent,
    hero: !!window.__sim.hero,
    mode: window.__sim.G.mode,
    calls: window.__sim.renderer.info.render.calls,
    tris: window.__sim.renderer.info.render.triangles
  }));
  logs.push('MENU ' + JSON.stringify(menuInfo));
  await page.screenshot({ path: shot('shot_menu.png') });

  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: shot('shot_brief.png') });
  await page.click('#brGo');

  let ok = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const st = await page.evaluate(() => ({ mode: window.__sim.G.mode, step: document.getElementById('loadStep').textContent, pct: document.getElementById('loadPct').textContent }));
    if (i % 5 === 0) logs.push('BUILD ' + JSON.stringify(st));
    if (st.mode === 'driving') { ok = true; break; }
    if (st.mode === 'menu') break;
  }
  logs.push('DRIVING_READY ' + ok);
  await new Promise(r => setTimeout(r, 3000));

  const cabInfo = await page.evaluate(() => {
    const S = window.__sim;
    return {
      mode: S.G.mode, s: S.G.s, v: S.G.v, target: S.G.targetIdx,
      stopS: S.path.stations[0].stopS, doors: S.G.doorT,
      stations: S.stationObjs.length,
      calls: S.renderer.info.render.calls, tris: S.renderer.info.render.triangles,
      cam: S.camera.position.toArray().map(n => +n.toFixed(1)),
      routeLen: Math.round(S.path.length)
    };
  });
  logs.push('CAB ' + JSON.stringify(cabInfo));
  await page.screenshot({ path: shot('shot_cab.png') });

  // 关门、牵引
  await page.keyboard.press('KeyP');
  await new Promise(r => setTimeout(r, 2500));
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 7000));
  await page.keyboard.up('KeyW');
  await new Promise(r => setTimeout(r, 2500));
  const d1 = await page.evaluate(() => ({ s: +window.__sim.G.s.toFixed(1), v: +window.__sim.G.v.toFixed(2), doors: +window.__sim.G.doorT.toFixed(2), lever: +window.__sim.G.lever.toFixed(2), clock: Math.round(window.__sim.G.clock), state: window.__sim.G.stopState }));
  logs.push('DRIVE ' + JSON.stringify(d1));
  await page.screenshot({ path: shot('shot_drive.png') });

  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: shot('shot_chase.png') });
  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: shot('shot_orbit.png') });

  console.log(logs.join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
