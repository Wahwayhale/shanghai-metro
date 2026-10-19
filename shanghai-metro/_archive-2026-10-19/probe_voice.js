const puppeteer=require('puppeteer-core');
const EDGE='C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
(async()=>{
console.log('launching');
const b=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--no-sandbox'],protocolTimeout:30000});
console.log('launched');
const p=await b.newPage();
console.log('page');
await p.setContent('<html><body>hi</body></html>');
console.log('content');
const vs=await p.evaluate(()=>{
  const v=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
  return {has:!!window.speechSynthesis, n:v.length, list:v.map(x=>({name:x.name,lang:x.lang,local:x.localService}))};
});
console.log('VOICES',JSON.stringify(vs).slice(0,1200));
await b.close();})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
