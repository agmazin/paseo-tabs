import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountTabs } from "./client/web";

export default function contribute(client: PluginClientContext) {
  return mountTabs(client.paseo);
}
