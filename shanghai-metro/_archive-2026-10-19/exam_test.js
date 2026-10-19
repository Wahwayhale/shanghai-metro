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
  await new Promise(r => setTimeout(r, 2000));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  // 选择考试模式
  await p.evaluate(() => { document.querySelectorAll('#modeGroup button')[1].click(); });
  await new Promise(r => setTimeout(r, 300));
  await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 900));
  console.log('EXAM', JSON.stringify(await p.evaluate(() => ({
    exam: window.__sim.G.exam,
    panel: document.getElementById('examPanel').className,
    tasks: window.__sim.G.examTasks.map(t => t.label + ':' + t.ok)
  }))));
  // ATO 跑三站
  await p.evaluate(() => { const S = window.__sim; S.toggleATO(true); for (let i = 0; i < 120; i++) S.advance(2); });
  await new Promise(r => setTimeout(r, 600));
  console.log('AFTER', JSON.stringify(await p.evaluate(() => ({
    tgt: window.__sim.G.targetIdx,
    tasks: window.__sim.G.examTasks.map(t => t.ok),
    passed: window.__sim.G.examTasks.every(t => t.ok === true)
  }))));
  await p.evaluate(() => window.__sim.finishService());
  await new Promise(r => setTimeout(r, 900));
  console.log('RESULT', JSON.stringify(await p.evaluate(() => ({
    title: document.getElementById('resTitle').textContent,
    examBox: document.getElementById('resExam').innerText.replace(/\n/g, ' | ').slice(0, 120)
  }))));
  await p.screenshot({ path: base + '/shanghai-metro/exam1.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 3)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
