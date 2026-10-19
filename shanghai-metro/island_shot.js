const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1500));
// 站台中央看向列车
await p.evaluate(()=>{
  const S=window.__sim;const V=S.camera.position.constructor;
  const g=S.stationObjs[0].group; g.updateMatrixWorld(true);
  const pos=g.localToWorld(new V(1.6,2.3,-16));
  const look=g.localToWorld(new V(-5.7,2.0,4));
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],62);
});
await new Promise(r=>setTimeout(r,2600));
await p.screenshot({path:base+'/shanghai-metro/is_platform.png'});
// 站台全景（从端部看）
await p.evaluate(()=>{
  const S=window.__sim;const V=S.camera.position.constructor;
  const g=S.stationObjs[0].group; g.updateMatrixWorld(true);
  const pos=g.localToWorld(new V(2.5,2.6,52));
  const look=g.localToWorld(new V(0,1.9,-30));
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],66);
});
await new Promise(r=>setTimeout(r,2400));
await p.screenshot({path:base+'/shanghai-metro/is_wide.png'});
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
