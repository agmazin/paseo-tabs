import { _electron } from "playwright";
import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.CLOSE_FIXTURE_BASE;
assert.ok(base);
const bundle = `${base}/app-dist/_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js`;
assert.equal(createHash("sha256").update(readFileSync(bundle)).digest("hex"), "e34d305be181eda51066d03f7d1516b4603cc4661643e1ca3d818f2bba3e7363");
const fixture = JSON.parse(readFileSync(`${base}/fixtures.json`));
const pid = JSON.parse(readFileSync(`${base}/home/paseo.pid`));
assert.equal(pid.listen, "127.0.0.1:6812");
const client = new DaemonClient({ url: `ws://${pid.listen}/ws`, clientId: "close-baseline", clientType: "cli",
  localCredential: () => readFileSync(`${base}/home/local-credential`, "utf8").trim(), reconnect: { enabled: false } });
let electron;
try {
  await client.connect();
  const id = fixture.ids[0];
  assert.equal((await client.fetchAgent(id)).agent.labels["test.fixture"], "explicit-close-0.4.0");
  assert.equal(!!(await client.fetchAgent(id)).agent.archivedAt, false);
  electron = await _electron.launch({ executablePath: "/Users/agmazin/Library/Developer/paseo-tabs/desktop-test/runtime44/Electron.app/Contents/MacOS/Electron",
    args: [resolve("tests/browser/choice-host.cjs")], env: { ...process.env, CLOSE_FIXTURE_BASE: base, CLOSE_PROFILE: "baseline-old-plugin" } });
  const page = await electron.firstWindow();
  await page.addInitScript(() => {
    localStorage.removeItem("paseo-tabs.layout-module.v1");
    const original = window.fetch;
    window.fetch = async (...args) => String(args[0]).includes("/static/js/web/index-")
      ? new Response("// fixture layout discovery unavailable") : await original(...args);
  });
  await page.goto(`paseo://app/h/${pid.serverId}/workspace/${fixture.workspaceId}`);
  await page.waitForFunction(() => window.__paseoTabsClose?.version === "0.3.2" && window.__paseoTabsClose?.unavailable);
  await page.getByTestId(`workspace-tab-agent_${id}`).hover();
  await page.getByTestId(`workspace-agent-close-${id}`).click();
  await page.getByTestId(`workspace-tab-agent_${id}`).waitFor({ state: "detached" });
  const archived = !!(await client.fetchAgent(id)).agent.archivedAt;
  assert.equal(archived, true);
  const out = resolve("docs/evidence/close-choice-0.4.0");
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/baseline.json`, JSON.stringify({ client: "0.14.0 original", daemon: "0.14.0", plugin: "0.3.2", fixture: true,
    discovery: "unavailable", mandatoryChoice: false, archivedByCrossWithoutExplicitChoice: archived }, null, 2) + "\n");
  console.log("REPRODUCED: 0.3.2 unavailable adapter lets native cross archive an idle root without explicit choice");
} finally { await electron?.close(); await client.close(); }
