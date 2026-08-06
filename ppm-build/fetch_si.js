const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>0&&!(t.slice(0,i).trim() in process.env))process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();}
const BASE=process.env.SERVICENOW_INSTANCE_URL.replace(/\/+$/,'');
const AUTH='Basic '+Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64');
(async()=>{
  const names=process.argv.slice(2);
  const dir=path.join(__dirname,'oob'); fs.mkdirSync(dir,{recursive:true});
  for(const n of names){
    const r=await fetch(`${BASE}/api/now/table/sys_script_include?sysparm_query=name=${n}&sysparm_fields=name,script&sysparm_limit=1`,{headers:{Authorization:AUTH,Accept:'application/json'}});
    const j=await r.json();
    if(!j.result.length){console.log(`MISSING ${n}`);continue;}
    const f=path.join(dir,n+'.js');
    fs.writeFileSync(f,j.result[0].script);
    console.log(`${n}: ${j.result[0].script.split('\n').length} lines -> ${f}`);
  }
})();
