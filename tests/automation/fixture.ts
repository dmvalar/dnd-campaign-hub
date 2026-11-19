import { TFile, TFolder } from "obsidian";
import { vi } from "vitest";
import type DndCampaignHubPlugin from "../../src/main";
import { AgentContentApi } from "../../src/automation/AgentContentApi";
import { MarkerLibrary } from "../../src/marker/MarkerLibrary";
import { PartyManager } from "../../src/party/PartyManager";
import { MapManager } from "../../src/map/MapManager";
import { CombatTracker } from "../../src/combat/CombatTracker";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

export async function authoringFixture() {
  const vault = noteVaultFixture();
  const storage = new Map<string, string>();
  const folders = new Set<string>();
  const revisions = new Map<string, number>();
  let revision = 1;
  const campaignPath = "ttrpgs/Keep";
  vault.addFolder(campaignPath);
  vault.addNote(`${campaignPath}/World.md`, "---\ntype: world\nworld: Forgotten Realms\ncampaign: Keep\nrole: GM\n---\n");
  const image = vault.addNote("Assets/goblin.png", "image bytes");
  Object.assign(image, { extension: "png", basename: "goblin" });
  const getFiles = () => [...vault.entries.values()].filter((entry): entry is TFile => entry instanceof TFile);
  const exists = (path: string) => vault.entries.has(path) || storage.has(path) || folders.has(path);
  const read = async (path: string) => {
    const entry = vault.entries.get(path);
    if (entry instanceof TFile) return vault.read(entry);
    if (storage.has(path)) return storage.get(path)!;
    throw Object.assign(new Error(`ENOENT ${path}`), { code: "ENOENT" });
  };
  const write = vi.fn(async (path: string, content: string) => {
    const entry = vault.entries.get(path);
    if (entry instanceof TFile) vault.write(entry, content);
    else storage.set(path, content);
    revisions.set(path, ++revision);
  });
  const adapterProcess = vi.fn(async (path: string, update: (current: string) => string) => {
    const content = update(await read(path));
    await write(path, content);
    return content;
  });
  Object.assign(vault.app.vault, { configDir: ".custom-obsidian", getFiles, getMarkdownFiles: () => getFiles().filter(file => file.extension === "md") });
  Object.assign(vault.app.vault.adapter, {
    exists: vi.fn(async (path: string) => exists(path)), read: vi.fn(read), write, process: adapterProcess,
    mkdir: vi.fn(async (path: string) => { folders.add(path); }),
    remove: vi.fn(async (path: string) => { storage.delete(path); revisions.set(path, ++revision); }),
    stat: vi.fn(async (path: string) => exists(path) ? { type: folders.has(path) || vault.entries.get(path) instanceof TFolder ? "folder" : "file", mtime: revisions.get(path) ?? 1, ctime: 1, size: Buffer.byteLength(storage.get(path) ?? "") } : null),
    list: vi.fn(async (folder: string) => ({
      files: [...storage.keys()].filter(path => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/")),
      folders: [...folders].filter(path => path.startsWith(`${folder}/`) && !path.slice(folder.length + 1).includes("/")),
    })),
  });
  Object.assign(vault.app.metadataCache, { getFirstLinkpathDest: (path: string) => vault.entries.get(path) ?? vault.entries.get(`${path}.md`) ?? null });
  const markerLibrary = new MarkerLibrary(vault.app, "dnd-campaign-hub");
  const partyManager = new PartyManager(vault.app, "dnd-campaign-hub");
  await markerLibrary.load();
  await partyManager.load();
  const plugin = {
    app: vault.app, manifest: { id: "dnd-campaign-hub", version: "0.15.0-beta.3" },
    markerLibrary, partyManager, mapManager: new MapManager(vault.app), _pendingSaves: new Map(),
    openCombatTracker: vi.fn(), settings: { combatStates: {} }, saveSettings: vi.fn(),
  } as unknown as DndCampaignHubPlugin;
  plugin.combatTracker = new CombatTracker(vault.app, plugin);
  const api = new AgentContentApi(plugin);
  write.mockClear();
  return { ...vault, storage, folders, revisions, writeStorage: write, adapterProcess, plugin, api, campaignPath, image };
}

export const monsterInput = {
  name: "Goblin's Champion",
  statblock: {
    size: "Small", creatureType: "humanoid", subtype: "goblinoid", alignment: "neutral evil",
    ac: 15, hp: 22, hitDice: "5d6 + 5", speed: "30 ft.", stats: [10, 16, 12, 10, 9, 8], cr: "1",
    saves: { dex: 5 }, skillsaves: { stealth: 7, perception: 1 }, senses: "darkvision 60 ft., passive Perception 11",
    traits: [{ name: "Nimble Escape", desc: "Bonus action: Disengage or Hide.\nDoesn't require \"cover\"." }],
    actions: [{ name: "Scimitar", desc: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage." }],
    bonusActions: [{ name: "Command", desc: "An ally can move." }], reactions: [{ name: "Parry", desc: "Add 2 to AC." }],
    legendaryActions: [{ name: "Move", desc: "Move up to half speed." }],
  },
  token: { imagePath: "Assets/goblin.png", imageFit: "contain", backgroundColor: "#112233" },
  description: "A boss: feared by everyone.\n\n```markdown\nA clue\n```",
};

export function fullBatch(campaignPath: string, requestId = "test-adventure", dryRun = false) {
  const ref = (value: string) => ({ $ref: value });
  return { schemaVersion: 1, requestId, campaignPath, dryRun, operations: [
    { id: "npc", type: "create_npc", input: { name: "Elara", motivation: "Wants: the crown\nBut fears the cost", token: { imagePath: "Assets/goblin.png" } } },
    { id: "monster", type: "create_monster", input: monsterInput },
    { id: "adventure", type: "create_adventure", input: { name: "The Keep", problem: "Stop the goblin's coup." } },
    { id: "map", type: "create_map", input: { name: "Keep Battlemap", imagePath: "Assets/goblin.png", width: 1400, height: 700, gridSize: 70 } },
    { id: "scene", type: "create_scene", input: { name: "The Gate", adventurePath: ref("adventure.notePath"), sceneNumber: 1, sceneType: "combat", npcPaths: [ref("npc.notePath")], mapPaths: [ref("map.notePath")] } },
    { id: "encounter", type: "create_encounter", input: { name: "Gate Defense", scenePath: ref("scene.notePath"), creatures: [{ path: ref("monster.notePath"), count: 2, currentHp: 0, thp: 5, initiative: 0 }] } },
    { id: "session", type: "create_session", input: { name: "At the Gates", date: "2026-11-19", adventurePaths: [ref("adventure.notePath")], plannedScenePaths: [ref("scene.notePath")], startingScenePath: ref("scene.notePath") } },
  ] };
}
