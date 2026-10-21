import { test } from "node:test";
import assert from "node:assert/strict";
import { flag, hiddenSides, highlight, jumpHint, matches, revealTarget, tabsWord, wheelDelta } from "../shared/model.ts";

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
