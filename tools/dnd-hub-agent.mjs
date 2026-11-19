import { readFile, writeFile, mkdir, stat, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const directory = ".dnd-hub/agent";
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const operationTypes = ["create_monster", "create_npc", "create_adventure", "create_scene", "create_encounter", "create_map", "create_session"];
const objectSchema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const stringSchema = { type: "string", minLength: 1 };
const campaign = { campaignPath: { ...stringSchema, description: "Explicit campaign folder from list_campaigns" } };
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const agentTools = [
  { name: "dnd_hub_describe", description: "List authoring capabilities, or get the exact schema for one operation. Fetch only the schema needed for your task.", inputSchema: objectSchema({ operation: { enum: operationTypes } }), annotations },
  { name: "dnd_hub_list_campaigns", description: "Find existing campaign folders in the open Obsidian vault.", inputSchema: objectSchema({}), annotations },
  { name: "dnd_hub_search", description: "Find campaign content and shared monsters by name/path, optionally filtering entity type. Returns at most 100 results.", inputSchema: objectSchema({ ...campaign, query: stringSchema, type: stringSchema }, ["campaignPath"]), annotations },
  { name: "dnd_hub_read_note", description: "Read a campaign or shared bestiary note before creating related content.", inputSchema: objectSchema({ ...campaign, path: stringSchema }, ["campaignPath", "path"]), annotations },
  { name: "dnd_hub_list_assets", description: "Find existing vault image paths to use for monster/NPC tokens and maps. Returns at most 100 results.", inputSchema: objectSchema({ query: stringSchema }), annotations },
  { name: "dnd_hub_create_batch", description: "Validate/preview or create linked content through the plugin. Get each operation's schema with describe. Images must exist in the vault. Use {$ref:'earlierId.notePath'} for links. Use a fresh requestId per new batch and reuse it only to retry that identical request. Obsidian must be running with Agent content requests enabled.",
    inputSchema: objectSchema({ ...campaign, requestId: { type: "string", pattern: idPattern.source }, dryRun: { type: "boolean", default: false },
      operations: { type: "array", minItems: 1, maxItems: 100, items: objectSchema({ id: { type: "string", pattern: idPattern.source }, type: { enum: operationTypes }, input: { type: "object", additionalProperties: true } }, ["id", "type", "input"]) } }, ["campaignPath", "operations"]),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
];

const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
  : JSON.stringify(value);

/** The transport only exchanges data files. All vault mutations happen inside the plugin. */
export async function sendAgentMessage(vaultPath, message, { timeoutMs = 120_000, pollMs = 250, signal } = {}) {
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Request must be an object");
  if (message.schemaVersion !== undefined && message.schemaVersion !== 1) throw new Error("Unsupported schemaVersion; use 1");
  const request = { ...message, schemaVersion: 1, requestId: message.requestId ?? randomUUID() };
  if (typeof request.requestId !== "string" || !idPattern.test(request.requestId)) throw new Error("Invalid requestId");
  const root = resolve(vaultPath);
  if (!(await stat(root)).isDirectory()) throw new Error("Vault path is not a directory");
  const requestFolder = join(root, directory, "requests");
  const resultPath = join(root, directory, "results", `${request.requestId}.json`);
  const requestPath = join(requestFolder, `${request.requestId}.json`);
  const bytes = JSON.stringify(request, null, 2);
  if (Buffer.byteLength(bytes) > 2 * 1024 * 1024) throw new Error("Request exceeds 2 MiB");
  await mkdir(requestFolder, { recursive: true });
  let existing;
  try { existing = await readFile(requestPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (existing !== undefined) {
    if (canonical(JSON.parse(existing)) !== canonical(request)) throw new Error("requestId already exists with different content. Use a new ID.");
  } else {
    const temporaryPath = `${requestPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, bytes, { flag: "wx" });
    try {
      // link() creates the destination exclusively; an identical concurrent
      // retry may win the claim without allowing replacement of another request.
      const { link } = await import("node:fs/promises");
      try { await link(temporaryPath, requestPath); }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (canonical(JSON.parse(await readFile(requestPath, "utf8"))) !== canonical(request)) throw new Error("requestId was concurrently used for different content");
      }
    } finally { await unlink(temporaryPath); }
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error(`Request wait canceled; ${request.requestId} may still complete. Reuse its ID to check the outcome.`);
    try {
      const response = JSON.parse(await readFile(resultPath, "utf8"));
      if (response.requestId !== request.requestId || response.schemaVersion !== 1) throw new Error("Unexpected response identity or version");
      return response;
    } catch (error) {
      // A response may be briefly visible while the adapter writes it.
      if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
    await new Promise(finish => setTimeout(finish, pollMs));
  }
  throw new Error(`Timed out waiting for ${request.requestId}. Keep Obsidian open and enable Agent content requests. The request may still complete; reuse the same ID to check/retry instead of creating a duplicate request.`);
}

export function createAgentMcpServer(vaultPath, options = {}) {
  const server = new Server({ name: "dnd-campaign-hub", version: "1.0.0" }, {
    capabilities: { tools: {} },
    instructions: "Use list_campaigns and list_assets to find exact paths. Fetch only needed operation schemas using describe. Prefer one dry-run linked batch, inspect its warnings, then submit a fresh request ID for the real batch. Never write marker/map/party JSON directly.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: agentTools }));
  server.setRequestHandler(CallToolRequestSchema, async (call, extra) => {
    try {
      const tool = agentTools.find(entry => entry.name === call.params.name);
      if (!tool) throw new Error("Unknown tool");
      const args = call.params.arguments ?? {};
      for (const key of Object.keys(args)) if (!Object.prototype.hasOwnProperty.call(tool.inputSchema.properties, key)) throw new Error(`Unknown argument: ${key}`);
      for (const key of tool.inputSchema.required) if (args[key] === undefined) throw new Error(`Missing argument: ${key}`);
      const action = tool.name.replace(/^dnd_hub_/, "");
      const response = await sendAgentMessage(vaultPath, { ...args, action }, { ...options, signal: extra.signal });
      return { content: [{ type: "text", text: JSON.stringify(response) }], isError: response.status === "failed" || response.status === "interrupted" };
    } catch (error) { return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }; }
  });
  return server;
}

async function main() {
  const args = process.argv.slice(2);
  const value = flag => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const vaultPath = value("--vault");
  if (!vaultPath) throw new Error("Usage: node tools/dnd-hub-agent.mjs --vault <vault-folder> [--request <request.json>]");
  const requestPath = value("--request");
  if (requestPath) {
    const response = await sendAgentMessage(vaultPath, JSON.parse(await readFile(resolve(requestPath), "utf8")));
    process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
    if (response.status === "failed" || response.status === "interrupted") process.exitCode = 1;
  } else {
    if (!(await stat(resolve(vaultPath))).isDirectory()) throw new Error("Vault path is not a directory");
    const server = createAgentMcpServer(vaultPath);
    await server.connect(new StdioServerTransport());
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
