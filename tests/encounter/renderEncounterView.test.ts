import { type TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { CombatTracker } from "../../src/combat/CombatTracker";
import { startEncounterFromFile } from "../../src/encounter/renderEncounterView";
import { PartyManager } from "../../src/party/PartyManager";
import { noteVaultFixture } from "./noteVaultFixture";

const encounterPath = "Keep/Encounters/Gate.md";

async function setup() {
  const vault = noteVaultFixture();
  Object.assign(vault.app.vault.adapter, { write: vi.fn() });
  const partyManager = new PartyManager(vault.app, "dnd-campaign-hub");
  const party = await partyManager.createParty("Keepers");
  const openCombatTracker = vi.fn();
  const plugin = { app: vault.app, partyManager, openCombatTracker } as unknown as Parameters<typeof startEncounterFromFile>[0];
  const tracker = new CombatTracker(vault.app, plugin);
  Object.assign(plugin, { combatTracker: tracker });

  const addPc = async (name: string, fields: string) => {
    const path = `Keep/Party/${name}.md`;
    const file = vault.addNote(path, `---\ntype: player\nname: ${name}\n${fields}\n---\n# ${name}\n\nGM notes\n`);
    await partyManager.addMember(party.id, path, name);
    return file;
  };
  const launch = async (fields: string, partyId = party.id) => {
    const file = vault.addNote(encounterPath, [
      "---", "type: encounter", "name: Gate", `selected_party_id: ${partyId}`,
      "creatures: [{ name: Goblin, hp: 7 }]", fields, "---", "# Gate", "",
    ].join("\n"));
    await startEncounterFromFile(plugin, file);
    return tracker.getState()!.combatants.filter(member => member.player);
  };

  return { ...vault, tracker, partyManager, party, openCombatTracker, addPc, launch };
}

describe("starting a saved encounter", () => {
  it("uses live wounded and zero-HP PC stats and syncs only current and temporary HP back", async () => {
    const f = await setup();
    const down = await f.addPc("Down", "hp: 18\nhp_max: 18\nthp: 7\nlevel: 2\nac: 11\ninit_bonus: -1\ntoken_id: old-down");
    const hurt = await f.addPc("Hurt", "hp: 24\nhp_max: 24\nthp: 1\ntoken_id: old-hurt");
    await f.addPc("Unselected", "hp: 12\nhp_max: 12");

    const getFileCache = f.app.metadataCache.getFileCache.bind(f.app.metadataCache);
    const stalePcCache = new Map([down, hurt].map(file => [file, getFileCache(file)]));
    vi.spyOn(f.app.metadataCache, "getFileCache").mockImplementation((file: TFile) => stalePcCache.get(file) ?? getFileCache(file));
    const downLive = f.read(down).replace("name: Down", "name: Renamed")
      .replace("hp: 18\nhp_max: 18\nthp: 7\nlevel: 2\nac: 11\ninit_bonus: -1\ntoken_id: old-down",
        "hp: 0 # current\nhp_max: 30\nthp: 0\nlevel: 5\nac: 17\ninit_bonus: '+3'\ntoken_id: new-down");
    const hurtLive = f.read(hurt).replace("hp: 24\nhp_max: 24\nthp: 1\ntoken_id: old-hurt",
      "hp: 9\nhp_max: 36\nthp: 6 # temporary\nlevel: 6\nac: 16\ninit_bonus: -2\ncustom: { hp: 51, thp: 25 }");
    f.write(down, downLive);
    f.write(hurt, hurtLive);

    const pcs = await f.launch(`party_members:
  - { name: Down, note_path: ${down.path}, hp: 18, thp: 7, ac: 11, level: 2, init_bonus: -1, token_id: old-down }
  - { name: Hurt, note_path: ${hurt.path}, hp: 24, hp_max: 24, thp: 1, token_id: old-hurt }`);

    expect(pcs).toMatchObject([
      { name: "Renamed", notePath: down.path, currentHP: 0, maxHP: 30, tempHP: 0, currentAC: 17, modifier: 3, level: 5, tokenId: "new-down" },
      { name: "Hurt", notePath: hurt.path, currentHP: 9, maxHP: 36, tempHP: 6, currentAC: 16, modifier: -2, level: 6, tokenId: undefined },
    ]);
    expect(f.tracker.getState()).toMatchObject({ encounterPath, encounterName: "Gate" });
    expect(f.openCombatTracker).toHaveBeenCalledOnce();

    f.tracker.setHP(pcs[1]!.id, 5);
    f.tracker.setTempHP(pcs[1]!.id, 0);
    expect(await f.tracker.syncSelectedPCsToNotes(pcs.map(pc => pc.id))).toEqual({ synced: 2, failed: 0 });
    expect(f.read(down)).toBe(downLive);
    expect(f.read(hurt)).toBe(hurtLive.replace("hp: 9", "hp: 5").replace("thp: 6", "thp: 0"));
  });

  it("uses saved stats for unavailable or unlinked notes with no writable note path", async () => {
    const f = await setup();
    await f.addPc("Unlinked", "hp: 25\nhp_max: 25");
    const malformed = f.addNote("Keep/Party/Malformed.md", "---\nhp: [\n---\n");
    const invalid = f.addNote("Keep/Party/Invalid.md", "---\n- hp: 25\n---\n");
    const unreadable = await f.addPc("Unreadable", "hp: 21\nhp_max: 21");
    vi.mocked(f.app.vault.read).mockImplementation(async file => {
      if (file === unreadable) throw new Error("Injected note read failure");
      return f.read(file);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pcs = await f.launch(`party_members:
  - { name: Missing, note_path: Keep/Party/Missing.md, hp: 0, hp_max: 35, thp: 2, level: 3 }
  - { name: Malformed, note_path: ${malformed.path}, hp: 13, token_id: snapshot-token }
  - { name: Invalid, note_path: ${invalid.path}, hp: 7, hp_max: 18 }
  - { name: Unreadable, note_path: ${unreadable.path}, hp: 3, hp_max: 20 }
  - { name: Unlinked, hp: 4, hp_max: 14, thp: 1, ac: 15, init_bonus: 2 }
  - invalid row`);

      expect(pcs).toMatchObject([
        { name: "Missing", currentHP: 0, maxHP: 35, tempHP: 2, level: 3, notePath: undefined },
        { name: "Malformed", currentHP: 13, maxHP: 13, tokenId: "snapshot-token", notePath: undefined },
        { name: "Invalid", currentHP: 7, maxHP: 18, notePath: undefined },
        { name: "Unreadable", currentHP: 3, maxHP: 20, notePath: undefined },
        { name: "Unlinked", currentHP: 4, maxHP: 14, tempHP: 1, currentAC: 15, modifier: 2, notePath: undefined },
      ]);
      expect(await f.tracker.syncSelectedPCsToNotes(pcs.map(pc => pc.id))).toEqual({ synced: 0, failed: 0 });
      expect(f.process).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("does not restore absent or disabled PCs or add other party members", async () => {
    const f = await setup();
    const disabled = await f.addPc("Disabled", "hp: 22\nenabled: false");
    const absent = await f.addPc("Absent", "hp: 24");
    await f.partyManager.setMemberAbsent(f.party.id, absent.path, true);
    const absentMissingPath = "Keep/Party/Absent Missing.md";
    await f.partyManager.addMember(f.party.id, absentMissingPath, "Absent missing");
    await f.partyManager.setMemberAbsent(f.party.id, absentMissingPath, true);
    await f.addPc("Alternate", "hp: 18");

    expect(await f.launch(`party_members:
  - { name: Disabled, note_path: ${disabled.path}, hp: 22 }
  - { name: Absent, note_path: ${absent.path}, hp: 24 }
  - { name: Absent missing, note_path: ${absentMissingPath}, hp: 18 }`)).toEqual([]);
  });

  it.each([
    "include_party: false\nparty_members: [{ name: Stale, hp: 10 }]",
    "party_members: []",
    "party_members: invalid",
  ])("does not add live party members for %j", async (fields) => {
    const f = await setup();
    await f.addPc("Available", "hp: 12");
    expect(await f.launch(fields)).toEqual([]);
  });

  it("uses the selected party for a legacy note without snapshots", async () => {
    const f = await setup();
    const down = await f.addPc("Down", "hp: 0\nhp_max: 21");
    await f.addPc("Retired", "hp: 8\nenabled: false");

    expect(await f.launch("include_party: true")).toMatchObject([
      { name: "Down", notePath: down.path, currentHP: 0, maxHP: 21 },
    ]);
    expect(await f.launch("include_party: true", "missing-party")).toEqual([]);
  });
});
