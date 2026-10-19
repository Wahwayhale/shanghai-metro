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
await p.evaluate(()=>{window.__sim.closeDoors();window.__sim.advance(20);});
await new Promise(r=>setTimeout(r,800));
// 打开 ATS
await p.click('#atsBtn');
await new Promise(r=>setTimeout(r,900));
const st1=await p.evaluate(()=>({on:document.getElementById('ats').classList.contains('on'),rows:document.querySelectorAll('.ats-row').length,clock:document.getElementById('atsClock').textContent,sub:document.getElementById('atsSub').textContent}));
console.log('OPEN',JSON.stringify(st1));
await p.screenshot({path:base+'/shanghai-metro/ats1.png'});
// 点扣车
const held=await p.evaluate(()=>{
  const btn=document.querySelector('.ats-btn.hold');
  if(!btn) return 'no-btn';
  const no=btn.dataset.no;btn.click();
  const ai=window.__sim.aiTrains.find(a=>a.carNo===no);
  return {no,holdT:Math.round(ai.holdT),state:ai.state};
});
console.log('HOLD',JSON.stringify(held));
await new Promise(r=>setTimeout(r,900));
await p.screenshot({path:base+'/shanghai-metro/ats2.png'});
// 跳停
const skip=await p.evaluate(()=>{
  const btn=document.querySelector('.ats-btn.skip');
  const no=btn.dataset.no;btn.click();
  const ai=window.__sim.aiTrains.find(a=>a.carNo===no);
  return {no,skip:ai.skip};
});
console.log('SKIP',JSON.stringify(skip));
console.log('ERR',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
