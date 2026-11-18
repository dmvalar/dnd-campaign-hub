import { TFile, TFolder, type App } from "obsidian";
import { vi } from "vitest";
import { parseYamlFrontmatter } from "../../src/utils/YamlFrontmatter";

export function noteVaultFixture() {
  const entries = new Map<string, TFile | TFolder>();
  const documents = new Map<TFile, string>();
  const addNote = (path: string, document: string) => {
    const name = path.slice(path.lastIndexOf("/") + 1);
    const file = Object.assign(new TFile(), { path, name, basename: name.slice(0, -3), extension: "md" });
    entries.set(path, file);
    documents.set(file, document);
    return file;
  };
  const addFolder = (path: string) => entries.set(path, Object.assign(new TFolder(), { path }));
  const read = (file: TFile) => documents.get(file)!;
  const process = vi.fn(async (file: TFile, update: (document: string) => string) => {
    const document = update(read(file));
    documents.set(file, document);
    return document;
  });
  const create = vi.fn(async (path: string, document: string) => {
    if (entries.has(path)) throw new Error(`Destination exists at ${path}`);
    return addNote(path, document);
  });
  const renameFile = vi.fn(async (file: TFile, path: string) => {
    if (entries.has(path)) throw new Error(`Destination exists at ${path}`);
    entries.delete(file.path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    Object.assign(file, { path, name, basename: name.slice(0, -3) });
    entries.set(path, file);
  });
  const remove = vi.fn(async (file: TFile) => {
    entries.delete(file.path);
    documents.delete(file);
  });
  const openFile = vi.fn();
  const createFolder = vi.fn(async (path: string) => addFolder(path));
  const getActiveFile = vi.fn<() => TFile | null>().mockReturnValue(null);
  const app = {
    vault: {
      adapter: { exists: vi.fn(async (path: string) => entries.has(path)) },
      getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
      getMarkdownFiles: () => [...documents.keys()],
      read: vi.fn(async (file: TFile) => read(file)),
      createFolder, create, process, delete: remove,
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({ frontmatter: parseYamlFrontmatter(read(file)).frontmatter }),
    },
    fileManager: { renameFile },
    workspace: { getLeaf: () => ({ openFile }), getActiveFile },
  } as unknown as App;

  return {
    app, entries, addNote, addFolder, read, process, create, createFolder, renameFile, remove, openFile, getActiveFile,
    write: (file: TFile, document: string) => documents.set(file, document),
  };
}
