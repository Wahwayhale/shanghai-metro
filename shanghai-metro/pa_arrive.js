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
  const fake={speak(u){window.__paLog.push(u.text);setTimeout(()=>u.onstart&&u.onstart(),5);setTimeout(()=>u.onend&&u.onend(),40);},
    cancel(){},getVoices(){return vs.map(v=>Object.assign({},v));},onvoiceschanged:null};
  Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,400));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>{window.__sim.closeDoors(); window.__sim.advance(3.6);});
await new Promise(r=>setTimeout(r,1800));
// 跳到站前
await p.evaluate(()=>{const S=window.__sim;const P=S.path;S.G.s=P.stations[1].stopS-19;S.G.v=6;S.G.targetIdx=1;S.G.stopState='run';S.snapTrain();S.snapCam();});
await p.evaluate(()=>{const S=window.__sim;S.setLever(-0.82);});
for(let i=0;i<30;i++){
  const st=await p.evaluate(()=>window.__sim.advance(0.25));
  if(i%6===0)console.log('  step',i,JSON.stringify(st));
  if(st.v<0.05)break;
}
console.log('  final', JSON.stringify(await p.evaluate(()=>({state:window.__sim.G.stopState,s:+window.__sim.G.s.toFixed(1),target:window.__sim.path.stations[window.__sim.G.targetIdx].stopS.toFixed(1),v:window.__sim.G.v.toFixed(2)}))));
await new Promise(r=>setTimeout(r,2600));
console.log('--- 到站 ---');
console.log(JSON.stringify(await p.evaluate(()=>window.__paLog),null,0));
await p.screenshot({path:base+'/shanghai-metro/pa_arrive.png'});
// 开门
await p.evaluate(()=>{window.__sim.openDoors();window.__sim.advance(0.4);window.__sim.snapCam();});
await new Promise(r=>setTimeout(r,2200));
await p.screenshot({path:base+'/shanghai-metro/pa_open.png'});
console.log('--- 开门后 ---');
console.log(JSON.stringify(await p.evaluate(()=>window.__paLog.slice(-4)),null,0));
const cap=await p.evaluate(()=>{const e=document.getElementById('paCaption');const r=e.getBoundingClientRect();return {on:e.classList.contains('on'),zh:e.querySelector('b').textContent,w:Math.round(r.width),y:Math.round(r.top)};});
console.log('CAPTION',JSON.stringify(cap));
console.log('ERR',errs.slice(0,3));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
