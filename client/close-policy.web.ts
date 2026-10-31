import type { CloseTab } from "../shared/close";

declare const window: any;
declare const document: any;

export type Choice = "close" | "archive" | "cancel";
export type LayoutStore = { getState: () => any; subscribe: (callback: (state: any) => void) => () => void; persist?: any };
export type CloseRequest = { workspaceKey: string; tabId: string; agentId: string; title?: string; isCurrent?: () => boolean };
const VERSION = "0.4.2";
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
    let root: any;
    let timer: any;
    let key: any;
    let observer: any;
    const previousFocus = document.activeElement;
    try {
      return await new Promise<Choice>(resolve => {
        let settled = false;
        let actionable = () => false;
        const finish = (choice: Choice) => {
          if (settled) return;
          settled = true;
          resolve(choice !== "cancel" && (!actionable() || focus() !== signature || !contains(request) || request.isCurrent?.() === false) ? "cancel" : choice);
        };
        cancelPending = () => finish("cancel");
        overlay = document.createElement("div");
        overlay.dataset.testid = "paseo-tab-close-root";
        overlay.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;pointer-events:none;-webkit-app-region:no-drag";
        document.body.appendChild(overlay);
        const ui = hostCloseUi();
        const h = ui.React.createElement;
        const focusStyle = document.createElement("style");
        const updateFocusStyle = () => {
          focusStyle.textContent = `[data-testid^="paseo-tab-close-"]:focus{outline:none!important}[data-testid^="paseo-tab-close-"]:focus-visible{outline:2px solid ${ui.runtime.getTheme().colors.ring}!important;outline-offset:1px}[data-testid="paseo-tab-close-cancel"][data-initial-focus="true"]:focus{outline:none!important}`;
        };
        function Content() {
          const { theme } = ui.useUnistyles();
          ui.React.useLayoutEffect(updateFocusStyle, [theme.colors.ring]);
          return h(ui.View, { style: { gap: theme.spacing[4] } },
            h(ui.Text, { style: { color: theme.colors.foreground, fontSize: theme.fontSize.base } }, request.title || "Чат"),
            h(ui.Text, { style: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base, lineHeight: 22 } },
              "После закрытия вкладки чат останется в Диалогах. Архивирование остановит чат и уберёт его в архив."),
            h(ui.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], alignItems: "center" } },
              h(ui.Button, { testID: "paseo-tab-close-close", variant: "default", size: "sm", style: { flex: 1 }, onPress: () => finish("close") }, "Закрыть"),
              h(ui.Button, { testID: "paseo-tab-close-archive", size: "sm", style: { flex: 1, backgroundColor: "#f97316", borderColor: "#f97316" },
                textStyle: { color: "#18181b" }, onPress: () => finish("archive") }, "Архивировать")));
        }
        function Dialog() {
          return h(ui.SafeAreaProvider, { initialMetrics: { frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, insets: { top: 0, right: 0, bottom: 0, left: 0 } } },
            h(ui.GestureHandlerRootView, { style: { flex: 1 } }, h(ui.BottomSheetModalProvider, null,
              h(ui.AdaptiveModalSheet, { visible: true, onClose: () => finish("cancel"), header: { title: "Закрыть вкладку?" },
                testID: "paseo-tab-close-surface" }, h(Content)))));
        }
        root = ui.createRoot(overlay);
        ui.flushSync(() => root.render(h(Dialog)));
        overlay.appendChild(focusStyle);
        let buttons: any[] = [];
        let firstFocus = true;
        let missingSince = Date.now();
        const visibleButton = (button: any) => {
          if (!button?.isConnected) return false;
          const bounds = button.getBoundingClientRect();
          if (bounds.width <= 0 || bounds.height <= 0) return false;
          const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
          if (!hit || !button.contains(hit)) return false;
          for (let node = button; node; node = node.parentElement) {
            const style = window.getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          }
          return true;
        };
        const syncControls = () => {
          const surface = document.querySelector('[data-testid="paseo-tab-close-surface"], [data-testid="paseo-tab-close-dialog"]');
          const next = [
            surface?.querySelector('[data-testid="paseo-tab-close-cancel"], [role="button"][aria-label="Close"], [role="button"][aria-label="Закрыть"]'),
            document.querySelector('[data-testid="paseo-tab-close-close"]'),
            document.querySelector('[data-testid="paseo-tab-close-archive"]'),
          ];
          if (next.some(button => !visibleButton(button))) {
            buttons = [];
            if (Date.now() - missingSince > 2000) finish("cancel");
            return;
          }
          missingSince = Date.now();
          buttons = next;
          actionable = () => buttons.length === 3 && buttons.every(visibleButton);
          const dialog = surface.querySelector('[role="dialog"]') ?? surface.parentElement;
          dialog.setAttribute("role", "dialog");
          dialog.setAttribute("aria-modal", "true");
          dialog.setAttribute("aria-label", "Закрыть вкладку?");
          surface.dataset.testid = "paseo-tab-close-dialog";
          buttons[0].dataset.testid = "paseo-tab-close-cancel";
          buttons[0].setAttribute("aria-label", "Отменить закрытие");
          buttons[0].style.marginRight = `${-parseFloat(window.getComputedStyle(buttons[0]).paddingRight)}px`;
          buttons[0].onblur = () => delete buttons[0]?.dataset.initialFocus;
          if (firstFocus) { buttons[0].dataset.initialFocus = "true"; buttons[0].focus({ preventScroll: true }); firstFocus = false; }
        };
        key = (event: any) => {
          if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); finish("cancel"); }
          if (event.key === "Tab") {
            for (const button of buttons) delete button.dataset.initialFocus;
            event.preventDefault(); event.stopImmediatePropagation();
            syncControls();
            if (!buttons.length) return;
            const index = buttons.indexOf(document.activeElement);
            buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
          }
        };
        window.addEventListener("keydown", key, true);
        syncControls();
        timer = window.setInterval(() => {
          if (focus() !== signature || !contains(request) || request.isCurrent?.() === false || !overlay.isConnected) { finish("cancel"); return; }
          syncControls();
        }, 40);
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
      root?.unmount();
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

// Metro exports of the exact Paseo 0.14.0 client supported by the native patch.
// The host owns the modal, header, close icon, compact sheet, buttons and theme.
function hostCloseUi() {
  const load = window.__r;
  if (typeof load !== "function") throw new Error("Paseo UI modules unavailable");
  const React = load(35);
  const { createRoot } = load(87);
  const { flushSync } = load(90);
  const { AdaptiveModalSheet } = load(3675);
  const { Button } = load(3351);
  const { useUnistyles, UnistylesRuntime: runtime } = load(160);
  const { SafeAreaProvider } = load(480);
  const { GestureHandlerRootView } = load(3679);
  const { BottomSheetModalProvider } = load(3676);
  const View = load(187).default;
  const Text = load(275).default;
  if (![React.createElement, createRoot, flushSync, AdaptiveModalSheet, Button, useUnistyles].every(value => typeof value === "function") ||
    !SafeAreaProvider || !GestureHandlerRootView || !BottomSheetModalProvider || !View || !Text)
    throw new Error("Unsupported Paseo UI module contract");
  return { React, createRoot, flushSync, AdaptiveModalSheet, Button, useUnistyles, runtime, SafeAreaProvider, GestureHandlerRootView, BottomSheetModalProvider, View, Text };
}
