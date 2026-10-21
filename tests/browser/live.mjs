// Живая проверка плагина на тестовом демоне 6793 в безголовом Chrome.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const root = "http://127.0.0.1:6793";
const out = process.argv[2] || "/tmp/paseo-tabs-check";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1560, height: 975 }, colorScheme: "dark" });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await p.goto(root);
await p.waitForTimeout(2500);
// "Диалоги" hide the native workspace list; expand the group if needed and open its first dialog.
if (!(await p.getByText("Общий ИИ", { exact: true }).count())) { await p.getByText("ЭкоЭксперт", { exact: true }).first().click(); await p.waitForTimeout(600); }
await p.getByText("Общий ИИ", { exact: true }).first().click();
await p.waitForSelector(".pt-all", { timeout: 10000 });
await p.waitForTimeout(800);
const state = () => p.evaluate(() => {
  const sc = document.querySelector('[data-paseo-tabs]');
  const tabs = [...sc.querySelectorAll('button[data-testid^="workspace-tab-"][aria-selected]')];
  const sel = tabs.find((t) => t.getAttribute("aria-selected") === "true");
  const sr = sc.getBoundingClientRect(), r = sel?.getBoundingClientRect();
  return {
    n: tabs.length, scroll: Math.round(sc.scrollLeft), max: sc.scrollWidth - sc.clientWidth,
    widths: tabs.slice(0, 4).map((t) => Math.round(t.getBoundingClientRect().width)),
    sel: sel?.getAttribute("aria-label"), selVisible: !!r && r.left >= sr.left - 1 && r.right <= sr.right + 1,
    left: document.querySelector(".pt-edge.pt-left.pt-show")?.textContent ?? null,
    right: document.querySelector(".pt-edge.pt-right.pt-show")?.textContent ?? null,
    button: document.querySelector(".pt-all")?.textContent,
    buttonAfterScroll: document.querySelector(".pt-all")?.previousElementSibling?.contains(sc),
  };
});
const s0 = await state();
console.log("start", s0);
assert.ok(s0.n >= 12); assert.ok(s0.widths.every((w) => w > 64), "tabs keep their label width"); assert.ok(s0.max > 0); assert.equal(s0.button, String(s0.n)); assert.ok(s0.buttonAfterScroll);
await p.screenshot({ path: `${out}/live-1-start.png` });
const box = await p.locator('[data-paseo-tabs]').boundingBox();
await p.mouse.move(box.x + 200, box.y + box.height / 2);
await p.mouse.wheel(0, 500);
await p.waitForTimeout(400);
const s1 = await state();
console.log("wheel", s1);
assert.ok(s1.scroll > 300, "wheel scrolls the strip"); assert.ok(s1.left && s1.right, "both counters shown");
await p.screenshot({ path: `${out}/live-2-wheel.png` });
await p.click(".pt-edge.pt-left"); await p.waitForTimeout(700);
const s2 = await state(); console.log("left counter", s2); assert.ok(s2.scroll < s1.scroll);
// native next-tab chord, many times: active tab must stay visible
await p.locator("body").click({ position: { x: 900, y: 500 } });
for (let i = 0; i < 14; i++) { await p.keyboard.press("Alt+Shift+BracketRight"); await p.waitForTimeout(120); }
await p.waitForTimeout(700);
const s3 = await state(); console.log("after 14 next", s3); assert.ok(s3.selVisible, "active tab revealed");
await p.screenshot({ path: `${out}/live-3-keys.png` });
// list + search + Enter
await p.click(".pt-all"); await p.waitForSelector(".pt-pop");
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/live-4-list.png` });
await p.keyboard.type("тенд"); await p.waitForTimeout(150);
const rows = await p.$$eval(".pt-row", (r) => r.map((x) => x.textContent));
console.log("search rows", rows); assert.equal(rows.length, 1);
await p.screenshot({ path: `${out}/live-5-search.png` });
await p.keyboard.press("Enter"); await p.waitForTimeout(800);
const s4 = await state(); console.log("after enter", s4);
assert.equal(s4.sel, "Тендеры"); assert.ok(s4.selVisible); assert.equal(await p.$(".pt-pop"), null);
// Escape and outside click close the list
await p.click(".pt-all"); await p.keyboard.press("Escape"); await p.waitForTimeout(100); assert.equal(await p.$(".pt-pop"), null);
await p.click(".pt-all"); await p.mouse.click(900, 600); await p.waitForTimeout(100); assert.equal(await p.$(".pt-pop"), null);
console.log("errors", errors);
await b.close();
