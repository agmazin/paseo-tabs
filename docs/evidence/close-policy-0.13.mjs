import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";

const directory = "/Applications/Paseo.app/Contents/Resources/app-dist/_expo/static/js/web";
const bundle = readdirSync(directory).filter((name) => name.startsWith("index-") && name.endsWith(".js"))
  .map((name) => ({ path: `${directory}/${name}`, source: readFileSync(`${directory}/${name}`, "utf8") }))
  .find(({ source }) => source.includes('kind:"archive-on-close"'));
assert.ok(bundle, "Installed Paseo bundle must contain the close policy");
const modules = new Map();
const wanted = new Set([3393, 3394, 3395, 3388, 5435, 5427]);
for (const line of bundle.source.split("\n")) {
  const match = line.match(/\},(\d+),\[[\d,]*\]\);$/);
  if (!match || !wanted.has(Number(match[1]))) continue;
  runInNewContext(line, { __d(factory, id, dependencies) { modules.set(id, { factory, dependencies }); } });
}
function load(id) {
  const entry = modules.get(id);
  assert.ok(entry, `Module ${id} must be present`);
  if (entry.exports) return entry.exports;
  entry.exports = {};
  entry.factory({}, load, load, load, { exports: entry.exports }, entry.exports, entry.dependencies);
  return entry.exports;
}
const root = { id: "root", workspaceId: "workspace", labels: { "paseo.open-agent-tab.test-client": "false" } };
const child = { id: "child", workspaceId: "workspace", parentAgentId: "root", labels: {} };
assert.equal(load(3394).resolveCloseAgentTabPolicy(root).kind, "archive-on-close");
assert.equal(load(3394).resolveCloseAgentTabPolicy(child).kind, "layout-only");
const visibility = load(5435).deriveWorkspaceAgentVisibility({ sessionAgents: new Map([[root.id, root], [child.id, child]]), workspaceId: "workspace" });
assert.equal(visibility.autoOpenAgentIds.has(root.id), true);
assert.equal(visibility.autoOpenAgentIds.has(child.id), false);
const needingLabel = load(5427).getAgentTabsNeedingOpenLabel({ tabs: [{ target: { kind: "agent", agentId: root.id } }], getAgent: () => root, label: "paseo.open-agent-tab.test-client", pendingAgentIds: new Set() });
assert.equal(needingLabel.length, 0);
console.log(JSON.stringify({ bundle: bundle.path, checks: 5, rootClosePolicy: "archive-on-close", childClosePolicy: "layout-only", rootAutoOpensWithFalseLabel: true, rootUsesOpenLabel: false }, null, 2));
