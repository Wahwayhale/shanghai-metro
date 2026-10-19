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
await new Promise(r=>setTimeout(r,1800));
console.log('SIG',JSON.stringify(await p.evaluate(()=>{
  const S=window.__sim;
  return {n:S.signals?S.signals.length:'na', first:S.signals?S.signals.slice(0,4):null};
})));
// 相机放在信号机前看
await p.evaluate(()=>{
  const S=window.__sim;const V=S.camera.position.constructor;
  const P=S.path;
  const sg=S.signals.find(x=>x.dir===1&&x.s>S.G.s+80);
  const f=P.frameAt(sg.s-26);
  const pos=f.pos.clone().addScaledVector(f.right,-2.2).addScaledVector(f.up,2.4);
  const ft=P.frameAt(sg.s);
  const look=ft.pos.clone().addScaledVector(ft.right,-7.2).addScaledVector(ft.up,2.4);
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],58);
});
await new Promise(r=>setTimeout(r,2600));
await p.screenshot({path:base+'/shanghai-metro/sig1.png'});
console.log('MESH',JSON.stringify(await p.evaluate(()=>{
  const ms=window.__sim.sigMeshes;
  if(!ms) return 'none';
  return ms.map(m=>m.count);
})));
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
