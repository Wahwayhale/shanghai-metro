const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,3000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1500));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await p.evaluate(()=>{
  const S=window.__sim; const V=S.camera.position.constructor;
  S.stationObjs[0].crowd.group.visible=false;
  S.closeDoors(); S.advance(3.5);
  const g=S.stationObjs[0].group; g.updateMatrixWorld(true);
  const pos=g.localToWorld(new V(-5.6,2.05,61.2));
  const look=g.localToWorld(new V(-2.2,1.95,61.2));
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],58);
});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:base+'/shanghai-metro/e_closed.png'});
await p.evaluate(()=>{const S=window.__sim;S.openDoors();S.advance(1.5);});
await new Promise(r=>setTimeout(r,1800));
await p.screenshot({path:base+'/shanghai-metro/e_mid.png'});
await p.evaluate(()=>{window.__sim.advance(3);});
await new Promise(r=>setTimeout(r,1800));
await p.screenshot({path:base+'/shanghai-metro/e_open.png'});
await p.evaluate(()=>{
  const S=window.__sim; const V=S.camera.position.constructor;
  const g=S.stationObjs[0].group; g.updateMatrixWorld(true);
  const pos=g.localToWorld(new V(-2.45,2.05,62.5));
  const look=g.localToWorld(new V(-2.45,1.45,46));
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],62);
});
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:base+'/shanghai-metro/e_interior.png'});
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
