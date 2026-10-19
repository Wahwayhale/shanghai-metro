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
await new Promise(r=>setTimeout(r,1200));
// 追车视角看前方同向车
await p.evaluate(()=>{
  const S=window.__sim;S.closeDoors();S.advance(60);
  const front=S.aiTrains.find(a=>a.carNo==='0214');
  S.G.s=front.s-52; S.G.v=front.v; S.G.targetIdx=front.idx; S.G.stopState='run';
  S.G.camMode=1; S.snapTrain(); S.snapCam();
});
await new Promise(r=>setTimeout(r,2600));
await p.screenshot({path:base+'/shanghai-metro/meet_front.png'});
console.log('F1',JSON.stringify(await p.evaluate(()=>{const S=window.__sim;const f=S.aiTrains.find(a=>a.carNo==='0214');return {gap:Math.round(f.s-S.G.s),fv:Math.round(f.v*3.6)};})));
// 站台视角看对向车经过
await p.evaluate(()=>{
  const S=window.__sim;
  const opp=S.aiTrains.find(a=>a.carNo==='0231');
  const st=S.path.stations[3];
  S.G.s=st.stopS; S.G.v=0; S.G.doorsOpen=true; S.G.doorT=1;
  S.G.camMode=3; S.snapTrain(); S.snapCam();
});
await new Promise(r=>setTimeout(r,1500));
// 让对向车挪到玩家旁边
await p.evaluate(()=>{
  const S=window.__sim;
  const opp=S.aiTrains.find(a=>a.carNo==='0231');
  opp.s=S.G.s+6; opp.v=15; opp.train.update(opp.s,opp.v,0);
  S.snapCam();
});
await new Promise(r=>setTimeout(r,2600));
await p.screenshot({path:base+'/shanghai-metro/meet_opp.png'});
console.log('ERR',errs.slice(0,3));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
