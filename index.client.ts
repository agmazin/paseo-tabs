import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountClose } from "./client/close";
import { mountTabs } from "./client/web";

declare const window: any;
declare const document: any;
if (typeof window !== "undefined" && typeof document !== "undefined") mountClose();

export default function contribute(client: PluginClientContext) {
  const stopClose = mountClose(client.paseo);
  const stopTabs = mountTabs(client.paseo);
  return () => { stopClose(); stopTabs(); };
}
