// Снимает родную вёрстку ленты вкладок на тестовом демоне 6793 (только чтение).
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const root = "http://127.0.0.1:6793";
const out = process.argv[2] || "/tmp/paseo-tabs-check";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1560, height: 975 }, colorScheme: "dark" });
await p.goto(root);
await p.waitForTimeout(2500);
await p.getByText("ЭкоЭксперт").first().click().catch(() => {});
await p.waitForTimeout(2000);
await p.screenshot({ path: `${out}/native-ws.png` });
const info = await p.evaluate(() => {
  const row = document.querySelector('[data-testid="workspace-tabs-row"]');
  const sc = document.querySelector('[data-testid="workspace-tabs-scroll"]');
  const tab = document.querySelector('[data-testid^="workspace-tab-agent_"]');
  const chain = [];
  for (let n = tab; n && n !== sc; n = n.parentElement) chain.push(`${n.tagName} tid=${n.dataset.testid || ''} style="${n.getAttribute('style') || ''}" cls="${n.className}"`);
  const strip = (h) => h.replace(/<path[^>]*>/g, '<path/>').replace(/class="[^"]{60,}"/g, 'class="…"');
  return {
    chain: chain.join('\n'),
    tabHTML: strip(tab.parentElement.parentElement.outerHTML).slice(0, 4000),
    rowKids: [...row.children].map(c => `${c.tagName} tid=${c.dataset.testid || ''} w=${Math.round(c.getBoundingClientRect().width)} x=${Math.round(c.getBoundingClientRect().x)} style="${(c.getAttribute('style') || '').slice(0, 100)}"`),
    scrollParentKids: [...sc.parentElement.children].map(c => `${c.tagName} tid=${c.dataset.testid || ''} w=${Math.round(c.getBoundingClientRect().width)}`),
    scrollKids: [...sc.children].map(c => `${c.tagName} tid=${c.dataset.testid || ''} kids=${c.children.length} w=${Math.round(c.getBoundingClientRect().width)} style="${c.getAttribute('style') || ''}"`),
    scrollCS: (() => { const s = getComputedStyle(sc); return { ox: s.overflowX, w: sc.clientWidth, sw: sc.scrollWidth, cls: sc.className }; })(),
    labels: [...document.querySelectorAll('[data-testid^="workspace-tab-agent_"],[data-testid^="workspace-tab-terminal_"]')].map(n => `${n.dataset.testid.slice(14, 30)} sel=${n.getAttribute('aria-selected')} w=${Math.round(n.getBoundingClientRect().width)} "${n.textContent.trim()}" aria="${n.getAttribute('aria-label') || ''}"`),
  };
});
writeFileSync(`${out}/native-dom.json`, JSON.stringify(info, null, 1));
console.log(info.chain, '\n---\n', info.rowKids.join('\n'), '\n---\n', info.scrollParentKids.join('\n'), '\n---\n', info.scrollKids.join('\n'), '\n---\n', JSON.stringify(info.scrollCS), '\n---\n', info.labels.join('\n'));
await b.close();
