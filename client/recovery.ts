import type { PluginClientContext } from "@getpaseo/plugin/client";
import { watchTabs } from "../shared/recovery";
declare const window: any;
declare const document: any;
export function installIntentJournal() {
  if (window.__paseoTabsIntentJournal) return;
  window.__paseoTabsIntentJournal = true;
  const key = "paseo-tabs.close-intents.v1";
  const read = (): { id: string; at: number }[] => {
    try { return JSON.parse(window.localStorage.getItem(key) || "[]").filter((x: any) => Date.now() - x.at < 15_000); }
    catch { return []; }
  };
  const record = (event: any) => {
    if (document.documentElement.hasAttribute("data-paseo-tabs-close")) return;
    let id: string | undefined;
    if (event.type === "keydown" && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w")
      id = document.querySelector('button[data-testid^="workspace-tab-agent_"][aria-selected="true"]')?.getAttribute("data-testid")?.slice("workspace-tab-agent_".length);
    else if (event.type === "pointerdown") id = event.target?.closest?.('[data-testid^="workspace-agent-close-"]')?.getAttribute("data-testid")?.slice("workspace-agent-close-".length);
    if (id) window.localStorage.setItem(key, JSON.stringify([...read().filter(x => x.id !== id), { id, at: Date.now() }]));
  };
  window.addEventListener("pointerdown", record, true);
  window.addEventListener("keydown", record, true);
}
export function startRecovery(client: PluginClientContext) {
  installIntentJournal();
  const key = "paseo-tabs.close-intents.v1";
  const read = () => {
    try { return JSON.parse(window.localStorage.getItem(key) || "[]").filter((x: any) => Date.now() - x.at < 15_000); }
    catch { return []; }
  };
  let stopped = false, busy = false;
  const send = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const intents = read();
      if (!intents.length) return;
      const result = await client.rpc(watchTabs, { intents });
      if (result.restored.length) window.localStorage.setItem(key, JSON.stringify(read().filter((item: any) => !result.restored.includes(item.id))));
    } catch (error) { if (!stopped) console.warn("[paseo-tabs] Recovery observation failed", error); }
    finally { busy = false; }
  };
  const timer = window.setInterval(send, 500);
  void send();
  return () => { stopped = true; window.clearInterval(timer); };
}
