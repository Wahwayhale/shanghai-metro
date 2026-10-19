const puppeteer = require('puppeteer-core'); const path = require('path');
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
  await new Promise(r => setTimeout(r, 2200));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 1500));

  // 打开 ATS
  await p.click('#atsBtn');
  await new Promise(r => setTimeout(r, 800));
  console.log('IX', await p.evaluate(() => ({
    rows: document.querySelectorAll('.ats-ix-btn').length,
    turnouts: window.__sim.IX.turnouts.map(t => ({ k: t.key, s: Math.round(t.s), t: +t.t.toFixed(2) })),
    active: window.__sim.IX.active
  })));
  await p.screenshot({ path: base + '/shanghai-metro/ix1.png' });

  // 排列起点折返进路
  await p.evaluate(() => { document.querySelectorAll('.ats-ix-btn')[1].click(); });
  await new Promise(r => setTimeout(r, 300));
  const mid = await p.evaluate(() => window.__sim.IX.turnouts.map(t => +t.t.toFixed(2)));
  await new Promise(r => setTimeout(r, 2200));
  const done = await p.evaluate(() => ({
    t: window.__sim.IX.turnouts.map(t => +t.t.toFixed(2)),
    active: window.__sim.IX.active,
    sigs: window.__sim.signals.filter(s => Math.abs(s.s - window.__sim.IX.turnouts[0].s) < 100).map(s => s.state)
  }));
  console.log('MOVING', JSON.stringify(mid), 'DONE', JSON.stringify(done));
  await p.screenshot({ path: base + '/shanghai-metro/ix2.png' });

  // 固定闭塞
  await p.keyboard.press('KeyK');
  await new Promise(r => setTimeout(r, 700));
  console.log('MODE', await p.evaluate(() => ({ mode: window.__sim.G.sigMode, lim: +window.__sim.G.limit.toFixed(1) })));
  await p.screenshot({ path: base + '/shanghai-metro/ix3.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
