import { TFile, type App, type FrontMatterCache } from "obsidian";

const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const noteName = (path: string) => basename(path).replace(/\.md$/i, "");
const inFolder = (path: string, folder: string) => !folder || path.startsWith(`${folder}/`);
const frontmatter = (app: App, file: TFile) => app.metadataCache.getFileCache(file)?.frontmatter;
type ReferenceResolver = (reference: unknown, sourcePath: string) => { path: string; type?: unknown } | null;

export function noteReferencePath(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const path = raw && typeof raw === "object" && "path" in raw ? raw.path : raw;
  if (typeof path !== "string") return "";
  const text = path.trim();
  const link = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/.exec(text)
    ?? /^\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)$/.exec(text);
  return (link?.[1] ?? text).trim().replace(/\\/g, "/");
}

export function resolveNoteReference(app: App, reference: unknown, sourcePath: string): TFile | null {
  const path = noteReferencePath(reference);
  if (!path) return null;
  // Keep literal hashes in filenames when the exact path exists.
  for (const target of new Set([path, path.split("#")[0]!.trim()])) {
    if (!target) continue;
    const direct = target.includes("/")
      ? app.vault.getAbstractFileByPath(/\.md$/i.test(target) ? target : `${target}.md`)
      : null;
    if (direct instanceof TFile) return direct;
    const linked = app.metadataCache.getFirstLinkpathDest(target, sourcePath);
    if (linked instanceof TFile) return linked;
  }
  return null;
}

function isBareName(reference: unknown, path: string): boolean {
  return typeof reference === "string" && reference.trim() === path && !path.includes("/");
}

function adventurePathForReference(
  reference: unknown, sourcePath: string, adventures: readonly string[], resolveReference: ReferenceResolver,
): string | null {
  const path = noteReferencePath(reference);
  if (!path) return null;
  if (!path.includes("/")) {
    // Legacy and short wiki links can name an adventure that also exists in
    // another campaign. Prefer a unique local match before resolving aliases.
    const matching = adventures.filter(adventure => noteName(adventure) === path.replace(/\.md$/i, ""));
    if (matching.length === 1) return matching[0]!;
    if (isBareName(reference, path)) return null;
  }
  const target = resolveReference(reference, sourcePath);
  return adventures.find(adventure => adventure === target?.path) ?? null;
}

function vaultReferenceResolver(app: App): ReferenceResolver {
  return (reference, sourcePath) => {
    const file = resolveNoteReference(app, reference, sourcePath);
    return file ? { path: file.path, type: frontmatter(app, file)?.type } : null;
  };
}

function adventureForReference(app: App, reference: unknown, sourcePath: string, adventures: TFile[]): TFile | null {
  const path = adventurePathForReference(reference, sourcePath, adventures.map(file => file.path), vaultReferenceResolver(app));
  return adventures.find(adventure => adventure.path === path) ?? null;
}

function campaignAdventures(app: App, campaignPath: string, files = app.vault.getMarkdownFiles()): TFile[] {
  return files.filter(file => inFolder(file.path, campaignPath) && frontmatter(app, file)?.type === "adventure");
}

export function resolveCampaignAdventure(app: App, reference: unknown, campaignPath: string, sourcePath: string): TFile | null {
  return adventureForReference(app, reference, sourcePath, campaignAdventures(app, campaignPath));
}

export function getSessionCampaignPath(session: TFile): string {
  const parent = parentPath(session.path);
  return basename(parent) === "Sessions" ? parentPath(parent) : parent;
}

function sessionAdventureReferences(app: App, session: TFile): unknown[] {
  const fm = frontmatter(app, session);
  return Array.isArray(fm?.adventures) && fm.adventures.length ? fm.adventures : [fm?.adventure];
}

export function hasSessionAdventureReferences(app: App, session: TFile): boolean {
  return sessionAdventureReferences(app, session).some(reference => reference != null && reference !== "");
}

export function getSessionAdventures(app: App, session: TFile, campaignPath = getSessionCampaignPath(session)): TFile[] {
  const adventures = campaignAdventures(app, campaignPath);
  const linked = sessionAdventureReferences(app, session)
    .map(reference => adventureForReference(app, reference, session.path, adventures));
  return [...new Set(linked.filter((file): file is TFile => file !== null))];
}

/** An empty set of resolved paths can still represent an explicit scene plan. */
export function getSessionPlannedScenePaths(app: App, session: TFile | null): string[] | null {
  if (!session) return null;
  const plan = frontmatter(app, session)?.planned_scenes;
  if (!Array.isArray(plan) || !plan.length) return null;
  const paths = plan.map(reference => resolveNoteReference(app, reference, session.path)?.path);
  return [...new Set(paths.filter((path): path is string => !!path))];
}

function campaignPathForAdventure(app: App, adventure: TFile): string {
  const parts = adventure.path.split("/");
  const adventuresIndex = parts.lastIndexOf("Adventures");
  // Folder notes add a directory named after the adventure.
  if (adventuresIndex >= 0) return parts.slice(0, adventuresIndex).join("/");
  const parent = parentPath(adventure.path);
  for (let folder = parent; folder; folder = parentPath(folder)) {
    const world = app.vault.getAbstractFileByPath(`${folder}/World.md`);
    if (world instanceof TFile && frontmatter(app, world)?.type === "world") return folder;
  }
  return basename(parent) === adventure.basename ? parentPath(parent) : parent;
}

export function matchesNoteCampaign(
  reference: unknown, sourcePath: string, campaignPath: string, resolveReference: ReferenceResolver,
): boolean {
  const path = noteReferencePath(reference);
  if (!path) return reference == null || (typeof reference === "string" && !reference.trim());
  const matchesName = path === campaignPath || path === basename(campaignPath);
  // Generated scenes store the campaign's folder name as plain text.
  if (matchesName && isBareName(reference, path)) return true;
  const linked = resolveReference(reference, sourcePath);
  if (!linked) return matchesName;
  return parentPath(linked.path) === campaignPath && (linked.type === "world" || linked.type === "campaign");
}

function legacyFolderOwners(scenePath: string, adventures: readonly string[]): string[] {
  // Adventure folder notes own their directory. Flat adventures can own a
  // named scene directory, but only share their own parent as a last resort.
  const specific = adventures.filter(adventure => {
    const parent = parentPath(adventure);
    const name = noteName(adventure);
    if (basename(parent) === name) return inFolder(scenePath, parent);
    const prefix = parent ? `${parent}/` : "";
    return inFolder(scenePath, `${prefix}${name} - Scenes`)
      || inFolder(scenePath, `${prefix}${name}`);
  });
  if (specific.length) return specific;

  return adventures.filter(adventure => {
    const parent = parentPath(adventure);
    const prefix = parent ? `${parent}/` : "";
    if (!scenePath.startsWith(prefix)) return false;
    const relativePath = scenePath.slice(prefix.length);
    if (relativePath.includes("/") && !/^(?:Scenes|Act [^/]+)\//i.test(relativePath)) return false;
    // A folder-based sibling also makes a shared scene directory ambiguous.
    return !adventures.some(other => other !== adventure && (
      parentPath(other) === parent || parentPath(parentPath(other)) === parent
    ));
  });
}

/** Resolve an existing or staged scene against all of the campaign's adventures. */
export function sceneAdventurePath(
  scenePath: string, fields: Record<string, unknown>, adventurePaths: readonly string[],
  campaignPath: string, resolveReference: ReferenceResolver,
): string | null {
  if (!inFolder(scenePath, campaignPath) || fields.type !== "scene"
    || !matchesNoteCampaign(fields.campaign, scenePath, campaignPath, resolveReference)) return null;

  const { adventure } = fields;
  const hasAdventure = adventure != null && (typeof adventure !== "string" || !!adventure.trim());
  if (hasAdventure) return adventurePathForReference(adventure, scenePath, adventurePaths, resolveReference);
  const owners = legacyFolderOwners(scenePath, adventurePaths);
  return owners.length === 1 ? owners[0]! : null;
}

export function getSceneNumber(path: string, value: unknown): number {
  return parseInt(String(value ?? noteName(path).match(/Scene\s+(\d+)/i)?.[1] ?? "0"), 10) || 0;
}

export interface AdventureScene {
  file: TFile;
  frontmatter: FrontMatterCache;
  sceneNumber: number;
  status: string;
}

export function getAdventureScenes(app: App, adventure: TFile, campaignPath = campaignPathForAdventure(app, adventure)): AdventureScene[] {
  if (!inFolder(adventure.path, campaignPath)) return [];
  const files = app.vault.getMarkdownFiles();
  const adventures = campaignAdventures(app, campaignPath, files);
  if (!adventures.some(file => file.path === adventure.path)) return [];

  const adventurePaths = adventures.map(file => file.path);
  const resolveReference = vaultReferenceResolver(app);
  const scenes: AdventureScene[] = [];
  for (const file of files) {
    if (!inFolder(file.path, campaignPath)) continue;
    const fm = frontmatter(app, file);
    if (!fm || sceneAdventurePath(file.path, fm, adventurePaths, campaignPath, resolveReference) !== adventure.path) continue;
    scenes.push({
      file,
      frontmatter: fm,
      sceneNumber: getSceneNumber(file.path, fm.scene_number),
      status: String(fm.status || "not-started"),
    });
  }
  return scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
}
