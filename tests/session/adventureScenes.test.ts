import { TFile, TFolder, stringifyYaml, type WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { getAdventureScenes } from "../../src/session/adventureScenes";
import { EndSessionModal } from "../../src/session/EndSessionModal";
import { SessionCreationModal } from "../../src/session/SessionCreationModal";
import { SessionPrepDashboardView } from "../../src/session/SessionPrepDashboardView";
import { SessionRunDashboardView } from "../../src/session/SessionRunDashboardView";
import { parseYamlFrontmatter } from "../../src/utils/YamlFrontmatter";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("../mocks/obsidian")>(),
  Modal: class {
    contentEl = {
      empty() {},
      createEl: () => ({}),
      createDiv: () => ({ createEl: () => ({}) }),
    };
    constructor(readonly app: unknown) {}
  },
  ItemView: class {
    constructor(leaf: { app: unknown }) { Object.assign(this, leaf); }
  },
  Setting: class {
    setName() { return this; }
    setDesc() { return this; }
    addDropdown() { return this; }
  },
}));

vi.mock("../../src/utils/ConfirmModal", () => ({
  ConfirmModal: class {
    constructor(_app: unknown, readonly title: string, _message: string, readonly finish: (value: boolean) => void) {}
    open() { this.finish(this.title === "Update Scene Statuses?"); }
  },
}));

function fixture() {
  const vault = noteVaultFixture();
  const north = "ttrpgs/North";
  const south = "ttrpgs/South";
  const roots = { north: `${north}/Adventures`, south: `${south}/Adventures` };
  const document = (frontmatter: Record<string, unknown>) => `---\n${stringifyYaml(frontmatter)}---\n\n## Notes\n\nKeep these notes.\n`;
  const note = (path: string, fields: Record<string, unknown>) => vault.addNote(path, document(fields));
  // Resolve ambiguous bare links globally in the mock to exercise local disambiguation.
  const foreignAdventure = note(`${roots.south}/The Keep.md`, { type: "adventure", campaign: "South" });
  const adventure = note(`${roots.north}/The Keep.md`, { type: "adventure", campaign: "North" });
  const sibling = note(`${roots.north}/Caves/Caves.md`, { type: "adventure", campaign: "North" });
  const northWorld = note(`${north}/World.md`, { type: "world" });
  const southWorld = note(`${south}/World.md`, { type: "world" });
  const scene = (path: string, fields: Record<string, unknown> = {}) => note(path, { type: "scene", status: "not-started", ...fields });
  const foreignScene = scene(`${roots.south}/The Keep - Scenes/Scene 1 - South.md`, { adventure: "The Keep", campaign: "South" });
  const copied = scene(`${roots.south}/The Keep - Scenes/Scene 2 - Copied.md`, { adventure: adventure.path, campaign: "North" });
  const direct = scene(`${roots.north}/Scene 2 - Direct.md`, { adventure: "The Keep" });
  const local = scene(`${roots.north}/The Keep - Scenes/Scene 1 - Legacy.md`);
  const start = scene(`${roots.north}/The Keep/Scenes/Scene 4 - Start.md`, {
    adventure: { path: `${adventure.path}#Summary` }, campaign: `[[${northWorld.path}#Summary|North]]`, goal: "Open the gate",
  });
  const badAdventure = scene(`${roots.north}/The Keep - Scenes/Scene 3 - Wrong Adventure.md`, { adventure: `[[${sibling.path}#Summary|Caves]]` });
  const badCampaign = scene(`${roots.north}/The Keep - Scenes/Scene 3 - Wrong Campaign.md`, { campaign: { path: southWorld.path } });
  const unresolved = scene(`${roots.north}/The Keep - Scenes/Scene 3 - Missing Adventure.md`, { adventure: `${roots.north}/Missing.md` });
  const cave = scene(`${roots.north}/Caves/Act 1/Scene 1 - Cave.md`);
  const ambiguous = scene(`${roots.north}/Act 1/Scene 3 - Ambiguous.md`);
  const session = note(`${north}/Sessions/Session 1.md`, {
    type: "session", adventure: "The Keep", status: "planned",
  });

  const folder = (path: string, children: Array<TFile | TFolder>) => Object.assign(vault.addFolder(path).get(path) as TFolder, {
    name: path.split("/").pop(), children,
  });
  folder(`${north}/Sessions`, [session]);
  const caves = folder(`${roots.north}/Caves`, [sibling]);
  folder(roots.north, [adventure, caves]);
  const modify = vi.fn(async (file: TFile, next: string) => vault.write(file, next));
  Object.assign(vault.app.vault, { modify, cachedRead: vault.app.vault.read });
  Object.assign(vault.app.metadataCache, {
    getFirstLinkpathDest: (link: string) => {
      const withExtension = /\.md$/i.test(link) ? link : `${link}.md`;
      return vault.entries.get(withExtension)
        ?? vault.app.vault.getMarkdownFiles().find(file => file.name === withExtension) ?? null;
    },
  });
  const plugin = {
    getActiveCampaignPath: () => north,
    resolveCampaign: () => south,
    partyManager: {
      getParty: () => undefined, getPartiesForCampaign: () => [], resolveParty: () => undefined, resolvePartyForNote: () => undefined,
    },
  } as unknown as SessionCreationModal["plugin"];
  const leaf = { app: vault.app } as unknown as WorkspaceLeaf;
  const creation = new SessionCreationModal(vault.app, plugin, adventure.path, north);
  const prep = new SessionPrepDashboardView(leaf, plugin);
  const run = new SessionRunDashboardView(leaf, plugin);
  run.currentSessionFile = session;
  const end = new EndSessionModal(vault.app, plugin, session);
  const setSession = (fields: Record<string, unknown>) => vault.write(session, document({ type: "session", status: "planned", ...fields }));
  const status = (file: TFile) => parseYamlFrontmatter(vault.read(file)).frontmatter.status;
  return {
    ...vault, north, roots, adventure, sibling, foreignAdventure, foreignScene, copied, direct, local, start,
    badCampaign, badAdventure, unresolved, ambiguous, cave, session, creation, prep, run, end, setSession, modify, status, note, scene,
  };
}

describe("adventure scene membership", () => {
  it("keeps both adventure layouts scoped across the helper, session builder, prep and run", async () => {
    const f = fixture();
    const paths = [f.local.path, f.direct.path, f.start.path];
    expect(getAdventureScenes(f.app, f.adventure).map(scene => scene.file.path)).toEqual(paths);
    expect((await f.creation.getAllScenesForAdventure("[[The Keep#Overview|Keep]]")).map(scene => scene.path)).toEqual(paths);
    expect((await f.prep.getScenesForAdventure(f.adventure.path)).map(scene => scene.path)).toEqual(paths);
    expect((await f.run.getScenesForAdventure(f.adventure.path)).map(scene => scene.path)).toEqual(paths);
    expect(getAdventureScenes(f.app, f.sibling).map(scene => scene.file.path)).toEqual([f.cave.path, f.badAdventure.path]);
    expect(await f.run.getScenesForAdventure(f.foreignAdventure.path)).toEqual([]);
  });

  it("includes unambiguous root and Act scenes while excluding unrelated subfolders", () => {
    const f = fixture();
    const adventure = f.note("ttrpgs/West/Adventures/The Vault.md", { type: "adventure" });
    const root = f.scene("ttrpgs/West/Adventures/Scene 1 - Root.md");
    const act = f.scene("ttrpgs/West/Adventures/Act 2/Scene 2 - Act.md");
    f.scene("ttrpgs/West/Adventures/Other/Scene 3 - Unrelated.md");
    expect(getAdventureScenes(f.app, adventure).map(scene => scene.file)).toEqual([root, act]);
  });

  it("revalidates the start status batch and writes only scenes from the selected adventure", async () => {
    const f = fixture();
    await f.creation.handleStartingSceneUpdate(f.start.path, f.session.path);
    expect(f.modify.mock.calls.map(([file]) => file)).toEqual([f.start, f.local, f.direct, f.start]);
    expect([f.status(f.local), f.status(f.direct), f.status(f.start)]).toEqual(["completed", "completed", "in-progress"]);
    expect(f.status(f.badAdventure)).toBe("not-started");
    expect(f.status(f.foreignScene)).toBe("not-started");
  });

  it("ends a session through its own campaign even when another campaign is active", async () => {
    const f = fixture();
    f.setSession({ adventures: [{ path: "The Keep" }, `[[${f.foreignAdventure.path}|Foreign]]`] });
    await f.end.onOpen();
    expect(f.end.scenes.map(scene => scene.path)).toEqual([f.local.path, f.direct.path, f.start.path]);
    await f.end.saveEndingScene(f.adventure.path);
    expect(f.status(f.session)).toBe("completed");
    expect(f.modify.mock.calls.map(([file]) => file)).toEqual([f.session, f.start, f.local, f.direct, f.start]);
    expect([f.status(f.local), f.status(f.direct), f.status(f.start)]).toEqual(["completed", "completed", "in-progress"]);
    expect(f.status(f.foreignScene)).toBe("not-started");
  });

  it("rechecks a captured status batch after a scene moves to another adventure", async () => {
    const f = fixture();
    const captured = await f.creation.getAllScenesForAdventure(f.adventure.path);
    f.write(f.direct, f.read(f.direct).replace("adventure: The Keep", "adventure: Caves"));
    captured.splice(1, 0, { path: f.foreignScene.path, name: f.foreignScene.basename, sceneNumber: 1, status: "not-started" });

    await f.creation.updateSceneStatusesFromStartingScene(captured, captured.length - 1);

    expect(f.modify.mock.calls.map(([file]) => file)).toEqual([f.local, f.start]);
    expect(f.status(f.direct)).toBe("not-started");
    expect(f.status(f.foreignScene)).toBe("not-started");
  });

  it("rejects an ending scene reassigned after the picker was opened", async () => {
    const f = fixture();
    await f.end.onOpen();
    f.write(f.start, f.read(f.start).replace(f.adventure.path, f.sibling.path));

    await f.end.saveEndingScene(f.adventure.path);

    expect(f.modify).not.toHaveBeenCalled();
    expect(f.status(f.session)).toBe("planned");
  });

  it("applies explicit scene-plan order only to members of the session's adventures", async () => {
    const f = fixture();
    f.setSession({
      adventures: ["[[The Keep#Summary|Keep]]"],
      planned_scenes: [f.foreignScene.path, f.cave.path, { path: f.start.path }, `[[${f.direct.path}#Notes|Direct]]`],
    });
    expect((await f.prep["getReadinessData"]()).nextScenePath).toBe(f.start.path);
    const live = await f.run["getLiveSceneContext"]();
    expect(live.current?.path).toBe(f.start.path);
    expect(live.next?.path).toBe(f.direct.path);
    for (const file of [f.foreignScene, f.cave, f.local, f.start]) await f.run.markSceneComplete(file.path);
    expect(f.modify.mock.calls.map(([file]) => file)).toEqual([f.start]);
    expect(f.status(f.start)).toBe("completed");
  });

  it("preserves the absent-link fallback but rejects explicit invalid links and an entirely foreign plan", async () => {
    const f = fixture();
    f.setSession({});
    expect((await f.run.getSessionAdventures()).map(adventure => adventure.path)).toEqual([f.adventure.path, f.sibling.path]);
    f.setSession({ adventure: f.foreignAdventure.path, planned_scenes: [f.local.path] });
    expect(await f.run.getSessionAdventures()).toEqual([]);
    await f.run.markSceneComplete(f.local.path);
    f.setSession({ adventure: "The Keep", planned_scenes: [f.foreignScene.path] });
    expect((await f.run["getLiveSceneContext"]()).current).toBeNull();
    expect((await f.prep["getReadinessData"]()).hasScenes).toBe(false);
    await f.run.markSceneComplete(f.foreignScene.path);
    expect(f.modify).not.toHaveBeenCalled();
  });
});
