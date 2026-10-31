import { _electron } from "playwright";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const base = process.env.CLOSE_FIXTURE_BASE;
assert.ok(base);
const fixture = JSON.parse(readFileSync(`${base}/fixtures.json`));
const pid = JSON.parse(readFileSync(`${base}/home/paseo.pid`));
assert.equal(pid.listen, "127.0.0.1:6812");
const client = new DaemonClient({ url: `ws://${pid.listen}/ws`, clientId: "close-choice-edges", clientType: "cli",
  localCredential: () => readFileSync(`${base}/home/local-credential`, "utf8").trim(), reconnect: { enabled: false } });
const checks = [];
let electron;
try {
  await client.connect();
  const id = fixture.ids[0];
  assert.equal(!!(await client.fetchAgent(id)).agent.archivedAt, false);
  electron = await _electron.launch({ executablePath: process.env.ELECTRON_PATH || "/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron",
    args: [resolve("tests/browser/choice-host.cjs")], env: { ...process.env, CLOSE_FIXTURE_BASE: base, CLOSE_PROFILE: "plugin-edges" } });
  const page = await electron.firstWindow();
  await page.waitForFunction(() => window.__paseoTabsClose?.version === "0.4.2");
  assert.equal(await page.evaluate(() => !!window.__paseoNativeTabCloseVersion), false, "Edges must use the original unpatched bundle");
  await page.addInitScript(() => {
      const mode = new URL(location.href).searchParams.get("closeFixtureMode");
      window.localStorage.removeItem("paseo-tabs.layout-module.v1");
      window.localStorage.removeItem("paseo-tabs.hidden-agents.v1");
      const original = window.fetch;
      window.fetch = async (...args) => {
        if (String(args[0]).includes("/static/js/web/index-")) {
          if (mode === "unavailable") return new Response("// fixture unknown layout store", { status: 200 });
          await new Promise(resolve => { window.__releaseCloseDiscovery = resolve; });
        }
        return await original(...args);
      };
    });
  for (const mode of ["unavailable", "delayed"]) {
    await page.goto(`paseo://app/h/${pid.serverId}/workspace/${fixture.workspaceId}?closeFixtureMode=${mode}`);
    await page.getByTestId(`workspace-tab-agent_${id}`).waitFor();
    if (mode === "unavailable") await page.waitForFunction(() => window.__paseoTabsClose?.unavailable === true);
    else await page.waitForFunction(() => !!window.__releaseCloseDiscovery);
    await page.getByTestId(`workspace-tab-agent_${id}`).hover();
    await page.getByTestId(`workspace-agent-close-${id}`).click();
    await page.waitForTimeout(100);
    assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 0);
    assert.equal(!!(await client.fetchAgent(id)).agent.archivedAt, false);
    await page.keyboard.press("Escape");
    if (mode === "delayed") {
      await page.evaluate(() => window.__releaseCloseDiscovery());
      await page.waitForSelector('html[data-paseo-tabs-close="ready"]');
    }
    await page.waitForTimeout(150);
    assert.equal(await page.getByTestId(`workspace-tab-agent_${id}`).count(), 1);
    assert.equal(!!(await client.fetchAgent(id)).agent.archivedAt, false);
    assert.equal(await page.getByTestId("paseo-tab-close-dialog").count(), 0);
    checks.push(`${mode} discovery: synchronous guard, unknown status blocks without prompt, no deferred close or archive`);
    await page.removeAllListeners("console");
  }
  const out = resolve("docs/evidence/close-choice-0.4.2");
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/edges.json`, JSON.stringify({ client: "0.14.0 original", plugin: "0.4.2", daemon: "0.14.0", checks }, null, 2) + "\n");
  console.log(JSON.stringify(checks));
} finally { await electron?.close(); await client.close(); }
