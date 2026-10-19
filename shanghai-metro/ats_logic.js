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
const out=await p.evaluate(()=>{
  const S=window.__sim;
  S.closeDoors();
  const log=[];
  const ai=S.aiTrains.find(a=>a.carNo==='0214');
  // 让它先跑到站
  let t=0, seenDwell=false;
  for(let i=0;i<400;i++){
    S.advance(0.5); t+=0.5;
    if(ai.state==='dwell'&&!seenDwell){seenDwell=true;log.push(`dwell@${t.toFixed(0)}s s=${ai.s.toFixed(0)}`);break;}
  }
  // 下达扣车 90s
  ai.command('hold',90);
  const s0=ai.s;
  let held=0;
  for(let i=0;i<400;i++){S.advance(0.5);t+=0.5;held+=0.5;if(ai.state!=='dwell')break;}
  log.push(`hold_released@${t.toFixed(0)}s held=${held.toFixed(0)}s moved=${(ai.s-s0).toFixed(1)}m`);
  // 跳停测试
  const ai2=S.aiTrains.find(a=>a.carNo==='0211');
  ai2.command('skip');
  const idx0=ai2.idx;
  let skipped=false;
  for(let i=0;i<400;i++){S.advance(0.5);if(ai2.idx>idx0){skipped=true;break;}}
  log.push(`skip idx ${idx0}->${ai2.idx} dwell=${ai2.state}`);
  return {log, ai:{state:ai.state,s:Math.round(ai.s)}};
});
console.log(JSON.stringify(out,null,1));
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
