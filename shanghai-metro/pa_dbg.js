const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const VOICES=[
 {name:'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',lang:'zh-CN',localService:false,voiceURI:'xs'},
 {name:'Microsoft Huihui Desktop',lang:'zh-CN',localService:true,voiceURI:'hh'}
];
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument((vs)=>{
  window.__paLog=[];window.__calls=[];
  const fake={
    speak(u){window.__paLog.push(u.text);setTimeout(()=>u.onstart&&u.onstart(),5);setTimeout(()=>u.onend&&u.onend(),40);},
    cancel(){window.__calls.push('cancel');},getVoices(){return vs.map(v=>Object.assign({},v));},onvoiceschanged:null
  };
  try{Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});window.__mockOK=true;}catch(e){window.__mockOK=String(e.message);}
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2000));
console.log('MOCK', await p.evaluate(()=>window.__mockOK));
console.log('BEFORE', await p.evaluate(()=>({ss:typeof speechSynthesis, has:!!window.speechSynthesis, voc:typeof (window.speechSynthesis&&window.speechSynthesis.getVoices)})));
await p.click('#startBtn');await new Promise(r=>setTimeout(r,1500));
console.log('AFTER_INIT', await p.evaluate(()=>{const A=window.__sim.AUDIO;return {ready:A.ready,ctx:!!A.ctx,voiceOn:A.voiceOn,zh:A.voiceName,paRun:A.paRunning,q:A.paQueue.length,gen:A.paGen};}));
await p.evaluate(()=>{window.__sim.AUDIO.announce('测试中文','Test English',{chime:true});});
await new Promise(r=>setTimeout(r,1500));
console.log('LOG', await p.evaluate(()=>window.__paLog));
console.log('CALLS', await p.evaluate(()=>window.__calls));
console.log('STATE', await p.evaluate(()=>{const A=window.__sim.AUDIO;return {paRun:A.paRunning,q:A.paQueue.length,gen:A.paGen,duck:+A.duckTarget};}));
console.log('ERR',errs.slice(0,4));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
