const puppeteer=require('puppeteer-core');const path=require('path');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base = require('./testenv').ROOT;
const file='file:///'+path.resolve(base+'/上海地铁模拟驾驶.html').replace(/\\/g,'/');
const VOICES=[
 {name:'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',lang:'zh-CN',localService:false,voiceURI:'xs'},
 {name:'Microsoft Yunxi Online (Natural) - Chinese (Mainland)',lang:'zh-CN',localService:false,voiceURI:'yx'},
 {name:'Microsoft Huihui Desktop',lang:'zh-CN',localService:true,voiceURI:'hh'},
 {name:'Microsoft Kangkang',lang:'zh-CN',localService:true,voiceURI:'kk'},
 {name:'Microsoft Aria Online (Natural) - English (United States)',lang:'en-US',localService:false,voiceURI:'ar'},
 {name:'Microsoft Zira Desktop',lang:'en-US',localService:true,voiceURI:'zr'}
];
(async()=>{
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],defaultViewport:{width:1280,height:720}});
const p=await b.newPage();
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.evaluateOnNewDocument((vs)=>{
  window.__paLog=[];
  const fake={
    speak(u){window.__paLog.push({t:u.text,lang:u.lang,rate:+u.rate.toFixed(2),voice:(u.voice&&u.voice.name)||'auto'});
      setTimeout(()=>u.onstart&&u.onstart(),5);setTimeout(()=>u.onend&&u.onend(),40);},
    cancel(){},pause(){},resume(){},
    getVoices(){return vs.map(v=>Object.assign({},v));},
    onvoiceschanged:null
  };
  Object.defineProperty(window,'speechSynthesis',{value:fake,configurable:true});
},VOICES);
await p.goto(file,{waitUntil:'load',timeout:90000});
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>{const S=window.__sim;S.AUDIO.init();S.AUDIO.setVolume(0.6);});
await new Promise(r=>setTimeout(r,1200));

const res=await p.evaluate(()=>{
  const S=window.__sim, PA=S.PA, A=S.AUDIO, L=S.line;
  const out={};
  out.voice=A.zhVoice&&A.zhVoice.name;
  out.enVoice=A.enVoice&&A.enVoice.name;
  out.rank=A.zhVoices.map(x=>x.v.name+'('+x.s+')');
  const st=L.stations;
  out.next=PA.next(st[3],1);
  out.arrive=PA.arrive(st[3],1);
  out.open=PA.doorsOpen();
  out.close=PA.doorsClose();
  out.welcome=PA.welcome(L,st[0],st[st.length-1]);
  out.term=PA.terminus(st[st.length-1]);
  out.courtesy=PA.courtesy(1);
  return out;
});
console.log('VOICE', res.voice, '|', res.enVoice);
console.log('RANK', JSON.stringify(res.rank));
console.log('NEXT', JSON.stringify(res.next));
console.log('ARRIVE', JSON.stringify(res.arrive));
console.log('OPEN', JSON.stringify(res.open));
console.log('CLOSE', JSON.stringify(res.close));
console.log('WELCOME', JSON.stringify(res.welcome));
console.log('TERM', JSON.stringify(res.term));

// 播放队列测试
await p.evaluate(()=>{const S=window.__sim;window.__paLog=[];S.AUDIO.announce(S.PA.arrive(S.line.stations[1],1).zh,S.PA.arrive(S.line.stations[1],1).en,{chime:true});});
await new Promise(r=>setTimeout(r,2000));
const log=await p.evaluate(()=>window.__paLog);
console.log('QUEUE', JSON.stringify(log,null,0));

// 字幕
const cap=await p.evaluate(()=>{const e=document.getElementById('paCaption');return {on:e.classList.contains('on'),zh:e.querySelector('b').textContent,en:e.querySelector('span').textContent};});
console.log('CAPTION', JSON.stringify(cap));
console.log('ERRORS', JSON.stringify(errs.slice(0,5)));
await b.close();})().catch(e=>{console.error('FATAL',e);process.exit(1)});
