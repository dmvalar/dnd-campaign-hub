import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Notice, TFile, TFolder, type WorkspaceLeaf } from "obsidian";
import { SessionRunDashboardView } from "../../src/session/SessionRunDashboardView";
import { extractQuickNotes, QUICK_NOTES_HEADING } from "../../src/session/quickNotes";

vi.mock("obsidian", async (importOriginal) => {
  const original = await importOriginal<typeof import("../mocks/obsidian")>();
  return {
    ...original,
    ItemView: class {
      constructor(leaf: { app: unknown; containerEl: unknown }) {
        Object.assign(this, leaf);
      }
    },
    Notice: vi.fn(),
  };
});

class TestElement {
  children: TestElement[] = [];
  style: Record<string, string> = {};
  value = "";
  private listeners = new Map<string, () => void | Promise<void>>();

  constructor(readonly tag: string, readonly text?: string) {}

  createEl(tag: string, options?: { text?: string }): TestElement {
    const element = new TestElement(tag, options?.text);
    this.children.push(element);
    return element;
  }

  addClass() {}
  querySelectorAll() { return []; }
  empty() { this.children = []; }

  addEventListener(event: string, listener: () => void | Promise<void>) {
    this.listeners.set(event, listener);
  }

  input(value: string) {
    this.value = value;
    this.listeners.get("input")?.();
  }

  click() {
    return this.listeners.get("click")?.();
  }

  find(tag: string, text?: string): TestElement | undefined {
    if (this.tag === tag && (text === undefined || this.text === text)) return this;
    for (const child of this.children) {
      const match = child.find(tag, text);
      if (match) return match;
    }
    return undefined;
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function sessionFile(campaign: string, number = 1): TFile {
  return Object.assign(new TFile(), {
    path: `${campaign}/Sessions/Session ${number}.md`,
    basename: `Session ${number}`,
    extension: "md",
  });
}

function sessionDocument(title: string, notes: string): string {
  return `---\ntype: session\n---\n# ${title}\n\n${QUICK_NOTES_HEADING}\n\n${notes}\n\n## Summary\n\n${title} summary.\n`;
}

function fixture() {
  const a = sessionFile("A");
  const b = sessionFile("B");
  const c = sessionFile("B", 2);
  const documents = new Map([
    [a, sessionDocument("A", "A saved notes")],
    [b, sessionDocument("B", "B saved notes")],
    [c, sessionDocument("C", "C saved notes")],
  ]);
  const entries = new Map<string, TFile | TFolder>([
    [a.path, a],
    [b.path, b],
    [c.path, c],
    ["A/Sessions", Object.assign(new TFolder(), { children: [a] })],
    ["B/Sessions", Object.assign(new TFolder(), { children: [b, c] })],
  ]);
  const read = vi.fn(async (file: TFile) => documents.get(file)!);
  const applyUpdate = async (file: TFile, update: (document: string) => string) => {
    const updated = update(documents.get(file)!);
    documents.set(file, updated);
    return updated;
  };
  const process = vi.fn(applyUpdate);
  const app = {
    vault: { getAbstractFileByPath: (path: string) => entries.get(path), read, process },
    metadataCache: { getFileCache: () => ({ frontmatter: { status: "planned" } }) },
  };
  const plugin = { getActiveCampaignPath: () => "A" };

  function createView() {
    const content = new TestElement("main");
    const leaf = { app, containerEl: { children: [null, content] } };
    const view = new SessionRunDashboardView(
      leaf as unknown as WorkspaceLeaf,
      plugin as unknown as ConstructorParameters<typeof SessionRunDashboardView>[1],
    );
    vi.spyOn(view, "renderTimers").mockResolvedValue();
    vi.spyOn(view, "renderDiceRoller").mockImplementation(() => {});
    vi.spyOn(view, "renderLiveSceneControl").mockResolvedValue();
    vi.spyOn(view, "renderSceneMusicDetector").mockResolvedValue();
    vi.spyOn(view, "renderSRDQuickSearch").mockResolvedValue();
    vi.spyOn(view, "renderQuickActions").mockResolvedValue();
    return { view, content };
  }

  function delayRead(target: TFile) {
    const started = deferred();
    const proceed = deferred();
    read.mockImplementation(async (file) => {
      if (file === target) {
        started.resolve();
        await proceed.promise;
      }
      return documents.get(file)!;
    });
    return { started, proceed };
  }

  function delaySave() {
    const started = deferred();
    const proceed = deferred();
    process.mockImplementationOnce(async (file, update) => {
      started.resolve();
      await proceed.promise;
      return applyUpdate(file, update);
    });
    return { started, proceed };
  }

  const notes = (file: TFile) => extractQuickNotes(documents.get(file)!);
  return { a, b, c, createView, delayRead, delaySave, documents, notes, process, read };
}

const savedMessage = "Quick notes saved to session!";
const saveButton = (content: TestElement) => content.find("button", "💾 Save Now")!;
const textarea = (content: TestElement) => content.find("textarea")!;

describe("Session Run Dashboard Quick Notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("finishes overlapping saves on the original file before switching sessions", async () => {
    const { a, b, createView, delaySave, documents, notes, process, read } = fixture();
    const { view, content } = createView();
    await view.onOpen();

    const originalEditor = textarea(content);
    const originalSave = saveButton(content);
    originalEditor.input("A first draft");
    const delayedSave = delaySave();
    const firstSave = originalSave.click();
    await delayedSave.started.promise;
    expect(Notice).not.toHaveBeenCalledWith(savedMessage);

    const switching = view.setContext("B", b.path);
    originalEditor.input("A final draft");
    const secondSave = originalSave.click();
    documents.set(a, documents.get(a)!.replace("A summary.", "External summary edit.").replace("type: session", "type: session\ndate: 2026-11-18"));
    expect(read).not.toHaveBeenCalledWith(b);
    delayedSave.proceed.resolve();

    expect(await switching).toBe(true);
    await Promise.all([firstSave, secondSave]);
    expect(process.mock.calls.map(([file]) => file)).toEqual([a, a]);
    expect(notes(a)).toBe("A final draft");
    expect(documents.get(a)).toContain("External summary edit.");
    expect(documents.get(a)).toContain("date: 2026-11-18");
    expect(documents.get(b)).toBe(sessionDocument("B", "B saved notes"));
    expect(textarea(content).value).toBe("B saved notes");

    originalEditor.input("Detached editor text");
    await originalSave.click();
    expect(textarea(content).value).toBe("B saved notes");
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("saves edits before autosave and flushes input made while the target loads", async () => {
    const { a, c, createView, delayRead, notes, process } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    textarea(content).input("Before campaign switch");
    const load = delayRead(c);
    const switching = view.setCampaign("B");
    await load.started.promise;
    expect(notes(a)).toBe("Before campaign switch");
    expect(view.currentSessionFile).toBe(a);

    textarea(content).input("During target load");
    load.proceed.resolve();
    expect(await switching).toBe(true);
    expect(view.currentSessionFile).toBe(c);
    expect(textarea(content).value).toBe("C saved notes");
    expect(notes(a)).toBe("During target load");
    expect(process.mock.calls.map(([file]) => file)).toEqual([a, a]);
  });

  it("ignores a superseded session load after rendering the latest session", async () => {
    const { b, c, createView, delayRead, notes, process } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    const load = delayRead(b);
    const older = view.setContext("B", b.path);
    await load.started.promise;
    expect(await view.setSession(c.path)).toBe(true);

    textarea(content).input("Newest session draft");
    load.proceed.resolve();
    expect(await older).toBe(false);
    expect(view.currentSessionFile).toBe(c);
    expect(textarea(content).value).toBe("Newest session draft");
    await saveButton(content).click();
    expect(process.mock.calls.map(([file]) => file)).toEqual([c]);
    expect(notes(b)).toBe("B saved notes");
    expect(notes(c)).toBe("Newest session draft");
    expect(Notice).toHaveBeenCalledWith(savedMessage);
  });

  it("keeps a failed save editable and retries without switching or announcing success", async () => {
    const { a, b, createView, notes, process, read } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    textarea(content).input("A unsaved draft");
    process.mockRejectedValueOnce(new Error("Vault unavailable"));
    await saveButton(content).click();
    expect(Notice).not.toHaveBeenCalledWith(savedMessage);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Your draft is still in the dashboard."), expect.any(Number));

    process.mockRejectedValueOnce(new Error("Vault unavailable"));
    expect(await view.setContext("B", b.path)).toBe(false);
    expect(read).not.toHaveBeenCalledWith(b);
    expect(view.currentSessionFile).toBe(a);
    expect(textarea(content).value).toBe("A unsaved draft");
    expect(notes(a)).toBe("A saved notes");

    await saveButton(content).click();
    expect(notes(a)).toBe("A unsaved draft");
    expect(Notice).toHaveBeenCalledWith(savedMessage);
    expect(await view.setContext("B", b.path)).toBe(true);
  });

  it("keeps both Quick Notes versions if the section changed independently", async () => {
    const { a, b, createView, documents, notes } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    textarea(content).input("A dashboard draft");
    documents.set(a, sessionDocument("A", "External Quick Notes edit"));

    expect(await view.setContext("B", b.path)).toBe(false);
    expect(notes(a)).toBe("External Quick Notes edit");
    expect(textarea(content).value).toBe("A dashboard draft");
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Quick Notes changed"), expect.any(Number));
    expect(Notice).not.toHaveBeenCalledWith(savedMessage);

    documents.set(a, sessionDocument("A", "A dashboard draft"));
    expect(await view.setContext("B", b.path)).toBe(true);
    expect(notes(a)).toBe("A dashboard draft");
  });

  it("keeps Quick Notes unavailable after a failed load until retry succeeds", async () => {
    const { a, createView, notes, process, read } = fixture();
    const { view, content } = createView();
    read.mockRejectedValueOnce(new Error("Read failed"));
    await view.onOpen();
    expect(content.find("textarea")).toBeUndefined();
    expect(content.find("button", "💾 Save Now")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30000);
    expect(process).not.toHaveBeenCalled();
    expect(notes(a)).toBe("A saved notes");

    content.find("button", "Retry")!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(textarea(content).value).toBe("A saved notes");
  });

  it("drains a pending save before a replacement view reads the same session", async () => {
    const { a, createView, delaySave, notes, process, read } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    const oldEditor = textarea(content);
    oldEditor.input("First draft");
    const save = delaySave();
    const saving = saveButton(content).click();
    await save.started.promise;
    oldEditor.input("Final draft at close");
    const closing = view.onClose();
    oldEditor.input("Stale input after close");

    const replacement = createView();
    const opening = replacement.view.onOpen();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    save.proceed.resolve();
    await Promise.all([saving, closing, opening]);

    expect(notes(a)).toBe("Final draft at close");
    expect(textarea(replacement.content).value).toBe("Final draft at close");
    expect(process.mock.calls.map(([file]) => file)).toEqual([a, a]);
    expect(Notice).not.toHaveBeenCalledWith(savedMessage);
    expect(view.autoSaveInterval).toBeNull();
    expect(view.timerUpdateInterval).toBeNull();
  });

  it("recovers a draft after a failed final save on close", async () => {
    const { a, createView, notes, process } = fixture();
    const { view, content } = createView();
    await view.onOpen();
    textarea(content).input("Recoverable draft");
    process.mockRejectedValueOnce(new Error("Vault unavailable"));
    await view.onClose();
    expect(notes(a)).toBe("A saved notes");
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Reopen this session"), expect.any(Number));

    const replacement = createView();
    await replacement.view.onOpen();
    expect(textarea(replacement.content).value).toBe("Recoverable draft");
    await saveButton(replacement.content).click();
    expect(notes(a)).toBe("Recoverable draft");
  });

  it("does not re-render or restart timers if a startup load finishes after close", async () => {
    const { a, b, createView, delayRead, process } = fixture();
    const { view, content } = createView();
    const load = delayRead(a);
    const opening = view.onOpen();
    await load.started.promise;
    await view.onClose();
    expect(await view.setContext("B", b.path)).toBe(false);

    load.proceed.resolve();
    await opening;
    expect(view.currentSessionFile).toBeNull();
    expect(content.find("textarea")).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(process).not.toHaveBeenCalled();
  });
});
