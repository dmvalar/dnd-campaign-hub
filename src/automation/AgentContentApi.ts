import { TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { parseYamlFrontmatter } from "../utils/YamlFrontmatter";
import { AuthoringTransaction } from "./AuthoringTransaction";
import { AUTHORING_PLANNERS } from "./registry";
import type { AuthoringOperation, AuthoringOperationType, AuthoringRequest, AuthoringResponse, AuthoringResult } from "./types";
import { assertKeys, boolean, identifier, object, string, vaultPath, within } from "./validation";
import schemas from "./schemas.json";
import { MAP_IMAGE_EXTENSIONS } from "../map/types";
import { VAULT_AGENT_GUIDE } from "./agentGuide";

export const AGENT_DIRECTORY = ".dnd-hub/agent";
export const MAX_REQUEST_BYTES = 2 * 1024 * 1024;

export async function ensureAgentDirectories(plugin: DndCampaignHubPlugin): Promise<void> {
  const adapter = plugin.app.vault.adapter;
  for (const folder of [".dnd-hub", AGENT_DIRECTORY, `${AGENT_DIRECTORY}/requests`, `${AGENT_DIRECTORY}/results`, `${AGENT_DIRECTORY}/receipts`]) {
    if (await adapter.exists(folder)) continue;
    try { await adapter.mkdir(folder); }
    catch (error) { if (!(await adapter.exists(folder))) throw error; }
  }
  const guidePath = `${AGENT_DIRECTORY}/README.md`;
  if (!(await adapter.exists(guidePath))) await adapter.write(guidePath, VAULT_AGENT_GUIDE);
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function resolveReferences(value: unknown, results: Record<string, AuthoringResult>, depth = 0): unknown {
  if (depth > 30) throw new Error("Request nesting exceeds 30 levels");
  if (Array.isArray(value)) return value.map(entry => resolveReferences(entry, results, depth + 1));
  if (value && typeof value === "object") {
    const fields = object(value, "input");
    if (Object.prototype.hasOwnProperty.call(fields, "$ref")) {
      assertKeys(fields, ["$ref"], "reference");
      const reference = string(fields.$ref, "$ref");
      const match = /^([A-Za-z0-9][A-Za-z0-9_-]*)\.([A-Za-z][A-Za-z0-9]*)$/.exec(reference);
      const result = match && Object.prototype.hasOwnProperty.call(results, match[1]!) ? results[match[1]!] : undefined;
      if (!result || !Object.prototype.hasOwnProperty.call(result, match![2]!)) throw new Error(`Reference must identify a preceding operation result: ${reference}`);
      return result[match![2]!];
    }
    const resolved = Object.create(null) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(fields)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`Unsupported object key: ${key}`);
      resolved[key] = resolveReferences(entry, results, depth + 1);
    }
    return resolved;
  }
  return value;
}

interface Receipt { payload: string; response: AuthoringResponse; running: boolean }

/** Public plugin API. All mutations use one queue, including different transports. */
export class AgentContentApi {
  private work: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(readonly plugin: DndCampaignHubPlugin) {}
  dispose() { this.stopped = true; }

  describe(operation?: string) {
    const definitions = schemas as Record<string, { description: string; inputSchema: unknown }>;
    if (operation && !Object.prototype.hasOwnProperty.call(definitions, operation)) throw new Error("Unknown operation schema");
    const operations = operation ? { [operation]: definitions[operation] }
      : Object.keys(definitions).map(name => ({ name, description: definitions[name]!.description }));
    return { schemaVersion: 1, pluginVersion: this.plugin.manifest.version, requestDirectory: `${AGENT_DIRECTORY}/requests`,
      resultDirectory: `${AGENT_DIRECTORY}/results`, operations, schemaHint: "Call describe with operation to retrieve its exact input schema.",
      referenceSyntax: { $ref: "precedingOperationId.notePath" },
      limits: { operations: 100, requestBytes: MAX_REQUEST_BYTES },
      notes: ["Images must already exist in the vault.", "Preview IDs are provisional; use batch references.",
        "Creation is create-only; existing authored notes are only updated for supported relationships.",
        "Reusing a committed request ID replays its outcome. Use a new ID after correcting a failed request."] };
  }

  execute(input: unknown): Promise<AuthoringResponse> {
    const result = this.work.then(() => this.executeNow(input));
    this.work = result.then(() => {}, () => {});
    return result;
  }

  private parseRequest(input: unknown): AuthoringRequest {
    if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_REQUEST_BYTES) throw new Error("Request exceeds 2 MiB");
    const fields = object(input, "request");
    assertKeys(fields, ["schemaVersion", "requestId", "campaignPath", "dryRun", "operations"], "request");
    if (fields.schemaVersion !== 1) throw new Error("Unsupported schemaVersion; use 1");
    const requestId = identifier(fields.requestId, "requestId");
    const campaignPath = vaultPath(fields.campaignPath, "campaignPath");
    if (campaignPath.split("/").some(part => part.startsWith("."))) throw new Error("campaignPath must be a visible campaign folder");
    if (!Array.isArray(fields.operations) || !fields.operations.length || fields.operations.length > 100) throw new Error("operations must contain 1 to 100 entries");
    const ids = new Set<string>();
    const operations = fields.operations.map(raw => {
      const operation = object(raw, "operation");
      assertKeys(operation, ["id", "type", "input"], "operation");
      const id = identifier(operation.id, "operation.id");
      if (ids.has(id)) throw new Error(`Duplicate operation ID: ${id}`);
      ids.add(id);
      const type = string(operation.type, "operation.type") as AuthoringOperationType;
      if (!Object.prototype.hasOwnProperty.call(AUTHORING_PLANNERS, type)) throw new Error(`Unsupported operation: ${type}`);
      return { id, type, input: object(operation.input, "operation.input") } as AuthoringOperation;
    });
    return { schemaVersion: 1, requestId, campaignPath, dryRun: boolean(fields.dryRun, "dryRun"), operations };
  }

  private async executeNow(input: unknown): Promise<AuthoringResponse> {
    const request = this.parseRequest(input);
    if (this.stopped) throw new Error("Agent authoring service has stopped");
    const adapter = this.plugin.app.vault.adapter;
    const receiptPath = `${AGENT_DIRECTORY}/receipts/${request.requestId}.json`;
    const payload = canonical({ ...request, dryRun: false });
    if (!request.dryRun && await adapter.exists(receiptPath)) {
      const receipt = JSON.parse(await adapter.read(receiptPath)) as Receipt;
      if (receipt.payload !== payload) throw new Error("requestId was already used for different content; choose a new requestId");
      if (receipt.running) {
        receipt.running = false;
        receipt.response.status = "interrupted";
        receipt.response.plannedResults = receipt.response.plannedResults ?? receipt.response.results;
        receipt.response.results = {};
        receipt.response.error = "The previous attempt was interrupted. Inspect the listed note paths, token/map IDs in their authoring metadata, and plugin state before creating a replacement request.";
        await adapter.write(receiptPath, JSON.stringify(receipt, null, 2));
      }
      return receipt.response;
    }
    if (!(this.plugin.app.vault.getAbstractFileByPath(request.campaignPath) instanceof TFolder)) throw new Error("campaignPath must identify an existing, indexed campaign folder");
    const world = this.plugin.app.vault.getAbstractFileByPath(`${request.campaignPath}/World.md`);
    if (!(world instanceof TFile)) throw new Error("Campaign must have an indexed World.md note");
    const worldType = parseYamlFrontmatter((await this.plugin.app.vault.read(world)).replace(/^\uFEFF/, "")).frontmatter.type;
    if (worldType !== "world" && worldType !== "campaign") throw new Error("Campaign World.md must have type world or campaign");
    const transaction = new AuthoringTransaction(this.plugin, request.campaignPath, request.requestId, () => !this.stopped);
    const response: AuthoringResponse = { schemaVersion: 1, requestId: request.requestId, status: "preview", results: Object.create(null), files: [], warnings: transaction.warnings };
    try {
      for (const operation of request.operations) {
        if (this.stopped) throw new Error("Agent authoring service has stopped");
        response.results[operation.id] = await AUTHORING_PLANNERS[operation.type](transaction.context(operation.id), resolveReferences(operation.input, response.results));
      }
      response.files = transaction.getFiles();
    } catch (error) {
      return { ...response, results: {}, status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    if (request.dryRun) return response;
    await ensureAgentDirectories(this.plugin);
    const receipt: Receipt = { payload, response: { ...response, status: "interrupted" }, running: true };
    const plannedResults = response.results;
    // Persist intent before effects. A crash cannot silently replay a partly applied batch.
    await adapter.write(receiptPath, JSON.stringify(receipt, null, 2));
    try {
      if (this.stopped) throw new Error("Agent authoring service has stopped");
      await transaction.commit();
      response.status = "completed";
    } catch (error) {
      response.status = "failed";
      response.results = {};
      response.error = error instanceof Error ? error.message : String(error);
      response.recoveryErrors = error && typeof error === "object" && "recoveryErrors" in error ? (error.recoveryErrors as string[]) : [];
      if (response.recoveryErrors.length) response.plannedResults = plannedResults;
    }
    receipt.response = response;
    receipt.running = false;
    // If this write fails, the durable running receipt deliberately blocks automatic replay.
    try { await adapter.write(receiptPath, JSON.stringify(receipt, null, 2)); }
    catch (error) {
      response.status = "interrupted";
      response.plannedResults = plannedResults;
      response.results = {};
      response.error = `The batch ran but its final receipt could not be confirmed. Inspect plannedResults before retrying: ${error instanceof Error ? error.message : String(error)}`;
    }
    return response;
  }

  async listCampaigns() {
    const campaigns = [];
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (file.name !== "World.md") continue;
      try {
        const fields = parseYamlFrontmatter((await this.plugin.app.vault.read(file)).replace(/^\uFEFF/, "")).frontmatter;
        if (fields.type === "world" || fields.type === "campaign") campaigns.push({
          campaignPath: file.path.slice(0, file.path.lastIndexOf("/")), world: fields.world, campaign: fields.campaign, role: fields.role, system: fields.system,
          parties: this.plugin.partyManager.getPartiesForCampaign(file.path.slice(0, file.path.lastIndexOf("/")))
            .map(party => ({ id: party.id, name: party.name, memberCount: party.members.length })),
        });
      } catch { /* A malformed world note is not a usable campaign. */ }
    }
    return campaigns;
  }

  async read(campaignPath: string, path: string) {
    vaultPath(campaignPath, "campaignPath");
    vaultPath(path);
    if (!within(path, campaignPath) && !within(path, "z_Beastiarity")) throw new Error("Note is outside the requested campaign or bestiary");
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") throw new Error("Note not found");
    const content = await this.plugin.app.vault.read(file);
    return { path, content };
  }

  async search(campaignPath: string, query = "", type?: string) {
    vaultPath(campaignPath, "campaignPath");
    const found = [];
    for (const file of this.plugin.app.vault.getMarkdownFiles()) {
      if (!within(file.path, campaignPath) && !within(file.path, "z_Beastiarity")) continue;
      let fm: Record<string, unknown> | undefined = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) {
        try { fm = parseYamlFrontmatter((await this.plugin.app.vault.read(file)).replace(/^\uFEFF/, "")).frontmatter; }
        catch { continue; }
      }
      if (type && fm?.type !== type) continue;
      const name = typeof fm?.name === "string" ? fm.name : file.basename;
      if (query && !`${name}\n${file.path}`.toLowerCase().includes(query.toLowerCase())) continue;
      found.push({ path: file.path, name, type: fm?.type, tokenId: fm?.token_id });
      if (found.length >= 100) break;
    }
    return found;
  }

  listAssets(query = "") {
    return this.plugin.app.vault.getFiles()
      .filter(file => [...MAP_IMAGE_EXTENSIONS, "bmp"].includes(file.extension.toLowerCase())
        && file.path.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 100).map(file => ({ path: file.path, name: file.name }));
  }

  async handleMessage(input: unknown): Promise<unknown> {
    const fields = object(input, "message");
    if (fields.action === undefined || fields.action === "create_batch") {
      const { action: _action, ...request } = fields;
      return this.execute(request);
    }
    if (fields.schemaVersion !== 1) throw new Error("Unsupported schemaVersion; use 1");
    const requestId = identifier(fields.requestId, "requestId");
    const complete = (data: unknown) => ({ schemaVersion: 1, requestId, status: "completed", data });
    switch (fields.action) {
      case "describe":
        assertKeys(fields, ["action", "schemaVersion", "requestId", "operation"], "describe");
        return complete(this.describe(string(fields.operation, "operation", { optional: true })));
      case "list_campaigns":
        assertKeys(fields, ["action", "schemaVersion", "requestId"], "list_campaigns");
        return complete(await this.listCampaigns());
      case "read_note":
        assertKeys(fields, ["action", "schemaVersion", "requestId", "campaignPath", "path"], "read_note");
        return complete(await this.read(string(fields.campaignPath, "campaignPath"), string(fields.path, "path")));
      case "search":
        assertKeys(fields, ["action", "schemaVersion", "requestId", "campaignPath", "query", "type"], "search");
        return complete(await this.search(string(fields.campaignPath, "campaignPath"), string(fields.query, "query", { optional: true }), string(fields.type, "type", { optional: true })));
      case "list_assets":
        assertKeys(fields, ["action", "schemaVersion", "requestId", "query"], "list_assets");
        return complete(this.listAssets(string(fields.query, "query", { optional: true })));
      default: throw new Error("Unknown agent action");
    }
  }
}
