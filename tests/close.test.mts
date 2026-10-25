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
