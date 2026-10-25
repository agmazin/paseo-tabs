import type { PluginClientContext } from "@getpaseo/plugin/client";
import { KeyboardBridge } from "./client/keyboard";
import { mountTabs } from "./client/web";

export default function contribute(client: PluginClientContext) {
  const stopTabs = mountTabs(client.paseo);
  const stopKeyboard = client.addSidebarHeaderItem({ id: "keyboard-bridge", title: "Вкладки", Component: KeyboardBridge });
  return () => { stopKeyboard(); stopTabs(); };
}
