const {spawnSync}=require("child_process");
const r=spawnSync("C:/Users/35498/.workbuddy/binaries/node/versions/22.22.2-6/node.exe",["-e","console.log(1+1)"],{encoding:"utf8"});
console.log("status",r.status,"err",r.error&&r.error.code,"out",(r.stdout||"").trim());
