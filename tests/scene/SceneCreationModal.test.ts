import { posix } from "node:path";
import { Notice, TFile, type TFolder } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncounterBuilder } from "../../src/encounter/EncounterBuilder";
import { SceneCreationModal } from "../../src/scene/SceneCreationModal";
import { readSceneNote } from "../../src/scene/sceneNote";
import { planSceneRenames, runSceneRenames } from "../../src/scene/sceneRenames";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("../mocks/obsidian")>(),
  Notice: vi.fn(), Setting: class {},
}));

const adventureFolder = "ttrpgs/North/Adventures/The Keep";
const sceneFolder = `${adventureFolder}/Scenes`;
const gatePath = (number: number) => `${sceneFolder}/Scene ${number} - The Gate.md`;
const scenePath = gatePath(2);
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
  const scenes = vault.addFolder(sceneFolder).get(sceneFolder) as TFolder;
  Object.assign(parent!, { name: adventureName, children: [adventure, scenes] });
  Object.assign(adventure, { parent });
  const file = options.scene === false ? undefined : vault.addNote(scenePath, options.content ?? frontmatter + body);
  if (file) Object.assign(file, { parent: scenes });
  Object.assign(scenes, { name: "Scenes", children: file ? [file] : [] });
  const addScene = (path: string, content: string) => {
    const added = vault.addNote(path, content);
    Object.assign(added, { parent: scenes });
    scenes.children.push(added);
    return added;
  };

  const openLinkText = vi.fn();
  const modify = vi.fn(async (note: TFile, content: string) => vault.write(note, content));
  const rawRename = vi.fn();
  Object.assign(vault.app.vault, { cachedRead: vault.app.vault.read, rename: rawRename, modify });
  Object.assign(vault.app.workspace, { openLinkText });
  Object.assign(vault.app.metadataCache, {
    getFileCache: (note: TFile) => ({ frontmatter: readSceneNote(vault.read(note)).frontmatter }),
    getFirstLinkpathDest: (target: string, source: string) => {
      const md = /\.md$/i.test(target) ? target : `${target}.md`;
      const relative = posix.normalize(posix.join(posix.dirname(source), md));
      const candidate = vault.entries.get(target.startsWith(".") ? relative : md)
        ?? (!target.includes("/") ? vault.entries.get(relative) : undefined)
        ?? (!target.includes("/") ? [...vault.entries.values()].find(note => note instanceof TFile && note.name === md) : undefined);
      return candidate instanceof TFile ? candidate : null;
    },
  });

  const partyManager = {
    generateId: vi.fn(() => "member-id"), buildEncounter: vi.fn(), saveEncounter: vi.fn(),
    remapEncounterNotePaths: vi.fn(async (_paths: ReadonlyMap<string, string>) => {}),
  };
  const plugin = { partyManager, ensureFolderExists: vi.fn() } as unknown as SceneCreationModal["plugin"];
  const modal = new SceneCreationModal(vault.app, plugin, adventure.path, file?.path);
  const close = vi.fn();
  Object.assign(modal, { app: vault.app, close });
  if (file) await modal.loadSceneData();

  return { ...vault, addScene, close, modal, file: file!, openLinkText, rawRename, modify, partyManager, plugin };
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

describe("scene rename and insertion", () => {
  it("updates aliased reference fields without changing shared custom anchors", async () => {
    const f = await setup();
    const anchors = `scalar: &gate '[[${scenePath}#Arrival|Gate]]'\nlist: &plan ['[[${scenePath}]]', {path: '${scenePath}', label: Keep}]\nobject: &reference {path: '${scenePath}', label: Keep}\n`;
    const session = f.addNote("Aliased session.md", `---\n${anchors}type: session\nstarting_scene: *gate\nplanned_scenes: *plan # ordered\nending_scene: *reference\ncustom: *plan\n---\n`);
    const prior = readSceneNote(f.read(session)).frontmatter;
    f.modal.sceneName = "North Gate";
    await f.modal.createSceneFile();
    const destination = `${sceneFolder}/Scene 2 - North Gate.md`;
    expect(f.read(session)).toContain(anchors);
    expect(f.read(session)).toContain(" # ordered\n");
    expect(readSceneNote(f.read(session)).frontmatter).toMatchObject({
      custom: prior.custom,
      starting_scene: `[[${destination}#Arrival|Gate]]`,
      planned_scenes: [`[[${destination}]]`, { path: destination, label: "Keep" }],
      ending_scene: { path: destination, label: "Keep" },
    });
  });

  it("preserves heading suffixes and encoded relative Markdown links in owned fields", async () => {
    const f = await setup();
    const session = f.addNote(`${adventureFolder}/Sessions/Session 9.md`, `---
type: session
starting_scene: '${scenePath}#Arrival'
ending_scene: '[The gate](../Scenes/Scene%202%20-%20The%20Gate.md#Arrival)'
---
`);
    f.modal.sceneName = "North Gate";
    await f.modal.createSceneFile();
    expect(readSceneNote(f.read(session)).frontmatter).toMatchObject({
      starting_scene: `${sceneFolder}/Scene 2 - North Gate.md#Arrival`,
      ending_scene: "[The gate](../Scenes/Scene%202%20-%20North%20Gate.md#Arrival)",
    });
  });

  it("preserves linked scene identity with native link updating disabled", async () => {
    const f = await setup();
    const otherScene = "Elsewhere/Scene 2 - The Gate.md";
    f.addNote(otherScene, frontmatter + body);
    const otherSession = f.addNote("Elsewhere/Session 2.md", "---\ntype: session\nstarting_scene: '[[Scene 2 - The Gate]]'\n---\n");
    const sessionContent = `---
type: session
planned_scenes:
  - '[[${scenePath}#Read Aloud|Gate arrival]]' # table order
  - {path: "../Scenes/Scene 2 - The Gate.md", label: Keep this}
  - '[[${otherScene}|Elsewhere]]'
starting_scene: "[[../Scenes/Scene 2 - The Gate#^arrival]]"
ending_scene: ${scenePath}
custom: '[[${scenePath}]]'
---
Keep this authored link as configured in Obsidian: [[${scenePath}]].
`;
    const toCrlf = (value: string) => "\uFEFF" + value.replace(/\n/g, "\r\n");
    const session = f.addNote(`${adventureFolder}/Sessions/Session 1.md`, toCrlf(sessionContent));
    const encounter = f.addNote("z_Encounters/Gate.md", `---\ntype: encounter\nscene_path: '${scenePath}' # keep\ncreatures: [{name: Guard, note_path: '${scenePath}'}]\n---\n`);
    const legacy = f.addNote(`${sceneFolder}/Session legacy.md`, "---\ntype: session\nplanned_scenes: '[[Scene 2 - The Gate|The gate]]'\n---\n");
    const trap = f.addNote(`${sceneFolder}/Gate trap.md`, "---\ntype: trap\nscene: Scene 2 - The Gate\n---\n");
    const otherSessionContent = f.read(otherSession);
    f.modal.sceneName = "North Gate";
    const destination = `${sceneFolder}/Scene 2 - North Gate.md`;
    await f.modal.createSceneFile();

    expect(f.entries.get(destination)).toBe(f.file);
    expect(f.renameFile).toHaveBeenCalledExactlyOnceWith(f.file, destination);
    expect(f.rawRename).not.toHaveBeenCalled();
    expect(f.partyManager.remapEncounterNotePaths).toHaveBeenCalledExactlyOnceWith(new Map([[scenePath, destination]]));
    expect(f.read(session)).toBe(toCrlf(sessionContent
      .replace(`${scenePath}#Read Aloud`, `${destination}#Read Aloud`)
      .replace('path: "../Scenes/Scene 2 - The Gate.md"', 'path: "../Scenes/Scene 2 - North Gate.md"')
      .replace("Scene 2 - The Gate#^arrival", "Scene 2 - North Gate#^arrival")
      .replace(`ending_scene: ${scenePath}`, `ending_scene: "${destination}"`)));
    expect(f.read(otherSession)).toBe(otherSessionContent);
    expect(f.read(encounter)).toContain(`scene_path: '${destination}' # keep\ncreatures: [{name: Guard, note_path: '${scenePath}'}]`);
    expect(readSceneNote(f.read(legacy)).frontmatter.planned_scenes).toBe(`[[${destination.slice(0, -3)}|The gate]]`);
    expect(readSceneNote(f.read(trap)).frontmatter.scene).toBe(destination.slice(0, -3));
  });

  async function insertion() {
    const f = await setup({ scene: false });
    const paths = [2, 3, 4, 5].map(gatePath);
    const start = [2, 3, 4].map(number => {
      const content = frontmatter.replace("scene_number: 2", `scene_number: ${number} # order`)
        + (number === 3 ? "# Scene 3: Author's own heading\n" + body : body.replace("# Scene 2", `# Scene ${number}`));
      return "\uFEFF" + content.replace(/\n/g, "\r\n");
    });
    const files = start.map((content, index) => f.addScene(paths[index]!, content));
    const sessionContent = `---\ntype: session\nplanned_scenes: ['[[${paths[0]}]]', '[[${paths[1]}]]', '[[${paths[2]}]]']\nending_scene: "${paths[2]}"\n---\n`;
    const session = f.addNote("Session 5.md", sessionContent);
    f.modal.sceneNumber = "2";
    f.modal.sceneName = "The Gate";
    return { ...f, paths, files, start, session, sessionContent };
  }

  it("moves each link once when inserting a new scene reuses old paths", async () => {
    const f = await insertion();
    const adventure = f.entries.get(`${adventureFolder}/The Keep.md`) as TFile;
    f.write(adventure, f.read(adventure) + `\nLater: [[${f.paths[2]}|last gate]].\n`);
    const rename = f.renameFile.getMockImplementation()!;
    // Represent edits made by the platform before its rename promise resolves.
    f.renameFile.mockImplementationOnce(async (file, destination) => {
      const old = file.path;
      await rename(file, destination);
      f.write(adventure, f.read(adventure).replace(old, destination));
      f.write(f.session, f.read(f.session).replace(`[[${old}]]`, `[[${destination}]]`));
    });
    await f.modal.createSceneFile();

    expect(f.renameFile.mock.calls.map(([, destination]) => destination)).toEqual([f.paths[3], f.paths[2], f.paths[1]]);
    expect(f.rawRename).not.toHaveBeenCalled();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.entries.get(f.paths[0]!)).not.toBe(f.files[0]);
    f.files.forEach((file, index) => {
      expect(f.entries.get(f.paths[index + 1]!)).toBe(file);
      const content = f.start[index]!.replace(`scene_number: ${index + 2}`, `scene_number: ${index + 3}`);
      expect(f.read(file)).toBe(index === 1 ? content : content.replace(`# Scene ${index + 2}`, `# Scene ${index + 3}`));
    });
    expect(readSceneNote(f.read(f.session)).frontmatter).toMatchObject({
      planned_scenes: f.paths.slice(1).map(path => `[[${path}]]`), ending_scene: f.paths[3],
    });
    expect(f.read(adventure)).toContain(`Later: [[${f.paths[3]}|last gate]].`);
    expect(f.partyManager.remapEncounterNotePaths).toHaveBeenCalledExactlyOnceWith(
      new Map(f.paths.slice(0, 3).map((path, index) => [path, f.paths[index + 1]])),
    );
  });

  it("rejects an occupied destination before changing any note", async () => {
    const f = await insertion();
    f.addFolder(f.paths[3]!);
    await f.modal.createSceneFile();

    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.process).not.toHaveBeenCalled();
    expect(f.partyManager.remapEncounterNotePaths).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining(`already exists at "${f.paths[3]}"`));
  });

  it("repairs references added before a later move in the batch", async () => {
    const f = await insertion();
    const rename = f.renameFile.getMockImplementation()!;
    let lateSession: TFile | undefined;
    f.renameFile.mockImplementationOnce(async (file, destination) => {
      await rename(file, destination);
      lateSession = f.addNote("Late Session.md", `---\ntype: session\nstarting_scene: '[[${f.paths[1]}]]'\n---\n`);
    });
    await f.modal.createSceneFile();
    expect(readSceneNote(f.read(lateSession!)).frontmatter.starting_scene).toBe(`[[${f.paths[2]}]]`);
  });

  it("rejects duplicate sources and cyclic destinations before mutations", async () => {
    const f = await setup();
    const another = f.addScene(gatePath(3), frontmatter.replace("scene_number: 2", "scene_number: 3") + body);
    await expect(planSceneRenames(f.app, [
      { file: f.file, from: scenePath, to: gatePath(3) },
      { file: f.file, from: scenePath, to: gatePath(4) },
    ])).rejects.toThrow("moved twice");
    await expect(planSceneRenames(f.app, [
      { file: f.file, from: scenePath, to: gatePath(3) },
      { file: another, from: gatePath(3), to: scenePath },
    ])).rejects.toThrow("conflicting destinations");
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.process).not.toHaveBeenCalled();
  });

  it.each([
    ["type: scene\nscene_number: '2' # order\ncustom: [A, B]\n", "type: scene\nscene_number: 3 # order\ncustom: [A, B]\n"],
    ["type: scene\ncustom: [A, B]\n", "type: scene\ncustom: [A, B]\nscene_number: 3\n"],
    ["{type: scene, custom: [A, B]}\n", "{type: scene, custom: [A, B], scene_number: 3}\n"],
  ])("renumbers legacy YAML while preserving unrelated bytes (%s)", async (yaml, expected) => {
    const makeNote = (fm: string, number: number) => `\uFEFF---\r\n${fm.replace(/\n/g, "\r\n")}---\r\n\r\n# Scene ${number}: The Gate\r\n\r\nKeep [[Session 1]].\r\n`;
    const f = await setup({ content: makeNote(yaml, 2) });
    const plan = await planSceneRenames(f.app, [{ file: f.file, from: scenePath, to: gatePath(3), number: 3 }]);
    await runSceneRenames(f.app, plan, f.partyManager.remapEncounterNotePaths);
    expect(f.read(f.file)).toBe(makeNote(expected, 3));
  });

  it("restores identity when a platform rename moves a file and then rejects", async () => {
    const f = await setup();
    const rename = f.renameFile.getMockImplementation()!;
    f.renameFile.mockImplementationOnce(async (file, destination) => {
      await rename(file, destination);
      throw new Error("Native link update failed");
    });
    f.modal.sceneName = "North Gate";
    await f.modal.createSceneFile();
    expect(f.entries.get(scenePath)).toBe(f.file);
    expect(f.file.path).toBe(scenePath);
    expect(f.renameFile).toHaveBeenCalledTimes(2);
    expect(f.partyManager.remapEncounterNotePaths).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it("retains concurrent authored edits when rollback cannot restore all note bytes", async () => {
    const f = await insertion();
    const rename = f.renameFile.getMockImplementation()!;
    f.renameFile.mockImplementationOnce(rename).mockImplementationOnce(async () => {
      f.write(f.files[2]!, f.read(f.files[2]!) + "\r\nA concurrent GM note.\r\n");
      throw new Error("Second move failed");
    });
    await f.modal.createSceneFile();
    expect(f.read(f.files[2]!)).toContain("A concurrent GM note.");
    expect(f.entries.get(f.paths[2]!)).toBe(f.files[2]);
    expect(f.create).not.toHaveBeenCalled();
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining("Could not fully restore"));
  });

  it.each(["rename", "number write", "reference write", "stored path write", "scene creation"])(
    "restores shifted scenes and references after a failure during %s, then retries",
    async stage => {
      const f = await insertion();
      if (stage === "rename") {
        const rename = f.renameFile.getMockImplementation()!;
        f.renameFile.mockImplementationOnce(rename).mockRejectedValueOnce(new Error("move failed"));
      } else if (stage === "number write" || stage === "reference write") {
        const process = f.process.getMockImplementation()!;
        f.process.mockImplementationOnce(process);
        if (stage === "number write") f.process.mockImplementationOnce(process);
        f.process.mockRejectedValueOnce(new Error("write failed"));
      } else if (stage === "stored path write") {
        f.partyManager.remapEncounterNotePaths.mockRejectedValueOnce(new Error("stored path write failed"));
      } else {
        f.create.mockRejectedValueOnce(new Error("scene create failed"));
      }
      await f.modal.createSceneFile();

      expect(f.entries.has(f.paths[3]!)).toBe(false);
      f.files.forEach((file, index) => {
        expect(f.entries.get(f.paths[index]!)).toBe(file);
        expect(f.read(file)).toBe(f.start[index]);
      });
      expect(f.read(f.session)).toBe(f.sessionContent);
      expect(f.openLinkText).not.toHaveBeenCalled();
      expect(f.close).not.toHaveBeenCalled();
      if (stage === "scene creation") {
        expect(f.partyManager.remapEncounterNotePaths).toHaveBeenNthCalledWith(2,
          new Map(f.paths.slice(1).map((path, index) => [path, f.paths[index]])));
      }

      await f.modal.createSceneFile();
      f.files.forEach((file, index) => expect(f.entries.get(f.paths[index + 1]!)).toBe(file));
      expect(f.close).toHaveBeenCalledTimes(1);
    },
  );
});
