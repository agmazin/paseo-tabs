import { _electron } from 'playwright';
import { resolve } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base=resolve('.fixture');
const fixture=JSON.parse(readFileSync(`${base}/fixtures.json`));
const pid=JSON.parse(readFileSync(`${base}/home/paseo.pid`));
assert.equal(pid.listen,'127.0.0.1:6812');
const out=resolve('docs/evidence/close-choice-0.4.2/visual');mkdirSync(out,{recursive:true});
const electron=await _electron.launch({executablePath:'/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron',args:[resolve('tests/browser/choice-host.cjs')],env:{...process.env,CLOSE_FIXTURE_BASE:base,CLOSE_PROFILE:'visual-final'}});
const records=[];
try {
 const page=await electron.firstWindow();
 await page.goto(`paseo://app/h/${pid.serverId}/workspace/${fixture.workspaceId}`);
 await page.waitForFunction(()=>window.__paseoTabClosePolicy?.version === "0.4.2" && window.__paseoTabClosePolicy.store);
 for(const theme of ['light','dark']) for(const [layout,width,height] of [['wide',1440,900],['compact',390,844]]) {
  await page.setViewportSize({width,height});
  await page.evaluate(theme=>{const r=window.__r(160).UnistylesRuntime;r.setAdaptiveThemes(false);r.setTheme(theme);},theme);
  await page.waitForTimeout(500);
  await page.evaluate(({fixture,pid})=>{
   const workspaceKey=`${pid.serverId}:${fixture.workspaceId}`,agentId=fixture.ids[0];
   window.__paseoTabClosePolicy.store.getState().openTab({workspaceKey,target:{kind:'agent',agentId},intent:'reveal',pin:true});
   window.__visualChoice=window.__paseoTabClosePolicy.choose({workspaceKey,tabId:`agent_${agentId}`,agentId,title:'AGM-24: Paseo'});
  },{fixture,pid});
  await page.getByTestId('paseo-tab-close-cancel').waitFor();
  await page.getByRole('dialog',{name:'Закрыть вкладку?',exact:true}).waitFor();await page.waitForTimeout(800);
  const metrics=await page.evaluate(()=>{
   const names=['cancel','close','archive'];
   return names.map(name=>{const n=document.querySelector(`[data-testid="paseo-tab-close-${name}"]`),r=n.getBoundingClientRect(),s=getComputedStyle(n),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name,box:{x:r.x,y:r.y,width:r.width,height:r.height},background:s.backgroundColor,color:s.color,radius:s.borderRadius,outline:s.outlineStyle,visibleAtCenter:n===top||n.contains(top),svg:!!n.querySelector('svg')};});
  });
  assert.ok(metrics.every(m=>m.visibleAtCenter),JSON.stringify(metrics));
  assert.equal(metrics[0].outline,'none');assert.ok(metrics[0].svg);assert.equal(metrics[2].background,'rgb(249, 115, 22)');
  assert.ok(metrics.every(m=>m.box.x>=0&&m.box.x+m.box.width<=width));
  await page.screenshot({path:`${out}/${theme}-${layout}.png`});
  await page.keyboard.press('Tab');assert.equal(await page.getByTestId('paseo-tab-close-close').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
  await page.getByTestId('paseo-tab-close-cancel').click();assert.equal(await page.evaluate(()=>window.__visualChoice),'cancel');
  if (theme === 'light' && layout === 'wide') {
   await page.evaluate(({fixture,pid})=>{const agentId=fixture.ids[0];window.__hiddenChoice=window.__paseoTabClosePolicy.choose({workspaceKey:`${pid.serverId}:${fixture.workspaceId}`,tabId:`agent_${agentId}`,agentId});},{fixture,pid});
   await page.getByTestId('paseo-tab-close-archive').waitFor();
   await page.getByRole('dialog',{name:'Закрыть вкладку?',exact:true}).evaluate(n=>{n.style.opacity='0';n.querySelector('[data-testid="paseo-tab-close-archive"]').click();});
   assert.equal(await page.evaluate(()=>window.__hiddenChoice),'cancel');
  }
  await page.evaluate(({width,height})=>{
   const load=window.__r,R=load(35),h=R.createElement;
   const mount=document.createElement('div');mount.style.cssText='position:fixed;inset:0;display:flex;flex-direction:column;pointer-events:none';document.body.appendChild(mount);
   const root=load(87).createRoot(mount);
   window.__referenceCleanup=()=>{root.unmount();mount.remove();};
   const modal=h(load(4575).AdaptiveRenameModal,{visible:true,title:'Переименовать рабочее пространство',initialValue:'Close fixtures',testID:'paseo-reference',onClose:window.__referenceCleanup,onSubmit:()=>{throw Error('Reference is read only');}});
   const providers=h(load(480).SafeAreaProvider,{initialMetrics:{frame:{x:0,y:0,width,height},insets:{top:0,right:0,bottom:0,left:0}}},
    h(load(3679).GestureHandlerRootView,{style:{flex:1}},h(load(3676).BottomSheetModalProvider,null,modal)));
   load(90).flushSync(()=>root.render(providers));
  },{width,height});
  await page.waitForTimeout(900);
  await page.screenshot({path:`${out}/paseo-reference-${theme}-${layout}.png`});
  await page.evaluate(()=>window.__referenceCleanup());
  records.push({theme,layout,metrics});
 }
 writeFileSync(`${out}/metrics.json`,JSON.stringify(records,null,2)+'\n');console.log('Four theme/layout screenshots, real hit testing, SVG X without initial outline, Tab ring, pointer cancel passed');
} finally { await electron.close(); }
