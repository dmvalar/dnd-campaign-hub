import { Notice, type TFile } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterBuilder } from "../../src/encounter/EncounterBuilder";
import { SceneCreationModal } from "../../src/scene/SceneCreationModal";
import { readSceneNote } from "../../src/scene/sceneNote";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("../mocks/obsidian")>(),
  Notice: vi.fn(), Setting: class {},
}));

const adventureFolder = "ttrpgs/North/Adventures/The Keep";
const scenePath = `${adventureFolder}/Scenes/Scene 2 - The Gate.md`;
const frontmatter = `---
type: scene
template_version: 2.2.0
adventure: The Keep
campaign: North
world: North
act: 1
scene_number: 2
duration: 30min
scene_type: exploration
difficulty: medium
status: planned
sessions: '[[Session 6]]'
date: 2024-03-21
handouts: ['[[North Gate.png|A note: gate closed]]']
handout_links: ['[[Map #4.png]]']
player_handout: '[[Gate Ledger.pdf]]'
aliases: ['The "West" gate']
custom:
  'keeper: name': 'true'
  hints: ['Wait: #15', '[[Door|Look closer]]']
---
`;
const body = `
# Scene 2: The Gate

**Duration:** 30min | **Type:** exploration | **Difficulty:** medium${"  "}
**Act:** 1 | **Adventure:** [[The Keep]]

## Notes

Read [[Prophecy|the note]].${"  "}

---

Leave the gate open.
`;

async function setup(options: { content?: string; scene?: boolean; adventureName?: string; adventureYaml?: string } = {}) {
  const vault = noteVaultFixture();
  const adventureName = options.adventureName ?? "The Keep";
  const adventure = vault.addNote(`${adventureFolder}/${adventureName}.md`, options.adventureYaml ?? "---\ncampaign: North\nworld: North\n---\n");
  const parent = vault.addFolder(adventureFolder).get(adventureFolder);
  const scenes = vault.addFolder(`${adventureFolder}/Scenes`).get(`${adventureFolder}/Scenes`);
  Object.assign(parent!, { name: adventureName, children: [adventure, scenes] });
  Object.assign(adventure, { parent });
  const file = options.scene === false ? undefined : vault.addNote(scenePath, options.content ?? frontmatter + body);
  if (file) Object.assign(file, { parent: scenes });
  Object.assign(scenes!, { name: "Scenes", children: file ? [file] : [] });

  const openLinkText = vi.fn();
  const modify = vi.fn(async (note: TFile, content: string) => vault.write(note, content));
  Object.assign(vault.app.vault, { rename: vault.renameFile, modify });
  Object.assign(vault.app.workspace, { openLinkText });
  Object.assign(vault.app.metadataCache, {
    getFileCache: (note: TFile) => ({ frontmatter: readSceneNote(vault.read(note)).frontmatter }),
  });

  const partyManager = { generateId: vi.fn(() => "member-id"), buildEncounter: vi.fn(), saveEncounter: vi.fn() };
  const plugin = { partyManager, ensureFolderExists: vi.fn() } as unknown as SceneCreationModal["plugin"];
  const modal = new SceneCreationModal(vault.app, plugin, adventure.path, file?.path);
  const close = vi.fn();
  Object.assign(modal, { app: vault.app, close });
  if (file) await modal.loadSceneData();

  return { ...vault, close, modal, file: file!, openLinkText, modify, partyManager, plugin };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("scene editor frontmatter preservation", () => {
  it("updates generated details against the latest document while preserving non-editable metadata", async () => {
    const f = await setup();
    const latest = (frontmatter + body)
      .replace("status: planned", "status: completed")
      .replace("sessions: '[[Session 6]]'", "sessions: ['[[Session 6]]', '[[Session 7|7: The Gate]]']")
      .replace("'true'", "'false'")
      .replace("Leave the gate open.", "Leave the gate open. The key is under the stone.");
    const process = f.process.getMockImplementation()!;
    f.process.mockImplementationOnce((file, update) => {
      f.write(file, latest);
      return process(file, update);
    });
    f.modal.duration = "45min";
    await f.modal.createSceneFile();

    const prior = readSceneNote(latest);
    const saved = readSceneNote(f.read(f.file));
    expect(saved.frontmatter).toEqual({ ...prior.frontmatter, duration: "45min" });
    expect(saved.body).toBe(prior.body.replace("**Duration:** 30min", "**Duration:** 45min"));
    expect(f.process).toHaveBeenCalledTimes(1);
    expect(f.modify).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.openLinkText).toHaveBeenCalledWith(scenePath, "", true);
  });

  it.each(["\n", "\r\n"])("preserves BOM and authored Markdown with %j line endings", async (lineEnding) => {
    const authored = "\n# Scene 2: The Gate\n\n```markdown\n**Act:** 1 | **Adventure:** [[The Keep]]\n**Duration:** 30min | **Type:** exploration | **Difficulty:** medium\n```\n\n## Player Handout\n![[Letter.png]]  \n\n";
    const f = await setup({ content: "\uFEFF" + (frontmatter + authored).replace(/\n/g, lineEnding) });
    f.modal.act = "2";
    f.modal.duration = "40min";
    await f.modal.createSceneFile();

    const content = f.read(f.file);
    const saved = readSceneNote(content);
    expect(content.startsWith(`\uFEFF---${lineEnding}`)).toBe(true);
    expect(saved.closing).toBe(`---${lineEnding}`);
    expect(saved.body).toBe(authored.replace(/\n/g, lineEnding));
    expect(saved.frontmatter).toMatchObject({ act: 2, duration: "40min" });
    if (lineEnding === "\r\n") expect(content.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("round-trips YAML-special context and legacy names during a rename", async () => {
    const f = await setup({
      adventureName: "# The Keeper's [Seal]",
      adventureYaml: `---\ncampaign: "Kingdom: \\\"North\\\""\nworld: 'The ''Other'' World #1'\n---\n`,
      content: frontmatter.replace("type: scene", "type: exploration\nname: The Gate").replace("scene_type: exploration\n", "") + body,
    });
    f.modal.sceneName = "[Pilot's] #1 $&";
    const newPath = `${adventureFolder}/Scenes/Scene 2 - ${f.modal.sceneName}.md`;
    await f.modal.createSceneFile();

    expect(f.entries.get(newPath)).toBe(f.file);
    expect(f.entries.has(scenePath)).toBe(false);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    const saved = readSceneNote(f.read(f.file));
    expect(saved.frontmatter).toMatchObject({
      type: "exploration", scene_type: "exploration", name: "[Pilot's] #1 $&", adventure: "# The Keeper's [Seal]",
      campaign: 'Kingdom: "North"', world: "The 'Other' World #1", template_version: "2.2.0",
      sessions: "[[Session 6]]", player_handout: "[[Gate Ledger.pdf]]",
    });
    expect(saved.body).toBe(body.replace("# Scene 2: The Gate", () => "# Scene 2: [Pilot's] #1 $&")
      .replace("**Adventure:** [[The Keep]]", "**Adventure:** [[# The Keeper's [Seal]]]"));
  });

  it("preserves hidden encounter fields and leaves absent optional metadata absent", async () => {
    const content = frontmatter.replace("template_version: 2.2.0\n", "").replace("status: planned\n", "")
      .replace("sessions: '[[Session 6]]'\n", "").replace("date: 2024-03-21\n", "")
      .replace("custom:", "encounter_file: '[[Old encounter]]'\nparty_id: legacy-party\ncustom:") + body;
    const f = await setup({ content });
    f.modal.duration = "40min";
    await f.modal.createSceneFile();
    expect(readSceneNote(f.read(f.file)).frontmatter).toEqual({ ...readSceneNote(content).frontmatter, duration: "40min" });
  });

  const encounterContent = frontmatter.replace("scene_type: exploration", "scene_type: combat").replace("custom:", `tracker_encounter: Gate Ambush
encounter_file: '[[Old encounter]]'
encounter_creatures:
  - name: Goblin
    count: 1
    is_hidden: true
    is_friendly: true
    custom: { clue: 'wax: #5' }
encounter_difficulty: { difficulty: Medium, gm_note: 'Wait for signal' }
selected_party_id: party-1
selected_party_members: [Alix]
party_id: legacy-party
custom:`) + body;

  it("clears owned encounter fields on explicit disable while preserving legacy party metadata", async () => {
    const f = await setup({ content: encounterContent });
    f.modal.createEncounter = false;
    await f.modal.createSceneFile();

    expect(readSceneNote(f.read(f.file)).frontmatter).toMatchObject({
      tracker_encounter: "", encounter_file: "", encounter_creatures: [], encounter_difficulty: null,
      selected_party_id: "", selected_party_members: [], party_id: "legacy-party",
    });
  });

  it("preserves untouched combat metadata and does not rebuild the encounter", async () => {
    const f = await setup({ content: encounterContent });
    const saveEncounterFile = vi.spyOn(f.modal, "saveEncounterFile");
    f.modal.duration = "60min";
    await f.modal.createSceneFile();

    expect(readSceneNote(f.read(f.file)).frontmatter).toEqual({ ...readSceneNote(encounterContent).frontmatter, duration: "60min" });
    expect(saveEncounterFile).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
  });

  it("writes edited combat fields and special links with one scene write", async () => {
    const f = await setup({ content: "\uFEFF" + encounterContent.replace(/\n/g, "\r\n") });
    const encounterName = '# [The "Ambush"]: north';
    const encounterPath = `z_Encounters/${encounterName}.md`;
    vi.spyOn(f.modal, "saveEncounterFile").mockResolvedValue(encounterPath);
    vi.spyOn(f.modal, "getPartyForDifficulty").mockResolvedValue([]);
    f.modal.encounterName = encounterName;
    f.modal.includeParty = false;
    f.modal.selectedPartyMembers = [];
    f.modal.creatures[0]!.count = 2;
    f.modal.creatures[0]!.isHidden = false;
    f.modal.creatures[0]!.isFriendly = false;
    const process = f.process.getMockImplementation()!;
    f.process.mockImplementationOnce((file, update) => {
      f.write(file, f.read(file).replace("wax: #5", "chalk: #7"));
      return process(file, update);
    });
    await f.modal.createSceneFile();

    const saved = readSceneNote(f.read(f.file));
    expect(saved.frontmatter).toMatchObject({
      tracker_encounter: encounterName, encounter_file: `[[${encounterPath}]]`,
      selected_party_id: "party-1", selected_party_members: [],
      encounter_creatures: [{ name: "Goblin", count: 2, is_hidden: false, is_friendly: false, custom: { clue: "chalk: #7" } }],
      encounter_difficulty: { enemyCount: 2, gm_note: "Wait for signal" },
    });
    expect(saved.body).toBe(body.replace(/\n/g, "\r\n"));
    expect(f.process).toHaveBeenCalledTimes(1);
    expect(f.modify).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).toHaveBeenCalledTimes(1);
  });

  it("keeps a concurrent encounter list edit when its rows cannot be matched safely", async () => {
    const f = await setup({ content: encounterContent });
    const saveEncounterFile = vi.spyOn(f.modal, "saveEncounterFile");
    const latest = encounterContent.replace("name: Goblin", "name: Kobold");
    f.write(f.file, latest);
    f.modal.creatures[0]!.count = 2;
    await f.modal.createSceneFile();

    expect(f.read(f.file)).toBe(latest);
    expect(saveEncounterFile).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("encounter list changed"));
  });

  it.each(["---\nname: [\n---\nBody", "---\n- name\n---\nBody", "---\nscene\n---\nBody", "---\nname: Missing\n", "Body only"])(
    "rejects malformed or non-mapping scene data without moving the note %j", async (latest) => {
      const f = await setup();
      f.write(f.file, latest);
      f.modal.sceneName = "New Name";
      await f.modal.createSceneFile();

      expect(f.read(f.file)).toBe(latest);
      expect(f.renameFile).not.toHaveBeenCalled();
      expect(f.openLinkText).not.toHaveBeenCalled();
      expect(f.close).not.toHaveBeenCalled();
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Error updating scene"));
    },
  );

  it("validates before writing an edited encounter note", async () => {
    const f = await setup({ content: encounterContent });
    const saveEncounterFile = vi.spyOn(f.modal, "saveEncounterFile");
    f.write(f.file, "---\n- invalid\n---\nBody");
    f.modal.encounterName = "Another Name";
    await f.modal.createSceneFile();

    expect(saveEncounterFile).not.toHaveBeenCalled();
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it("keeps the draft and source note on write failure, then retries the rename", async () => {
    const f = await setup();
    f.modal.sceneName = "Renamed Gate";
    f.process.mockRejectedValueOnce(new Error("injected write failure"));
    await f.modal.createSceneFile();

    expect(f.read(f.file)).toBe(frontmatter + body);
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    expect(f.openLinkText).not.toHaveBeenCalled();

    f.renameFile.mockRejectedValueOnce(new Error("injected rename failure"));
    await f.modal.createSceneFile();
    expect(f.entries.get(scenePath)).toBe(f.file);
    expect(f.close).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining(`Edits were saved to "${scenePath}"`));

    await f.modal.createSceneFile();
    expect(f.entries.has(scenePath)).toBe(false);
    expect(readSceneNote(f.read(f.file)).body).toContain("# Scene 2: Renamed Gate");
    expect(f.close).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("retries a partial rename with the written creature identity (further edits %s)", async (editAgain) => {
    const f = await setup({ content: encounterContent });
    const saveEncounterFile = vi.spyOn(f.modal, "saveEncounterFile").mockResolvedValue("z_Encounters/Gate Ambush.md");
    vi.spyOn(f.modal, "getPartyForDifficulty").mockResolvedValue([]);
    f.modal.sceneName = "Renamed Gate";
    f.modal.includeParty = false;
    f.modal.creatures[0]!.name = "Goblin Leader";
    f.renameFile.mockRejectedValueOnce(new Error("injected rename failure"));
    await f.modal.createSceneFile();

    expect(f.entries.get(scenePath)).toBe(f.file);
    expect(f.partyManager.saveEncounter).not.toHaveBeenCalled();
    f.write(f.file, f.read(f.file).replace("wax: #5", "chalk: #7"));
    if (editAgain) f.modal.creatures[0]!.count = 2;
    await f.modal.createSceneFile();

    expect(f.entries.has(scenePath)).toBe(false);
    expect(readSceneNote(f.read(f.file)).frontmatter.encounter_creatures).toMatchObject([
      { name: "Goblin Leader", count: editAgain ? 2 : 1, custom: { clue: "chalk: #7" } },
    ]);
    expect(saveEncounterFile).toHaveBeenCalledTimes(editAgain ? 2 : 1);
    expect(f.partyManager.saveEncounter).toHaveBeenCalledTimes(1);
  });

  it("still creates a new scene from the current template", async () => {
    const f = await setup({ scene: false });
    f.modal.sceneName = "The Gate";
    f.modal.sceneNumber = "2";
    await f.modal.createSceneFile();

    const saved = readSceneNote(f.read(f.entries.get(scenePath) as TFile));
    expect(saved.frontmatter).toMatchObject({
      type: "scene", scene_number: 2, status: "not-started", sessions: [], adventure: "The Keep",
    });
    expect(saved.body).toContain("# Scene 2: The Gate");
    expect(f.process).not.toHaveBeenCalled();
  });
});

describe("EncounterBuilder scene linking", () => {
  it("links by default and accepts an already-linked scene", async () => {
    const f = await setup();
    const builder = new EncounterBuilder(f.app, f.plugin);
    builder.encounterName = "Gate Ambush";
    builder.includeParty = false;
    builder.creatures = [{ name: "Goblin", count: 1 }];
    await builder.createEncounter(scenePath);
    expect(readSceneNote(f.read(f.file)).frontmatter.tracker_encounter).toBe("Gate Ambush");

    builder.encounterName = "New Ambush";
    await builder.createEncounter(scenePath, false);
    expect(readSceneNote(f.read(f.file)).frontmatter.tracker_encounter).toBe("Gate Ambush");
    expect(f.modify).toHaveBeenCalledTimes(1);
    expect(f.partyManager.saveEncounter).toHaveBeenCalledTimes(2);
  });
});
