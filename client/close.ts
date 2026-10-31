import { getPaseoClient } from "@getpaseo/plugin/client";
import { installClosePolicy, type CloseRequest } from "./close-policy.web";
import { closeSelection, moduleCandidateIds, type CloseTab } from "../shared/close";

declare const window: any;
declare const document: any;
declare const fetch: any;
type Store = { getState: () => any; subscribe: (callback: (state: any) => void) => () => void };
const hasCurrentNativePolicy = () => !!window.__paseoNativeTabCloseVersion && window.__paseoNativeTabCloseVersion !== "0.4.0";
const TAB = 'button[data-testid^="workspace-tab-"][aria-selected]';

export function observeCloseAgent(api: any, agent: { id: string; workspaceId?: string }, removed = false) {
  const state = window.__paseoTabsClose;
  if (!state) return;
  if (removed) {
    if (state.agents.get(agent.id)?.api === api) state.agents.delete(agent.id);
    return;
  }
  state.agents.set(agent.id, { api, workspaceId: agent.workspaceId });
}

export function releaseCloseAgents(api: any) {
  const agents = window.__paseoTabsClose?.agents;
  if (!agents) return;
  for (const [id, entry] of agents) if (entry.api === api) agents.delete(id);
}

function cachedStore(): Store | null {
  try {
    const id = Number(window.localStorage.getItem("paseo-tabs.layout-module.v1"));
    if (!id) return null;
    for (const value of Object.values(window.__r?.(id) ?? {}) as any[]) {
      const state = value?.getState?.();
      if (state?.layoutByWorkspace && ["hideAgent", "unhideAgent", "closeTab", "openTab"].every(key => typeof state[key] === "function")) return value;
    }
  } catch {}
  return null;
}

export async function discoverLayoutStore(): Promise<Store | null> {
  const cached = cachedStore();
  if (cached) return cached;
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
        if (state?.layoutByWorkspace && ["hideAgent", "unhideAgent", "closeTab", "openTab"].every(key => typeof state[key] === "function")) { window.localStorage.setItem("paseo-tabs.layout-module.v1", String(id)); return value; }
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

export async function closeAgentTab(api: any, request: CloseRequest, policy = installClosePolicy()) {
  if (!policy) return false;
  const handle = api.agents.ref(request.agentId);
  let invalidated = false;
  const matches = () => {
    const agent = handle.current();
    return agent?.id === request.agentId && agent.workspaceId === request.workspaceKey.slice(request.workspaceKey.indexOf(":") + 1);
  };
  const active = () => !invalidated && matches() && !handle.current().archivedAt;
  const stop = handle.subscribe((update: any) => {
    if (update.kind === "remove" || !matches() || handle.current().archivedAt) {
      invalidated = true;
      policy.cancel();
    }
  });
  try {
    await handle.refresh();
    if (!matches()) return false;
    if (handle.current().archivedAt) { policy.close(request); return true; }
    if (invalidated) return false;
    const choice = await policy.choose({ ...request, isCurrent: active });
    if (choice === "cancel" || !active()) return false;
    await handle.refresh();
    if (!active()) return false;
    if (choice === "archive") await handle.archive();
    else if (choice === "close") policy.close(request);
    return true;
  } catch (error) {
    console.warn("[paseo-tabs] Close status unavailable; action cancelled", error);
    return false;
  } finally { stop(); }
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
    if (closeButton) {
      const siblingTab = closeButton.parentElement?.querySelector(TAB) ?? closeButton.parentElement?.parentElement?.querySelector(TAB);
      if (siblingTab) return locate(siblingTab.getAttribute("data-testid").slice("workspace-tab-".length));
      return locate(`agent_${closeButton.getAttribute("data-testid").slice("workspace-agent-close-".length)}`);
    }
    const button = node?.closest?.(TAB);
    return button ? locate(button.getAttribute("data-testid").slice("workspace-tab-".length)) : null;
  };
  const stop = (event: any) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const close = async (key: string, tabs: CloseTab[]) => {
    for (const tab of tabs) {
      const id = tab.target.agentId;
      if (!id) continue;
      try {
        const api = window.__paseoTabsClose.resolveHost(key.slice(0, key.indexOf(":")));
        const choice = await closeAgentTab(api, { workspaceKey: key, tabId: tab.tabId, agentId: id,
          title: document.querySelector(`[data-testid="workspace-tab-${tab.tabId}"]`)?.getAttribute("aria-label") });
        if (!choice) return;
      } catch (error) { console.warn("[paseo-tabs] Cannot resolve close status; action cancelled", error); return; }
    }
  };
  const click = (event: any) => {
    if (hasCurrentNativePolicy()) return;
    const cross = event.target?.closest?.('[data-testid^="workspace-agent-close-"]');
    if (cross) {
      stop(event);
      try {
        const found = fromNode(event.target);
        if (event.type === "click" && found?.tab.target.kind === "agent") void close(found.key, [found.tab]);
      } catch (error) { console.warn("[paseo-tabs] Cannot resolve close target; action cancelled", error); }
      return;
    }
    const found = fromNode(event.target);
    if (found?.tab.target.kind === "agent") {
      const button = event.target.closest?.('[data-testid^="workspace-agent-close-"]');
      if (event.button === 1 || button) {
        stop(event);
        if (event.type === "click" || event.type === "auxclick") void close(found.key, [found.tab]);
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
    void close(context.key, selection.filter(t => t.target.kind === "agent"));
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
    if (hasCurrentNativePolicy()) return false;
    if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return true;
    const route = window.location.pathname.match(/\/h\/([^/]+)\/workspace\/([^/]+)/);
    const workspace = route ? entries().find(([key]) => key === `${decodeURIComponent(route[1])}:${decodeURIComponent(route[2])}`) : null;
    const pane = workspace ? panes(workspace[1].root).find(p => p.id === workspace[1].focusedPaneId) : null;
    const found = pane ? locate(pane.focusedTabId) : fromNode(document.querySelector(`${TAB}[aria-selected="true"]`));
    if (!found || found.tab.target.kind !== "agent") return false;
    void close(found.key, [found.tab]);
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

export function connectDispatcher() {
  const state = window.__paseoTabsClose;
  if (!state || state.dispatcher) return;
  const root = document.getElementById("root");
  const key = root && Object.keys(root).find(key => key.startsWith("__reactContainer$"));
  const container = key && root[key];
  const pending = [container?.stateNode?.current ?? container];
  const seen = new Set();
  while (pending.length) {
    const fiber = pending.pop();
    if (!fiber || seen.has(fiber)) continue;
    seen.add(fiber);
    const dispatcher = fiber.memoizedProps?.value;
    if (typeof dispatcher?.registerHandler === "function" && typeof dispatcher?.dispatch === "function") {
      if (state.dispatcher === dispatcher) return;
      state.stopKeyboard?.();
      state.dispatcher = dispatcher;
      state.stopKeyboard = dispatcher.registerHandler({
        handlerId: "paseo-tabs-close-current", actions: ["workspace.tab.close-current"],
        enabled: true, priority: 100_000,
        handle: () => state.closeCurrent?.() ?? false,
      });
      document.documentElement.setAttribute("data-paseo-tabs-keyboard", "ready");
      return;
    }
    pending.push(fiber.child, fiber.sibling);
  }
}

function startClose(): () => void {
  let disposed = false;
  let release: (() => void) | undefined;
  const install = (store: Store | null) => {
    if (disposed) return;
    if (store) {
      installClosePolicy()?.attachStore(store);
      const events = interceptClose(store);
      window.__paseoTabsClose.closeCurrent = events.closeCurrent;
      document.documentElement.setAttribute("data-paseo-tabs-close", "ready");
      document.documentElement.setAttribute("data-paseo-tabs-close-version", "0.4.2");
      release = () => { events.dispose(); document.documentElement.removeAttribute("data-paseo-tabs-close"); document.documentElement.removeAttribute("data-paseo-tabs-close-version"); };
    }
    else {
      window.__paseoTabsClose.unavailable = true;
      window.__paseoTabsClose.closeCurrent = () => true;
      console.warn("[paseo-tabs] Layout store unavailable; close actions blocked");
    }
    connectDispatcher();
  };
  const cached = cachedStore();
  if (cached) install(cached);
  else void discoverLayoutStore().then(install).catch(error => { install(null); console.warn("[paseo-tabs] Layout discovery failed; close actions blocked", error); });
  const timer = window.setInterval(connectDispatcher, 100);
  connectDispatcher();
  return () => { disposed = true; window.clearInterval(timer); release?.(); };
}

export function mountClose(api?: any): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  installClosePolicy();
  const version = "0.4.2";
  let state = window.__paseoTabsClose;
  if (!state || state.version !== version) {
    state?.dispose();
    state = { version, count: 0, apis: new Set(), agents: new Map() };
    window.__paseoTabsClose = state;
    state.closeCurrent = () => {
      if (hasCurrentNativePolicy()) return false;
      return true;
    };
    const earlyClick = (event: any) => {
      if (hasCurrentNativePolicy() || document.documentElement.hasAttribute("data-paseo-tabs-close")) return;
      const button = event.target?.closest?.('[data-testid^="workspace-agent-close-"]');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    for (const type of ["pointerdown", "mousedown", "click", "auxclick"]) window.addEventListener(type, earlyClick, true);
    const stop = startClose();
    state.dispose = () => {
      state.stopKeyboard?.();
      document.documentElement.removeAttribute("data-paseo-tabs-keyboard");
      for (const type of ["pointerdown", "mousedown", "click", "auxclick"]) window.removeEventListener(type, earlyClick, true);
      stop();
    };
  }
  state.resolveHost = getPaseoClient;
  if (api) state.apis.add(api);
  state.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (api) { state.apis.delete(api); installClosePolicy()?.cancel(); }
    if (--state.count > 0) return;
    // Keep the window guard across plugin reload and host reconnection.
    // Replacement by a newer guard disposes this instance atomically.
    state.count = 0;
  };
}
