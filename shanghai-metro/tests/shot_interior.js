/* 车厢内视角截图：node tests/shot_interior.js [线路名关键字] [输出名] */
const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lineKey = process.argv[2] || '1号线';
const out = process.argv[3] || 'int_' + lineKey;

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await sleep(2500);
  await p.evaluate(k => { const c = [...document.querySelectorAll('.route-card')].find(c => c.textContent.includes(k)); if (c) c.click(); }, lineKey);
  await sleep(400);
  await p.click('#startBtn'); await sleep(400); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await sleep(800);
  await p.evaluate(() => { const S = window.__sim; if (S.G.onboardOpen) S.onboardFinish(); S.G.s = S.path.stations[0].stopS; S.G.v = 0; S.G.doorsOpen = true; S.G.doorT = 1; S.G.stopState = 'dwell'; });
  await sleep(500);
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' })));
  await p.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' })));
  await sleep(500);
  await p.evaluate((A) => {
    const S = window.__sim; S.walkInteractE();
    const w = S.G.walk; const it = w.inTrain;
    it.lz = A[0]; it.lx = 0; S.clampWalk();
    w.yaw = w.yaw + A[1] * Math.PI / 2; w.pitch = 0.0;
  }, [+(process.argv[4] || 0), +(process.argv[5] || 1)]);
  await sleep(4000);
  await p.evaluate(() => { const S = window.__sim; S.G.doorT = 1; });
  await sleep(2000);
  await p.screenshot({ path: base + '/shanghai-metro/shots/' + out + '_a.png' });
  console.log(JSON.stringify(await p.evaluate(() => {
    const S = window.__sim; const r = S.renderer; r.info.reset(); r.render(S.scene, S.camera);
    let lights = 0, shadowCasters = 0, visMeshes = 0;
    S.scene.traverseVisible(o => { if (o.isLight) lights++; if (o.isMesh) { visMeshes++; if (o.castShadow) shadowCasters++; } });
    return { calls: r.info.render.calls, tris: r.info.render.triangles, lights, shadowCasters, visMeshes, progs: r.info.programs.length, q: S.G.quality, rs: S.G.renderScale };
  })));
  console.log(JSON.stringify({ info: await p.evaluate(() => { const r = window.__sim.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures, progs: r.programs.length }; }), errs: errs.slice(0, 3) }));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
