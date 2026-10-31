import { _electron } from "playwright";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = process.env.CLOSE_FIXTURE_BASE;
assert.ok(base, "Pass a disposable fixture base");
const fixture = JSON.parse(readFileSync(`${base}/fixtures.json`));
const pid = JSON.parse(readFileSync(`${base}/home/paseo.pid`));
assert.equal(pid.listen, "127.0.0.1:6812");
const client = new DaemonClient({ url: `ws://${pid.listen}/ws`, clientId: "close-choice", clientType: "cli",
  localCredential: () => readFileSync(`${base}/home/local-credential`, "utf8").trim(), reconnect: { enabled: false } });
const checks = [];
let electron;
const mode = process.env.CLOSE_MODE || "native";
const out = resolve(`docs/evidence/close-choice-0.4.1/${mode}`);
mkdirSync(out, { recursive: true });
try {
  await client.connect();
  for (const id of fixture.ids) {
    const agent = (await client.fetchAgent(id)).agent;
    assert.equal(agent.labels["test.fixture"], "explicit-close-0.4.0");
    assert.equal(!!agent.archivedAt, false, "Use fresh fixtures");
  }
  electron = await _electron.launch({
    executablePath: process.env.ELECTRON_PATH || "/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron",
    args: [resolve("tests/browser/choice-host.cjs")], env: { ...process.env, CLOSE_FIXTURE_BASE: base },
  });
  const page = await electron.firstWindow();
  const mutationFrames = [];
  page.on("websocket", socket => socket.on("framesent", frame => {
    try { const envelope = JSON.parse(String(frame.payload)); const message = envelope.message || envelope; if (/archive|resume/i.test(message.type || "")) mutationFrames.push(message.type); } catch {}
  }));
  page.on("pageerror", error => console.log("PAGE", error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) console.log(message.type().toUpperCase(), message.text().slice(0, 300)); });
  await page.waitForFunction(() => window.__paseoTabClosePolicy?.store, null, { timeout: 30000 });
  await page.waitForTimeout(2000);
  if (mode === "hot-upgrade") {
    assert.equal(await page.evaluate(() => window.__paseoNativeTabCloseVersion), "0.4.0");
    assert.equal(await page.evaluate(() => window.__paseoTabClosePolicy.version), "0.4.1");
    checks.push("old native 0.4.0 bootstrap uses new 0.4.1 plugin fallback without UI reload");
  }
  console.log("URL", page.url());
  await page.screenshot({ path: `${out}/initial.png` });
  const open = async id => {
    await page.evaluate(({ workspaceId, id, serverId }) => {
      const state = window.__paseoTabClosePolicy.store.getState();
      state.openTab({ workspaceKey: `${serverId}:${workspaceId}`, target: { kind: "agent", agentId: id }, intent: "reveal", pin: true });
    }, { workspaceId: fixture.workspaceId, id, serverId: pid.serverId });
    const route = `paseo://app/h/${pid.serverId}/workspace/${fixture.workspaceId}`;
    if (!page.url().includes(`/workspace/${fixture.workspaceId}`)) {
      await page.goto(route);
      await page.waitForFunction(() => window.__paseoTabClosePolicy?.store);
    }
    await page.getByTestId(`workspace-tab-agent_${id}`).first().waitFor({ timeout: 30000 });
  };
  const archived = async id => !!(await client.fetchAgent(id)).agent.archivedAt;
  const cross = async id => {
    await page.getByTestId(`workspace-tab-agent_${id}`).first().hover();
    await page.getByTestId(`workspace-agent-close-${id}`).first().click();
    await page.getByTestId("paseo-tab-close-dialog").waitFor();
    assert.equal(await archived(id), false);
  };
  const id = fixture.ids[0];
  await open(id);
  await cross(id);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "paseo-tab-close-cancel");
  assert.equal(await page.getByRole("button", { name: "Отмена", exact: true }).count(), 0);
  assert.equal(await page.getByTestId("paseo-tab-close-close").textContent(), "Закрыть");
  assert.equal(await page.getByTestId("paseo-tab-close-archive").textContent(), "Архивировать");
  assert.equal(await page.getByTestId("paseo-tab-close-cancel").getAttribute("aria-label"), "Отменить закрытие");
  assert.equal(await page.getByTestId("paseo-tab-close-close").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(22, 101, 52)");
  assert.equal(await page.getByTestId("paseo-tab-close-archive").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(154, 52, 18)");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "paseo-tab-close-archive");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.testid), "paseo-tab-close-cancel");
  assert.equal(await page.getByTestId("paseo-tab-close-cancel").evaluate(node => getComputedStyle(node).outlineStyle), "solid");
  await page.screenshot({ path: `${out}/mandatory-choice-wide.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/mandatory-choice-compact.png` });
  const box = await page.getByTestId("paseo-tab-close-close").boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  checks.push("new labels/colors, accessible cross, initial focus, visible focus, Tab wrap, wide/compact");
  await page.getByTestId("paseo-tab-close-cancel").click();
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 1);
  checks.push("cancel preserves tab and archive state");
  await cross(id);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 1);
  checks.push("Escape preserves tab and archive state");
  await cross(id);
  await page.getByTestId("paseo-tab-close-close").click();
  await page.getByTestId(`workspace-tab-agent_${id}`).waitFor({ state: "detached" });
  assert.equal(await archived(id), false);
  checks.push("close hides root without archive");
  await page.reload();
  await page.waitForFunction(() => window.__paseoTabClosePolicy?.store);
  await page.waitForTimeout(1000);
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 0);
  assert.equal(await archived(id), false);
  checks.push("hidden root persists across UI reload");
  await open(id);
  await cross(id);
  await page.keyboard.press("Escape");
  checks.push("reopen always prompts again");
  await open(fixture.ids[2]);
  await open(id);
  await cross(fixture.ids[2]);
  await page.getByTestId("paseo-tab-close-close").click();
  await page.getByTestId(`workspace-tab-agent_${fixture.ids[2]}`).waitFor({ state: "detached" });
  assert.equal(await archived(fixture.ids[2]), false);
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).getAttribute("aria-selected"), "true");
  checks.push("close-only of an inactive child preserves the child and selected root");
  for (const target of fixture.ids) {
    await open(target);
    await open(target === fixture.ids[0] ? fixture.ids[1] : fixture.ids[0]);
    await cross(target);
    await page.keyboard.press("Escape");
    assert.equal(await archived(target), false);
    checks.push(`inactive ${target === fixture.ids[2] ? "child" : "root"} prompts and cancels`);
  }
  await open(id);
  await page.evaluate(id => {
    const button = document.querySelector(`[data-testid="workspace-agent-close-${id}"]`);
    for (let n = 0; n < 12; n++) button.click();
  }, id);
  await page.getByTestId("paseo-tab-close-dialog").waitFor();
  assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 0);
  assert.equal(await archived(id), false);
  checks.push("12 rapid clicks share one visible dialog; no delayed action after Escape");
  await cross(id);
  await open(fixture.ids[1]);
  await page.getByTestId("paseo-tab-close-dialog").waitFor({ state: "detached" });
  assert.equal(await archived(id), false);
  checks.push("programmatic tab switch cancels pending decision");
  await open(id);
  await page.evaluate(() => {
    const original = document.body.appendChild;
    document.body.appendChild = function (node) {
      if (node.dataset?.testid === "paseo-tab-close-dialog") { document.body.appendChild = original; throw new Error("fixture dialog failure"); }
      return original.call(this, node);
    };
  });
  await page.getByTestId(`workspace-agent-close-${id}`).click();
  await page.waitForTimeout(100);
  assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 0);
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 1);
  assert.equal(await archived(id), false);
  checks.push("dialog construction error leaves tab and archive unchanged");
  if (mode === "native") {
  await page.evaluate(() => { window.__savedClosePolicy = window.__paseoTabClosePolicy; delete window.__paseoTabClosePolicy; });
  await page.getByTestId(`workspace-agent-close-${id}`).click();
  await page.waitForTimeout(100);
  assert.equal(await archived(id), false);
  assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 1);
  await page.evaluate(() => { window.__paseoTabClosePolicy = window.__savedClosePolicy; });
  checks.push("missing runtime fails closed");
  }
  await page.keyboard.press("Meta+w");
  await page.getByTestId("paseo-tab-close-dialog").waitFor();
  await page.keyboard.press("Escape");
  checks.push("Cmd+W uses the same mandatory dialog");
  if (mode !== "native") {
    await cross(id);
    execFileSync("paseo", ["plugin", "reload", "paseo-tabs", "--host", pid.listen], { stdio: "pipe" });
    await page.getByTestId("paseo-tab-close-dialog").waitFor({ state: "detached" });
    await page.waitForFunction(id => !!window.__paseoTabsClose?.agents.get(id), id);
    assert.equal(await archived(id), false);
    await cross(id);
    await page.keyboard.press("Escape");
    checks.push("plugin reload cancels an open decision; next click prompts again without delayed archive");
  }
  for (const child of [false, true]) {
    const stale = await client.createAgent({ provider: "codex", cwd: base, workspaceId: fixture.workspaceId,
      title: child ? "Archive race child" : "Archive race root", ...(child ? { callerAgentId: id } : {}),
      labels: { "test.fixture": "explicit-close-0.4.1" } });
    await open(stale.id);
    await cross(stale.id);
    const before = mutationFrames.length;
    await client.archiveAgent(stale.id);
    await page.getByTestId("paseo-tab-close-dialog").waitFor({ state: "detached" });
    await page.waitForTimeout(100);
    assert.equal(await archived(stale.id), true);
    assert.equal(mutationFrames.length, before, "Archiving during the dialog must not send archive/resume from the UI");
    checks.push(`external archive cancels an open ${child ? "child" : "root"} dialog without UI mutation RPC`);
    await open(stale.id);
    await page.getByTestId(`workspace-tab-agent_${stale.id}`).first().hover();
    await page.getByTestId(`workspace-agent-close-${stale.id}`).first().click();
    await page.getByTestId(`workspace-tab-agent_${stale.id}`).waitFor({ state: "detached" });
    assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 0);
    assert.equal(await archived(stale.id), true);
    assert.equal(mutationFrames.length, before, "Closing an archived tab must be local only");
    checks.push(`archived ${child ? "child" : "root"} closes locally without dialog, archive/resume/unarchive RPC`);
  }
  for (const target of [...fixture.ids].reverse()) {
    await open(target);
    await cross(target);
    await page.getByTestId("paseo-tab-close-archive").click();
    await page.getByTestId(`workspace-tab-agent_${target}`).waitFor({ state: "detached" });
    assert.equal(await archived(target), true);
    checks.push(`explicit archive only after choice: ${target === fixture.ids[2] ? "child" : "root"}`);
  }
  assert.ok(mutationFrames.includes("archive_agent_request"), "UI websocket observer must capture explicit fixture archives");
  writeFileSync(`${out}/result.json`, JSON.stringify({ mode, observedUiMutations: mutationFrames, plugin: await page.evaluate(() => window.__paseoTabsClose?.version ?? null), client: "0.14.0", daemon: (await client.getDaemonStatus()).version,
    nativePolicy: await page.evaluate(() => window.__paseoNativeTabCloseVersion), checks }, null, 2) + "\n");
  console.log(JSON.stringify(checks));
} finally { await electron?.close(); await client.close(); }
