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
  // 选择原有 2 号线浦东段（31 条中的第 22 张，index 21），加载快
  await p.evaluate(() => document.querySelectorAll('.route-card')[21].click());
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  let ok = false;
  for (let i = 0; i < 160; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') { ok = true; break; } }
  await new Promise(r => setTimeout(r, 900));
  const state = await p.evaluate(() => {
    const S = window.__sim, so = S.stationObjs[0], psd = so.psdL;
    const t = psd.t;
    const pairs = [];
    for (let i = 0; i + 1 < psd.leaves.length; i += 2) {
      const a = psd.leaves[i], b = psd.leaves[i + 1];
      const az = a.z + a.dir * 0.72 * t;
      const bz = b.z + b.dir * 0.72 * t;
      pairs.push({ a: +az.toFixed(3), b: +bz.toFixed(3), crossed: az > bz });
    }
    const trainSet = S.train.doorSets[0];
    const arr = trainSet.mesh.instanceMatrix.array;
    const zAt = i => +arr[i * 16 + 14].toFixed(3);
    const f = S.path.stations[0].frame;
    const pos = f.pos.clone().addScaledVector(f.right, -1.2).addScaledVector(f.up, 2.8).addScaledVector(f.tan, 58.6);
    const look = f.pos.clone().addScaledVector(f.right, -4.0).addScaledVector(f.up, 1.7).addScaledVector(f.tan, 58.6);
    S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], 58);
    return {
      doorT: S.G.doorT, psdT: t,
      hudL: document.getElementById('hudDoorL').classList.contains('open'),
      hudR: document.getElementById('hudDoorR').classList.contains('open'),
      crossedCount: pairs.filter(x => x.crossed).length,
      pairs: pairs.slice(0, 4),
      trainLeftZ: zAt(0), trainRightZ: zAt(8),
      trainSides: [trainSet.list[0].side, trainSet.list[8].side]
    };
  });
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: base + '/shanghai-metro/fix_psd.png' });
  console.log(JSON.stringify({ ok, state, errors: errs.slice(0, 4) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
