import { _electron } from 'playwright';
import { DaemonClient } from '@getpaseo/client/internal/daemon-client';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const home='/Users/agmazin/Library/Developer/paseo-tabs/test-home';
const base='/Users/agmazin/Library/Developer/paseo-tabs/desktop-test';
const id='867be215-bdd8-4e24-885a-f4a3afa2928c';
const c=new DaemonClient({url:'ws://127.0.0.1:6793/ws',clientId:'race-test',clientType:'cli',localCredential:()=>readFileSync(home+'/local-credential','utf8').trim(),reconnect:{enabled:false}});
let electron;
const report={checks:[],archiveEvents:0,daemon:null};
try {
 await c.connect(); report.daemon=(await c.getDaemonStatus()).version;
 electron=await _electron.launch({executablePath:base+'/runtime44/Electron.app/Contents/MacOS/Electron',args:[resolve('tests/browser/desktop-host.cjs')],env:{...process.env,TABS_TEST_HOME:home,TABS_TEST_PROFILE:base+'/race-profile'}});
 let p=await electron.firstWindow();
 p.on('pageerror',e=>console.log('PAGE',e.message));
 p.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,400));});
 await p.getByTestId('dialogs-agent-'+id).waitFor({timeout:40000});
 await p.getByTestId('dialogs-agent-'+id).click();
 await p.waitForSelector('html[data-paseo-tabs-keyboard="ready"]');
 console.log('READY',await p.evaluate(()=>({guard:window.__paseoTabsClose?.version,dispatcher:!!window.__paseoTabsClose?.dispatcher})));

 await p.addInitScript(() => {
  localStorage.removeItem("paseo-tabs.layout-module.v1");
  const original=window.fetch;
  window.fetch=async(...args)=>{
   if(String(args[0]).includes('/static/js/'))await new Promise(resolve=>setTimeout(resolve,5000));
   return original(...args);
  };
  window.__testSockets=[];
  const Original=window.WebSocket;
  window.WebSocket=new Proxy(Original,{construct(target,args){const ws=new target(...args);window.__testSockets.push(ws);return ws;}});
 });
 await p.reload();
 await p.getByTestId('dialogs-agent-'+id).waitFor();
 await p.getByTestId('dialogs-agent-'+id).click();
 await p.getByTestId('workspace-tab-agent_'+id).waitFor();
 const early=await p.evaluate(()=>({ready:document.documentElement.hasAttribute('data-paseo-tabs-close'),dispatcher:!!window.__paseoTabsClose?.dispatcher}));
 assert.equal(early.ready,false,'must exercise pending discovery');
 assert.equal(early.dispatcher,true);
 await p.keyboard.press('Meta+w');
 await p.waitForFunction(id=>!document.querySelector('[data-testid="workspace-tab-agent_'+id+'"]'),id);
 assert.equal(!!(await c.fetchAgent(id)).agent.archivedAt,false);
 report.checks.push({case:'delayed-discovery-Cmd+W',archived:false,early});
 await p.getByTestId('dialogs-agent-'+id).click();
 await p.getByTestId('workspace-tab-agent_'+id).waitFor();
 await p.evaluate(()=>window.__testSockets.filter(ws=>ws.url.includes(':6793/')).forEach(ws=>ws.close()));
 await p.keyboard.press('Meta+w');
 await p.waitForTimeout(1000);
 assert.equal(!!(await c.fetchAgent(id)).agent.archivedAt,false);
 assert.equal(await p.getByTestId('workspace-tab-agent_'+id).count(),0);
 report.checks.push({case:'reconnect-Cmd+W',archived:false});
 await p.screenshot({path:'docs/desktop-edges-0.3.2.png'});
 writeFileSync('docs/desktop-edges-0.3.2.json',JSON.stringify(report,null,2)+'\n');
 console.log(report);
}finally{await electron?.close();await c.close();}
