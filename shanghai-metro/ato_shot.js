const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
(async()=>{const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(file,{waitUntil:'load',timeout:90000});await new Promise(r=>setTimeout(r,3000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1500));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1000));
await p.click('#atoBtn');
await new Promise(r=>setTimeout(r,500));
await p.evaluate(()=>{window.__sim.advance(40);window.__sim.snapCam();});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:base+'/shanghai-metro/a_cab.png'});
const st=await p.evaluate(()=>{const S=window.__sim;return {ato:S.G.ato,atoState:S.G.atoState,v:+(S.G.v*3.6).toFixed(0),tgt:S.G.targetIdx,btn:document.getElementById('atoBtn').className,status:document.getElementById('hudStatus').textContent};});
console.log('ATO',JSON.stringify(st));
// EB 画面
await p.evaluate(()=>{window.__sim.triggerEB('测试');window.__sim.snapCam();});
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:base+'/shanghai-metro/a_eb.png'});
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
