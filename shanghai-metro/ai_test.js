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
const snap=async(tag)=>{
  const d=await p.evaluate(()=>window.__sim.aiTrains.map(a=>({no:a.carNo,dir:a.dir,lat:a.lateral,s:Math.round(a.s),v:+(a.v*3.6).toFixed(0),st:a.state,idx:a.idx,hold:Math.round(a.holdT)})));
  console.log(tag,JSON.stringify(d));
};
await snap('T0');
// 玩家关门发车
await p.evaluate(()=>{const S=window.__sim;S.closeDoors();S.advance(3.5);S.setLever(0.9);});
for(let k=0;k<10;k++){await p.evaluate(()=>window.__sim.advance(20));await snap('T+'+(20*(k+1))+'s');}
const pl=await p.evaluate(()=>({s:Math.round(window.__sim.G.s),v:+(window.__sim.G.v*3.6).toFixed(0),lim:+window.__sim.G.limit.toFixed(1),gap:window.__sim.G.leaderGap?Math.round(window.__sim.G.leaderGap):null,no:window.__sim.G.leaderNo}));
console.log('PLAYER',JSON.stringify(pl));
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await p.evaluate(()=>window.__sim.snapCam());
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:base+'/shanghai-metro/ai_run.png'});
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
