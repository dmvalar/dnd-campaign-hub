import { TFolder } from "obsidian";
import { matchesNoteCampaign, noteReferencePath, resolveNoteReference } from "../session/adventureScenes";
import { parseYamlFrontmatter, updateYamlFrontmatter } from "../utils/YamlFrontmatter";
import type { AuthoringContext } from "./types";
import { string, vaultPath } from "./validation";

type Fields = Record<string, unknown>;

export const parentFolder = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const fileName = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
export const currentDate = (now: number): string => new Date(now).toISOString().slice(0, 10);
export const wikiLink = (path: string): string => `[[${path}]]`;

export function qualifiedNotePath(value: unknown, label: string): string {
  const path = vaultPath(value, label);
  if (!/\.md$/i.test(path) || /[\[\]#]/.test(path)) {
    throw new Error(`${label} must be a vault-relative Markdown path usable in a wikilink`);
  }
  return path;
}

export function notePaths(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of note paths`);
  return [...new Set(value.map((path, index) => qualifiedNotePath(path, `${label}[${index}]`)))];
}

export function optionalText(value: unknown, label: string): string | undefined {
  return string(value, label, { optional: true });
}

export function singleLineText(value: unknown, label: string): string | undefined {
  const result = string(value, label, { optional: true, maxLength: 120 })?.trim();
  if (result && /[\x00-\x1f]/.test(result)) throw new Error(`${label} must be a single line of text`);
  return result;
}

export function textField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function noteFields(content: string): Fields {
  return parseYamlFrontmatter(content.replace(/^\uFEFF/, "")).frontmatter;
}

export async function campaignMetadata(ctx: AuthoringContext) {
  const name = fileName(ctx.campaignPath);
  const fields = noteFields(await ctx.readNote(`${ctx.campaignPath}/World.md`));
  if (fields.type !== "world" && fields.type !== "campaign") {
    throw new Error(`Campaign World.md has an invalid type in "${ctx.campaignPath}"`);
  }
  return { name, world: textField(fields.world, name), fields };
}

/** Build a snapshot that includes notes staged by preceding operations in the same request. */
export async function campaignNotes(ctx: AuthoringContext) {
  const paths = ctx.listNotes(ctx.campaignPath).filter(path => path.startsWith(`${ctx.campaignPath}/`));
  const entries = await Promise.all(paths.map(async (path) => {
    const content = await ctx.readNote(path);
    try {
      return [path, noteFields(content)] as const;
    } catch {
      // A note with malformed YAML does not have a discoverable entity type.
      return [path, {}] as const;
    }
  }));
  const nestedCampaigns = entries
    .filter(([path, fm]) => fileName(path) === "World.md" && parentFolder(path) !== ctx.campaignPath && fm.type === "world")
    .map(([path]) => `${parentFolder(path)}/`);
  const notes = new Map<string, Fields>(entries.filter(([path]) => !nestedCampaigns.some(folder => path.startsWith(folder))));

  function resolveReference(reference: unknown, sourcePath: string) {
    const target = noteReferencePath(reference);
    for (const path of new Set([target, target.split("#")[0]!])) {
      const fullPath = /\.md$/i.test(path) ? path : `${path}.md`;
      const fields = notes.get(fullPath);
      if (fields) return { path: fullPath, type: fields.type };
    }
    // Existing alias and relative-link resolution remains available for legacy live notes.
    const file = resolveNoteReference(ctx.app, reference, sourcePath);
    return file ? { path: file.path, type: notes.get(file.path)?.type } : null;
  }

  function matchesCampaign(path: string, fields: Fields): boolean {
    const explicitCampaignPath = fields.campaign_path;
    return (explicitCampaignPath == null || explicitCampaignPath === "" || explicitCampaignPath === ctx.campaignPath)
      && matchesNoteCampaign(fields.campaign, path, ctx.campaignPath, resolveReference);
  }

  function requireNote(path: string, type: string): Fields {
    const fields = notes.get(path);
    if (fields?.type !== type || !matchesCampaign(path, fields)) {
      throw new Error(`Expected a ${type} note in campaign "${ctx.campaignPath}" at "${path}"`);
    }
    return fields;
  }

  return { notes, matchesCampaign, requireNote, resolveReference };
}

export function renderTemplate(template: string, fields: Fields, placeholders: Record<string, string> = {}): string {
  const withFields = updateYamlFrontmatter(template, frontmatter => ({ ...frontmatter, ...fields }));
  const { body } = parseYamlFrontmatter(withFields);
  const start = withFields.slice(0, withFields.length - body.length);
  return start + body.replace(/\{\{(\w+)\}\}/g, (token, key: string) => placeholders[key] ?? token);
}

export function folderExists(ctx: AuthoringContext, path: string): boolean {
  return ctx.app.vault.getAbstractFileByPath(path) instanceof TFolder
    || ctx.listNotes(path).some(notePath => notePath.startsWith(`${path}/`));
}
