import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BUNDLE, deploy, ORIGINAL_SHA256, patchSource } from "../scripts/native-close-patch.mts";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

test("native deployment rejects an unknown client before writing", () => {
  const directory = mkdtempSync(join(tmpdir(), "paseo-close-"));
  try {
    const path = join(directory, BUNDLE);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "unknown client");
    writeFileSync(join(directory, "index.html"), "unknown index");
    assert.throws(() => deploy(directory, "apply", join(directory, "backup")), /Unsupported/);
    assert.equal(readFileSync(path, "utf8"), "unknown client");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("native deployment is exact, idempotent, and reversible", { skip: !process.env.CLOSE_ORIGINAL_BUNDLE }, () => {
  const original = readFileSync(process.env.CLOSE_ORIGINAL_BUNDLE!, "utf8");
  const originalIndex = readFileSync(process.env.CLOSE_ORIGINAL_INDEX || join(dirname(process.env.CLOSE_ORIGINAL_BUNDLE!), "../../../../index.html"), "utf8");
  assert.equal(createHash("sha256").update(original).digest("hex"), ORIGINAL_SHA256);
  const patched = patchSource(original);
  assert.ok(patched.includes('c!=="close"'));
  const directory = mkdtempSync(join(tmpdir(), "paseo-close-"));
  try {
    const path = join(directory, BUNDLE), backup = join(directory, "backup");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, original);
    writeFileSync(join(directory, "index.html"), originalIndex);
    assert.equal(deploy(directory, "apply", backup).status, "installed");
    assert.equal(readFileSync(path, "utf8"), patched);
    assert.equal(deploy(directory, "apply", backup).status, "already-installed");
    assert.equal(deploy(directory, "rollback", backup).status, "rolled-back");
    assert.equal(readFileSync(path, "utf8"), original);
    assert.equal(readFileSync(join(directory, "index.html"), "utf8"), originalIndex);
    if (process.env.CLOSE_PREVIOUS_BUNDLE && process.env.CLOSE_PREVIOUS_INDEX) {
      const previous = readFileSync(process.env.CLOSE_PREVIOUS_BUNDLE, "utf8");
      const previousIndex = readFileSync(process.env.CLOSE_PREVIOUS_INDEX, "utf8");
      writeFileSync(path, previous);
      writeFileSync(join(directory, "index.html"), previousIndex);
      assert.equal(deploy(directory, "check", backup).status, "compatible");
      assert.equal(deploy(directory, "apply", backup).status, "installed");
      assert.equal(deploy(directory, "apply", backup).status, "already-installed");
      assert.equal(deploy(directory, "rollback", backup).status, "rolled-back");
      assert.equal(readFileSync(path, "utf8"), previous);
      assert.equal(readFileSync(join(directory, "index.html"), "utf8"), previousIndex);
      writeFileSync(join(directory, "index.html"), previousIndex + "changed");
      assert.throws(() => deploy(directory, "apply", backup), /Unsupported/);
      assert.equal(readFileSync(path, "utf8"), previous);
      writeFileSync(join(directory, "index.html"), previousIndex);
    }
    deploy(directory, "apply", backup);
    writeFileSync(path, readFileSync(path, "utf8") + "\nchanged");
    assert.throws(() => deploy(directory, "apply", backup), /matching deployment record/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("native callback never archives idle/running roots or children before an explicit choice", { skip: !process.env.CLOSE_ORIGINAL_BUNDLE }, async () => {
  const patched = patchSource(readFileSync(process.env.CLOSE_ORIGINAL_BUNDLE!, "utf8"));
  const start = patched.indexOf('const{tabId:t,agentId:s}=e;await yr(');
  const end = patched.indexOf('})},[Wt,yr,Tr,te,Ga,f,h])', start);
  const source = `async e=>{${patched.slice(start, end + 2)}}`;
  for (const status of ["idle", "running"]) for (const parentAgentId of [undefined, "parent"]) for (const archivedAt of [undefined, "2026-10-31T12:00:00Z"]) {
    for (const choice of ["cancel", "close", "archive", undefined, "throw"]) {
      const calls: string[] = [];
      const callback = runInNewContext(`(${source})`, {
        te: "host", Ga: "host:workspace", yr: async (_id: string, action: () => Promise<void>) => await action(),
        re: { useSessionStore: { subscribe: () => () => {}, getState: () => ({ sessions: { host: { agents: new Map([["agent", { status, parentAgentId, archivedAt }]]) } } }) } },
        __paseoTabClosePolicy: { choose: async () => { assert.equal(archivedAt, undefined, "Archived tabs must not open a dialog"); if (choice === "throw") throw Error("fixture failure"); return choice; }, close: () => calls.push("close") },
        Wt: async () => { calls.push("archive"); }, Tr: () => calls.push("close"), zr: () => {}, console: { warn: () => {} },
      });
      await callback({ tabId: "tab", agentId: "agent" });
      assert.deepEqual(calls, archivedAt || choice === "close" ? ["close"] : choice === "archive" ? ["archive"] : []);
    }
  }
});

test("native callback cancels a stale choice and never uses another host's archived state", { skip: !process.env.CLOSE_ORIGINAL_BUNDLE }, async () => {
  const patched = patchSource(readFileSync(process.env.CLOSE_ORIGINAL_BUNDLE!, "utf8"));
  const start = patched.indexOf('const{tabId:t,agentId:s}=e;await yr(');
  const end = patched.indexOf('})},[Wt,yr,Tr,te,Ga,f,h])', start);
  const source = `async e=>{${patched.slice(start, end + 2)}}`;
  for (const scenario of ["archive-during-dialog", "unknown", "other-host", "archived-not-listed"]) {
    const calls: string[] = [];
    const agents = new Map<string, any>(scenario !== "archive-during-dialog" ? [] : [["agent", {}]]);
    let changed = () => {};
    const callback = runInNewContext(`(${source})`, {
      te: "host", Ga: "host:workspace", yr: async (_id: string, action: () => Promise<void>) => await action(),
      re: { useSessionStore: { subscribe: (fn: () => void) => { changed = fn; return () => {}; },
        getState: () => ({ sessions: { host: { agents, client: { fetchAgent: async (id: string) => { assert.equal(id, "agent"); return scenario === "archived-not-listed" ? { agent: { id, archivedAt: "archived" } } : null; } } }, other: { agents: new Map([["agent", { archivedAt: "archived" }]]) } } }) } },
      __paseoTabClosePolicy: { choose: async (request: any) => {
        calls.push("choose"); agents.set("agent", { archivedAt: "archived" }); changed();
        assert.equal(request.isCurrent(), false); return "archive";
      }, cancel: () => calls.push("cancel"), close: () => calls.push("close") },
      Wt: async () => calls.push("archive"), zr: () => {}, console,
    });
    await callback({ tabId: "tab", agentId: "agent" });
    assert.deepEqual(calls, scenario === "archive-during-dialog" ? ["choose", "cancel"] : scenario === "archived-not-listed" ? ["close"] : []);
  }
});
