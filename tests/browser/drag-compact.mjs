// Перетаскивание вкладок с плагином, узкое окно и светлая тема на тестовом демоне 6793.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const root = "http://127.0.0.1:6793";
const out = process.argv[2] || "/tmp/paseo-tabs-check";
const b = await chromium.launch({ headless: true, channel: "chrome" });
// "Диалоги" hide the native workspace list: expand the group if needed and open a dialog.
const openChat = async (p) => {
  if (!(await p.getByText("Общий ИИ", { exact: true }).count())) { await p.getByText("ЭкоЭксперт", { exact: true }).first().click(); await p.waitForTimeout(600); }
  await p.getByText("Общий ИИ", { exact: true }).first().click();
};
const order = (p) => p.$$eval('[data-paseo-tabs] button[aria-selected]', (n) => n.map((x) => x.getAttribute("data-testid").slice(14, 26)));
{
  const p = await b.newPage({ viewport: { width: 1560, height: 975 }, colorScheme: "dark" });
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(root); await p.waitForTimeout(2500);
  await openChat(p); await p.waitForSelector(".pt-all"); await p.waitForTimeout(800);
  const before = await order(p);
  const tabs = p.locator('[data-paseo-tabs] button[aria-selected]');
  const from = await tabs.nth(1).boundingBox(), to = await tabs.nth(4).boundingBox();
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(from.x + from.width / 2 + ((to.x + to.width - 10 - from.x - from.width / 2) * i) / 20, from.y + from.height / 2); await p.waitForTimeout(25); }
  await p.waitForTimeout(200);
  await p.mouse.up(); await p.waitForTimeout(900);
  const after = await order(p);
  console.log("before", before.slice(0, 6).join(" ")); console.log("after ", after.slice(0, 6).join(" "));
  assert.notDeepEqual(after, before, "drag reorders tabs");
  assert.equal(after.length, before.length);
  assert.equal(await p.locator(".pt-all").count(), 1);
  // move it back so the fixture stays stable
  const back = after.indexOf(before[1]);
  const f2 = await tabs.nth(back).boundingBox(), t2 = await tabs.nth(1).boundingBox();
  await p.mouse.move(f2.x + f2.width / 2, f2.y + f2.height / 2); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(f2.x + f2.width / 2 + ((t2.x + 10 - f2.x - f2.width / 2) * i) / 20, f2.y + f2.height / 2); await p.waitForTimeout(25); }
  await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(900);
  console.log("restored", JSON.stringify(await order(p)) === JSON.stringify(before));
  console.log("errors", errors);
  await p.close();
}
{
  const p = await b.newPage({ viewport: { width: 1560, height: 975 }, colorScheme: "light" });
  await p.goto(root); await p.waitForTimeout(2500);
  await openChat(p); await p.waitForSelector(".pt-all"); await p.waitForTimeout(800);
  const box = await p.locator("[data-paseo-tabs]").boundingBox();
  await p.mouse.move(box.x + 300, box.y + 15); await p.mouse.wheel(0, 600); await p.waitForTimeout(400);
  await p.click(".pt-all"); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/light.png` });
  await p.close();
}
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, hasTouch: true });
  const errors = []; p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(root); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/compact-start.png` });
  console.log("compact strips", await p.locator("[data-paseo-tabs]").count(), "buttons", await p.locator(".pt-all").count(), "errors", errors);
  await p.close();
}
await b.close();
