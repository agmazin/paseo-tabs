import type { PaseoApi } from "@getpaseo/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { join } from "node:path";
import { transferClient } from "./server/daemon";
import { watchTabs } from "./shared/recovery";
export default function contribute(server: PluginServerContext) {
  const completed = new Map<string, number>();
  const intents = new Map<string, number>();
  const restoring = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const jobs = new Set<Promise<unknown>>();
  let connection: ReturnType<typeof transferClient> | undefined;
  const recover = async (id: string, paseo: PaseoApi) => {
    if (restoring.has(id)) return false;
    restoring.add(id);
    try {
      if (!intents.has(id)) return false;
      const a = (await paseo.agents.ref(id).refresh())?.agent;
      const archived = Date.parse(a?.archivedAt ?? "");
      if (!a || !Number.isFinite(archived) || Date.now() - archived > 15_000) return false;
      const intent = intents.get(id) ?? 0;
      if (Math.abs(archived - intent) > 5_000) return false;
      for (const key of ["paseo.explicit-archive-at", "paseo.transfer-at"])
        if (Math.abs(archived - Date.parse(a.labels?.[key] ?? "")) < 30_000) return false;
      if (!a.persistence?.sessionId || !a.workspaceId) return false;
      const client = await (connection ??= transferClient(process.env.PASEO_HOME || join(homedir(), ".paseo")).catch(error => { connection = undefined; throw error; }));
      const labels = { ...a.labels, "paseo.tabs-recovered-at": new Date().toISOString() };
      const restored = await client.importAgent({ provider: a.provider, sessionId: a.persistence.sessionId, cwd: a.cwd, workspaceId: a.workspaceId, labels });
      if (restored.id !== id) throw new Error("Same-ID import contract changed");
      await client.updateAgent(id, { ...(a.title ? { name: a.title } : {}), labels });
      completed.set(id, intent);
      intents.delete(id);
      console.log("[paseo-tabs] Recovered native tab archive", JSON.stringify({ id, archivedAt: a.archivedAt, intentAt: new Date(intent).toISOString() }));
      return true;
    } catch (error) { console.error("[paseo-tabs] Recovery failed", id, error); return false; }
    finally { restoring.delete(id); }
  };
  server.handle(watchTabs, async ({ intents: incoming }, { paseo }) => {
    const now = Date.now();
    for (const item of incoming) if (now - item.at >= 0 && now - item.at < 15_000 && item.at > (completed.get(item.id) ?? 0)) intents.set(item.id, item.at);
    for (const [id, at] of completed) if (now - at > 15_000) completed.delete(id);
    const restored: string[] = [];
    for (const [id, at] of intents) {
      if (now - at > 15_000) { intents.delete(id); continue; }
      if (await recover(id, paseo)) restored.push(id);
    }
    return { restored };
  });
  const off = server.on("agent.archived", ({ agent }, { paseo }) => {
    if (agent.parentAgentId && intents.has(agent.parentAgentId)) intents.set(agent.id, intents.get(agent.parentAgentId)!);
    const timer = setTimeout(() => {
      timers.delete(timer);
      const job = recover(agent.id, paseo);
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
    }, 200);
    timers.add(timer);
  });
  return async () => {
    off();
    for (const timer of timers) clearTimeout(timer);
    await Promise.allSettled([...jobs]);
    await (await connection?.catch(() => undefined))?.close();
  };
}
