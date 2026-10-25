import { _electron } from 'playwright';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const base='/Users/agmazin/Library/Developer/paseo-tabs/desktop-test';
const home='/Users/agmazin/Library/Developer/paseo-kanban/test-home';
const pid=JSON.parse(readFileSync(`${home}/paseo.pid`));
assert.equal(pid.listen,'127.0.0.1:6786');
const root='03e7e46f-0eaa-4068-9a43-c1a15d3fca97',child='d8198484-a39c-4f55-9000-fa99e206011c';
const install=path=>{
 execFileSync('paseo',['plugin','remove','paseo-tabs','--host',pid.listen],{stdio:'pipe'});
 execFileSync('paseo',['plugin','install',path,'--host',pid.listen],{stdio:'pipe'});
};
const c=new DaemonClient({url:`ws://${pid.listen}/ws`,clientId:'desktop-close-regression',clientType:'cli',localCredential:()=>readFileSync(`${home}/local-credential`,'utf8').trim(),reconnect:{enabled:false}});
let electron;
const out=resolve('docs/shots/0.3.1');mkdirSync(out,{recursive:true});
const report={client:'Paseo app-dist 0.13.0',daemon:'0.12.0',electron:null,legacyRetained:false,baselineArchived:false,checks:[]};
try{
 await c.connect();assert.equal((await c.getDaemonStatus()).version,'0.12.0');
 const originals=new Map();for(const id of [root,child])originals.set(id,(await c.fetchAgent(id)).agent);
 const restore=async()=>{for(const [id,old]of originals){if((await c.fetchAgent(id)).agent.archivedAt){const a=await c.importAgent({provider:old.provider,sessionId:old.persistence.sessionId,cwd:old.cwd,workspaceId:old.workspaceId,labels:old.labels});assert.equal(a.id,id);await c.updateAgent(id,{name:old.title,labels:old.labels});}}};
 await restore();install(`${base}/legacy-tabs`);
 electron=await _electron.launch({executablePath:process.env.ELECTRON_PATH||`${base}/runtime44/Electron.app/Contents/MacOS/Electron`,args:[resolve('tests/browser/desktop-host.cjs')]});
 report.electron=await electron.evaluate(()=>process.versions.electron);
 const p=await electron.firstWindow();
 p.on("pageerror",error=>console.log("PAGE ERROR",error.message));
 await p.getByTestId(`dialogs-agent-${root}`).waitFor({timeout:30000});
 assert.equal(await p.evaluate(()=>!!window.paseoDesktop),true);
 await p.waitForFunction(()=>window.__paseoTabs?.count===1);
 // Retain the real 0.2.1 instance as a second connected host would do.
 await p.evaluate(()=>window.__paseoTabs.count++);
 install(`${base}/baseline-tabs`);
 await p.waitForFunction(()=>window.__paseoTabs?.count===2);
 report.legacyRetained=await p.evaluate(()=>!document.documentElement.hasAttribute('data-paseo-tabs-close'));
 assert.equal(report.legacyRetained,true);
 await p.getByTestId(`dialogs-agent-${root}`).click();
 await p.getByTestId(`workspace-tab-agent_${root}`).hover();
 await p.getByTestId(`workspace-agent-close-${root}`).click();
 await p.waitForTimeout(500);
 report.baselineArchived=!!(await c.fetchAgent(root)).agent.archivedAt;
 assert.equal(report.baselineArchived,true,'0.3.0 must reproduce archive with a retained 0.2.1 instance');
 console.log('REPRO: desktop 0.13 + daemon 0.12, retained 0.2.1 instance bypasses 0.3.0 close adapter and archives root');
 install(resolve('.'));
 await p.waitForSelector('html[data-paseo-tabs-close-version="0.3.1"]',{timeout:20000});
 await p.waitForSelector('html[data-paseo-tabs-keyboard="ready"]',{timeout:20000});
 await restore();
 const workspace=originals.get(root).workspaceId;
 const open=async id=>{
  if(id===root)await p.getByTestId(`dialogs-agent-${root}`).click();
  else await p.evaluate(async({workspace,id})=>{
   for(const script of document.scripts){
    if(!script.src.includes('/static/js/'))continue;
    const source=await(await fetch(script.src)).text();
    for(const line of source.split('\n')){
     if(!line.includes('hideAgent:')||!line.includes('unhideAgent:')||!line.includes('closeTab:'))continue;
     const match=line.match(/\},(\d+),\[[\d,]*\]\);$/);if(!match)continue;
     for(const store of Object.values(window.__r(Number(match[1])))){
      if(typeof store?.getState!=='function')continue;
      const state=store.getState();if(!state.layoutByWorkspace||typeof state.hideAgent!=='function')continue;
      const key=Object.keys(state.layoutByWorkspace).find(key=>key.endsWith(':'+workspace));
      if(!key)throw new Error('test workspace layout missing');
      state.openTab({workspaceKey:key,target:{kind:'agent',agentId:id},pin:true});return;
     }
    }
   }
   throw new Error('test layout store missing');
  },{workspace,id});
  await p.getByTestId(`workspace-tab-agent_${id}`).waitFor();
 };
 for(const id of [root,child])for(const action of ['cross','Cmd+W']){
  await open(id);
  console.log('CHECK',id,action,await p.evaluate(()=>({ready:document.documentElement.getAttribute('data-paseo-tabs-close-version'),singleton:window.__paseoTabsClose?.version})));
  if(action==='cross'){await p.getByTestId(`workspace-tab-agent_${id}`).hover();await p.getByTestId(`workspace-agent-close-${id}`).click();}
  else await p.keyboard.press('Meta+w');
  await p.waitForTimeout(500);
  assert.equal(await p.getByTestId(`workspace-tab-agent_${id}`).count(),0);
  console.log('AFTER',action,await p.evaluate(()=>({last:window.__paseoTabsClose?.lastShortcut,route:location.pathname})));
  assert.equal(!!(await c.fetchAgent(id)).agent.archivedAt,false);
  report.checks.push({id,kind:id===root?'root':'subagent',action,archived:false});
 }
 await p.screenshot({path:`${out}/desktop-root-child-closed.png`});
 await p.reload();await p.waitForSelector('html[data-paseo-tabs-close-version="0.3.1"]');
 for(const id of [root,child])assert.equal(await p.getByTestId(`workspace-tab-agent_${id}`).count(),0);
 report.persistedAfterReload=true;
 await open(root);await open(child);
 await p.screenshot({path:`${out}/desktop-root-child-reopened.png`});
 report.reopen=true;
 writeFileSync('docs/desktop-close-0.3.1.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
}finally{await electron?.close();await c.close();install(resolve('.'));}
