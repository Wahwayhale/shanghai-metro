const puppeteer = require('puppeteer-core'); const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const idx = Number(process.argv[2] || 4);
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
  await new Promise(r => setTimeout(r, 1200));

  console.log('META', JSON.stringify(await p.evaluate(() => {
    const S = window.__sim;
    return {
      line: S.line.name, n: S.path.stations.length,
      tr: S.stationObjs.filter(Boolean).filter(o => o.trPass).map(o => o.s | 0),
      pav: S.stationObjs.filter(Boolean).filter(o => o.pavilion).length,
      pis: S.stationObjs.filter(Boolean).filter(o => o.pis).length
    };
  })));

  const shot = async (name, from, to, fov) => {
    await p.evaluate(([f, t, fv]) => {
      const S = window.__sim; const V = S.camera.position.constructor;
      const g = S.stationObjs[0].group; g.updateMatrixWorld(true);
      const pos = g.localToWorld(new V(...f)), look = g.localToWorld(new V(...t));
      S.setFreeCam([pos.x, pos.y, pos.z], [look.x, look.y, look.z], fv);
    }, [from, to, fov]);
    await new Promise(r => setTimeout(r, 2400));
    await p.screenshot({ path: base + '/shanghai-metro/shots/x_' + name + '.png' });
  };

  // 换乘通道口
  await shot('tr', [1.2, 2.4, 48], [0, 1.75, 88], 62);
  // PIS 屏
  await shot('pis', [0.2, 2.3, 16], [0, 3.3, -10], 52);
  // 站台全景（含楼扶梯与站厅）
  await shot('hall', [3.2, 2.6, 30], [0, 3.4, -30], 72);
  console.log('ERR', JSON.stringify(errs.slice(0, 4)));
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
