const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const idx=Number(process.argv[2]||4);
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:120000});
await new Promise(r=>setTimeout(r,2200));
console.log('CARDS', await p.evaluate(()=>document.querySelectorAll('.route-card').length));
await p.evaluate(i=>{document.querySelectorAll('.route-card')[i].click();},idx);
await new Promise(r=>setTimeout(r,700));
const t0=Date.now();
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
let ok=false;
for(let i=0;i<160;i++){await new Promise(r=>setTimeout(r,1000));const m=await p.evaluate(()=>window.__sim&&window.__sim.G.mode);if(m==='driving'){ok=true;break;}}
console.log('LOAD_S', ((Date.now()-t0)/1000).toFixed(1), 'ok', ok);
if(ok){
  console.log(JSON.stringify(await p.evaluate(()=>{
    const S=window.__sim,P=S.path;
    return {line:S.line.name, n:P.stations.length, len:Math.round(P.length),
      stop0:Math.round(P.stations[0].stopS), lastStop:Math.round(P.stations[P.stations.length-1].stopS),
      s0:Math.round(P.stations[0].s), sLast:Math.round(P.stations[P.stations.length-1].s),
      loop:!!P.loop, ai:S.aiTrains.length, sig:S.signals.length,
      stations:S.stationObjs.filter(Boolean).length};
  })));
  await p.evaluate(()=>window.__sim.snapCam());
  await new Promise(r=>setTimeout(r,2500));
  await p.screenshot({path:base+'/shanghai-metro/net_'+idx+'.png'});
}
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
