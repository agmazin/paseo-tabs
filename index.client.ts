import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountClose } from "./client/close";
import { installIntentJournal, startRecovery } from "./client/recovery";
import { mountTabs } from "./client/web";

declare const window: any;
declare const document: any;
if (typeof window !== "undefined" && typeof document !== "undefined") { installIntentJournal(); mountClose(); }

export default function contribute(client: PluginClientContext) {
  const stopRecovery = startRecovery(client);
  const stopTabs = mountTabs(client.paseo);
  return () => { stopRecovery(); stopTabs(); };
}
