import { describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
import { renderView } from "../../src/rendering/ViewRenderer";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

class TestElement {
  children: TestElement[] = [];
  style: Record<string, string> = {};
  private listeners = new Map<string, () => unknown>();

  constructor(readonly tag = "div", readonly text = "", readonly cls = "") {}

  createEl(tag: string, options: { text?: string; cls?: string } = {}) {
    const child = new TestElement(tag, options.text, options.cls);
    this.children.push(child);
    return child;
  }

  createDiv(options: { cls?: string } = {}) { return this.createEl("div", options); }
  addEventListener(event: string, listener: () => unknown) { this.listeners.set(event, listener); }
  click() { return this.listeners.get("click")?.(); }
  all(): TestElement[] { return [this, ...this.children.flatMap(child => child.all())]; }
}

function fixture() {
  const vault = noteVaultFixture();
  // Put a foreign duplicate first, reproducing the previous global-name lookup.
  const foreignAdventure = vault.addNote("B/Adventures/Shared.md", "---\ntype: adventure\n---\n");
  const adventure = vault.addNote("A/Adventures/Shared.md", "---\ntype: adventure\n---\n");
  vault.addNote("A/Adventures/Other.md", "---\ntype: adventure\n---\n");
  const owned = vault.addNote("A/Adventures/Shared - Scenes/Scene 1 - Ours.md",
    "---\ntype: scene\nadventure: Shared\ncampaign: A\nscene_number: 1\nstatus: not-started\n---\n");
  vault.addNote("A/Adventures/Other - Scenes/Scene 2 - Sibling.md",
    "---\ntype: scene\nadventure: Other\ncampaign: A\nscene_number: 2\n---\n");
  const foreignScene = vault.addNote("B/Adventures/Shared - Scenes/Scene 3 - Foreign.md",
    "---\ntype: scene\nadventure: Shared\ncampaign: B\nscene_number: 3\n---\n");
  vault.addNote("A/Adventures/Scene 4 - Ambiguous.md", "---\ntype: scene\n---\n");
  Object.assign(vault.app.metadataCache, {
    getFirstLinkpathDest: (path: string) =>
      [...vault.entries.values()].find(entry =>
        "basename" in entry && (entry.path === path || entry.path === `${path}.md` || entry.basename === path)) ?? null,
  });
  const modify = vi.fn(async (file: TFile, document: string) => vault.write(file, document));
  Object.assign(vault.app.vault, { modify });
  return { ...vault, adventure, foreignAdventure, owned, foreignScene, modify };
}

function rendered(vault: ReturnType<typeof fixture>, view: string, file: TFile) {
  const element = new TestElement();
  renderView(view, element as unknown as HTMLElement, vault.app, file.path);
  return element;
}

const sceneLinks = (element: TestElement) => element.all().filter(child => child.tag === "a").map(child => child.text);

describe("scene listings use canonical adventure membership", () => {
  it("renders only the flat adventure's scenes and only offers status changes for them", async () => {
    const vault = fixture();
    const root = rendered(vault, "adventure-scenes", vault.adventure);
    expect(sceneLinks(root)).toEqual([vault.owned.basename]);
    const toggles = root.all().filter(child => child.cls === "dnd-hub-scene-toggle");
    expect(toggles).toHaveLength(1);
    await toggles[0]!.click();
    expect(vault.modify).toHaveBeenCalledOnce();
    expect(vault.modify.mock.calls[0]![0]).toBe(vault.owned);
    expect(vault.read(vault.owned)).toContain("status: in-progress");
    expect(vault.read(vault.foreignScene)).not.toContain("status: in-progress");
  });

  it.each(["A/Session 1.md", "A/Sessions/Session 1.md"])(
    "scopes a legacy short adventure link using the session's physical campaign at %s", path => {
      const vault = fixture();
      const session = vault.addNote(path, "---\ntype: session\nadventure: '[[Shared|Alias]]'\n---\n");
      expect(sceneLinks(rendered(vault, "scene-navigator", session))).toEqual([vault.owned.basename]);
    },
  );

  it("intersects an explicit scene plan with the linked adventure instead of admitting a foreign scene", () => {
    const vault = fixture();
    const session = vault.addNote("A/Sessions/Session 1.md", `---\ntype: session\nadventure: Shared\nplanned_scenes:\n  - '[[${vault.foreignScene.path}]]'\n---\n`);
    expect(sceneLinks(rendered(vault, "scene-navigator", session))).toEqual([]);
  });

  it("resolves planned scene aliases and headings while preserving plan order", () => {
    const vault = fixture();
    const second = vault.addNote("A/Adventures/Shared - Scenes/Scene 2 - Ours.md",
      "---\ntype: scene\nadventure: Shared\ncampaign: A\nscene_number: 2\n---\n");
    const session = vault.addNote("A/Sessions/Session 1.md", `---\ntype: session\nadventure: Shared\nplanned_scenes:\n  - '[[${second.path}#Details|Next]]'\n  - '[[${vault.owned.path}]]'\n---\n`);
    expect(sceneLinks(rendered(vault, "scene-navigator", session))).toEqual([second.basename, vault.owned.basename]);
  });
});
