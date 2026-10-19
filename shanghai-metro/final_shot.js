const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2200));
// 雨天 + 1号线（方正车头）
await p.evaluate(()=>{document.querySelectorAll('.route-card')[1].click();});
await p.evaluate(()=>{document.querySelectorAll('#weatherGroup button')[1].click();});
await new Promise(r=>setTimeout(r,1200));
await p.screenshot({path:base+'/shanghai-metro/f_menu_rain.png'});
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<110;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,2000));
// 司机室看新车头 + 雨
await p.evaluate(()=>{const S=window.__sim;S.G.camMode=2;S.G.orbit={az:2.6,el:0.14,dist:22};S.snapCam();});
await new Promise(r=>setTimeout(r,2600));
await p.screenshot({path:base+'/shanghai-metro/f_rain_car.png'});
await p.evaluate(()=>{const S=window.__sim;S.G.camMode=0;S.snapCam();});
await new Promise(r=>setTimeout(r,2200));
await p.screenshot({path:base+'/shanghai-metro/f_rain_cab.png'});
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
