const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:800,height:500}});
const p=await b.newPage();
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1200));
console.log(JSON.stringify(await p.evaluate(()=>{
  const S=window.__sim;
  const g=S.stationObjs[0].group;g.updateMatrixWorld(true);
  const V=S.camera.position.constructor;
  const local=new V(); 
  const car0=S.train.cars[0].group;
  const wp=new V(); car0.getWorldPosition(wp);
  g.worldToLocal(wp);
  const st0=S.path.stations[0];
  return {
    lateral:S.train.lateral,
    car0Local:{x:+wp.x.toFixed(2),y:+wp.y.toFixed(2),z:+wp.z.toFixed(2)},
    stationS:Math.round(st0.s), playerS:Math.round(S.G.s),
    rootPos:S.scene.children.length
  };
}),null,1));
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
