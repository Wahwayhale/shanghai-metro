const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  const menu = await p.evaluate(() => ({
    cards: document.querySelectorAll('.route-card').length,
    branchTitles: [...document.querySelectorAll('.route-card')].slice(18, 30).map(c => c.querySelector('.rc-title')?.innerText.split('\n')[0])
  }));
  // 原有 2 号线浦东段（第 30 张，index 29）
  const idx = await p.evaluate(() => [...document.querySelectorAll('.route-card')].findIndex(c => c.querySelector('.rc-title')?.innerText.includes('南京东路') && c.querySelector('.rc-title')?.innerText.includes('张江高科')));
  await p.evaluate(i => document.querySelectorAll('.route-card')[i].click(), idx);
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  let ok = false;
  for (let i = 0; i < 180; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') { ok = true; break; } }
  await new Promise(r => setTimeout(r, 700));
  // 下车并直接把步行位置放到换乘通道尽头，触发面板
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
  await new Promise(r => setTimeout(r, 500));
  const before = await p.evaluate(() => {
    const S = window.__sim, G = S.G, st = S.path.stations[0], f = st.frame;
    if (!G.walk) return { walk: false };
    G.walk.pos.copy(f.pos).addScaledVector(f.right, -3).addScaledVector(f.up, 2.76).addScaledVector(f.tan, 90);
    S.clampWalk();
    return { walk: true, station: st.zh, tr: st.tr, line: S.line.name };
  });
  await new Promise(r => setTimeout(r, 300));
  const panel = await p.evaluate(() => ({
    visible: !document.getElementById('transferPanel').classList.contains('hidden'),
    lines: [...document.querySelectorAll('.tp-line')].map(x => x.dataset.line)
  }));
  await p.evaluate(() => { const b = document.querySelector('.tp-line'); if (b) b.click(); });
  let transferred = false;
  for (let i = 0; i < 220; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const st = await p.evaluate(() => {
      const S = window.__sim;
      return S ? { mode: S.G.mode, line: S.line.name, walk: !!(S.G.walk && S.G.walk.active), station: S.G.walk ? S.path.stations[S.G.walk.station].zh : null } : null;
    });
    if (st && st.mode === 'driving' && st.walk && st.line === '10号线') { transferred = true; break; }
  }
  const after = transferred ? await p.evaluate(() => {
    const S = window.__sim, G = S.G;
    return { line: S.line.name, station: G.walk ? S.path.stations[G.walk.station].zh : null, walk: !!(G.walk && G.walk.active), mode: G.mode, doors: G.doorsOpen, target: G.targetIdx };
  }) : null;
  await p.screenshot({ path: base + '/shanghai-metro/fix_transfer.png' });
  console.log(JSON.stringify({ ok, menu, before, panel, transferred, after, errors: errs.slice(0, 6) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
