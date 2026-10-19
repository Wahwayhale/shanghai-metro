const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const VOICES=[
 {name:'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',lang:'zh-CN',localService:false,voiceURI:'xs'},
 {name:'Microsoft Huihui Desktop',lang:'zh-CN',localService:true,voiceURI:'hh'},
 {name:'Microsoft Aria Online (Natural) - English (United States)',lang:'en-US',localService:false,voiceURI:'ar'}
];
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument((vs)=>{
  window.__paLog=[];
  const fake={
    speak(u){window.__paLog.push({t:u.text,at:+((performance.now()-window.__t0)/1000).toFixed(1)});
      setTimeout(()=>u.onstart&&u.onstart(),5);setTimeout(()=>u.onend&&u.onend(),40);},
    cancel(){},getVoices(){return vs.map(v=>Object.assign({},v));},onvoiceschanged:null
  };
  Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});
  window.__t0=performance.now();
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2500));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,500));await p.click('#brGo');
for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,4000));
console.log('--- 起始欢迎 ---');
console.log(JSON.stringify(await p.evaluate(()=>window.__paLog)));
console.log('voice', await p.evaluate(()=>window.__sim.AUDIO.voiceName));

// 关车门 → 起步
await p.evaluate(()=>{window.__sim.closeDoors();});
await new Promise(r=>setTimeout(r,2500));
console.log('--- 关门 ---');
console.log(JSON.stringify(await p.evaluate(()=>window.__paLog)));

// 牵引，推进到出站
await p.evaluate(()=>{const S=window.__sim;S.setLever(0.85);});
for(let i=0;i<40;i++){await p.evaluate(()=>window.__sim.advance(0.3));await new Promise(r=>setTimeout(r,120));}
console.log('--- 发车后 ---', await p.evaluate(()=>({v:+(window.__sim.G.v*3.6).toFixed(0),s:Math.round(window.__sim.G.s),tgt:window.__sim.G.targetIdx,paTimer:+window.__sim.G.paTimer.toFixed(1)})));
console.log(JSON.stringify(await p.evaluate(()=>window.__paLog)));

// 播报时的环境音让位
console.log('duck', await p.evaluate(()=>+window.__sim.AUDIO.duckTarget.toFixed(2)));
console.log('ERRORS',JSON.stringify(errs.slice(0,4)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
