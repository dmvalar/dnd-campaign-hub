import { describe, expect, it, vi } from "vitest";
import { AgentRequestProcessor } from "../../src/automation/AgentRequestProcessor";
import { AGENT_DIRECTORY } from "../../src/automation/AgentContentApi";
import { authoringFixture, fullBatch } from "./fixture";

describe("agent file requests", () => {
  it("processes a file batch and writes a durable result, then skips the unchanged file", async () => {
    const f = await authoringFixture();
    const processor = new AgentRequestProcessor(f.plugin, f.api);
    const request = fullBatch(f.campaignPath);
    f.storage.set(`${AGENT_DIRECTORY}/requests/${request.requestId}.json`, JSON.stringify(request));
    expect(await processor.poll()).toBe(1);
    const response = JSON.parse(f.storage.get(`${AGENT_DIRECTORY}/results/${request.requestId}.json`)!);
    expect(response.status, response.error).toBe("completed");
    expect(await processor.poll()).toBe(0);
    expect(f.create).toHaveBeenCalledTimes(7);
    expect(await new AgentRequestProcessor(f.plugin, f.api).poll()).toBe(1);
    expect(f.create).toHaveBeenCalledTimes(7);
  });

  it.each([
    ["bad-json", "{"],
    ["wrong-id", JSON.stringify({ schemaVersion:1, requestId:"another", action:"describe" })],
    ["bad-version", JSON.stringify({ schemaVersion:2, requestId:"bad-version", action:"describe" })],
  ])("acknowledges invalid request %s without touching content", async (id, content) => {
    const f = await authoringFixture();
    f.storage.set(`${AGENT_DIRECTORY}/requests/${id}.json`, content);
    expect(await new AgentRequestProcessor(f.plugin, f.api).poll()).toBe(1);
    expect(JSON.parse(f.storage.get(`${AGENT_DIRECTORY}/results/${id}.json`)!)).toMatchObject({ requestId:id, status:"failed" });
    expect(f.create).not.toHaveBeenCalled();
  });

  it("retries a failed result write through the completed receipt without duplicate creations", async () => {
    const f = await authoringFixture();
    const request = fullBatch(f.campaignPath);
    f.storage.set(`${AGENT_DIRECTORY}/requests/${request.requestId}.json`, JSON.stringify(request));
    const write = f.writeStorage.getMockImplementation()!;
    let fail = true;
    f.writeStorage.mockImplementation(async (path, content) => {
      if (fail && path.includes("/results/")) { fail=false; throw new Error("Reply failure"); }
      return write(path, content);
    });
    const processor = new AgentRequestProcessor(f.plugin, f.api);
    await expect(processor.poll()).rejects.toThrow("Reply failure");
    expect(await processor.poll()).toBe(1);
    expect(f.create).toHaveBeenCalledTimes(7);
    expect(JSON.parse(f.storage.get(`${AGENT_DIRECTORY}/results/${request.requestId}.json`)!).status).toBe("completed");
  });

  it("exposes schemas on demand, campaign discovery and image discovery through the same transport", async () => {
    const f = await authoringFixture();
    expect(await f.api.handleMessage({schemaVersion:1, requestId:"schema", action:"describe", operation:"create_monster"})).toMatchObject({status:"completed",data:{operations:{create_monster:{inputSchema:{required:["name","statblock","token"]}}}}});
    expect(await f.api.handleMessage({schemaVersion:1,requestId:"campaigns",action:"list_campaigns"})).toMatchObject({data:[{campaignPath:f.campaignPath}]});
    expect(await f.api.handleMessage({schemaVersion:1,requestId:"assets",action:"list_assets",query:"goblin"})).toMatchObject({data:[{path:"Assets/goblin.png"}]});
    const overview = f.api.describe();
    expect(Array.isArray(overview.operations)).toBe(true);
    expect(JSON.stringify(overview)).not.toContain("legendaryActions");
  });

  it("stops scanning after unload and shares one concurrent poll", async () => {
    const f = await authoringFixture();
    const processor = new AgentRequestProcessor(f.plugin, f.api);
    const first = processor.poll();
    expect(processor.poll()).toBe(first);
    await first;
    processor.stop();
    f.writeStorage.mockClear();
    expect(await processor.poll()).toBe(0);
    expect(f.writeStorage).not.toHaveBeenCalled();
    f.api.dispose();
    await expect(f.api.execute(fullBatch(f.campaignPath))).rejects.toThrow("stopped");
  });
});
