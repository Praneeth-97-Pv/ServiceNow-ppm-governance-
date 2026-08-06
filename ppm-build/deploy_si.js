const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i>0&&!(t.slice(0,i).trim() in process.env))process.env[t.slice(0,i).trim()]=t.slice(i+1).trim();}
const BASE=process.env.SERVICENOW_INSTANCE_URL.replace(/\/+$/,'');
const AUTH='Basic '+Buffer.from(`${process.env.SERVICENOW_USERNAME}:${process.env.SERVICENOW_PASSWORD}`).toString('base64');
async function api(p,o={}){const r=await fetch(new URL(p,BASE),{method:o.method||'GET',headers:{Authorization:AUTH,Accept:'application/json','Content-Type':'application/json'},body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();const j=JSON.parse(t);if(!r.ok)throw new Error(`HTTP ${r.status}: ${t.slice(0,200)}`);return j.result;}
(async()=>{
  const dir=path.join(__dirname,'si');
  for(const f of fs.readdirSync(dir)){
    const name=f.replace(/\.js$/,'');
    const script=fs.readFileSync(path.join(dir,f),'utf8');
    const found=await api(`/api/now/table/sys_script_include?sysparm_query=name=${name}&sysparm_fields=sys_id&sysparm_limit=1`);
    if(!found.length){console.log(`  MISSING on instance: ${name}`);continue;}
    await api(`/api/now/table/sys_script_include/${found[0].sys_id}`,{method:'PATCH',body:{script}});
    console.log(`  UPDATED  ${name} (${script.split('\n').length} lines)`);
  }
})().catch(e=>{console.error('FAILED: '+e.message);process.exit(1);});
