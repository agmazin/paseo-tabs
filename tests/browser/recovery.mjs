import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const home='/Users/agmazin/Library/Developer/paseo-tabs/test-home';
const c=new DaemonClient({url:'ws://127.0.0.1:6793/ws',clientId:'recovery-test',clientType:'cli',localCredential:()=>readFileSync(home+'/local-credential','utf8').trim(),reconnect:{enabled:false}});
const ids=['a84428e1-85ca-4985-bddf-35034427bb6c','34b55ee5-54d9-4949-a6c9-3f41c88ad8ff','49c12ece-af97-4600-bd74-f886baabb6bf'];
const originals=[];
const report=[];
const restore=async a=>{
 if((await c.fetchAgent(a.id)).agent.archivedAt){const result=await c.importAgent({provider:a.provider,sessionId:a.persistence.sessionId,cwd:a.cwd,workspaceId:a.workspaceId,labels:a.labels});assert.equal(result.id,a.id);}
 await c.updateAgent(a.id,{name:a.title,labels:a.labels});
};
try{
 await c.connect();assert.equal((await c.getDaemonStatus()).version,'0.12.0');
 for(const id of ids)originals.push((await c.fetchAgent(id)).agent);
 for(let i=0;i<ids.length;i++){
  const id=ids[i], at=Date.now();
  if(i===2)await c.updateAgent(id,{labels:{...originals[i].labels,'paseo.explicit-archive-at':new Date().toISOString()}});
  if(i!==1)await c.invokePluginRpc('paseo-tabs','tabs.watch',{intents:[{id,at}]});
  await c.archiveAgent(id);
  for(let n=0;n<30;n++){
   await new Promise(r=>setTimeout(r,100));
   if(i!==1)await c.invokePluginRpc('paseo-tabs','tabs.watch',{intents:[{id,at}]});
   if(i===0&&!(await c.fetchAgent(id)).agent.archivedAt)break;
  }
  const agent=(await c.fetchAgent(id)).agent;
  assert.equal(!!agent.archivedAt,i!==0);
  if(i===0){assert.ok(agent.labels['paseo.tabs-recovered-at']);assert.equal(agent.id,id);assert.equal(agent.title,originals[i].title);}
  report.push({case:['confirmed-close','CLI-without-intent','explicit-archive'][i],archived:!!agent.archivedAt,sameId:agent.id===id});
  if(i===0){
   await c.archiveAgent(id);
   await c.invokePluginRpc('paseo-tabs','tabs.watch',{intents:[{id,at}]});
   await new Promise(r=>setTimeout(r,500));
   assert.equal(!!(await c.fetchAgent(id)).agent.archivedAt,true);
   report.push({case:'consumed-intent-does-not-revive-later-CLI-archive',archived:true});
  }
  await restore(originals[i]);
 }
 writeFileSync('docs/recovery-0.3.2.json',JSON.stringify(report,null,2)+'\n');console.log(report);
}finally{for(const a of originals)await restore(a);await c.close();}
