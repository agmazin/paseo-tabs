import type { LayoutStore } from "./close-policy.web";
import type { CloseTab } from "../shared/close";

declare const window: any;
const storageKey = "paseo-tabs.closed-chats.v1";
type Entry = { workspaceKey: string; agentId: string };

function agentIds(root: any): string[] {
  if (!root) return [];
  if (root.kind !== "pane") return (root.group?.children ?? []).flatMap(agentIds);
  return root.pane.tabs.flatMap((tab: CloseTab) =>
    tab.target.kind === "agent" && tab.target.agentId ? [tab.target.agentId] : []);
}

export function installReopen(store: LayoutStore) {
  let history: Entry[] = [];
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(saved)) history = saved.filter(entry =>
      typeof entry?.workspaceKey === "string" && typeof entry.agentId === "string");
  } catch {}
  const save = () => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(history)); } catch {}
  };
  let previous = store.getState().layoutByWorkspace;
  const unsubscribe = store.subscribe(state => {
    const current = state.layoutByWorkspace;
    if (current === previous) return;
    const before = previous;
    previous = current;
    for (const workspaceKey of Object.keys(current)) {
      if (!before[workspaceKey] || before[workspaceKey].root === current[workspaceKey].root) continue;
      const oldIds = new Set(agentIds(before[workspaceKey].root));
      const newIds = new Set(agentIds(current[workspaceKey].root));
      const closed = [...oldIds].filter(id => !newIds.has(id));
      const opened = [...newIds].filter(id => !oldIds.has(id));
      if (!closed.length && !opened.length) continue;
      const changed = new Set([...opened, ...closed]);
      history = history.filter(entry => entry.workspaceKey !== workspaceKey || !changed.has(entry.agentId));
      history.push(...closed.map(agentId => ({ workspaceKey, agentId })));
      history = history.slice(-100);
      save();
    }
  });
  const keydown = (event: any) => {
    if (!event.metaKey || !event.shiftKey || event.altKey || event.ctrlKey || event.code !== "KeyT") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    const entry = history.at(-1);
    if (!entry) return;
    const { workspaceKey, agentId } = entry;
    const separator = workspaceKey.indexOf(":");
    const server = workspaceKey.slice(0, separator);
    const workspace = workspaceKey.slice(separator + 1);
    const state = store.getState();
    state.unhideAgent(workspaceKey, agentId);
    if (!state.openTab({ workspaceKey, target: { kind: "agent", agentId }, pin: true })) return;
    history = history.filter(item => item !== entry);
    save();
    const route = "/h/" + encodeURIComponent(server) + "/workspace/" + encodeURIComponent(workspace);
    if (window.location.pathname !== route) {
      window.history.pushState(window.history.state, "", route);
      window.dispatchEvent(new window.PopStateEvent("popstate", { state: window.history.state }));
    }
  };
  window.addEventListener("keydown", keydown, true);
  return () => {
    unsubscribe();
    window.removeEventListener("keydown", keydown, true);
  };
}
