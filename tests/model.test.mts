import { test } from "node:test";
import assert from "node:assert/strict";
import { agentIdOf, flag, hiddenSides, runningDescendants, tabBucket, highlight, jumpHint, matches, revealTarget, tabsWord, wheelDelta } from "../shared/model.ts";

const tabs = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, left: i * 100, width: 96 }));

test("hidden sides count tabs under the edge counters", () => {
  assert.deepEqual(hiddenSides(tabs, 0, 500, 44), { left: [], right: ["t5", "t6", "t7", "t8", "t9"] });
  const mid = hiddenSides(tabs, 300, 400, 44);
  assert.deepEqual(mid.left, ["t0", "t1", "t2"]);
  assert.deepEqual(mid.right, ["t7", "t8", "t9"]);
});

test("reveal brings the active tab clear of the counters and stays in range", () => {
  assert.equal(revealTarget(tabs[8], 0, 500, 1000, 44), 440);
  assert.equal(revealTarget(tabs[9], 0, 500, 1000, 44), 500);
  assert.equal(revealTarget(tabs[1], 500, 500, 1000, 44), 56);
  assert.equal(revealTarget(tabs[0], 300, 500, 1000, 44), 0);
  assert.equal(revealTarget(tabs[4], 200, 500, 1000, 44), null);
  assert.equal(revealTarget(tabs[9], 0, 1200, 1000, 44), null);
});

test("flag picks the most important hidden status", () => {
  assert.equal(flag(["done", "running"]), null);
  assert.equal(flag(["attention", "failed"]), "failed");
  assert.equal(flag(["attention", "needs_input", "failed"]), "needs_input");
  assert.equal(flag(["attention", "subagents"]), "subagents");
  assert.equal(flag(["subagents", "failed"]), "failed");
});

test("running descendants count up the whole parent chain", () => {
  const counts = runningDescendants([
    { id: "chat", status: "idle" },
    { id: "a", status: "running", parentAgentId: "chat" },
    { id: "b", status: "idle", parentAgentId: "chat" },
    { id: "c", status: "running", labels: { "paseo.parent-agent-id": "b" } },
    { id: "d", status: "running", parentAgentId: "chat", archivedAt: "2026-10-22" },
    { id: "x", status: "running", parentAgentId: "y" },
    { id: "y", status: "running", parentAgentId: "x" },
  ]);
  assert.equal(counts.get("chat"), 2);
  assert.equal(counts.get("b"), 1);
  assert.equal(counts.get("a"), undefined);
  assert.equal(counts.get("x"), 1);
});

test("a resting chat gives way to its subagents, other statuses stay native", () => {
  assert.equal(tabBucket("done", 2), "subagents");
  assert.equal(tabBucket("attention", 1), "subagents");
  assert.equal(tabBucket("running", 3), "running");
  assert.equal(tabBucket("needs_input", 1), "needs_input");
  assert.equal(tabBucket("failed", 1), "failed");
  assert.equal(tabBucket("done", 0), "done");
  assert.equal(agentIdOf("workspace-tab-agent_abc-1"), "abc-1");
  assert.equal(agentIdOf("workspace-tab-terminal_1"), null);
});

test("vertical wheel scrolls horizontally, trackpad sideways stays native", () => {
  assert.equal(wheelDelta(0, 120, 0), 120);
  assert.equal(wheelDelta(0, 3, 1), 48);
  assert.equal(wheelDelta(40, 10, 0), 0);
});

test("search ignores case and ё", () => {
  assert.ok(matches("Письмо Семёнову", "семен"));
  assert.ok(matches("Отчёт по звонкам", "ЗВ"));
  assert.ok(!matches("Дебиторка", "тенд"));
  assert.deepEqual(highlight("Письмо Семёнову", "семен"), ["Письмо ", "Семён", "ову"]);
  assert.deepEqual(highlight("Дебиторка", ""), ["Дебиторка", "", ""]);
});

test("russian plural and native jump hints", () => {
  assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(tabsWord), ["вкладка", "вкладки", "вкладок", "вкладок", "вкладка", "вкладки", "вкладок"]);
  assert.equal(jumpHint(0, true, true), "⌘⌥1");
  assert.equal(jumpHint(8, false, true), "Alt+9");
  assert.equal(jumpHint(2, true, false), "⌥⇧3");
  assert.equal(jumpHint(9, true, true), "");
});
