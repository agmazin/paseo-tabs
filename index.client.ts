import type { PluginClientContext } from "@getpaseo/plugin/client";
import { mountTabs } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return mountTabs();
}
