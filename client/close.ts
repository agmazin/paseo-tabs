import { closeSelection, moduleCandidateIds, type CloseTab } from "../shared/close";

declare const window: any;
declare const document: any;
declare const fetch: any;
type Store = { getState: () => any; subscribe: (callback: (state: any) => void) => () => void };
const TAB = 'button[data-testid^="workspace-tab-"][aria-selected]';

export async function discoverLayoutStore(): Promise<Store | null> {
  const metro = window.__r;
  if (typeof metro !== "function") return null;
  for (const script of document.scripts) {
    if (!script.src || !script.src.includes("/static/js/")) continue;
    const response = await fetch(script.src);
    if (!response.ok) continue;
    for (const id of moduleCandidateIds(await response.text())) {
      const exports = metro(id);
      for (const value of Object.values(exports) as any[]) {
        if (typeof value?.getState !== "function" || typeof value?.subscribe !== "function") continue;
        const state = value.getState();
        if (state?.layoutByWorkspace && ["hideAgent", "unhideAgent", "closeTab", "openTab"].every(key => typeof state[key] === "function")) return value;
      }
    }
  }
  return null;
}

function panes(root: any): any[] {
  if (!root) return [];
  if (root.kind === "pane") return [root.pane];
  return (root.group?.children ?? []).flatMap(panes);
}

export function interceptClose(store: Store) {
  let context: { key: string; tabId: string } | null = null;
  const entries = () => Object.entries(store.getState().layoutByWorkspace) as [string, any][];
  const locate = (tabId: string) => {
    for (const [key, layout] of entries()) {
      const pane = panes(layout.root).find(p => p.tabs.some((t: CloseTab) => t.tabId === tabId));
      if (pane) return { key, pane, tab: pane.tabs.find((t: CloseTab) => t.tabId === tabId) as CloseTab };
    }
    return null;
  };
  const fromNode = (node: any) => {
    const closeButton = node?.closest?.('[data-testid^="workspace-agent-close-"]');
    if (closeButton) return locate(`agent_${closeButton.getAttribute("data-testid").slice("workspace-agent-close-".length)}`);
    const button = node?.closest?.(TAB);
    return button ? locate(button.getAttribute("data-testid").slice("workspace-tab-".length)) : null;
  };
  const stop = (event: any) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const close = (key: string, tabs: CloseTab[]) => {
    for (const tab of tabs) {
      const state = store.getState();
      state.hideAgent(key, tab.target.agentId);
      state.closeTab(key, tab.tabId);
    }
  };
  const click = (event: any) => {
    const found = fromNode(event.target);
    if (found?.tab.target.kind === "agent") {
      const button = event.target.closest?.('[data-testid^="workspace-agent-close-"]');
      if (event.button === 1 || button) {
        stop(event);
        if (event.type === "click" || event.type === "auxclick") close(found.key, [found.tab]);
        return;
      }
    }
    if (event.type !== "click" || !context) return;
    const item = event.target.closest?.('[role="menuitem"]');
    if (!item) return;
    const text = item.textContent.trim();
    const foundContext = locate(context.tabId);
    if (!foundContext) return;
    const selection = closeSelection(foundContext.pane.tabs, context.tabId, text);
    if (!selection || !selection.some(tab => tab.target.kind === "agent")) { context = null; return; }
    stop(event);
    close(context.key, selection.filter(t => t.target.kind === "agent"));
    context = null;
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    for (const tab of selection.filter(t => t.target.kind !== "agent")) {
      const nativeTab = [...document.querySelectorAll(TAB)].find((node: any) => node.getAttribute("data-testid") === `workspace-tab-${tab.tabId}`) as any;
      nativeTab?.parentElement?.querySelector('button[data-testid*="close-"], button[aria-label="Закрыть"], button[aria-label="Close"]')?.click();
    }
  };
  const menu = (event: any) => {
    const found = fromNode(event.target);
    context = found ? { key: found.key, tabId: found.tab.tabId } : null;
  };
  const closeCurrent = () => {
    if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return false;
    const route = window.location.pathname.match(/\/h\/([^/]+)\/workspace\/([^/]+)/);
    const workspace = route ? entries().find(([key]) => key === `${decodeURIComponent(route[1])}:${decodeURIComponent(route[2])}`) : null;
    const pane = workspace ? panes(workspace[1].root).find(p => p.id === workspace[1].focusedPaneId) : null;
    const found = pane ? locate(pane.focusedTabId) : fromNode(document.querySelector(`${TAB}[aria-selected="true"]`));
    if (!found || found.tab.target.kind !== "agent") return false;
    close(found.key, [found.tab]);
    return true;
  };
  const key = (event: any) => {
    if (event.key === "Escape") context = null;
    if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "w" || event.shiftKey || event.altKey) return;
    if (closeCurrent()) stop(event);
  };
  for (const type of ["pointerdown", "mousedown", "click", "auxclick"]) window.addEventListener(type, click, true);
  window.addEventListener("contextmenu", menu, true);
  window.addEventListener("keydown", key, true);
  return { closeCurrent, dispose: () => {
    for (const type of ["pointerdown", "mousedown", "click", "auxclick"]) window.removeEventListener(type, click, true);
    window.removeEventListener("contextmenu", menu, true);
    window.removeEventListener("keydown", key, true);
  } };
}

function startClose(): () => void {
  let disposed = false;
  let release: (() => void) | undefined;
  void discoverLayoutStore().then(store => {
    if (disposed) return;
    if (store) {
      const stopPersistence = persistHidden(store);
      const events = interceptClose(store);
      window.__paseoTabsClose.closeCurrent = events.closeCurrent;
      document.documentElement.setAttribute("data-paseo-tabs-close", "ready");
      document.documentElement.setAttribute("data-paseo-tabs-close-version", "0.3.1");
      release = () => { events.dispose(); stopPersistence(); document.documentElement.removeAttribute("data-paseo-tabs-close"); document.documentElement.removeAttribute("data-paseo-tabs-close-version"); };
    }
    else console.warn("[paseo-tabs] Layout store unavailable; native tab closing retained");
  }).catch(error => { if (!disposed) console.warn("[paseo-tabs] Layout store unavailable; native tab closing retained", error); });
  return () => { disposed = true; release?.(); };
}

function persistHidden(store: Store): () => void {
  const storageKey = "paseo-tabs.hidden-agents.v1";
  const save = (state: any) => {
    try {
      const records = Object.fromEntries(Object.entries(state.hiddenAgentIdsByWorkspace).map(([key, ids]) => [key, [...(ids as Set<string>)]]));
      window.localStorage.setItem(storageKey, JSON.stringify(records));
    } catch (error) { console.warn("[paseo-tabs] Cannot persist hidden tabs", error); }
  };
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    for (const [key, ids] of Object.entries(saved)) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id !== "string") continue;
        const state = store.getState();
        state.hideAgent(key, id);
        for (const pane of panes(state.layoutByWorkspace[key]?.root))
          for (const tab of pane.tabs) if (tab.target.kind === "agent" && tab.target.agentId === id) state.closeTab(key, tab.tabId);
      }
    }
  } catch (error) { console.warn("[paseo-tabs] Cannot restore hidden tabs", error); }
  let previous = store.getState().hiddenAgentIdsByWorkspace;
  return store.subscribe(state => {
    if (state.hiddenAgentIdsByWorkspace === previous) return;
    previous = state.hiddenAgentIdsByWorkspace;
    save(state);
  });
}

export function mountClose(): () => void {
  const version = "0.3.1";
  let state = window.__paseoTabsClose;
  if (!state || state.version !== version) {
    state?.dispose();
    state = { version, count: 0 };
    window.__paseoTabsClose = state;
    const stop = startClose();
    state.dispose = () => {
      state.stopKeyboard?.();
      document.documentElement.removeAttribute("data-paseo-tabs-keyboard");
      stop();
    };
  }
  state.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--state.count > 0) return;
    state.dispose();
    if (window.__paseoTabsClose === state) delete window.__paseoTabsClose;
  };
}
