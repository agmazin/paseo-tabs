import { test } from "node:test";
import assert from "node:assert/strict";
import { closeSelection, moduleCandidateIds } from "../shared/close.ts";
const tabs = ["a", "b", "c"].map(tabId => ({ tabId, target: { kind: "agent", agentId: tabId } }));
test("close selection preserves pane order and excludes the kept tab", () => {
  assert.deepEqual(closeSelection(tabs, "b", "Закрыть другие вкладки"), [tabs[0], tabs[2]]);
  assert.deepEqual(closeSelection(tabs, "b", "Закрыть вкладки слева"), [tabs[0]]);
  assert.deepEqual(closeSelection(tabs, "b", "Close tabs to the right"), [tabs[2]]);
  assert.deepEqual(closeSelection(tabs, "b", "Закрыть"), [tabs[1]]);
  assert.equal(closeSelection(tabs, "b", "Перезагрузить агента"), null);
  assert.equal(closeSelection(tabs, "missing", "Закрыть"), null);
});
test("module discovery follows source shape rather than a fixed module number", () => {
  const source = (id: number) => `__d(function(){ hideAgent:1; unhideAgent:1; closeTab:1; layoutByWorkspace:1 },${id},[1,2]);`;
  assert.deepEqual(moduleCandidateIds(source(12)), [12]);
  assert.deepEqual(moduleCandidateIds(source(9999)), [9999]);
  assert.deepEqual(moduleCandidateIds(source(12).replace("unhideAgent:", "renamed:")), []);
});


import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("fallback closes archived root/child locally and cancels stale or unknown status", async () => {
  const source = ts.transpileModule(readFileSync(new URL("../client/close.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} as any };
  runInNewContext(`(function(require,module,exports){${source}\n})`, { console })((id: string) => {
    if (id === "@getpaseo/plugin/client") return {};
    if (id === "./close-policy.web") return {};
    if (id === "../shared/close") return { closeSelection, moduleCandidateIds };
    throw new Error(id);
  }, module, module.exports);
  for (const parentAgentId of [undefined, "parent"]) for (const scenario of ["archived", "active", "stale", "missing", "wrong-workspace", "refresh-error"]) {
    const calls: string[] = [];
    let current: any = { id: "agent", workspaceId: scenario === "wrong-workspace" ? "other" : "workspace", parentAgentId,
      archivedAt: scenario === "archived" ? "archived" : null };
    if (scenario === "missing") current = null;
    let changed: (update: any) => void = () => {};
    const handle = { current: () => current, refresh: async () => { if (scenario === "refresh-error") throw new Error("fixture fetch failed"); },
      subscribe: (fn: any) => { changed = fn; return () => calls.push("unsubscribe"); }, archive: async () => calls.push("archive") };
    const api = { agents: { ref: (id: string) => { assert.equal(id, "agent"); return handle; } } };
    const policy = { close: () => calls.push("close"), cancel: () => calls.push("cancel"), choose: async (request: any) => {
      calls.push("choose");
      if (scenario === "stale") { current = { ...current, archivedAt: "archived" }; changed({ kind: "upsert", agent: current }); assert.equal(request.isCurrent(), false); }
      return "archive";
    } };
    await module.exports.closeAgentTab(api, { workspaceKey: "host:workspace", agentId: "agent", tabId: "tab" }, policy);
    assert.deepEqual(calls, scenario === "archived" ? ["close", "unsubscribe"] : scenario === "active" ? ["choose", "archive", "unsubscribe"] :
      scenario === "stale" ? ["choose", "cancel", "unsubscribe"] : ["unsubscribe"]);
  }
});
