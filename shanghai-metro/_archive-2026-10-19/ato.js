const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 900, height: 560 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @' + (e.stack || '').split('\n')[1]));
  page.on('console', m => { if (m.type() === 'error') errs.push('C ' + m.text()); });
  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#brGo');
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 1500));
    if (await page.evaluate(() => window.__sim.G.mode) === 'driving') break;
  }
  await new Promise(r => setTimeout(r, 1200));
  const st0 = await page.evaluate(() => ({ mode: window.__sim.G.mode, train: !!window.__sim.train, step: document.getElementById('loadStep').textContent, err: document.getElementById('loadPct').textContent }));
  console.log('STATE', JSON.stringify(st0), 'ERRS', JSON.stringify(errs.slice(0, 5)));
  if (st0.mode !== 'driving') { console.log('NOT DRIVING'); await browser.close(); return; }

  const out = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    const log = [];
    // --- 紧急制动测试 ---
    G.s = 900; G.v = 15; G.lever = 0; G.eb = false; G.doorsOpen = false; G.doorT = 0;
    G.stopState = 'run'; G.targetIdx = 2;
    S.snapTrain();
    G.eb = true; G.lever = 0;
    S.advance(16);
    log.push('EB_STOP v=' + G.v.toFixed(2) + ' eb=' + G.eb);
    const rel = S.releaseEB();
    S.setLever(0.8);
    S.advance(3);
    log.push('AFTER_RELEASE rel=' + rel + ' v=' + G.v.toFixed(2) + ' eb=' + G.eb + ' lever=' + G.lever.toFixed(2));
    G.eb = false; G.lever = 0;
    return { log };
  });
  console.log(out.log.join('\n'));

  // 用真实键盘测试 EB 缓解
  await page.keyboard.press('KeyR');
  await new Promise(r => setTimeout(r, 500));
  const ebState = await page.evaluate(() => ({ eb: window.__sim.G.eb, v: window.__sim.G.v }));
  console.log('EB_RELEASE', JSON.stringify(ebState));
  await page.keyboard.down('KeyW');
  await new Promise(r => setTimeout(r, 2500));
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => ({ eb: window.__sim.G.eb, v: +window.__sim.G.v.toFixed(2), s: +window.__sim.G.s.toFixed(1) }));
  console.log('EB_RUN', JSON.stringify(after));

  // --- ATO 测试 ---
  const ato = await page.evaluate(() => {
    const S = window.__sim, G = S.G;
    G.s = S.path.stations[0].stopS; G.v = 0; G.lever = 0; G.eb = false;
    G.doorsOpen = true; G.doorT = 1; G.stopState = 'dwell'; G.targetIdx = 0;
    G.ato = true; G.atoState = 'dwell'; G.atoTimer = 0; G.clock = S.path.stations[0].schDep;
    S.snapTrain();
    const log = [];
    for (let k = 0; k < 62; k++) {
      S.advance(5);
      log.push(`${k * 5 + 5}s tgt=${G.targetIdx} v=${(G.v * 3.6).toFixed(0)} s=${G.s.toFixed(0)} d=${(S.path.stations[G.targetIdx].stopS - G.s).toFixed(1)} st=${G.stopState} ato=${G.atoState} eb=${G.eb} lv=${G.lever.toFixed(2)} lim=${S.path.atpLimit(G.s,G.v).toFixed(1)}`);
    }
    return { log, target: G.targetIdx, results: G.results.map(r => r.zh + ':' + r.err.toFixed(2)) };
  });
  console.log(ato.log.join('\n'));
  console.log('ATO_END', ato.target, JSON.stringify(ato.results));
  console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
