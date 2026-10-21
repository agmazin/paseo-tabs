// Снимки 0.1.0 для Александра: тестовый демон 6793, размер его окна (1710x1068 pt / 1.095).
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const root = "http://127.0.0.1:6793";
const out = process.argv[2];
const host = ["--host", "127.0.0.1:6793"];
const b = await chromium.launch({ headless: true, channel: "chrome" });
async function page() {
  const p = await b.newPage({ viewport: { width: 1560, height: 975 }, colorScheme: "dark", deviceScaleFactor: 2 });
  await p.goto(root); await p.waitForTimeout(3000);
  // "Диалоги" hide the native workspace list; open the workspace from its first dialog.
  await p.getByText("Общий ИИ", { exact: true }).first().click(); await p.waitForTimeout(1500);
  return p;
}
const open = async (p, label) => { await p.locator(`[data-testid^="workspace-tab-"][aria-label="${label}"]`).first().click(); await p.waitForTimeout(900); };
// before: plugin disabled
execFileSync("paseo", ["plugin", "disable", "paseo-tabs", ...host]);
{
  const p = await page();
  // the dialog list opens a far tab; the native strip does not follow it
  await p.getByText("Письмо Семёнову", { exact: true }).first().click(); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/r1-before.png` });
  await p.close();
}
execFileSync("paseo", ["plugin", "enable", "paseo-tabs", ...host]);
{
  const p = await page();
  await p.waitForSelector(".pt-all");
  await p.click(".pt-all"); await p.keyboard.type("семён"); await p.keyboard.press("Enter"); await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}/r2-revealed.png` });
  await p.click(".pt-all"); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/r3-list.png` });
  await p.keyboard.type("от"); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/r4-search.png` });
  await p.keyboard.press("Escape");
  const box = await p.locator("[data-paseo-tabs]").boundingBox();
  await p.mouse.move(box.x + 400, box.y + 15); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(120); } await p.waitForTimeout(500);
  await p.mouse.move(1100, 600); await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/r5-wheel.png` });
  await p.close();
}
await b.close();
