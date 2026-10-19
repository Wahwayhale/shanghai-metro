const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1440,810'],
    defaultViewport: { width: 1440, height: 810 }
  });
  const page = await browser.newPage();
  page.on('console', m => console.log(`[${m.type()}]`, m.text()));
  page.on('pageerror', e => console.log('[PAGEERROR]', e.message, '\n', (e.stack || '').split('\n').slice(0, 8).join('\n')));
  page.on('requestfailed', r => console.log('[REQFAIL]', r.url().slice(0, 160), r.failure() && r.failure().errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('[HTTP]', r.status(), r.url().slice(0, 160)); });

  await page.goto(file, { waitUntil: 'load', timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));
  const info = await page.evaluate(() => ({
    hasSim: typeof window.__sim,
    bodyText: document.body.innerText.slice(0, 600),
    canvases: document.querySelectorAll('canvas').length,
    title: document.title
  }));
  console.log('INFO', JSON.stringify(info, null, 1));
  await page.screenshot({ path: base + '/shanghai-metro/dbg.png' });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
