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
 for(let i=0;i<50;i++){
  const mode=i%5;
  if(mode===2) {
    const previous=p;
    const created=electron.waitForEvent('window');
    await electron.evaluate(async({BrowserWindow})=>{
      const w=new BrowserWindow({show:false,width:1440,height:900,webPreferences:{preload:'/Applications/Paseo.app/Contents/Resources/app.asar/dist/preload.js',sandbox:true,contextIsolation:true}});
      await w.loadURL('paseo://app/');
    });
    p=await created;
    await p.getByTestId('dialogs-agent-'+id).waitFor({timeout:30000});
    await previous.close();
  }
  if(mode===0) { await p.reload(); await p.getByTestId('dialogs-agent-'+id).waitFor(); }
  await p.getByTestId('dialogs-agent-'+id).click();
  await p.getByTestId('workspace-tab-agent_'+id).waitFor();
  if(mode===1)execFileSync('/Users/agmazin/Library/Developer/paseo-tabs/runtime012/node_modules/.bin/paseo',['plugin','reload','paseo-tabs','--host','127.0.0.1:6793'],{stdio:'pipe'});
  if(i%2)await p.keyboard.press('Meta+w');
  else {await p.getByTestId('workspace-tab-agent_'+id).hover();await p.getByTestId('workspace-agent-close-'+id).click();}
  await p.waitForTimeout(100);
  const archived=!!(await c.fetchAgent(id)).agent.archivedAt;
  if(archived)report.archiveEvents++;
  assert.equal(archived,false,'archive at iteration '+i);
  await p.waitForFunction(id=>!document.querySelector('[data-testid="workspace-tab-agent_'+id+'"]'),id);
  report.checks.push({i,mode,action:i%2?'Cmd+W':'cross',archived});
  console.log('PASS',i,mode);
 }
 writeFileSync('docs/desktop-race-0.3.2.json',JSON.stringify(report,null,2)+'\n');
}finally{await electron?.close();await c.close();}
