const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2200));
console.log('CARDS', await p.evaluate(()=>document.querySelectorAll('.route-card').length));
await p.evaluate(()=>{document.querySelectorAll('.route-card')[3].click();});
await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:base+'/shanghai-metro/l4_menu.png'});
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<110;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1800));
console.log('L4', JSON.stringify(await p.evaluate(()=>({
  line: window.__sim.line.name, stations: window.__sim.path.stations.length,
  len: Math.round(window.__sim.path.length), model: window.__sim.line.model,
  ai: window.__sim.aiTrains.length, sig: window.__sim.signals.length
}))));
await p.screenshot({path:base+'/shanghai-metro/l4_cab.png'});
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});
