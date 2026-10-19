const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message+' @'+(e.stack||'').split('\n')[1]));
await p.goto(file,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,3000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1500));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await p.evaluate(()=>{const S=window.__sim;S.G.camMode=3;S.snapCam();S.advance(0.1);});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:base+'/shanghai-metro/d_open.png'});
// 关门
await p.evaluate(()=>{const S=window.__sim;S.closeDoors();S.advance(3.4);S.snapCam();});
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:base+'/shanghai-metro/d_closed.png'});
const st1=await p.evaluate(()=>({doorT:+window.__sim.G.doorT.toFixed(2),trainDoorT:+window.__sim.train.doorT.toFixed(2)}));
// 开门中
await p.evaluate(()=>{const S=window.__sim;S.openDoors();S.advance(1.4);S.snapCam();});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:base+'/shanghai-metro/d_mid.png'});
const st2=await p.evaluate(()=>({doorT:+window.__sim.G.doorT.toFixed(2),trainDoorT:+window.__sim.train.doorT.toFixed(2)}));
console.log(JSON.stringify({st1,st2,errs:errs.slice(0,4)}));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
