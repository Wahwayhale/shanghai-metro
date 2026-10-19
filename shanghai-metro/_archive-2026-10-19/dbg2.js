const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1024,600'],
    defaultViewport: { width: 1024, height: 600 }
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 3500));
  await page.click('#startBtn');
  await new Promise(r => setTimeout(r, 500));
  await page.click('#brGo');
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const m = await page.evaluate(() => window.__sim.G.mode);
    if (m === 'driving') break;
  }
  await new Promise(r => setTimeout(r, 3000));

  const info = await page.evaluate(() => {
    const cd = window.__sim.train.cabDisplay;
    const ctx = cd.c1.getContext('2d');
    const d = ctx.getImageData(20, 20, 1, 1).data;
    return {
      last: cd.last,
      size: [cd.c1.width, cd.c1.height],
      px: Array.from(d),
      hasMap: !!cd.t1.image,
      needs: cd.t1.needsUpdate,
      dataUrl: cd.c1.toDataURL('image/png'),
      speedTex: cd.speedCanvas.toDataURL('image/png')
    };
  });
  fs.writeFileSync(base + '/shanghai-metro/dbg_atp.png', Buffer.from(info.dataUrl.split(',')[1], 'base64'));
  fs.writeFileSync(base + '/shanghai-metro/dbg_speed.png', Buffer.from(info.speedTex.split(',')[1], 'base64'));
  delete info.dataUrl; delete info.speedTex;
  console.log(JSON.stringify(info));
  console.log('ERRORS', JSON.stringify(errs));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
