import { type App, type TFile, parseYaml, stringifyYaml } from "obsidian";

type Frontmatter = Record<string, unknown>;

export class EncounterTrapNoteSaveError extends Error {}

export function pathForEditedNote(file: TFile, originalName: string, name: string): string {
  if (name === originalName) return file.path;
  return `${file.path.slice(0, file.path.lastIndexOf("/") + 1)}${name}.md`;
}

export function validateNoteName(name: string): void {
  if (/[\\/\r\n]/.test(name)) {
    throw new EncounterTrapNoteSaveError("The note name cannot contain a slash or line break.");
  }
}

export async function ensureNotePathAvailable(app: App, path: string): Promise<void> {
  if (app.vault.getAbstractFileByPath(path) || await app.vault.adapter.exists(path)) {
    throw new EncounterTrapNoteSaveError(`A file or folder already exists at "${path}".`);
  }
}

export async function saveEncounterTrapEdits(
  app: App,
  file: TFile,
  destination: string,
  type: "encounter" | "trap",
  update: (frontmatter: Frontmatter, body: string) => { frontmatter: Frontmatter; body: string },
  afterWrite?: () => void,
): Promise<void> {
  const rename = destination !== file.path;
  if (rename) await ensureNotePathAvailable(app, destination);

  await app.vault.process(file, (document) => {
    const header = /^(\uFEFF?)---[ \t]*(\r?\n)([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(document);
    if (!header) {
      throw new EncounterTrapNoteSaveError(`The ${type} note needs valid YAML frontmatter before it can be edited.`);
    }
    const [, bom, eol, yaml] = header;
    let frontmatter: unknown;
    try {
      frontmatter = parseYaml(yaml!);
    } catch {
      throw new EncounterTrapNoteSaveError(`The ${type} note needs valid YAML frontmatter before it can be edited.`);
    }
    if (!isNoteMapping(frontmatter) || frontmatter.type !== type) {
      throw new EncounterTrapNoteSaveError(`The note needs a valid ${type} frontmatter mapping before it can be edited.`);
    }

    const updated = update(frontmatter, document.slice(header[0].length));
    const updatedYaml = stringifyYaml(updated.frontmatter).trimEnd().replace(/\r?\n/g, eol!);
    return `${bom}---${eol}${updatedYaml}${eol}---${eol}${updated.body}`;
  });
  afterWrite?.();

  if (rename) {
    try {
      await ensureNotePathAvailable(app, destination);
      await app.fileManager.renameFile(file, destination);
    } catch (error) {
      console.error(`Error renaming ${type} note:`, error);
      throw new EncounterTrapNoteSaveError(
        `Edits were saved to "${file.path}". The note could not be renamed to "${destination}".`,
      );
    }
  }
}

export function isNoteMapping(value: unknown): value is Frontmatter {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function preserveNoteRowFields(
  previous: unknown,
  rows: Frontmatter[],
  identity: (row: Frontmatter) => string,
  ownedKeys: readonly string[],
  previousIdentity: (row: Frontmatter, index: number) => string = identity,
): Frontmatter[] {
  if (!Array.isArray(previous)) return rows;

  const previousRows = previous.filter(isNoteMapping);
  const previousKeys = rows.map(previousIdentity);
  return rows.map((row, index) => {
    const key = previousKeys[index];
    const matches = previousRows.filter((candidate) => identity(candidate) === key);
    if (matches.length === 0) return row;
    if (matches.length > 1 || previousKeys.some((candidate, i) => i !== index && candidate === key)) {
      if (matches.some((match) => Object.keys(match).some((field) => !ownedKeys.includes(field)))) {
        throw new EncounterTrapNoteSaveError("Duplicate entries have custom properties. Give them distinct names in the note before editing.");
      }
      return row;
    }
    const original = { ...matches[0] };
    for (const field of ownedKeys) delete original[field];
    return { ...original, ...row };
  });
}

export function replaceGeneratedNotePrefix(body: string, previous: string, next: string): string {
  const start = /^(?:[ \t]*\r?\n)*/.exec(body)?.[0] ?? "";
  const content = body.slice(start.length);
  const eol = content.match(/\r?\n/)?.[0] ?? "\n";
  const expected = previous.trimStart().replace(/\r?\n/g, eol);
  if (!content.startsWith(expected)) return body;
  return start + next.trimStart().replace(/\r?\n/g, eol) + content.slice(expected.length);
}

export function updateGeneratedNoteTitle(body: string, previous: unknown, next: string): string {
  if (typeof previous !== "string" || /[\r\n]/.test(previous) || previous === next) return body;
  return replaceGeneratedNotePrefix(body, `# ${previous}\n`, `# ${next}\n`);
}
