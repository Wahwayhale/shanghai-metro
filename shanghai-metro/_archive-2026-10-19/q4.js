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
const r=await p.evaluate(()=>{
  const S=window.__sim, ms=S.sigMeshes;
  const out=ms.map(m=>{
    const a=m.instanceMatrix.array;
    return {sc:+Math.hypot(a[0],a[1],a[2]).toFixed(3), y:+a[13].toFixed(2), col:m.material.color.getHexString(), vis:m.visible};
  });
  return {out, states:S.signals.slice(0,3).map(s=>s.state)};
});
console.log(JSON.stringify(r));
await b.close();})().catch(e=>{console.error(e.message);process.exit(1)});
