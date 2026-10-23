// 0.2.1: Paseo's "+" (new tab) stays in view at the right end of the scrolled strip and works as native.
import { chromium } from '/Users/agmazin/Library/Developer/paseo-dialogs/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/Users/agmazin/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const p = await b.newPage({ viewport: { width: 1560, height: 800 }, colorScheme: 'dark', locale: 'ru-RU' });
p.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)));
await p.goto('http://127.0.0.1:6793'); await p.waitForTimeout(2500);
if (!(await p.getByText('Общий ИИ', { exact: false }).count())) { await p.getByText('ЭкоЭксперт', { exact: true }).first().click(); await p.waitForTimeout(600); }
await p.getByText('Общий ИИ', { exact: false }).first().click();
await p.waitForSelector('.pt-all', { timeout: 10000 }); await p.waitForTimeout(1000);
const check = (label) => p.evaluate((label) => {
  const sc = document.querySelector('[data-paseo-tabs]');
  const plus = sc.querySelector('[data-testid="workspace-new-tab-button"]');
  const s = sc.getBoundingClientRect(), r = plus.getBoundingClientRect();
  const edge = document.querySelector('.pt-edge.pt-right.pt-show')?.getBoundingClientRect();
  return `${label}: overflow=${sc.scrollWidth > sc.clientWidth} scroll=${Math.round(sc.scrollLeft)}/${sc.scrollWidth - sc.clientWidth} plus in view=${r.left >= s.left - 1 && r.right <= s.right + 1} edge overlaps plus=${!!edge && edge.right > r.left}`;
}, label);
console.log(await check('start'));
await p.evaluate(() => { const sc = document.querySelector('[data-paseo-tabs]'); sc.scrollLeft = 0; }); await p.waitForTimeout(400);
console.log(await check('left end'));
await p.evaluate(() => { const sc = document.querySelector('[data-paseo-tabs]'); sc.scrollLeft = sc.scrollWidth; }); await p.waitForTimeout(400);
console.log(await check('right end'), '| last tab left of +:', await p.evaluate(() => {
  const sc = document.querySelector('[data-paseo-tabs]');
  const tabs = [...sc.querySelectorAll('button[data-testid^="workspace-tab-"][aria-selected]')];
  return tabs[tabs.length - 1].getBoundingClientRect().right <= sc.querySelector('[data-testid="workspace-new-tab-button"]').parentElement.getBoundingClientRect().left + 1;
}));
await p.evaluate(() => { document.querySelector('[data-paseo-tabs]').scrollLeft = 0; }); await p.waitForTimeout(300);
await p.screenshot({ path: '/tmp/kbt/99-tabs-plus.png', clip: { x: 0, y: 0, width: 1560, height: 90 } });
await p.locator('[data-paseo-tabs] [data-testid="workspace-new-tab-button"]').click(); await p.waitForTimeout(800);
console.log('menu after +:', (await p.evaluate(() => document.body.innerText)).match(/Новый агент|Агент|Терминал/g)?.slice(0, 3));
await p.screenshot({ path: '/tmp/kbt/99b-tabs-plus-menu.png', clip: { x: 0, y: 0, width: 1560, height: 400 } });
await b.close();
