import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, readdir, stat, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sendAgentMessage } from "../../tools/dnd-hub-agent.mjs";
import { AgentRequestProcessor } from "../../src/automation/AgentRequestProcessor";
import { authoringFixture, fullBatch } from "./fixture";

const temporaryFolders: string[] = [];
afterEach(async () => {
  for (const folder of temporaryFolders.splice(0)) {
    if (!resolve(folder).startsWith(resolve(tmpdir()) + sep)) throw new Error("Unsafe temporary cleanup path");
    await rm(folder, {recursive:true, force:true});
  }
});

async function diskFixture() {
  const f = await authoringFixture();
  const root = await mkdtemp(join(tmpdir(), "dnd-hub-agent-test-"));
  temporaryFolders.push(root);
  const adapter = f.app.vault.adapter;
  const original = { exists:adapter.exists, read:adapter.read, write:adapter.write, mkdir:adapter.mkdir, stat:adapter.stat, list:adapter.list };
  const isTransport = (path: string) => path === ".dnd-hub" || path.startsWith(".dnd-hub/");
  Object.assign(adapter, {
    exists:async (path:string) => isTransport(path) ? !!await stat(join(root,path)).catch(()=>null) : original.exists(path),
    read:async (path:string) => isTransport(path) ? readFile(join(root,path),"utf8") : original.read(path),
    write:async (path:string,content:string) => isTransport(path) ? writeFile(join(root,path),content,"utf8") : original.write(path,content),
    mkdir:async (path:string) => isTransport(path) ? mkdir(join(root,path),{recursive:true}) : original.mkdir(path),
    stat:async (path:string) => {
      if (!isTransport(path)) return original.stat(path);
      const value=await stat(join(root,path)).catch(()=>null);
      return value ? {type:value.isDirectory()?"folder":"file",mtime:value.mtimeMs,ctime:value.ctimeMs,size:value.size} : null;
    },
    list:async (path:string) => {
      if (!isTransport(path)) return original.list(path);
      const entries=await readdir(join(root,path),{withFileTypes:true});
      return {files:entries.filter(entry=>entry.isFile()).map(entry=>`${path}/${entry.name}`),folders:entries.filter(entry=>entry.isDirectory()).map(entry=>`${path}/${entry.name}`)};
    },
  });
  return { ...f, root, processor:new AgentRequestProcessor(f.plugin,f.api) };
}

describe("MCP bridge", () => {
  it("negotiates real stdio MCP, discovers tools and creates native content through the live file processor", async () => {
    const f = await diskFixture();
    const interval = setInterval(()=>{ void f.processor.poll().catch(()=>{}); },10);
    const client=new Client({name:"test-dm-agent",version:"1.0.0"});
    try {
      await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve("tools/dnd-hub-agent.mjs"),"--vault",f.root],stderr:"pipe"}));
      const tools=await client.listTools();
      expect(tools.tools.map(tool=>tool.name)).toContain("dnd_hub_create_batch");
      expect(tools.tools).toHaveLength(6);
      const campaigns=await client.callTool({name:"dnd_hub_list_campaigns",arguments:{}});
      expect(campaigns.isError).toBe(false);
      const batch=fullBatch(f.campaignPath,"via-mcp");
      const args={campaignPath:batch.campaignPath,requestId:batch.requestId,operations:batch.operations};
      const response=await client.callTool({name:"dnd_hub_create_batch",arguments:args});
      expect(response.isError,JSON.stringify(response)).toBe(false);
      const result=JSON.parse((response.content as {text:string}[])[0]!.text);
      expect(result.status).toBe("completed");
      expect(f.plugin.markerLibrary.getMarker(result.results.monster.tokenId)?.imageFile).toBe("Assets/goblin.png");
      expect(f.create).toHaveBeenCalledTimes(7);
      const replay=await client.callTool({name:"dnd_hub_create_batch",arguments:args});
      expect(replay).toEqual(response);
      expect(f.create).toHaveBeenCalledTimes(7);
    } finally {
      clearInterval(interval);
      await client.close();
      f.processor.stop();
      await f.processor.whenIdle();
    }
  },15_000);

  it("reports a timeout without canceling the pending request or inventing a successful result", async () => {
    const f=await diskFixture();
    await expect(sendAgentMessage(f.root,{schemaVersion:1,requestId:"waiting",action:"describe"},{timeoutMs:20,pollMs:2})).rejects.toThrow("may still complete");
    const request=JSON.parse(await readFile(join(f.root,".dnd-hub/agent/requests/waiting.json"),"utf8"));
    expect(request.requestId).toBe("waiting");
    await f.processor.poll();
    expect(await sendAgentMessage(f.root,request,{timeoutMs:100,pollMs:2})).toMatchObject({status:"completed"});
  });

  it("refuses a reused filename with different content before returning an old result", async () => {
    const f=await diskFixture();
    const initial=sendAgentMessage(f.root,{requestId:"same",action:"describe"},{timeoutMs:1000,pollMs:2});
    while (!(await f.app.vault.adapter.exists(".dnd-hub/agent/requests/same.json"))) await new Promise(done=>setTimeout(done,2));
    await f.processor.poll();
    await initial;
    await expect(sendAgentMessage(f.root,{requestId:"same",action:"list_campaigns"})).rejects.toThrow("different content");
  });
});
