import type { CloseTab } from "../shared/close";

declare const window: any;
declare const document: any;

export type Choice = "close" | "archive" | "cancel";
export type LayoutStore = { getState: () => any; subscribe: (callback: (state: any) => void) => () => void; persist?: any };
export type CloseRequest = { workspaceKey: string; tabId: string; agentId: string; title?: string; isCurrent?: () => boolean };
const VERSION = "0.4.6";
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
    if (pending || !request.workspaceKey || !request.tabId || !request.agentId || !contains(request) || request.isCurrent?.() === false) {
      console.warn("[paseo-tabs] close cancelled before dialog", { pending, contains: contains(request), current: request.isCurrent?.(), request: { key: request.workspaceKey, tab: request.tabId } });
      return "cancel";
    }
    // Another Paseo build has no known modal: the tab closes as before the choice existed, the chat stays in Dialogs.
    let ui: ReturnType<typeof hostCloseUi> | null = null;
    try {
      ui = hostCloseUi();
    } catch (error) {
      console.warn("[paseo-tabs] Host close dialog unavailable on this Paseo build; own dialog", error);
    }
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
        const finish = (choice: Choice, why = "") => {
          if (settled) return;
          if (choice === "cancel" && why) console.warn(`[paseo-tabs] close dialog cancelled: ${why}`);
          settled = true;
          resolve(choice !== "cancel" && (!actionable() || focus() !== signature || !contains(request) || request.isCurrent?.() === false) ? "cancel" : choice);
        };
        cancelPending = () => finish("cancel");
        overlay = document.createElement("div");
        overlay.dataset.testid = "paseo-tab-close-root";
        overlay.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column;pointer-events:none;-webkit-app-region:no-drag";
        document.body.appendChild(overlay);
        let fallback = false;
        const focusStyle = document.createElement("style");
        focusStyle.textContent = '[data-testid^="paseo-tab-close-"]:focus{outline:none!important}[data-testid^="paseo-tab-close-"]:focus-visible{outline:2px solid #888!important;outline-offset:1px}';
        // Own dialog: same title, text, buttons and test ids as the host one, so the checks below stay the same.
        const showFallback = () => {
          fallback = true;
          try { root?.unmount(); } catch {}
          root = undefined;
          overlay.replaceChildren();
          overlay.style.pointerEvents = "auto";
          const colors = (() => { try { return ui?.runtime.getTheme().colors ?? {}; } catch { return {}; } })();
          const bg = colors.surface1 ?? "#1f2121", fg = colors.foreground ?? "#e8e8e8", muted = colors.foregroundMuted ?? "#a3a3a3";
          const line = colors.border ?? "rgba(255,255,255,0.08)", ok = colors.accent ?? "#2f7d4f";
          const el = (tag: string, css: string, text?: string) => { const node = document.createElement(tag); node.style.cssText = css; if (text) node.textContent = text; return node; };
          const shade = el("div", "position:absolute;inset:0;background:rgba(0,0,0,0.45)");
          shade.onclick = () => finish("cancel");
          const panel = el("div", `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));background:${bg};border:1px solid ${line};border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:${fg};overflow:hidden`);
          panel.dataset.testid = "paseo-tab-close-surface";
          panel.dataset.own = "true";
          panel.setAttribute("role", "dialog");
          const head = el("div", `display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid ${line}`);
          head.append(el("div", "font-size:15px;font-weight:500", "Закрыть вкладку?"));
          const x = el("button", `all:unset;cursor:pointer;color:${muted};font-size:18px;line-height:1;padding:4px 6px;border-radius:6px`, "✕");
          x.dataset.testid = "paseo-tab-close-cancel";
          x.setAttribute("aria-label", "Отменить закрытие");
          x.onclick = () => finish("cancel");
          head.append(x);
          const body = el("div", "padding:20px;display:flex;flex-direction:column;gap:16px");
          body.append(el("div", "font-size:14px", request.title || "Чат"));
          body.append(el("div", `font-size:14px;line-height:22px;color:${muted}`, "После закрытия вкладки чат останется в Диалогах. Архивирование остановит чат и уберёт его в архив."));
          const row = el("div", "display:flex;gap:8px");
          const button = (testid: string, label: string, css: string, choice: Choice) => {
            const node = el("button", `all:unset;cursor:pointer;flex:1;text-align:center;font-size:13px;font-weight:500;padding:8px 12px;border-radius:8px;${css}`, label);
            node.dataset.testid = testid;
            node.onclick = () => finish(choice);
            return node;
          };
          row.append(button("paseo-tab-close-close", "Закрыть", `background:${ok};color:${colors.accentForeground ?? "#fff"}`, "close"));
          row.append(button("paseo-tab-close-archive", "Архивировать", "background:#f97316;color:#18181b", "archive"));
          body.append(row);
          panel.append(head, body);
          overlay.append(shade, panel, focusStyle);
          missingSince = Date.now();
        };
        if (ui) {
          const host = ui;
          const h = host.React.createElement;
          const updateFocusStyle = () => {
            focusStyle.textContent = `[data-testid^="paseo-tab-close-"]:focus{outline:none!important}[data-testid^="paseo-tab-close-"]:focus-visible{outline:2px solid ${host.runtime.getTheme().colors.ring}!important;outline-offset:1px}[data-testid="paseo-tab-close-cancel"][data-initial-focus="true"]:focus{outline:none!important}`;
          };
          function Content() {
            const { theme } = host.useUnistyles();
            host.React.useLayoutEffect(updateFocusStyle, [theme.colors.ring]);
            return h(host.View, { style: { gap: theme.spacing[4] } },
              h(host.Text, { style: { color: theme.colors.foreground, fontSize: theme.fontSize.base } }, request.title || "Чат"),
              h(host.Text, { style: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base, lineHeight: 22 } },
                "После закрытия вкладки чат останется в Диалогах. Архивирование остановит чат и уберёт его в архив."),
              h(host.View, { style: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], alignItems: "center" } },
                h(host.Button, { testID: "paseo-tab-close-close", variant: "default", size: "sm", style: { flex: 1 }, onPress: () => finish("close") }, "Закрыть"),
                h(host.Button, { testID: "paseo-tab-close-archive", size: "sm", style: { flex: 1, backgroundColor: "#f97316", borderColor: "#f97316" },
                  textStyle: { color: "#18181b" }, onPress: () => finish("archive") }, "Архивировать")));
          }
          function Dialog() {
            return h(host.SafeAreaProvider, { initialMetrics: { frame: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }, insets: { top: 0, right: 0, bottom: 0, left: 0 } } },
              h(host.GestureHandlerRootView, { style: { flex: 1 } }, h(host.BottomSheetModalProvider, null,
                h(host.AdaptiveModalSheet, { visible: true, onClose: () => finish("cancel"), header: { title: "Закрыть вкладку?" },
                  testID: "paseo-tab-close-surface" }, h(Content)))));
          }
          root = host.createRoot(overlay);
          host.flushSync(() => root.render(h(Dialog)));
        } else showFallback();
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
            if (!fallback && Date.now() - missingSince > 1000) {
              console.warn("[paseo-tabs] host close dialog not visible; own dialog", JSON.stringify(next.map(button => button ? Math.round(button.getBoundingClientRect().width) : "missing")));
              showFallback();
              return;
            }
            if (Date.now() - missingSince > 2000)
              finish("cancel", `controls not visible ${JSON.stringify(next.map(button => {
                if (!button) return "missing";
                const r = button.getBoundingClientRect();
                const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), hit: hit ? `${hit.tagName}.${hit.getAttribute?.("data-testid") ?? ""}` : null };
              }))} window ${window.innerWidth}x${window.innerHeight}`);
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
          if (focus() !== signature || !contains(request) || request.isCurrent?.() === false || !overlay.isConnected) {
            finish("cancel", `context changed focus=${focus() === signature} contains=${contains(request)} current=${request.isCurrent?.()} overlay=${overlay.isConnected}`);
            return;
          }
          syncControls();
        }, 40);
        observer = new window.MutationObserver(() => { if (!overlay.isConnected) finish("cancel", "overlay removed"); });
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

// Metro module ids of the exact desktop builds the close choice is verified on: 0.14.0 and 0.16.2.
// The host owns the modal, header, close icon, compact sheet, buttons and theme.
const BUILDS: Record<string, Record<"react" | "root" | "flush" | "sheet" | "button" | "uni" | "safe" | "gesture" | "bottom" | "view" | "text", number>> = {
  "/_expo/static/js/web/index-4df2750168de94b9b8fdf3170859afa9.js": {
    react: 35, root: 87, flush: 90, sheet: 3675, button: 3351, uni: 160, safe: 480, gesture: 3679, bottom: 3676, view: 187, text: 275,
  },
  "/_expo/static/js/web/index-0d8c444bf1d4a1ba16548f9ab36ae9d8.js": {
    react: 36, root: 87, flush: 91, sheet: 3414, button: 3384, uni: 160, safe: 487, gesture: 3418, bottom: 3415, view: 187, text: 275,
  },
};
function hostCloseUi() {
  const sources = Array.from(document.scripts ?? []).map((script: any) => String(script.src ?? "").split(/[?#]/)[0]);
  const bundle = Object.keys(BUILDS).find(name => sources.some(src => src.endsWith(name)));
  if (!bundle) throw new Error("Unsupported Paseo desktop UI build");
  const ids = BUILDS[bundle];
  const load = window.__r;
  if (typeof load !== "function") throw new Error("Paseo UI modules unavailable");
  const React = load(ids.react);
  const { createRoot } = load(ids.root);
  const { flushSync } = load(ids.flush);
  const { AdaptiveModalSheet } = load(ids.sheet);
  const { Button } = load(ids.button);
  const { useUnistyles, UnistylesRuntime: runtime } = load(ids.uni);
  const { SafeAreaProvider } = load(ids.safe);
  const { GestureHandlerRootView } = load(ids.gesture);
  const { BottomSheetModalProvider } = load(ids.bottom);
  const View = load(ids.view).default;
  const Text = load(ids.text).default;
  if (![React.createElement, createRoot, flushSync, AdaptiveModalSheet, Button, useUnistyles].every(value => typeof value === "function") ||
    !SafeAreaProvider || !GestureHandlerRootView || !BottomSheetModalProvider || !View || !Text)
    throw new Error("Unsupported Paseo UI module contract");
  return { React, createRoot, flushSync, AdaptiveModalSheet, Button, useUnistyles, runtime, SafeAreaProvider, GestureHandlerRootView, BottomSheetModalProvider, View, Text };
}
