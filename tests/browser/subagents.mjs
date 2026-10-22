// Индикатор "работают подагенты" на тестовом демоне 6793: чат "Индикатор подагентов" отдыхает,
// его подагенты (paseo run из этого чата) работают. Замер пары во вкладке против пары "Диалогов".
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const root = "http://127.0.0.1:6793";
const out = process.argv[2] || "/tmp/paseo-tabs-check";
const parent = "Индикатор подагентов";
const b = await chromium.launch({ headless: true, channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: "dark", deviceScaleFactor: 2 });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await p.goto(root);
await p.waitForTimeout(2500);
if (!(await p.getByText(parent, { exact: true }).count())) { await p.getByText("ЭкоЭксперт", { exact: true }).first().click(); await p.waitForTimeout(600); }
await p.getByText(parent, { exact: true }).first().click();
await p.waitForSelector(".pt-pair", { timeout: 15000 });
await p.waitForTimeout(800);

const tabSel = `button[data-testid^="workspace-tab-agent_"][aria-label="${parent}"]`;
const measure = () => p.evaluate((tabSel) => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const box = (n, o) => { const r = n.getBoundingClientRect(); return { cx: r2(r.x + r.width / 2 - o.x), cy: r2(r.y + r.height / 2 - o.y), w: r2(r.width), h: r2(r.height) }; };
  const tab = document.querySelector(tabSel);
  const icon = tab.querySelector("[data-status-bucket]").firstElementChild;
  const io = icon.getBoundingClientRect();
  const minis = [...tab.querySelectorAll(".pt-mini")];
  const pseudo = (n, which) => { const s = getComputedStyle(n, which); return { inset: s.inset, bg: s.backgroundColor, border: s.borderTopWidth, top: s.borderTopColor, side: s.borderRightColor, anim: s.animationDuration + " " + s.animationTimingFunction }; };
  const dPair = document.querySelector('[data-testid="dialogs-subagents-pair"]');
  const dIcon = dPair?.parentElement.firstElementChild;
  const dio = dIcon?.getBoundingClientRect();
  const dMinis = dPair ? [...dPair.children] : [];
  const dRing = (m) => { const s = getComputedStyle(m.children[2]); return { border: s.borderTopWidth, top: s.borderTopColor, side: s.borderRightColor }; };
  const native = [...icon.querySelectorAll(":scope > :first-child > div")].map((n) => getComputedStyle(n).display);
  const tabRect = tab.getBoundingClientRect();
  const label = tab.querySelector("[data-status-bucket]").children[1].getBoundingClientRect();
  return {
    tab: { title: tab.title, width: r2(tabRect.width), icon: { x: r2(io.x - tabRect.x), y: r2(io.y - tabRect.y), w: io.width, h: io.height }, labelX: r2(label.x - tabRect.x), nativeBadge: native },
    tabs: minis.map((m) => ({ dot: box(m.querySelector("i"), io), cut: pseudo(m, "::before"), ring: pseudo(m, "::after") })),
    dialogs: dMinis.map((m) => ({ dot: box(m.children[1], dio), cut: box(m.children[0], dio), ring: dRing(m) })),
    dialogsIcon: dio && { w: dio.width, h: dio.height },
    dialogsHint: dPair?.closest('[title]')?.getAttribute("title") ?? null,
    spins: document.getAnimations().filter((a) => a.animationName === "pt-spin").map((a) => a.startTime),
  };
}, tabSel);
const m = await measure();
console.log(JSON.stringify(m, null, 1));
assert.equal(m.tabs.length, 2, "pair of circles on the parent tab");
assert.match(m.tab.title, /^Работают подагенты: \d+$/);
assert.ok(m.tab.nativeBadge.every((d) => d === "none"), "native badge hidden");
for (const t of m.tabs) { assert.equal(t.dot.w, 5); assert.equal(t.dot.h, 5); assert.equal(t.cut.inset, "-2.5px"); if (m.dialogs.length) assert.equal(t.ring.border, m.dialogs[0].ring.border); assert.equal(t.ring.anim, "0.9s linear"); }
assert.equal(m.tabs[1].dot.cx - m.tabs[0].dot.cx, 7, "same 7px step as Dialogs");
if (m.dialogs.length) { assert.equal(m.dialogs[1].dot.cx - m.dialogs[0].dot.cx, 7); assert.equal(m.dialogs[0].dot.w, 5); assert.equal(m.dialogs[0].cut.w, 10); }
assert.ok(m.spins.length >= 2 && m.spins.every((s) => s === 0), "all pairs share one phase");

// Width does not jump: the same tab with the pair hidden keeps its width.
const widths = await p.evaluate((tabSel) => {
  const tab = document.querySelector(tabSel);
  const a = tab.getBoundingClientRect().width;
  tab.querySelector(".pt-pair").style.display = "none";
  const bW = tab.getBoundingClientRect().width;
  tab.querySelector(".pt-pair").style.display = "";
  return [a, bW];
}, tabSel);
assert.equal(widths[0], widths[1], "tab width unchanged by the pair");

const tabBox = await p.locator(tabSel).boundingBox();
await p.screenshot({ path: `${out}/tab-pair.png`, clip: { x: tabBox.x - 6, y: tabBox.y - 6, width: tabBox.width + 12, height: tabBox.height + 12 } });
const dRow = p.locator('[data-testid="dialogs-subagents-pair"]').first();
if (await dRow.count()) { const d = await dRow.boundingBox(); await p.screenshot({ path: `${out}/dialogs-pair.png`, clip: { x: d.x - 20, y: d.y - 16, width: 200, height: 30 } }); }
await p.screenshot({ path: `${out}/1-open.png` });

// Hover keeps the cut in the tab colour.
await p.locator(`button[data-testid^="workspace-tab-agent_"][aria-label="Карусель"]`).hover();
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}/2-hover-other.png`, clip: { x: tabBox.x - 6, y: tabBox.y - 6, width: 400, height: tabBox.height + 12 } });

// Open a subagent: its own tab is native (running spinner, no pair), the parent keeps the pair.
await p.locator('[data-testid="dialogs-subagents-toggle"]').first().click();
await p.waitForTimeout(600);
await p.getByText("Подагент 3", { exact: true }).first().click();
await p.waitForTimeout(2000);
const sub = await p.evaluate(() => {
  const t = document.querySelector('button[data-testid^="workspace-tab-agent_"][aria-label="Подагент 3"]');
  return { bucket: t?.querySelector("[data-status-bucket]")?.getAttribute("data-status-bucket"), pair: !!t?.querySelector(".pt-pair"), busy: t?.hasAttribute("data-pt-busy") };
});
console.log("subagent tab", sub);
assert.equal(sub.bucket, "running"); assert.equal(sub.pair, false);
assert.equal(await p.locator(`${tabSel} .pt-pair`).count(), 1, "parent keeps the pair while a subagent tab is open");
await p.screenshot({ path: `${out}/3-subagent-tab.png` });

// Collapse the left panel: the tabs alone show where work goes on.
await p.keyboard.press(process.platform === "darwin" ? "Meta+b" : "Control+b").catch(() => {});
await p.waitForTimeout(800);
if (await p.getByText("Диалоги", { exact: true }).first().isVisible().catch(() => false)) {
  await p.locator('[aria-label*="боков" i], [aria-label*="sidebar" i]').first().click().catch(() => {});
  await p.waitForTimeout(800);
}
await p.screenshot({ path: `${out}/4-collapsed.png` });

// Push the parent tab out of sight: the edge counter and the list button carry the pair.
await p.locator(`button[data-testid^="workspace-tab-agent_"][aria-label="Общий ИИ"]`).click();
await p.waitForTimeout(1200);
const edge = await p.evaluate(() => ({
  left: document.querySelector(".pt-edge.pt-left.pt-show")?.querySelector(".pt-flag")?.className ?? null,
  right: document.querySelector(".pt-edge.pt-right.pt-show")?.querySelector(".pt-flag")?.className ?? null,
  leftTitle: document.querySelector(".pt-edge.pt-left.pt-show")?.title ?? null,
  button: document.querySelector(".pt-all .pt-flag")?.className ?? null,
}));
console.log("edges", edge);
assert.ok([edge.left, edge.right].some((c) => c?.includes("pt-flag-subagents")), "edge marks working subagents");
assert.ok(edge.button?.includes("pt-flag-subagents"));
await p.screenshot({ path: `${out}/5-edge.png` });
const row = await p.locator('[data-testid="workspace-tabs-row"]').first().boundingBox();
await p.screenshot({ path: `${out}/5-edge-crop.png`, clip: { x: row.x, y: row.y, width: row.width, height: row.height } });

await p.locator(".pt-all").first().click();
await p.waitForTimeout(500);
const list = await p.evaluate((parent) => {
  const r = [...document.querySelectorAll(".pt-row")].find((n) => n.textContent.includes(parent));
  return { pair: r?.querySelectorAll(".pt-mini").length, title: r?.title, nativeHidden: [...(r?.querySelectorAll(".pt-ico > :first-child > :first-child > div") ?? [])].every((n) => getComputedStyle(n).display === "none") };
}, parent);
console.log("list row", list);
assert.equal(list.pair, 2); assert.match(list.title, /^Работают подагенты/); assert.ok(list.nativeHidden);
const spins = await p.evaluate(() => document.getAnimations().filter((a) => a.animationName === "pt-spin").map((a) => a.startTime));
assert.ok(spins.every((s) => s === 0), "list pairs share the phase");
await p.screenshot({ path: `${out}/6-list.png` });
await p.keyboard.press("Escape");

writeFileSync(`${out}/measure.json`, JSON.stringify({ ...m, widths, sub, edge, list }, null, 1));
assert.deepEqual(errors.filter((e) => !/favicon|Failed to load resource/.test(e)), []);
console.log("ok");
await b.close();
