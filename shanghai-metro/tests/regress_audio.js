const puppeteer = require('puppeteer-core');
const path = require('path');
const EDGE = require('./testenv').CHROME;
const base = require('./testenv').ROOT;
const file = 'file:///' + path.resolve(base + '/上海地铁模拟驾驶.html').replace(/\\/g, '/');

(async () => {
  const b = await puppeteer.launch({
    executablePath: EDGE, headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 1280, height: 720 }
  });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(file, { waitUntil: 'load', timeout: 120000 });
  await new Promise(r => setTimeout(r, 2500));
  await p.evaluate(() => document.querySelectorAll('.route-card')[21].click());
  await new Promise(r => setTimeout(r, 300));
  await p.click('#startBtn'); await new Promise(r => setTimeout(r, 300)); await p.click('#brGo');
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); if (await p.evaluate(() => window.__sim.G.mode) === 'driving') break; }
  await new Promise(r => setTimeout(r, 800));
  const state = await p.evaluate(() => {
    const S = window.__sim, a = S.audio;
    return {
      ready: a.ready, ctx: a.ctx && a.ctx.state, volume: a.volume,
      osc: a.osc1 && [a.osc1.type, a.osc2.type, a.osc3.type],
      compressor: a.comp && [a.comp.threshold.value, a.comp.ratio.value],
      rest: a.motorGain && [a.motorGain.gain.value, a.whineGain.gain.value, a.rollGain.gain.value, a.brkGain.gain.value, a.ambGain.gain.value]
    };
  });
  const moving = await p.evaluate(() => {
    const S = window.__sim, a = S.audio, G = S.G;
    G.lever = 1; G.eb = false;
    S.advance(3);
    return { v: +(G.v * 3.6).toFixed(0), motors: [a.motorGain.gain.value, a.whineGain.gain.value, a.rollGain.gain.value], f: [a.osc1.frequency.value, a.osc3.frequency.value] };
  });
  console.log(JSON.stringify({ state, moving, errors: errs.slice(0, 4) }, null, 1));
  await b.close();
})().catch(e => { console.error('FATAL', e.stack || e.message); process.exit(1); });
