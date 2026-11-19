import { TFile, TFolder } from "obsidian";
import type DndCampaignHubPlugin from "../main";
import { parseYamlFrontmatter } from "../utils/YamlFrontmatter";
import { updateAuthoringFrontmatter } from "./frontmatter";
import type { AuthoringContext, AuthoringEffect } from "./types";
import { vaultPath, within } from "./validation";

interface PlannedNote { path: string; before: string | null; after: string }

/** One serialized batch, with an overlay for references to preceding operations. */
export class AuthoringTransaction {
  private notes = new Map<string, PlannedNote>();
  private effects: AuthoringEffect[] = [];
  private effectKeys = new Set<string>();
  readonly warnings: string[] = [];

  constructor(private plugin: DndCampaignHubPlugin, private campaignPath: string, private requestId: string, private canCommit = () => true) {}

  context(operationId: string): AuthoringContext {
    return {
      app: this.plugin.app, plugin: this.plugin, campaignPath: this.campaignPath,
      operationId, now: Date.now(), id: prefix => `${prefix}_${crypto.randomUUID()}`,
      readNote: path => this.readNote(path), exists: path => this.exists(path),
      listNotes: folder => this.listNotes(folder),
      stageNote: async (path, content) => {
        this.assertWritable(path);
        if (await this.exists(path)) throw new Error(`Destination already exists: ${path}`);
        const key = path.toLowerCase();
        if ([...this.notes.keys()].some(existing => existing.toLowerCase() === key)) throw new Error(`Conflicting note paths: ${path}`);
        this.validateNote(content, path);
        const after = updateAuthoringFrontmatter(content, fields => ({
          ...fields, dnd_hub_authoring: { request_id: this.requestId, operation_id: operationId },
        }));
        this.notes.set(path, { path, before: null, after });
      },
      stageUpdate: async (path, transform) => {
        this.assertWritable(path);
        const previous = this.notes.get(path);
        const before = previous?.after ?? await this.readNote(path);
        const after = transform(before);
        this.validateNote(after, path);
        this.notes.set(path, { path, before: previous ? previous.before : before, after });
      },
      stageEffect: effect => {
        if (!effect.key || this.effectKeys.has(effect.key)) throw new Error(`Duplicate authoring effect: ${effect.key}`);
        this.effectKeys.add(effect.key);
        this.effects.push(effect);
      },
      warn: message => this.warnings.push(`${operationId}: ${message}`),
    };
  }

  getFiles() {
    return [...this.notes.values()].filter(note => note.before !== note.after)
      .map(note => ({ path: note.path, action: note.before === null ? "create" as const : "update" as const }));
  }

  private validateNote(content: string, path: string) {
    const parsed = parseYamlFrontmatter(content.replace(/^\uFEFF/, ""));
    if (!parsed.hasFrontmatter || !Object.keys(parsed.frontmatter).length) throw new Error(`Note requires valid mapping frontmatter: ${path}`);
  }

  private assertWritable(path: string) {
    vaultPath(path);
    if (!path.endsWith(".md") || (!within(path, this.campaignPath) && !within(path, "z_Beastiarity"))) {
      throw new Error(`Note destination is outside the campaign or bestiary: ${path}`);
    }
    if (path.split("/").some(part => part.startsWith("."))) throw new Error(`Hidden note destination is not supported: ${path}`);
  }

  private async exists(path: string): Promise<boolean> {
    vaultPath(path);
    return this.notes.has(path) || !!this.plugin.app.vault.getAbstractFileByPath(path)
      || await this.plugin.app.vault.adapter.exists(path);
  }

  private async readNote(path: string): Promise<string> {
    vaultPath(path);
    if (!path.endsWith(".md")) throw new Error(`Expected a Markdown note: ${path}`);
    const pending = this.notes.get(path);
    if (pending) return pending.after;
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return this.plugin.app.vault.read(file);
    throw new Error(`Note not found or not indexed yet: ${path}`);
  }

  private listNotes(folder: string): string[] {
    vaultPath(folder);
    return [...new Set([...this.plugin.app.vault.getMarkdownFiles().map(file => file.path), ...this.notes.keys()])]
      .filter(path => within(path, folder));
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    const { vault } = this.plugin.app;
    const entry = vault.getAbstractFileByPath(path);
    if (entry instanceof TFolder) return;
    if (entry) throw new Error(`Folder path is occupied by a file: ${path}`);
    // A newly created folder can precede the metadata index.
    if (await vault.adapter.exists(path)) {
      const stat = await vault.adapter.stat(path);
      if (stat?.type === "folder") return;
      throw new Error(`Folder path is occupied: ${path}`);
    }
    const separator = path.lastIndexOf("/");
    if (separator >= 0) await this.ensureFolder(path.slice(0, separator));
    try { await vault.createFolder(path); }
    catch (error) {
      if ((await vault.adapter.stat(path))?.type !== "folder") throw error;
    }
  }

  async commit(): Promise<void> {
    const { vault } = this.plugin.app;
    const applied: PlannedNote[] = [];
    const attemptedEffects: AuthoringEffect[] = [];
    try {
      for (const note of this.notes.values()) {
        if (!this.canCommit()) throw new Error("Authoring stopped before all changes were saved");
        if (note.before === note.after) continue;
        if (note.before === null) {
          await this.ensureFolder(note.path.slice(0, note.path.lastIndexOf("/")));
          if (await vault.adapter.exists(note.path) || vault.getAbstractFileByPath(note.path)) throw new Error(`Destination appeared during planning: ${note.path}`);
          applied.push(note);
          await vault.create(note.path, note.after);
        } else {
          const file = vault.getAbstractFileByPath(note.path);
          if (!(file instanceof TFile)) throw new Error(`Note disappeared during planning: ${note.path}`);
          await vault.process(file, current => {
            if (current !== note.before) throw new Error(`Note changed during planning; retry with a new request ID: ${note.path}`);
            if (!applied.includes(note)) applied.push(note);
            return note.after;
          });
        }
      }
      for (const effect of this.effects) {
        if (!this.canCommit()) throw new Error("Authoring stopped before all changes were saved");
        attemptedEffects.push(effect);
        await effect.commit();
      }
      if (!this.canCommit()) throw new Error("Authoring stopped before all changes were saved");
    } catch (error) {
      const recoveryErrors: string[] = [];
      for (const effect of attemptedEffects.reverse()) {
        try { await effect.rollback(); }
        catch (recoveryError) { recoveryErrors.push(`${effect.key}: ${String(recoveryError)}`); }
      }
      for (const note of applied.reverse()) {
        try {
          const file = vault.getAbstractFileByPath(note.path);
          if (note.before === null) {
            if (!(file instanceof TFile)) {
              if (!(await vault.adapter.exists(note.path))) continue;
              if (await vault.adapter.read(note.path) !== note.after) throw new Error("Unindexed content differs; inspect the destination before retrying");
              await vault.adapter.remove(note.path);
              continue;
            }
            if (await vault.read(file) !== note.after) throw new Error("Concurrent changes were preserved; remove the created note manually if unwanted");
            await vault.delete(file);
          } else {
            if (!(file instanceof TFile)) throw new Error("Note is missing or not indexed");
            await vault.process(file, current => {
              if (current === note.before) return current;
              if (current !== note.after) throw new Error("Concurrent changes were preserved; inspect the note before retrying");
              return note.before!;
            });
          }
        } catch (recoveryError) { recoveryErrors.push(`${note.path}: ${String(recoveryError)}`); }
      }
      const failure = new Error(error instanceof Error ? error.message : String(error));
      Object.assign(failure, { recoveryErrors });
      throw failure;
    }
  }
}
