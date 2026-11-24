import { test } from "node:test";
import assert from "node:assert/strict";
import { installReopen } from "../client/reopen.ts";

test("closing two chats then pressing Cmd+Shift+T twice reopens them in order after a plugin reload", () => {
  const listeners = new Map();
  const saved = new Map();
  const win = { sessionStorage: { getItem: saved.get.bind(saved), setItem: saved.set.bind(saved) },
    location: { pathname: "/h/host/workspace/work" },
    addEventListener: listeners.set.bind(listeners), removeEventListener: listeners.delete.bind(listeners) };
  (globalThis as any).window = win;
  const key = "host:work";
  const layout = (ids: string[]) => ({ [key]: { root: { kind: "pane", pane: { tabs: ids.map(agentId =>
    ({ target: { kind: "agent", agentId } })) } } } });
  let ids = ["first", "archived"];
  let change = () => {};
  const set = (next: string[]) => { ids = next; state.layoutByWorkspace = layout(ids); change(); };
  const opened: string[] = [];
  const state = { layoutByWorkspace: layout(ids), unhideAgent() {},
    openTab({ target }: any) { opened.push(target.agentId); set([...ids, target.agentId]); return true; } };
  const store = { getState: () => state, subscribe(fn: (s: any) => void) { change = () => fn(state); return () => { change = () => {}; }; } };
  const cleanup = installReopen(store);
  set(["archived"]);
  set([]);
  cleanup();
  const stop = installReopen(store);
  let prevented = 0;
  const press = () => listeners.get("keydown")({ code: "KeyT", metaKey: true, shiftKey: true,
    preventDefault() { prevented++; }, stopImmediatePropagation() {} });
  press(); press(); press();
  assert.deepEqual(opened, ["archived", "first"]);
  assert.equal(prevented, 3);
  stop();
  delete (globalThis as any).window;
});
