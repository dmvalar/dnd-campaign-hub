import { TFile, type App, type FrontMatterCache } from "obsidian";

const parentPath = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf("/")));
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const inFolder = (path: string, folder: string) => !folder || path.startsWith(`${folder}/`);
const frontmatter = (app: App, file: TFile) => app.metadataCache.getFileCache(file)?.frontmatter;

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

function adventureForReference(app: App, reference: unknown, sourcePath: string, adventures: TFile[]): TFile | null {
  const path = noteReferencePath(reference);
  if (!path) return null;
  if (!path.includes("/")) {
    // Legacy and short wiki links can name an adventure that also exists in
    // another campaign. Prefer a unique local match before resolving aliases.
    const matching = adventures.filter(file => file.basename === path.replace(/\.md$/i, ""));
    if (matching.length === 1) return matching[0]!;
    if (isBareName(reference, path)) return null;
  }
  const file = resolveNoteReference(app, reference, sourcePath);
  return adventures.find(adventure => adventure.path === file?.path) ?? null;
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

function matchesCampaign(app: App, reference: unknown, sourcePath: string, campaignPath: string): boolean {
  const path = noteReferencePath(reference);
  if (!path) return reference == null || (typeof reference === "string" && !reference.trim());
  const matchesName = path === campaignPath || path === basename(campaignPath);
  // Generated scenes store the campaign's folder name as plain text.
  if (matchesName && isBareName(reference, path)) return true;
  const linked = resolveNoteReference(app, reference, sourcePath);
  if (!linked) return matchesName;
  const type = frontmatter(app, linked)?.type;
  return parentPath(linked.path) === campaignPath && (type === "world" || type === "campaign");
}

function legacyFolderOwners(scene: TFile, adventures: TFile[]): TFile[] {
  // Adventure folder notes own their directory. Flat adventures can own a
  // named scene directory, but only share their own parent as a last resort.
  const specific = adventures.filter(adventure => {
    const parent = parentPath(adventure.path);
    if (basename(parent) === adventure.basename) return inFolder(scene.path, parent);
    const prefix = parent ? `${parent}/` : "";
    return inFolder(scene.path, `${prefix}${adventure.basename} - Scenes`)
      || inFolder(scene.path, `${prefix}${adventure.basename}`);
  });
  if (specific.length) return specific;

  return adventures.filter(adventure => {
    const parent = parentPath(adventure.path);
    const prefix = parent ? `${parent}/` : "";
    if (!scene.path.startsWith(prefix)) return false;
    const relativePath = scene.path.slice(prefix.length);
    if (relativePath.includes("/") && !/^(?:Scenes|Act [^/]+)\//i.test(relativePath)) return false;
    // A folder-based sibling also makes a shared scene directory ambiguous.
    return !adventures.some(other => other !== adventure && (
      parentPath(other.path) === parent || parentPath(parentPath(other.path)) === parent
    ));
  });
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

  const scenes: AdventureScene[] = [];
  for (const file of files) {
    if (!inFolder(file.path, campaignPath)) continue;
    const fm = frontmatter(app, file);
    if (fm?.type !== "scene" || !matchesCampaign(app, fm.campaign, file.path, campaignPath)) continue;

    const hasAdventure = fm.adventure != null && (typeof fm.adventure !== "string" || !!fm.adventure.trim());
    if (hasAdventure) {
      if (adventureForReference(app, fm.adventure, file.path, adventures)?.path !== adventure.path) continue;
    } else {
      const owners = legacyFolderOwners(file, adventures);
      if (owners.length !== 1 || owners[0]?.path !== adventure.path) continue;
    }
    scenes.push({
      file,
      frontmatter: fm,
      sceneNumber: parseInt(fm.scene_number ?? file.basename.match(/Scene\s+(\d+)/i)?.[1] ?? "0", 10) || 0,
      status: String(fm.status || "not-started"),
    });
  }
  return scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
}
