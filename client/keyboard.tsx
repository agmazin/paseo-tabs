import { useEffect, useState } from "react";

declare const window: any;
declare const document: any;
declare const fetch: any;
type Dispatcher = { registerHandler: (handler: any) => () => void };
type DispatcherHook = () => Dispatcher;

async function discoverDispatcherHook(): Promise<DispatcherHook | null> {
  for (const script of document.scripts) {
    if (!script.src?.includes("/static/js/")) continue;
    const response = await fetch(script.src);
    if (!response.ok) continue;
    for (const line of (await response.text()).split("\n")) {
      if (!line.includes("KeyboardActionDispatcherProvider") || !line.includes("useKeyboardActionDispatcher")) continue;
      const match = line.match(/\},(\d+),\[[\d,]*\]\);$/);
      if (!match) continue;
      const module = window.__r?.(Number(match[1]));
      if (typeof module?.useKeyboardActionDispatcher === "function") return module.useKeyboardActionDispatcher;
    }
  }
  return null;
}

function RegisterKeyboard({ useDispatcher }: { useDispatcher: DispatcherHook }) {
  const dispatcher = useDispatcher();
  useEffect(() => {
    const state = window.__paseoTabsClose;
    if (!state || state.dispatcher === dispatcher) return;
    state.stopKeyboard?.();
    state.dispatcher = dispatcher;
    state.stopKeyboard = dispatcher.registerHandler({
      handlerId: "paseo-tabs-close-current",
      actions: ["workspace.tab.close-current"],
      enabled: true,
      priority: 100_000,
      handle: () => {
        const handled = window.__paseoTabsClose?.closeCurrent?.() ?? false;
        state.lastShortcut = { handled, time: Date.now() };
        return handled;
      },
    });
    document.documentElement.setAttribute("data-paseo-tabs-keyboard", "ready");
  }, [dispatcher]);
  return null;
}

export function KeyboardBridge() {
  const [hook, setHook] = useState<DispatcherHook | null>(null);
  useEffect(() => {
    let alive = true;
    void discoverDispatcherHook().then(value => { if (alive) setHook(() => value); })
      .catch(error => console.warn("[paseo-tabs] Native keyboard dispatcher unavailable", error));
    return () => { alive = false; };
  }, []);
  return hook ? <RegisterKeyboard useDispatcher={hook} /> : null;
}
