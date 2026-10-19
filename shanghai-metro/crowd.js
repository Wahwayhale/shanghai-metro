const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,3000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1500));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await p.evaluate(()=>{const S=window.__sim;S.G.camMode=3;S.snapCam();});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:base+'/shanghai-metro/c_wait.png'});
// 开门触发乘降
await p.evaluate(()=>{const S=window.__sim;S.openDoors();S.advance(3.2);const c=S.stationObjs[0].crowd;for(let i=0;i<420;i++)c.update(1/30,1);S.snapCam();});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:base+'/shanghai-metro/c_board.png'});
await p.evaluate(()=>{const S=window.__sim;const c=S.stationObjs[0].crowd;for(let i=0;i<240;i++)c.update(1/30,1);S.snapCam();});
await new Promise(r=>setTimeout(r,1500));
await p.screenshot({path:base+'/shanghai-metro/c_board2.png'});
// 近景
await p.evaluate(()=>{const S=window.__sim;const st=S.path.stations[0];S.G.camMode=2;S.G.orbit={az:2.4,el:0.12,dist:16};S.snapCam();});
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:base+'/shanghai-metro/c_near.png'});
console.log('ERR',JSON.stringify(errs.slice(0,5)));
const st=await p.evaluate(()=>{const S=window.__sim;let meshes=0;S.scene.traverse(o=>{if(o.isMesh)meshes++});return {meshes, crowd:S.stationObjs[0].crowd?['wait','board','alight','leave','gone','spare'].map(k=>k+':'+S.stationObjs[0].crowd.people.filter(x=>x.state===k).length).join(','):'none'};});
console.log(JSON.stringify(st));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
