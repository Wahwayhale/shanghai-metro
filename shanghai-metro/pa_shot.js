const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const VOICES=[
 {name:'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',lang:'zh-CN',localService:false,voiceURI:'xs'},
 {name:'Microsoft Huihui Desktop',lang:'zh-CN',localService:true,voiceURI:'hh'},
 {name:'Microsoft Yaoyao',lang:'zh-CN',localService:true,voiceURI:'yy'},
 {name:'Microsoft Aria Online (Natural) - English (United States)',lang:'en-US',localService:false,voiceURI:'ar'}
];
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument((vs)=>{
  const fake={speak(u){setTimeout(()=>u.onend&&u.onend(),9000);},cancel(){},getVoices(){return vs.map(v=>Object.assign({},v));},onvoiceschanged:null};
  Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,500));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{const S=window.__sim;S.closeDoors();S.advance(3.6);S.snapCam();});
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{const A=window.__sim.AUDIO;window.__capCalls=[];const o=A.onCaption;A.onCaption=(zh,en)=>{window.__capCalls.push([zh?zh.slice(0,10):null,Math.round(performance.now())]);o&&o(zh,en);};});
// 触发到站播报（长时长，便于截图）
await p.evaluate(()=>{const S=window.__sim;const P=S.path;S.G.s=P.stations[1].stopS-6;S.G.v=2.2;S.G.targetIdx=1;S.G.stopState='run';S.setLever(-0.8);S.snapTrain();S.snapCam();S.advance(4.5);S.snapCam();});
await new Promise(r=>setTimeout(r,300));
console.log('CAPCALLS',JSON.stringify(await p.evaluate(()=>window.__capCalls||[])));
console.log('CLS',await p.evaluate(()=>document.getElementById('paCaption').className));
await p.screenshot({path:base+'/shanghai-metro/pa_cap.png'});
console.log('CAP',JSON.stringify(await p.evaluate(()=>{const e=document.getElementById('paCaption');const r=e.getBoundingClientRect();return {on:e.classList.contains('on'),zh:e.querySelector('b').textContent,top:Math.round(r.top),bot:Math.round(r.bottom)};})));
// 暂停面板
await p.evaluate(()=>{window.__sim.G.paused=false;});
await p.keyboard.press('Escape');
await new Promise(r=>setTimeout(r,900));
await p.screenshot({path:base+'/shanghai-metro/pa_panel.png'});
console.log('SEL',JSON.stringify(await p.evaluate(()=>{const s=document.getElementById('voiceSel');return {opts:[...s.options].map(o=>o.text),val:s.value};})));
console.log('ERR',errs.slice(0,3));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
