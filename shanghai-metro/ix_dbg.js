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
  const p = await b.newPage();
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2200));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 1200));
  const c1 = await p.evaluate(() => window.__sim.G.clock);
  await new Promise(r => setTimeout(r, 2000));
  const c2 = await p.evaluate(() => window.__sim.G.clock);
  console.log('CLOCK', c1.toFixed(2), c2.toFixed(2), 'delta', (c2 - c1).toFixed(2));
  // 手动推进联锁
  const r = await p.evaluate(() => {
    const IX = window.__sim.IX;
    IX.applyRoute('revA');
    const seq = [];
    for (let i = 0; i < 20; i++) { IX.update(0.08); seq.push(+IX.turnouts[0].t.toFixed(2)); }
    return { seq: seq.slice(0, 8).concat([seq[19]]), active: IX.active };
  });
  console.log('MANUAL', JSON.stringify(r));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
