const puppeteer = require('puppeteer-core'); const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const idx = Number(process.argv[2] || 0);
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
  await p.evaluate(i => { document.querySelectorAll('.route-card')[i].click(); }, idx);
  await new Promise(r => setTimeout(r, 600));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 400));
  await p.click('#brGo');
  for (let i = 0; i < 140; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 1000));

  // PIS 画布内容抽样
  console.log('PIS', JSON.stringify(await p.evaluate(() => {
    const S = window.__sim;
    const so = S.stationObjs.find(o => o && o.pis);
    if (!so) return 'none';
    const c = so.pis.c, x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let bright = 0, colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i] + d[i + 1] + d[i + 2];
      if (v > 180) bright++;
      if (Math.abs(d[i] - d[i + 2]) > 40) colored++;
    }
    return { w: c.width, h: c.height, bright, colored, tex: !!so.pis.tex };
  })));

  // ATO 跑两站
  const r = await p.evaluate(() => {
    const S = window.__sim;
    S.toggleATO(true);
    const log = [];
    for (let k = 0; k < 90; k++) {
      S.advance(2);
      log.push([Math.round(S.G.s), +(S.G.v * 3.6).toFixed(0), S.G.atoState, S.G.targetIdx]);
    }
    return { ato: S.G.ato, state: S.G.atoState, tgt: S.G.targetIdx, s: Math.round(S.G.s), log: log.filter((_, i) => i % 12 === 0) };
  });
  console.log('ATO', JSON.stringify(r));
  await p.screenshot({ path: base + '/shanghai-metro/z_' + idx + '.png' });
  console.log('ERR', JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
