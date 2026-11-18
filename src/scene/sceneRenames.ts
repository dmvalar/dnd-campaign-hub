/*!
 * Bundled dependency: yaml (ISC)
 * Copyright Eemeli Aro <eemeli@gmail.com>
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose
 * with or without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
 * FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
 * OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
 * TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
 * THIS SOFTWARE.
 */
import type { App, TFile } from "obsidian";
import { isAlias, isMap, isScalar, isSeq, parseDocument, Scalar, type Alias, type Document, type YAMLMap } from "yaml";

export interface SceneRename {
  file: TFile;
  from: string;
  to: string;
  number?: number;
}

type TextEdit = { from: number; to: number; text: string };

const REFERENCE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  session: ["planned_scenes", "starting_scene", "ending_scene"],
  encounter: ["scene_path"],
  trap: ["scene"],
};

function frontmatter(content: string) {
  const start = /^\uFEFF?---[ \t]*\r?\n/.exec(content)?.[0];
  if (!start) return null;
  const rest = content.slice(start.length);
  const end = /^---[ \t]*(?:\r?\n|$)/m.exec(rest);
  if (!end) return null;
  const parsed = parseDocument(rest.slice(0, end.index));
  if (parsed.errors.length || !isMap(parsed.contents)) return null;
  return { document: parsed, map: parsed.contents, offset: start.length, end: start.length + end.index, body: start.length + end.index + end[0].length };
}

function applyEdits(content: string, edits: TextEdit[]): string {
  for (const edit of edits.sort((a, b) => b.from - a.from)) {
    content = content.slice(0, edit.from) + edit.text + content.slice(edit.to);
  }
  return content;
}

function renumberNote(content: string, rename: SceneRename): string {
  const note = frontmatter(content);
  if (!note) throw new Error(`Cannot read the scene frontmatter in "${rename.from}".`);
  const previous = note.map.get("scene_number", true);
  if (previous !== undefined && (!isScalar(previous) || !previous.range)) {
    throw new Error(`Cannot update the scene number in "${rename.from}".`);
  }

  const number = String(rename.number);
  const edits: TextEdit[] = [];
  if (isScalar(previous) && previous.range) {
    const [from, to] = previous.range;
    const trailingLineBreak = content.slice(note.offset + from, note.offset + to).match(/\r?\n$/)?.[0] ?? "";
    edits.push({ from: note.offset + from, to: note.offset + to, text: number + trailingLineBreak });
  } else if (note.map.flow && note.map.range) {
    const at = note.offset + note.map.range[1] - 1;
    const separator = note.map.items.length && !content.slice(note.offset, at).trimEnd().endsWith(",") ? ", " : "";
    edits.push({ from: at, to: at, text: `${separator}scene_number: ${number}` });
  } else {
    const eol = content.slice(0, note.offset).endsWith("\r\n") ? "\r\n" : "\n";
    edits.push({ from: note.end, to: note.end, text: `scene_number: ${number}${eol}` });
  }

  const oldFilename = /(?:^|\/)Scene\s+(\d+)\s+-\s+(.+)\.md$/.exec(rename.from);
  const heading = /^(?:[ \t]*\r?\n)*(# Scene (\d+): (.*))(?=\r?\n|$)/.exec(content.slice(note.body));
  const oldNumber = isScalar(previous) ? previous.value : oldFilename?.[1];
  if (heading && heading[2] === String(oldNumber)
    && (heading[3] === oldFilename?.[2] || heading[3] === note.map.get("name"))) {
    const from = note.body + heading[0].length - heading[1]!.length + "# Scene ".length;
    edits.push({ from, to: from + heading[2]!.length, text: number });
  }
  return applyEdits(content, edits);
}

/** Validate every destination before writing any note, and free occupied paths in dependency order. */
export async function planSceneRenames(app: App, renames: SceneRename[], createAt?: string): Promise<SceneRename[]> {
  const pending = new Map(renames.map(rename => [rename.from, rename]));
  if (pending.size !== renames.length) throw new Error("A scene cannot be moved twice in the same batch.");
  const destinations = new Set<string>();
  for (const rename of renames) {
    if (app.vault.getAbstractFileByPath(rename.from) !== rename.file || rename.file.path !== rename.from) {
      throw new Error(`The scene at "${rename.from}" moved or was removed. Reopen the editor and try again.`);
    }
    if (destinations.has(rename.to)) throw new Error(`More than one scene would move to "${rename.to}".`);
    destinations.add(rename.to);
    if (rename.number !== undefined) renumberNote(await app.vault.read(rename.file), rename);
  }

  if (createAt && destinations.has(createAt)) throw new Error(`A scene would move to "${createAt}".`);
  const checkPaths = createAt ? [...destinations, createAt] : destinations;
  for (const path of checkPaths) {
    if (pending.has(path)) continue;
    const loaded = app.vault.getAbstractFileByPath(path);
    // A case-only rename can be found on disk under the old spelling.
    const caseOnly = renames.some(rename => rename.to === path && rename.from.toLowerCase() === path.toLowerCase());
    const sameFile = caseOnly && renames.some(rename => rename.to === path && rename.file === loaded);
    if ((loaded && !sameFile) || (!caseOnly && await app.vault.adapter.exists(path))) {
      throw new Error(`A file or folder already exists at "${path}".`);
    }
  }

  const ordered: SceneRename[] = [];
  while (pending.size) {
    const next = [...pending.values()].find(rename => !pending.has(rename.to));
    if (!next) throw new Error("These scene renames have conflicting destinations. Choose a different scene name or number.");
    pending.delete(next.from);
    ordered.push(next);
  }
  return ordered;
}

function mapReferenceValues(value: unknown, transform: (value: string) => string): unknown {
  const item = (entry: unknown): unknown => {
    if (typeof entry === "string") return transform(entry);
    if (entry && typeof entry === "object" && !Array.isArray(entry) && "path" in entry && typeof entry.path === "string") {
      return { ...entry, path: transform(entry.path) };
    }
    return entry;
  };
  return Array.isArray(value) ? value.map(item) : item(value);
}

function visitSceneReferences(
  map: YAMLMap, document: Document, visit: (scalar: Scalar<string>) => void,
  visitAlias?: (alias: Alias, value: unknown) => void,
) {
  const type = map.get("type");
  const fields = typeof type === "string" && Object.hasOwnProperty.call(REFERENCE_FIELDS, type)
    ? REFERENCE_FIELDS[type] : undefined;
  for (const field of fields ?? []) {
    const value = map.get(field, true);
    for (const item of isSeq(value) ? value.items : [value]) {
      const scalar = isMap(item) ? item.get("path", true) : item;
      if (isScalar(scalar) && typeof scalar.value === "string") visit(scalar as Scalar<string>);
      else if (isAlias(scalar)) {
        const value = scalar.toJS(document);
        mapReferenceValues(value, text => {
          visit(new Scalar(text));
          return text;
        });
        visitAlias?.(scalar, value);
      }
    }
  }
}

function relativeLinkPath(target: string, source: string): string {
  const directories = source.split("/").slice(0, -1);
  const targetParts = target.split("/");
  while (directories.length && targetParts.length > 1 && directories[0] === targetParts[0]) {
    directories.shift();
    targetParts.shift();
  }
  return (directories.length ? "../".repeat(directories.length) : "./") + targetParts.join("/");
}

function referenceChange(
  value: string, source: string, resolve: (target: string) => SceneRename | undefined,
): { rename: SceneRename; replacement: string } | undefined {
  const leading = value.length - value.trimStart().length;
  const raw = value.trim();
  if (!raw) return;
  const wiki = /^!?\[\[([^|#\]]+)(?:[#|][^\]]*)?\]\]$/.exec(raw);
  const markdown = /^!?\[[^\]]*\]\(<?([^#>)]*)(?:#[^>)]*)?>?\)$/.exec(raw);
  const link = wiki ?? markdown;
  const target = link ? link[1]!.trim() : raw.split("#", 1)[0]!.trimEnd();
  if (!target) return;
  let decoded = target;
  if (markdown) {
    try {
      decoded = decodeURIComponent(target);
    } catch {
      return;
    }
  }
  const rename = resolve(decoded);
  if (!rename) return;

  let replacement = /\.md$/i.test(decoded) ? rename.to : rename.to.replace(/\.md$/i, "");
  if (/^\.\.?\//.test(decoded)) replacement = relativeLinkPath(replacement, source);
  if (markdown && !raw.includes("(<")) {
    replacement = encodeURI(replacement).replace(/[?#()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  const start = leading + (wiki ? raw.indexOf("[[") + 2 : markdown ? raw.indexOf("](") + 2 + Number(raw.includes("(<")) : 0);
  const at = value.indexOf(target, start);
  return { rename, replacement: value.slice(0, at) + replacement + value.slice(at + target.length) };
}

type ReferenceChanges = Map<SceneRename, Map<TFile, Map<string, string>>>;

async function collectReferenceChanges(app: App, renames: SceneRename[]): Promise<ReferenceChanges> {
  const changes: ReferenceChanges = new Map();
  const byFile = new Map(renames.map(rename => [rename.file, rename]));
  for (const file of app.vault.getMarkdownFiles()) {
    const content = await app.vault.read(file);
    const note = frontmatter(content);
    if (!note) continue;
    visitSceneReferences(note.map, note.document, ({ value }) => {
      const change = referenceChange(value, file.path, target => {
        const resolved = app.metadataCache.getFirstLinkpathDest(target, file.path);
        return resolved ? byFile.get(resolved) : undefined;
      });
      if (!change) return;
      const files = changes.get(change.rename) ?? new Map<TFile, Map<string, string>>();
      changes.set(change.rename, files);
      const values = files.get(file) ?? new Map<string, string>();
      files.set(file, values);
      values.set(value, change.replacement);
    });
  }
  return changes;
}

function updateReferences(content: string, replacements: Map<string, string>): string {
  const note = frontmatter(content);
  if (!note) return content;
  const edits: TextEdit[] = [];
  visitSceneReferences(note.map, note.document, scalar => {
    const value = replacements.get(scalar.value);
    if (value === undefined || !scalar.range) return;
    const [from, to] = scalar.range.map(offset => offset + note.offset) as [number, number, number];
    const text = scalar.type === Scalar.QUOTE_SINGLE ? `'${value.replace(/'/g, "''")}'` : JSON.stringify(value);
    const trailingLineBreak = content.slice(from, to).match(/\r?\n$/)?.[0] ?? "";
    edits.push({ from, to, text: text + trailingLineBreak });
  }, (alias, value) => {
    let changed = false;
    const updated = mapReferenceValues(value, text => {
      const replacement = replacements.get(text);
      if (replacement !== undefined && replacement !== text) changed = true;
      return replacement ?? text;
    });
    if (changed && alias.range) {
      // Detach this owned field instead of rewriting an anchor used by custom metadata.
      edits.push({ from: note.offset + alias.range[0], to: note.offset + alias.range[1], text: JSON.stringify(updated) });
    }
  });
  return applyEdits(content, edits);
}

/** Move notes through the file manager, then reconcile Hub fields the native link engine may skip. */
export async function runSceneRenames(
  app: App,
  renames: SceneRename[],
  remapStoredPaths: (paths: ReadonlyMap<string, string>) => Promise<void>,
  createScene?: () => Promise<void>,
): Promise<void> {
  if (!renames.length) {
    await createScene?.();
    return;
  }
  const undo: Array<() => Promise<void>> = [];
  const write = async (file: TFile, update: (content: string) => string) => {
    const current = await app.vault.read(file);
    if (update(current) === current) return;
    let before = current;
    const written = await app.vault.process(file, latest => {
      before = latest;
      return update(latest);
    });
    if (before === written) return;
    undo.push(async () => {
      await app.vault.process(file, latest => {
        if (latest !== written) throw new Error(`"${file.path}" changed during scene renaming.`);
        return before;
      });
    });
  };

  try {
    for (const rename of renames) {
      if (rename.file.path !== rename.from) throw new Error(`The scene at "${rename.from}" was moved.`);
      const destination = app.vault.getAbstractFileByPath(rename.to);
      if (destination && destination !== rename.file) throw new Error(`A file or folder already exists at "${rename.to}".`);
      const references = await collectReferenceChanges(app, [rename]);
      try {
        await app.fileManager.renameFile(rename.file, rename.to);
      } finally {
        // A platform rename can move the file before an error updating its links.
        if (rename.file.path === rename.to) {
          undo.push(async () => {
            if (rename.file.path !== rename.to) throw new Error(`The scene at "${rename.to}" was moved again.`);
            await app.fileManager.renameFile(rename.file, rename.from);
          });
        }
      }
      if (rename.number !== undefined) await write(rename.file, content => renumberNote(content, rename));
      for (const [file, replacements] of references.get(rename) ?? []) {
        await write(file, content => updateReferences(content, replacements));
      }
    }

    await remapStoredPaths(new Map(renames.map(rename => [rename.from, rename.file.path])));
    if (createScene) {
      undo.push(() => remapStoredPaths(new Map(renames.map(rename => [rename.file.path, rename.from]))));
      await createScene();
    }
  } catch (error) {
    const failures: string[] = [];
    for (const revert of undo.reverse()) {
      try {
        await revert();
      } catch (failure) {
        failures.push(failure instanceof Error ? failure.message : String(failure));
      }
    }
    if (failures.length) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} Could not fully restore the previous scene paths and references. ${failures.join(" ")}`);
    }
    throw error;
  }
}
