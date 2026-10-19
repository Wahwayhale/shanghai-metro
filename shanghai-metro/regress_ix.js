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
  await p.evaluate(() => document.querySelectorAll('.route-card')[0].click());
  await new Promise(r => setTimeout(r, 400));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400)); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 600));
  const result = await p.evaluate(() => {
    const S = window.__sim, IX = S.IX;
    const snap = () => ({
      active: IX.active,
      routes: IX.routes.map(r => r.id),
      states: IX.turnouts.map(t => ({ key: t.key, t: t.t, target: t.target })),
      buttons: document.querySelectorAll('#atsIx .ats-ix-btn').length,
      head: document.querySelector('#atsIx .ats-ix-head')?.innerText || ''
    });
    const main = snap();
    IX.applyRoute('both', true);
    const both = snap();
    IX.applyRoute('revA', true);
    const revA = snap();
    IX.applyRoute('main', true);
    const back = snap();
    return { main, both, revA, back };
  });
  console.log(JSON.stringify({ result, errors: errs.slice(0, 4) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
