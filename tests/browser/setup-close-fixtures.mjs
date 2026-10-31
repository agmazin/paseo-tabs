import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const base = process.env.CLOSE_FIXTURE_BASE;
assert.ok(base);
const pid = JSON.parse(readFileSync(`${base}/home/paseo.pid`));
assert.equal(pid.listen, "127.0.0.1:6812");
const client = new DaemonClient({ url: `ws://${pid.listen}/ws`, clientId: "setup-close-fixtures", clientType: "cli",
  localCredential: () => readFileSync(`${base}/home/local-credential`, "utf8").trim(), reconnect: { enabled: false } });
try {
  await client.connect();
  const workspace = await client.createWorkspace({ source: { kind: "directory", path: base }, title: "Close fixtures" });
  const workspaceId = workspace.workspace.id;
  const ids = [];
  for (const title of ["Root A", "Root B", "Child"]) {
    const agent = await client.createAgent({ provider: "codex", cwd: base, workspaceId, title,
      ...(title === "Child" ? { callerAgentId: ids[0] } : {}), labels: { "test.fixture": "explicit-close-0.4.0" } });
    ids.push(agent.id);
  }
  const child = (await client.fetchAgent(ids[2])).agent;
  assert.equal(child.labels["paseo.parent-agent-id"], ids[0]);
  writeFileSync(`${base}/fixtures.json`, JSON.stringify({ workspaceId, ids }) + "\n");
  console.log("Created three idle fixtures, including an actual subagent; no prompts sent");
} finally { await client.close(); }
