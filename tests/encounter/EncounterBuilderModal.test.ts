import { Notice } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterBuilderModal } from "../../src/encounter/EncounterBuilderModal";
import { PartyManager } from "../../src/party/PartyManager";
import { parseYamlFrontmatter } from "../../src/utils/YamlFrontmatter";
import { noteVaultFixture } from "./noteVaultFixture";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("../mocks/obsidian")>(),
  Notice: vi.fn(),
  Setting: class {
    setName() { return this; }
    setDesc() { return this; }
    addDropdown(setup: (dropdown: object) => void) {
      setup({ addOption: vi.fn(), setValue: vi.fn(), onChange: vi.fn() });
      return this;
    }
  },
}));

const folder = "ttrpgs/Keep/z_Encounters";
const originalPath = `${folder}/Gate.md`;
const renamedPath = `${folder}/Watch.md`;
const body = [
  "", "# Gate", "", "```dnd-hub", "```", "", "## Difficulty Analysis", "",
  "```dnd-hub-view", "encounter-difficulty", "```", "", "## GM Notes", "",
  "Use [[Gate Map#North wall]].", "", "## Optional reinforcement", "Watch for the fire signal.", "",
].join("\n");
const original = [
  "---", "type: encounter", "template_version: 1.1.0", "name: Gate", "include_party: false",
  "campaign_path: ttrpgs/Keep", "scene_path: Keep/Scene.md", "date: 2024-05-21",
  "custom:", "  treasure: [coin, key]", "creatures:", "  - name: Goblin", "    count: 1", "    tactics: Signal allies",
  "party_members:", "  - name: Scout", "    level: 3", "difficulty:", "  enemy_count: 1", "  estimate: conservative", "---", body,
].join("\n");

async function setup(edit = true, document = original) {
  const vault = noteVaultFixture();
  const file = edit ? vault.addNote(originalPath, document) : undefined;
  const partyManager = {
    generateId: vi.fn(() => "test-id"),
    buildEncounter: vi.fn((name, creatures, notePath) => ({ name, creatures, notePath })),
    saveEncounter: vi.fn(),
  };
  const plugin = { partyManager } as unknown as EncounterBuilderModal["plugin"];
  const modal = new EncounterBuilderModal(vault.app, plugin, file?.path);
  const close = vi.fn();
  Object.assign(modal, { app: vault.app, close });
  if (edit) await modal.loadEncounterData();
  else Object.assign(modal, { encounterName: "Gate", includeParty: false, creatures: [{ name: "Goblin", count: 1 }] });
  return { ...vault, file: file!, modal, close, partyManager };
}

async function addParty(f: Awaited<ReturnType<typeof setup>>) {
  Object.assign(f.app.vault.adapter, { write: vi.fn() });
  const manager = new PartyManager(f.app, "dnd-campaign-hub");
  Object.assign(f.modal.plugin, { partyManager: manager });
  const party = await manager.createParty("Keepers");
  const addMember = async (name: string, fields: string) => {
    const notePath = `Keep/Party/${name}.md`;
    f.addNote(notePath, `---\ntype: player\nname: ${name}\n${fields}\n---\n`);
    await manager.addMember(party.id, notePath, name);
    return notePath;
  };
  f.modal.selectedPartyId = party.id;
  return { manager, party, addMember };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { moment: () => ({ format: () => "2026-11-18" }) });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EncounterBuilderModal note save", () => {
  it("round-trips agent-authored zero HP, maximum/temp HP, image token and fixed initiative for every creature instance", async () => {
    const f=await setup(true,original.replace("    count: 1", "    count: 2\n    hp: 0\n    hp_max: 22\n    thp: 5\n    token_id: image-token\n    init_bonus: 3\n    initiative: 0\n    fixed_initiative: true"));
    await f.modal.saveEncounter();
    expect(parseYamlFrontmatter(f.read(f.file)).frontmatter.creatures).toMatchObject([
      {name:"Goblin",count:2,hp:0,hp_max:22,thp:5,token_id:"image-token",init_bonus:3,initiative:0,fixed_initiative:true},
    ]);
    const stored=f.partyManager.saveEncounter.mock.calls[0]![1];
    expect(stored.creatures).toHaveLength(2);
    expect(stored.creatures).toMatchObject([
      {currentHP:0,maxHP:22,tempHP:5,tokenId:"image-token",fixedInitiative:true,initiative:0},
      {currentHP:0,maxHP:22,tempHP:5,tokenId:"image-token",fixedInitiative:true,initiative:0},
    ]);
  });

  it("edits the latest note in its own folder, preserving body, metadata and the original file through rename", async () => {
    const f = await setup();
    f.addFolder("Other/ttrpgs");
    f.getActiveFile.mockReturnValue(f.addNote("Other/Active.md", ""));
    // Simulate Markdown and YAML authored after the edit modal was opened.
    const latestBody = body + "\nRetreat through the old tunnel.\n";
    f.write(f.file, original.replace("  treasure: [coin, key]", "  treasure: [coin, key]\n  ally: Smith")
      .replace("    tactics: Signal allies", "    tactics: Retreat if outnumbered").replace(body, latestBody).replace(/\n/g, "\r\n"));
    f.modal.encounterName = "Watch";
    f.modal.creatures[0]!.count = 2;
    await f.modal.saveEncounter();

    expect(f.process).toHaveBeenCalledWith(f.file, expect.any(Function));
    expect(f.renameFile).toHaveBeenCalledWith(f.file, renamedPath);
    expect(f.entries.get(renamedPath)).toBe(f.file);
    expect(f.entries.has(originalPath)).toBe(false);
    expect(f.createFolder).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.openFile).toHaveBeenCalledWith(f.file);
    expect(f.partyManager.saveEncounter).toHaveBeenCalledWith("Watch", expect.objectContaining({ notePath: renamedPath }));
    const saved = parseYamlFrontmatter(f.read(f.file));
    expect(saved.frontmatter).toMatchObject({
      name: "Watch", template_version: "1.1.0", date: "2024-05-21",
      campaign_path: "ttrpgs/Keep", scene_path: "Keep/Scene.md",
      custom: { treasure: ["coin", "key"], ally: "Smith" },
      creatures: [{ name: "Goblin", count: 2, tactics: "Retreat if outnumbered" }],
      difficulty: { enemy_count: 2, estimate: "conservative" },
    });
    expect(saved.frontmatter).not.toHaveProperty("party_members");
    expect(saved.body).toBe(latestBody.replace("# Gate", "# Watch").replace(/\n/g, "\r\n"));
  });

  it("keeps an authored heading and a fenced copy of the original heading", async () => {
    const customBody = "\n# Gate — my expanded heading\n\n~~~markdown\n# Gate\n~~~\n";
    const f = await setup(true, original.replace(body, customBody));
    f.modal.encounterName = "Watch";
    await f.modal.saveEncounter();
    expect(parseYamlFrontmatter(f.read(f.file)).body).toBe(customBody);
  });

  it.each(["file", "folder"] as const)("blocks a rename over an existing %s before writing", async (kind) => {
    const f = await setup();
    const target = kind === "file" ? f.addNote(renamedPath, "Keep me") : f.addFolder(renamedPath).get(renamedPath);
    f.modal.encounterName = "Watch";
    await f.modal.saveEncounter();
    expect(f.entries.get(originalPath)).toBe(f.file);
    expect(f.entries.get(renamedPath)).toBe(target);
    expect(f.read(f.file)).toBe(original);
    if (target && kind === "file") expect(f.read(target as typeof f.file)).toBe("Keep me");
    expect(f.process).not.toHaveBeenCalled();
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it.each(["file", "folder"] as const)("blocks creation over an existing %s", async (kind) => {
    const f = await setup(false);
    const path = "z_Encounters/Gate.md";
    const target = kind === "file" ? f.addNote(path, "Keep me") : f.addFolder(path).get(path);
    await f.modal.saveEncounter();
    expect(f.entries.get(path)).toBe(target);
    if (target && kind === "file") expect(f.read(target as typeof f.file)).toBe("Keep me");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.process).not.toHaveBeenCalled();
    expect(f.createFolder).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
  });

  it("keeps the draft available after create fails and creates only once on retry", async () => {
    const f = await setup(false);
    f.create.mockRejectedValueOnce(new Error("injected create failure"));
    await f.modal.saveEncounter();
    expect(f.entries.has("z_Encounters/Gate.md")).toBe(false);
    expect(f.close).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    await f.modal.saveEncounter();
    const created = f.entries.get("z_Encounters/Gate.md") as typeof f.file;
    expect(parseYamlFrontmatter(f.read(created)).body).toContain("## GM Notes");
    expect(f.partyManager.saveEncounter).toHaveBeenCalledTimes(1);
  });

  it("keeps the source on write failure and retries a rename from the edited source", async () => {
    const f = await setup();
    f.modal.encounterName = "Watch";
    f.modal.creatures[0]!.name = "Watch Goblin";
    f.process.mockRejectedValueOnce(new Error("injected write failure"));
    await f.modal.saveEncounter();
    expect(f.read(f.file)).toBe(original);
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();

    f.renameFile.mockRejectedValueOnce(new Error("injected rename failure"));
    await f.modal.saveEncounter();
    expect(f.entries.get(originalPath)).toBe(f.file);
    expect(f.entries.has(renamedPath)).toBe(false);
    expect(f.read(f.file)).toContain("# Watch");
    expect(f.read(f.file)).toContain("Use [[Gate Map#North wall]].");
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining(`Edits were saved to "${originalPath}"`));
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();

    await f.modal.saveEncounter();
    expect(f.entries.get(renamedPath)).toBe(f.file);
    expect(f.entries.has(originalPath)).toBe(false);
    expect(parseYamlFrontmatter(f.read(f.file)).frontmatter).toMatchObject({
      creatures: [{ name: "Watch Goblin", tactics: "Signal allies" }],
    });
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).toHaveBeenCalledTimes(1);
  });

  it("blocks a rename when the adapter sees a target that is not yet indexed", async () => {
    const f = await setup();
    vi.mocked(f.app.vault.adapter.exists).mockImplementation(async (path) => path === renamedPath);
    f.modal.encounterName = "Watch";
    await f.modal.saveEncounter();
    expect(f.read(f.file)).toBe(original);
    expect(f.process).not.toHaveBeenCalled();
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it("keeps ambiguous rows with custom keys and rejects changes to malformed frontmatter", async () => {
    const f = await setup(true, original.replace("party_members:", "  - name: Goblin\n    count: 1\nparty_members:"));
    const duplicate = f.read(f.file);
    await f.modal.saveEncounter();
    expect(f.read(f.file)).toBe(duplicate);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Duplicate entries have custom properties"));

    const malformed = "---\n[encounter, goblin]\n---\n\n# Gate\n";
    f.write(f.file, malformed);
    await f.modal.saveEncounter();
    expect(f.read(f.file)).toBe(malformed);
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it("saves current, maximum and temporary HP separately for selected party members", async () => {
    const f = await setup(false);
    const { addMember } = await addParty(f);
    const down = await addMember("Down", "hp: 0\nhp_max: 30\nthp: 4");
    const hurt = await addMember("Hurt", "hp: 7\nhp_max: 25");
    await addMember("Unselected", "hp: 9\nhp_max: 18");
    f.modal.includeParty = true;
    f.modal.selectedPartyMembers = ["Down", "Hurt"];

    await f.modal.saveEncounter();

    const saved = f.entries.get("z_Encounters/Gate.md") as typeof f.file;
    expect(parseYamlFrontmatter(f.read(saved)).frontmatter.party_members).toMatchObject([
      { name: "Down", note_path: down, hp: 0, hp_max: 30, thp: 4 },
      { name: "Hurt", note_path: hurt, hp: 7, hp_max: 25 },
    ]);
  });

  it("does not overwrite a saved selection if the selected party fails to load during save", async () => {
    const f = await setup(true, original.replace("include_party: false", "include_party: true"));
    const { manager, addMember } = await addParty(f);
    await addMember("Scout", "hp: 9\nhp_max: 18");
    const document = f.read(f.file);
    const resolve = vi.spyOn(manager, "resolveMembers").mockRejectedValue(new Error("party read failed"));

    await f.modal.saveEncounter();

    expect(f.read(f.file)).toBe(document);
    expect(f.process).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();

    resolve.mockRestore();
    await f.modal.saveEncounter();
    expect(f.process).toHaveBeenCalledOnce();
  });

  it.each([
    ["party_members: []", []],
    ["", ["Scout"]],
  ])("preserves the member selection when editing a note with %j", async (selection, expected) => {
    const f = await setup(true, original.replace("include_party: false", "include_party: true")
      .replace("party_members:\n  - name: Scout\n    level: 3", selection));
    const { addMember } = await addParty(f);
    await addMember("Scout", "hp: 9\nhp_max: 18");
    const container = {
      style: {}, empty: vi.fn(), querySelector: () => null,
      createDiv: () => container, createEl: () => container,
    };
    f.modal.partySelectionContainer = container as unknown as HTMLElement;

    await f.modal.renderPartySelection();
    expect(f.modal.selectedPartyMembers).toEqual(expected);
    await f.modal.saveEncounter();
    const rows = parseYamlFrontmatter(f.read(f.file)).frontmatter.party_members as { name: string }[];
    expect(rows.map(row => row.name)).toEqual(expected);
  });
});
