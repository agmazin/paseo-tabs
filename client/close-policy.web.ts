import type { CloseTab } from "../shared/close";

declare const window: any;
declare const document: any;

export type Choice = "close" | "archive" | "cancel";
export type LayoutStore = { getState: () => any; subscribe: (callback: (state: any) => void) => () => void; persist?: any };
export type CloseRequest = { workspaceKey: string; tabId: string; agentId: string; title?: string; isCurrent?: () => boolean };
const VERSION = "0.4.1";
const STORAGE = "paseo-tabs.hidden-agents.v1";

function allTabs(root: any): CloseTab[] {
  if (!root) return [];
  if (root.kind === "pane") return root.pane.tabs ?? [];
  return (root.group?.children ?? []).flatMap(allTabs);
}

export function installClosePolicy() {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const existing = window.__paseoTabClosePolicy;
  if (existing?.version === VERSION) return existing;
  existing?.dispose?.();
  let store: LayoutStore | undefined;
  let stopStore: (() => void) | undefined;
  let cancelPending: (() => void) | undefined;
  let pending = false;
  const focus = () => {
    const layouts = store?.getState().layoutByWorkspace ?? {};
    return window.location.pathname + JSON.stringify(Object.entries(layouts).map(([key, value]: [string, any]) =>
      [key, value.focusedPaneId, allPanes(value.root).map(pane => [pane.id, pane.focusedTabId])]));
  };
  const contains = (request: CloseRequest) => !store || [...allTabs(store.getState().layoutByWorkspace[request.workspaceKey]?.root), ...(store.getState().sheetsByWorkspace?.[request.workspaceKey] ?? []).map((sheet: any) => sheet.tab)]
    .some(tab => tab.tabId === request.tabId && tab.target.agentId === request.agentId);
  const choose = async (request: CloseRequest): Promise<Choice> => {
    if (pending || !request.workspaceKey || !request.tabId || !request.agentId || !contains(request) || request.isCurrent?.() === false) return "cancel";
    pending = true;
    const signature = focus();
    let overlay: any;
    let timer: any;
    let key: any;
    let observer: any;
    const previousFocus = document.activeElement;
    try {
      return await new Promise<Choice>(resolve => {
        let settled = false;
        const finish = (choice: Choice) => {
          if (settled) return;
          settled = true;
          resolve(choice !== "cancel" && (focus() !== signature || !contains(request) || request.isCurrent?.() === false) ? "cancel" : choice);
        };
        cancelPending = () => finish("cancel");
        overlay = document.createElement("div");
        overlay.dataset.testid = "paseo-tab-close-dialog";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "paseo-tab-close-title");
        overlay.style.cssText = "box-sizing:border-box;position:fixed;inset:0;z-index:2147483647;background:#0009;display:flex;align-items:center;justify-content:center;padding:20px;color:var(--foreground,#eee);font:14px system-ui;-webkit-app-region:no-drag";
        const panel = document.createElement("div");
        panel.style.cssText = "box-sizing:border-box;position:relative;width:420px;max-width:100%;background:#202421;border:1px solid #4b524c;border-radius:14px;padding:24px;box-shadow:0 16px 60px #0008";
        const heading = document.createElement("h2");
        heading.id = "paseo-tab-close-title";
        heading.textContent = "Закрыть вкладку?";
        heading.style.cssText = "font-size:18px;margin:0 32px 12px 0";
        const title = document.createElement("p");
        title.textContent = request.title || "Чат";
        title.style.cssText = "overflow-wrap:anywhere;margin:0 0 12px";
        const explanation = document.createElement("p");
        explanation.textContent = "После закрытия вкладки чат останется в Диалогах. Архивирование остановит чат и уберёт его в архив.";
        explanation.style.cssText = "color:#b6bdb7;line-height:1.5;margin:0 0 20px";
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
        const buttons: any[] = [];
        for (const [label, choice] of [["Отменить закрытие", "cancel"], ["Закрыть", "close"], ["Архивировать", "archive"]] as const) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = choice === "cancel" ? "×" : label;
          button.setAttribute("aria-label", label);
          button.dataset.testid = `paseo-tab-close-${choice}`;
          button.style.cssText = "border:1px solid #69746a;border-radius:8px;background:#166534;color:#fff;padding:10px 12px;cursor:pointer;font:inherit";
          if (choice === "archive") button.style.background = "#9a3412";
          if (choice === "cancel") button.style.cssText = "position:absolute;top:12px;right:12px;width:36px;height:36px;border:1px solid transparent;border-radius:8px;background:transparent;color:#eee;font:26px system-ui;cursor:pointer";
          button.addEventListener("focus", () => { button.style.outline = "2px solid #f8fafc"; button.style.outlineOffset = "3px"; });
          button.addEventListener("blur", () => { button.style.outline = ""; button.style.outlineOffset = ""; });
          button.addEventListener("click", () => finish(choice));
          buttons.push(button);
          (choice === "cancel" ? panel : actions).appendChild(button);
        }
        panel.append(heading, title, explanation, actions);
        overlay.appendChild(panel);
        key = (event: any) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finish("cancel"); }
          if (event.key === "Tab") {
            event.preventDefault(); event.stopImmediatePropagation();
            const index = buttons.indexOf(document.activeElement);
            buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
          }
        };
        window.addEventListener("keydown", key, true);
        document.body.appendChild(overlay);
        const style = window.getComputedStyle(overlay);
        const bounds = overlay.getBoundingClientRect();
        if (!overlay.isConnected || style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || bounds.width <= 0 || bounds.height <= 0) { finish("cancel"); return; }
        buttons[0].focus();
        timer = window.setInterval(() => { if (focus() !== signature || !contains(request) || request.isCurrent?.() === false || !overlay.isConnected) finish("cancel"); }, 40);
        observer = new window.MutationObserver(() => { if (!overlay.isConnected) finish("cancel"); });
        observer.observe(document.body, { childList: true });
      });
    } catch (error) {
      console.warn("[paseo-tabs] Close dialog unavailable; action cancelled", error);
      return "cancel";
    } finally {
      window.clearInterval(timer);
      observer?.disconnect();
      window.removeEventListener("keydown", key, true);
      overlay?.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      cancelPending = undefined;
      pending = false;
    }
  };
  const attachStore = (next: LayoutStore) => {
    if (store === next) return;
    stopStore?.();
    store = next;
    const restore = () => {
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE) || "{}");
        for (const [key, ids] of Object.entries(saved)) {
          if (!Array.isArray(ids)) continue;
          for (const id of ids) {
            if (typeof id !== "string") continue;
            next.getState().hideAgent(key, id);
            for (const tab of allTabs(next.getState().layoutByWorkspace[key]?.root))
              if (tab.target.kind === "agent" && tab.target.agentId === id) next.getState().closeTab(key, tab.tabId);
          }
        }
      } catch (error) { console.warn("[paseo-tabs] Cannot restore hidden tabs", error); }
    };
    const stopHydration = next.persist && !next.persist.hasHydrated() ? next.persist.onFinishHydration(restore) : undefined;
    if (!stopHydration) restore();
    let previous = next.getState().hiddenAgentIdsByWorkspace;
    const unsubscribe = next.subscribe(state => {
      if (previous === state.hiddenAgentIdsByWorkspace) return;
      previous = state.hiddenAgentIdsByWorkspace;
      try { window.localStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(Object.entries(previous).map(([key, ids]) => [key, [...ids as Set<string>]])))); }
      catch (error) { console.warn("[paseo-tabs] Cannot persist hidden tabs", error); }
    });
    stopStore = () => { unsubscribe(); stopHydration?.(); };
  };
  const close = (request: CloseRequest) => {
    if (!store || !contains(request)) return;
    const state = store.getState();
    const otherTab = allTabs(state.layoutByWorkspace[request.workspaceKey]?.root).some(tab =>
      tab.tabId !== request.tabId && tab.target.kind === "agent" && tab.target.agentId === request.agentId);
    if (!otherTab) {
      state.unpinAgent?.(request.workspaceKey, request.agentId);
      state.hideAgent(request.workspaceKey, request.agentId);
    }
    state.closeTab(request.workspaceKey, request.tabId);
  };
  const policy = { version: VERSION, choose, close, attachStore, cancel: () => cancelPending?.(),
    dispose: () => { cancelPending?.(); stopStore?.(); }, get store() { return store; } };
  window.__paseoTabClosePolicy = policy;
  document.documentElement.setAttribute("data-paseo-tab-close-policy", VERSION);
  return policy;
}

function allPanes(root: any): any[] {
  if (!root) return [];
  return root.kind === "pane" ? [root.pane] : (root.group?.children ?? []).flatMap(allPanes);
}
