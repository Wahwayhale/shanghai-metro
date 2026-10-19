const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1000,height:620}});
const p=await b.newPage();
await p.goto(file,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,3000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1500));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await p.evaluate(()=>window.__sim.snapCam());await new Promise(r=>setTimeout(r,2000));
const info=await p.evaluate(()=>{
  const S=window.__sim;
  const g=S.stationObjs[0].group; g.updateMatrixWorld(true);
  const camLocal=g.worldToLocal(S.camera.position.clone());
  const car=S.train.cars[0].group;
  let tabs=0;
  g.traverse(o=>{if(o.isMesh&&o.material&&o.material.transparent)tabs++;});
  return {camLocal:camLocal.toArray().map(v=>+v.toFixed(2)), camWorld:S.camera.position.toArray().map(v=>+v.toFixed(1)),
   stWorld:g.position.toArray().map(v=>+v.toFixed(1)), tabs, carPos:car.position.toArray().map(v=>+v.toFixed(1)),
};
});
console.log('INFO',JSON.stringify(info));
await p.evaluate(()=>{const g=window.__sim.stationObjs[0].group;g.traverse(o=>{if(o.isMesh&&o.material&&o.material.transparent)o.visible=false;});});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:base+'/shanghai-metro/probe_notrans.png'});
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
