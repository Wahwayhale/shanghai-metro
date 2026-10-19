const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE = require('./testenv').CHROME;
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
await p.evaluate(()=>{
  const S=window.__sim;
  const idx=S.stationObjs.findIndex(o=>o.s>11000);
  const st=S.path.stations[idx];
  S.G.s=st.stopS; S.G.targetIdx=idx; S.G.stopState='stop'; S.G.doorsOpen=true; S.G.doorT=1;
  S.snapTrain();
  const V=S.camera.position.constructor;
  const g=S.stationObjs[idx].group; g.updateMatrixWorld(true);
  const pos=g.localToWorld(new V(2.2,3.0,-30));
  const look=g.localToWorld(new V(-2,2.2,40));
  S.setFreeCam([pos.x,pos.y,pos.z],[look.x,look.y,look.z],64);
});
await new Promise(r=>setTimeout(r,2800));
await p.screenshot({path:base+'/shanghai-metro/shots/is_elev.png'});
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
