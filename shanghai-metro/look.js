const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1024,height:576}});
const p=await b.newPage();
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1200));
const shot=async(name,from,to)=>{
  await p.evaluate(([f,t])=>{
    const S=window.__sim;const V=S.camera.position.constructor;
    const g=S.stationObjs[0].group;g.updateMatrixWorld(true);
    const pos=g.localToWorld(new V(...f)), look=g.localToWorld(new V(...t));
    S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],68);
  },[from,to]);
  await new Promise(r=>setTimeout(r,2200));
  await p.screenshot({path:base+'/shanghai-metro/look_'+name+'.png'});
};
await shot('right',[0,2.2,0],[9,2.0,0]);
await shot('left',[0,2.2,0],[-9,2.0,0]);
console.log('ok');
await b.close();})().catch(e=>{console.error(e);process.exit(1)});
