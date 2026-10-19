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
await new Promise(r=>setTimeout(r,1500));
console.log(JSON.stringify(await p.evaluate(()=>{
  const ms=window.__sim.sigMeshes;
  const out=[];
  for(let c=0;c<3;c++){
    const m=new (window.THREE?window.THREE.Matrix4:Object)();
  }
  // 直接用 elements
  const res=ms.map(mesh=>{
    const arr=mesh.instanceMatrix.array;
    const sc=Math.hypot(arr[0],arr[1],arr[2]);
    return {count:mesh.count, s0:+sc.toFixed(3), pos:[+arr[12].toFixed(1),+arr[13].toFixed(1),+arr[14].toFixed(1)], visible:mesh.visible};
  });
  return res;
}),null,1));
await b.close();})().catch(e=>{console.error(e.message);process.exit(1)});
