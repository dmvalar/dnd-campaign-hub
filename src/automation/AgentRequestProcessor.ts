import type DndCampaignHubPlugin from "../main";
import { AGENT_DIRECTORY, AgentContentApi, ensureAgentDirectories, MAX_REQUEST_BYTES } from "./AgentContentApi";
import { identifier, object } from "./validation";

/** File transport for any agent with vault file access; never executes code. */
export class AgentRequestProcessor {
  private current: Promise<number> | null = null;
  private processed = new Map<string, string>();
  private stopped = false;

  constructor(private plugin: DndCampaignHubPlugin, private api: AgentContentApi) {}
  stop() { this.stopped = true; }
  whenIdle(): Promise<void> { return this.current ? this.current.then(() => {}, () => {}) : Promise.resolve(); }

  poll(): Promise<number> {
    if (this.stopped) return Promise.resolve(0);
    if (this.current) return this.current;
    const task = this.scan();
    this.current = task;
    void task.finally(() => { if (this.current === task) this.current = null; }).catch(() => {});
    return task;
  }

  private async scan(): Promise<number> {
    await ensureAgentDirectories(this.plugin);
    const adapter = this.plugin.app.vault.adapter;
    const files = (await adapter.list(`${AGENT_DIRECTORY}/requests`)).files.filter(path => path.endsWith(".json")).sort();
    let processed = 0;
    for (const path of files) {
      if (this.stopped || processed >= 100) break;
      const fileId = path.slice(path.lastIndexOf("/") + 1, -5);
      try { identifier(fileId, "request filename"); } catch { continue; }
      const stat = await adapter.stat(path);
      if (!stat || stat.type !== "file") continue;
      const stamp = `${stat.mtime}:${stat.size}`;
      if (this.processed.get(path) === stamp) continue;
      let response: unknown;
      try {
        if (stat.size > MAX_REQUEST_BYTES) throw new Error("Request exceeds 2 MiB");
        const content = await adapter.read(path);
        const message = object(JSON.parse(content), "request");
        if (message.requestId !== fileId) throw new Error("requestId must match the request filename without .json");
        if (this.stopped) break;
        response = await this.api.handleMessage(message);
      } catch (error) {
        response = { schemaVersion: 1, requestId: fileId, status: "failed", error: error instanceof Error ? error.message : String(error) };
      }
      // Mark as processed only after the acknowledgement is durable. A failed
      // reply write is retried through the API receipt, without repeating writes.
      await adapter.write(`${AGENT_DIRECTORY}/results/${fileId}.json`, JSON.stringify(response, null, 2));
      this.processed.set(path, stamp);
      processed++;
    }
    return processed;
  }
}
