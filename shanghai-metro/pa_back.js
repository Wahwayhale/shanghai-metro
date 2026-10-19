const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const VOICES=[{name:'Microsoft Huihui Desktop',lang:'zh-CN',localService:true,voiceURI:'hh'}];
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument((vs)=>{
  window.__paLog=[];window.__cancel=0;
  const fake={speak(u){window.__paLog.push(u.text);setTimeout(()=>u.onend&&u.onend(),30);},
    cancel(){window.__cancel++;},getVoices(){return vs.map(v=>Object.assign({},v));},onvoiceschanged:null};
  Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});
  class FakeU{constructor(t){this.text=t;this.lang='';this.rate=1;this.pitch=1;this.volume=1;this.voice=null;}}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:FakeU,configurable:true});
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,500));await p.click('#brGo');
for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,1200));if(await p.evaluate(()=>window.__sim.G.mode)==='driving')break;}
await new Promise(r=>setTimeout(r,1500));

console.log('1 值乘开始', JSON.stringify(await p.evaluate(()=>window.__paLog)));
// 关门
await p.evaluate(()=>{window.__sim.closeDoors();window.__sim.advance(3.6);});
await new Promise(r=>setTimeout(r,900));
console.log('2 关门后', JSON.stringify(await p.evaluate(()=>window.__paLog.slice(1))));
// 发车
await p.evaluate(()=>{const S=window.__sim;S.setLever(0.8);S.advance(2);});
await new Promise(r=>setTimeout(r,700));
console.log('3 发车', JSON.stringify(await p.evaluate(()=>window.__paLog.slice(-2))));
// 到站
await p.evaluate(()=>{const S=window.__sim,P=S.path;S.G.s=P.stations[1].stopS-19;S.G.v=6;S.G.targetIdx=1;S.G.stopState='run';S.setLever(-0.82);for(let i=0;i<40;i++){S.advance(0.25);if(S.G.v<0.04)break;}S.snapTrain();S.snapCam();});
await new Promise(r=>setTimeout(r,800));
console.log('4 到站', JSON.stringify(await p.evaluate(()=>window.__paLog.slice(-2))));
// 开门
await p.evaluate(()=>{window.__sim.openDoors();window.__sim.advance(0.5);});
await new Promise(r=>setTimeout(r,600));
console.log('5 开门', JSON.stringify(await p.evaluate(()=>window.__paLog.slice(-1))));
console.log('CAPTION_EL', await p.evaluate(()=>!!document.getElementById('paCaption')));
console.log('VOICESEL_EL', await p.evaluate(()=>!!document.getElementById('voiceSel')));
console.log('ERR',JSON.stringify(errs.slice(0,3)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
