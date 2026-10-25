import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
export const watchTabs = defineRpc({
  name: "tabs.watch",
  input: z.object({ intents: z.array(z.object({ id: z.string(), at: z.number() })).max(500) }),
  output: z.object({ restored: z.array(z.string()) }),
});
