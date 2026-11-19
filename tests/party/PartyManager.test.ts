import { TFile, type App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { PartyManager } from "../../src/party/PartyManager";

const first = "Adventures/Scenes/Scene 1 - Travel.md";
const second = "Adventures/Scenes/Scene 2 - Travel.md";
const third = "Adventures/Scenes/Scene 3 - Travel.md";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function setup() {
  const encounter = (name: string, notePath: string) => ({
    name, notePath, creatures: [{ name: "Scout", notePath: first, currentHP: 7 }],
    started: true, round: 3, custom: { secret: "keep" },
  });
  const data = {
    version: "1.0.0", defaultPartyId: "party-1", rollPlayerInitiatives: 2,
    parties: [{ id: "party-1", name: "Scouts", members: [{ name: "Scout", notePath: first }], createdAt: "2026-11-18" }],
    encounters: { A: encounter("A", first), B: encounter("B", second), Other: encounter("Other", "Other/Scene 1 - Travel.md") },
  };
  let saved = JSON.stringify(data);
  const adapter = {
    exists: vi.fn(async () => true), read: vi.fn(async () => saved),
    write: vi.fn(async (_path: string, content: string) => { saved = content; }),
  };
  const manager = new PartyManager({ vault: { adapter } } as unknown as App, "dnd-campaign-hub");
  await manager.load();
  const listener = vi.fn();
  manager.onChange(listener);
  return { manager, adapter, listener, data, saved: () => JSON.parse(saved) };
}

describe("PartyManager scene path reconciliation", () => {
  it("applies path chains once and preserves other encounter, combatant and party data", async () => {
    const f = await setup();
    const original = f.manager.getEncounter("A");
    await f.manager.remapEncounterNotePaths(new Map([[first, second], [second, third]]));

    expect(f.saved()).toEqual({ ...f.data, encounters: {
      ...f.data.encounters,
      A: { ...f.data.encounters.A, notePath: second },
      B: { ...f.data.encounters.B, notePath: third },
    } });
    expect(f.manager.getEncounter("A")).toBe(original);
    expect(original?.notePath).toBe(second);
    expect(f.manager.getEncounter("B")?.notePath).toBe(third);
    expect(f.manager.getEncounter("A")?.creatures[0]?.notePath).toBe(first);
    expect(f.adapter.write).toHaveBeenCalledTimes(1);
    expect(f.listener).toHaveBeenCalledTimes(1);
  });

  it("leaves memory unchanged on persistence failure and permits retry", async () => {
    const f = await setup();
    const original = structuredClone(f.manager.getAllEncounters());
    const paths = new Map([[first, third]]);
    f.adapter.write.mockRejectedValueOnce(new Error("Injected save failure"));
    await expect(f.manager.remapEncounterNotePaths(paths)).rejects.toThrow("Injected save failure");
    expect(f.manager.getAllEncounters()).toEqual(original);
    expect(f.saved()).toEqual(f.data);
    expect(f.listener).not.toHaveBeenCalled();

    await f.manager.remapEncounterNotePaths(paths);
    expect(f.manager.getEncounter("A")?.notePath).toBe(third);
    expect(f.saved().encounters.A.notePath).toBe(third);
    expect(f.listener).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent saves and keeps intervening encounter edits", async () => {
    const f = await setup();
    const started = deferred();
    const finish = deferred();
    const write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementationOnce(async (path, content) => {
      started.resolve();
      await finish.promise;
      await write(path, content);
    });
    const remap = f.manager.remapEncounterNotePaths(new Map([[first, third]]));
    await started.promise;
    const edit = f.manager.saveEncounter("A", { ...f.manager.getEncounter("A")!, round: 8 });
    expect(f.adapter.write).toHaveBeenCalledTimes(1);
    expect(f.manager.getEncounter("A")?.notePath).toBe(first);
    finish.resolve();
    await Promise.all([remap, edit]);

    expect(f.adapter.write).toHaveBeenCalledTimes(2);
    expect(f.manager.getEncounter("A")).toMatchObject({ round: 8, notePath: third });
    expect(f.saved().encounters.A).toMatchObject({ round: 8, notePath: third });
  });

  it("does not write or notify for mappings with no matching source paths", async () => {
    const f = await setup();
    await f.manager.remapEncounterNotePaths(new Map());
    await f.manager.remapEncounterNotePaths(new Map([["Unrelated.md", third], [first, first]]));
    expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.listener).not.toHaveBeenCalled();
  });
});

describe("PartyManager live HP", () => {
  it.each([
    ["hp: 0\nhp_max: 28\nthp: 5", { hp: 0, maxHp: 28, thp: 5 }],
    ["hp: '0'\nhp_max: '28'\nthp: '0'", { hp: 0, maxHp: 28, thp: 0 }],
    ["hp_max: 28", { hp: 28, maxHp: 28, thp: 0 }],
    ["hp: \nhp_max: 28\nthp: false", { hp: 28, maxHp: 28, thp: 0 }],
    ["hp: invalid\nhp_max: 28\nthp: 4xyz", { hp: 28, maxHp: 28, thp: 0 }],
    ["hp: 7\nhp_max: -1\nthp: -2", { hp: 7, maxHp: 7, thp: 0 }],
    ["hp: 31\nhp_max: 28\nthp: 35", { hp: 28, maxHp: 28, thp: 35 }],
    ["hp: -3\nhp_max: 28", { hp: 0, maxHp: 28, thp: 0 }],
    ["hp: 0\nhp_max: 0", { hp: 0, maxHp: 0, thp: 0 }],
    ["hp: true\nhp_max: ' '\nthp: 2.5", { hp: 0, maxHp: 0, thp: 0 }],
  ])("resolves bounded HP for %j", async (fields, expected) => {
    const path = "Party/Scout.md";
    const file = Object.assign(new TFile(), { path, basename: "Scout" });
    const vault = {
      getAbstractFileByPath: (notePath: string) => notePath === path ? file : null,
      read: async () => `---\ntype: player\n${fields}\n---\n`,
    };
    const manager = new PartyManager({ vault } as unknown as App, "dnd-campaign-hub");

    expect(await manager.resolveMemberFromNote(path)).toMatchObject(expected);
  });
});
