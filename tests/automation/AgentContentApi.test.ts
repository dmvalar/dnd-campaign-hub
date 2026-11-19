import { describe, expect, it, vi } from "vitest";
import { AgentContentApi, AGENT_DIRECTORY } from "../../src/automation/AgentContentApi";
import { AuthoringTransaction } from "../../src/automation/AuthoringTransaction";
import { startEncounterFromFile } from "../../src/encounter/renderEncounterView";
import { getAdventureScenes } from "../../src/session/adventureScenes";
import { parseYamlFrontmatter } from "../../src/utils/YamlFrontmatter";
import { authoringFixture, fullBatch, monsterInput } from "./fixture";
import type { TFile } from "obsidian";
import { readFileSync } from "node:fs";

describe("agent creation API", () => {
  it("validates the documented example adventure batch after supplying the campaign and image assets", async () => {
    const f=await authoringFixture();
    const example=JSON.parse(readFileSync("examples/agent-authoring/adventure-batch.json","utf8"));
    example.campaignPath=f.campaignPath;
    for (const path of ["Assets/Tokens/ghast-captain.png","Assets/Tokens/sister-ada.png","Assets/Maps/monastery.png"]) {
      Object.assign(f.addNote(path,"image bytes"),{extension:"png"});
    }
    const response=await f.api.execute(example);
    expect(response.status,response.error).toBe("preview");
    expect(response.files).toHaveLength(7);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("creates a linked adventure with monster statblocks, image tokens, encounter, map, NPC and session usable by existing plugin consumers", async () => {
    const f = await authoringFixture();
    const response = await f.api.execute(fullBatch(f.campaignPath));
    expect(response.status, response.error).toBe("completed");
    const result = response.results;
    const file = (id: string) => f.entries.get(result[id]!.notePath) as TFile;
    const fm = (id: string) => parseYamlFrontmatter(f.read(file(id))).frontmatter;
    expect(fm("monster")).toMatchObject({ type: "creature", creature_type: "humanoid", hp: 22, ac: 15, stats: [10,16,12,10,9,8], token_id: result.monster!.tokenId,
      actions: monsterInput.statblock.actions, traits: monsterInput.statblock.traits });
    expect(f.read(file("monster"))).toContain("```statblock");
    expect(f.read(file("monster"))).toContain(monsterInput.description);
    expect(f.plugin.markerLibrary.getMarker(result.monster!.tokenId!)).toMatchObject({ type: "creature", imageFile: "Assets/goblin.png", imageFit: "contain", creatureSize: "small", darkvision: 60 });
    expect(fm("npc").motivation).toBe("Wants: the crown\nBut fears the cost");
    expect(fm("scene")).toMatchObject({ tracker_encounter: "Gate Defense", encounter_file: `[[${result.encounter!.notePath}]]`, sessions: [`[[${result.session!.notePath}]]`] });
    expect(fm("adventure").sessions).toEqual([`[[${result.session!.notePath}]]`]);
    expect(getAdventureScenes(f.app, file("adventure")).map(entry => entry.file.path)).toEqual([result.scene!.notePath]);
    expect(fm("session")).toMatchObject({ status: "planned", sessionNum: 1, planned_scenes: [`[[${result.scene!.notePath}]]`] });
    expect(f.read(file("session"))).toContain("# Session 1 - At the Gates");
    expect(fm("encounter").difficulty).toMatchObject({ enemy_count: 2, enemy_total_hp: 44, rating: expect.any(String) });
    const mapId = result.map!.mapId;
    const annotationPath = `.custom-obsidian/plugins/dnd-campaign-hub/map-annotations/${mapId}.json`;
    expect(JSON.parse(f.storage.get(annotationPath)!)).toMatchObject({ mapId, schemaVersion: 4, imageFile: "Assets/goblin.png", dimensions: { width:1400, height:700 }, gridSize: 70, markers: [] });
    expect(f.read(file("map"))).toContain(JSON.stringify({ mapId }, null, 2));
    expect(f.read(file("scene"))).toContain(JSON.stringify({ mapId }, null, 2));
    expect(f.plugin._pendingSaves.size).toBe(0);
    expect(f.plugin.partyManager.getEncounter("Gate Defense")?.creatures).toHaveLength(2);
    await startEncounterFromFile(f.plugin, file("encounter"));
    expect(f.plugin.combatTracker.getState()?.combatants).toMatchObject([
      { currentHP: 0, maxHP: 22, tempHP: 5, fixedInitiative: true, initiative: 0, tokenId: result.monster!.tokenId },
      { currentHP: 0, maxHP: 22, tempHP: 5, fixedInitiative: true, initiative: 0, tokenId: result.monster!.tokenId },
    ]);
    f.plugin.combatTracker.rollAllInitiative();
    expect(f.plugin.combatTracker.getState()?.combatants.map(entry => entry.initiative)).toEqual([0,0]);
  });

  it("previews the entire linked batch without writing notes, tokens, map data, receipts or backlinks", async () => {
    const f = await authoringFixture();
    const response = await f.api.execute(fullBatch(f.campaignPath, "preview", true));
    expect(response.status, response.error).toBe("preview");
    expect(response.files).toHaveLength(7);
    expect(f.writeStorage).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.process).not.toHaveBeenCalled();
    expect(f.plugin.markerLibrary.getAllMarkers()).toEqual([]);
    expect(f.plugin.partyManager.getAllEncounters()).toEqual({});
  });

  it("creates combat-ready NPCs with the same full statblock schema and an image token", async () => {
    const f = await authoringFixture();
    const response=await f.api.execute({schemaVersion:1,requestId:"combat-npc",campaignPath:f.campaignPath,operations:[
      {id:"npc",type:"create_npc",input:{name:"A Duelist",statblock:monsterInput.statblock,token:monsterInput.token}},
      {id:"encounter",type:"create_encounter",input:{name:"Duel",creatures:[{path:{$ref:"npc.notePath"},friendly:true}]}},
    ]});
    expect(response.status,response.error).toBe("completed");
    const note=f.entries.get(response.results.npc!.notePath) as TFile;
    expect(parseYamlFrontmatter(f.read(note)).frontmatter).toMatchObject({type:"npc",statblock:true,creature_type:"humanoid",hp:22,ac:15});
    expect(f.read(note)).toContain("Nimble Escape");
    expect(f.read(note)).not.toContain("# Leave empty or add stat block here");
    expect(f.plugin.markerLibrary.getMarker(response.results.npc!.tokenId!)).toMatchObject({type:"npc",creatureSize:"small",imageFile:"Assets/goblin.png",darkvision:60});
    expect(f.plugin.partyManager.getEncounter("Duel")?.creatures).toMatchObject([{friendly:true,notePath:note.path}]);
  });

  it("exposes party choices and preserves live zero-HP PCs while excluding absent/retired members", async () => {
    const f=await authoringFixture();
    const manager=f.plugin.partyManager;
    const party=await manager.createParty("Keepers",f.campaignPath);
    for (const [name,extra] of [["Down",""],["Absent",""],["Retired","enabled: false\n"]]) {
      const path=`${f.campaignPath}/PCs/${name}.md`;
      f.addNote(path,`---\ntype: player\nname: ${name}\nlevel: 3\nhp: 0\nhp_max: 30\nthp: 4\nac: 15\n${extra}---\n`);
      await manager.addMember(party.id,path,name);
      if (name==="Absent") await manager.setMemberAbsent(party.id,path,true);
    }
    expect(await f.api.listCampaigns()).toMatchObject([{parties:[{id:party.id,name:"Keepers"}]}]);
    const response=await f.api.execute({schemaVersion:1,requestId:"selected-party",campaignPath:f.campaignPath,operations:[
      {id:"monster",type:"create_monster",input:monsterInput},
      {id:"encounter",type:"create_encounter",input:{name:"With Party",includeParty:true,selectedPartyId:party.id,creatures:[{path:{$ref:"monster.notePath"}}]}},
    ]});
    expect(response.status,response.error).toBe("completed");
    const encounter=f.entries.get(response.results.encounter!.notePath) as TFile;
    const fields=parseYamlFrontmatter(f.read(encounter)).frontmatter;
    expect(fields.party_members).toMatchObject([{name:"Down",hp:0,hp_max:30,thp:4}]);
    expect((fields.party_members as unknown[]).length).toBe(1);
    expect(fields.difficulty).toMatchObject({party_total_hp:30,party_count:1});
    await startEncounterFromFile(f.plugin,encounter);
    expect(f.plugin.combatTracker.getState()?.combatants.filter(member=>member.player)).toMatchObject([{name:"Down",currentHP:0,maxHP:30,tempHP:4}]);
  });

  it("keeps an existing Fantasy Statblocks entry and embeds the new monster's full statblock in its own note", async () => {
    const f = await authoringFixture();
    const entry={name:monsterInput.name,hp:900};
    const fantasy={data:{bestiary:[entry]},saveSettings:vi.fn()};
    Object.assign(f.app,{plugins:{getPlugin:()=>fantasy}});
    const response=await f.api.execute({schemaVersion:1,requestId:"statblocks-collision",campaignPath:f.campaignPath,operations:[{id:"monster",type:"create_monster",input:monsterInput}]});
    expect(response.status,response.error).toBe("completed");
    expect(fantasy.data.bestiary).toEqual([entry]);
    expect(fantasy.saveSettings).not.toHaveBeenCalled();
    expect(response.warnings).toEqual([expect.stringContaining("already has an entry")]);
    expect(parseYamlFrontmatter(f.read(f.entries.get(response.results.monster!.notePath) as TFile)).frontmatter.hp).toBe(22);
  });

  it("preserves a third-party statblock edited after registration and reports incomplete rollback", async () => {
    const f=await authoringFixture();
    const bestiary:Record<string,unknown>[]=[];
    const fantasy={data:{bestiary},saveSettings:vi.fn(async ()=>{ if(bestiary[0]) bestiary[0].dmNotes="Keep this edit"; })};
    Object.assign(f.app,{plugins:{getPlugin:()=>fantasy}});
    const write=f.writeStorage.getMockImplementation()!;
    f.writeStorage.mockImplementation(async(path,content)=>{if(path.includes("map-annotations/"))throw new Error("Disk failure");return write(path,content);});
    const response=await f.api.execute(fullBatch(f.campaignPath));
    expect(response.status).toBe("failed");
    expect(response.recoveryErrors).toEqual([expect.stringContaining("entry changed after creating")]);
    expect(response.plannedResults?.monster?.tokenId).toBeTruthy();
    expect(bestiary[0]?.dmNotes).toBe("Keep this edit");
  });

  it("replays a committed request after reconnect/restart and rejects ID reuse for different content", async () => {
    const f = await authoringFixture();
    const request = fullBatch(f.campaignPath);
    const response = await f.api.execute(request);
    f.create.mockClear();
    const reconnected = new AgentContentApi(f.plugin);
    expect(await reconnected.execute(request)).toEqual(response);
    expect(f.create).not.toHaveBeenCalled();
    await expect(reconnected.execute({ ...request, operations: [] })).rejects.toThrow("operations");
    await expect(reconnected.execute({ ...request, operations: request.operations.slice(0, 1) })).rejects.toThrow("different content");
  });

  it("serializes concurrent duplicate requests across the public API", async () => {
    const f = await authoringFixture();
    const request = fullBatch(f.campaignPath);
    const [first, second] = await Promise.all([f.api.execute(request), f.api.execute(request)]);
    expect(second).toEqual(first);
    expect(f.create).toHaveBeenCalledTimes(7);
    expect(f.plugin.markerLibrary.getAllMarkers()).toHaveLength(2);
  });

  it.each([
    ["missing image", { ...monsterInput, token: { imagePath: "Assets/missing.png" } }],
    ["malformed statblock", { ...monsterInput, statblock: { ...monsterInput.statblock, stats: [10] } }],
    ["unknown field", { ...monsterInput, oops: true }],
    ["path traversal", { ...monsterInput, name: "../Escape" }],
  ])("rejects %s before writing any part of a preceding valid operation", async (_name, input) => {
    const f = await authoringFixture();
    const response = await f.api.execute({ schemaVersion:1, requestId:"bad-input", campaignPath:f.campaignPath, operations: [
      { id:"npc", type:"create_npc", input:{name:"An NPC"} }, { id:"monster", type:"create_monster", input },
    ] });
    expect(response.status).toBe("failed");
    expect(response.error).toBeTruthy();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.writeStorage).not.toHaveBeenCalled();
  });

  it("rolls back newly created notes and markers after a later map write fails", async () => {
    const f = await authoringFixture();
    const write = f.writeStorage.getMockImplementation()!;
    f.writeStorage.mockImplementation(async (path, content) => {
      if (path.includes("map-annotations/")) throw new Error("Disk full");
      return write(path, content);
    });
    const response = await f.api.execute(fullBatch(f.campaignPath));
    expect(response.status).toBe("failed");
    expect(response.error).toContain("Disk full");
    expect(response.recoveryErrors).toEqual([]);
    expect(f.app.vault.getMarkdownFiles().map(file => file.path)).toEqual([`${f.campaignPath}/World.md`]);
    expect(f.plugin.markerLibrary.getAllMarkers()).toEqual([]);
    expect(f.plugin.partyManager.getEncounter("Gate Defense")).toBeUndefined();
    expect([...f.storage.keys()].filter(path => path.includes("map-annotations/"))).toEqual([]);
  });

  it.each([false,true])("recovers tokens, map annotations and stored encounter when encounter persistence fails (after write=%s)", async (afterWrite) => {
    const f = await authoringFixture();
    const write=f.writeStorage.getMockImplementation()!;
    let failed=false;
    f.writeStorage.mockImplementation(async (path,content)=>{
      if (!failed && path.endsWith("parties.json") && content.includes("Gate Defense")) {
        failed=true;
        if (afterWrite) await write(path,content);
        throw new Error("Encounter write failed");
      }
      return write(path,content);
    });
    const response=await f.api.execute(fullBatch(f.campaignPath));
    expect(response.status).toBe("failed");
    expect(response.recoveryErrors).toEqual([]);
    expect(f.plugin.markerLibrary.getAllMarkers()).toEqual([]);
    expect(f.plugin.partyManager.getEncounter("Gate Defense")).toBeUndefined();
    expect([...f.storage.keys()].filter(path=>path.includes("map-annotations/"))).toEqual([]);
    expect(f.app.vault.getMarkdownFiles().map(file=>file.path)).toEqual([`${f.campaignPath}/World.md`]);
  });

  it("restores an existing authored adventure after a later creation failure", async () => {
    const f = await authoringFixture();
    const adventure = f.addNote(`${f.campaignPath}/Adventures/Old.md`, "---\ntype: adventure\nname: Old\ncustom: keep\nsessions: []\n---\n\nMy notes.\n");
    const original = f.read(adventure);
    const tx = new AuthoringTransaction(f.plugin, f.campaignPath, "rollback");
    const ctx = tx.context("update");
    await ctx.stageUpdate(adventure.path, content => content.replace("sessions: []", "sessions: [new]"));
    ctx.stageEffect({ key:"fail", commit:async () => { throw new Error("Injected failure"); }, rollback:async () => {} });
    await expect(tx.commit()).rejects.toThrow("Injected failure");
    expect(f.read(adventure)).toBe(original);
  });

  it("preserves concurrent note edits instead of overwriting them during apply or rollback", async () => {
    const f = await authoringFixture();
    const note = f.addNote(`${f.campaignPath}/Original.md`, "---\ntype: adventure\n---\nOriginal\n");
    const tx = new AuthoringTransaction(f.plugin, f.campaignPath, "concurrent");
    const ctx = tx.context("update");
    await ctx.stageUpdate(note.path, content => content.replace("Original", "Agent change"));
    f.write(note, f.read(note) + "Concurrent DM edit\n");
    await expect(tx.commit()).rejects.toThrow("changed during planning");
    expect(f.read(note)).toContain("Concurrent DM edit");
    expect(f.read(note)).not.toContain("Agent change");
  });

  it("preserves BOM, CRLF, comments and authored body when adding a session backlink", async () => {
    const f = await authoringFixture();
    const body = "\r\n# My Adventure\r\n\r\nKeep this prose exactly.\r\n";
    const adventure = f.addNote(`${f.campaignPath}/Adventures/Old.md`, "\uFEFF---\r\ntype: adventure\r\nname: Old\r\ncustom: 'keep: quoted' # DM comment\r\nsessions: [] # backlink note\r\n---\r\n" + body);
    const response = await f.api.execute({ schemaVersion:1,requestId:"existing-backlink",campaignPath:f.campaignPath,operations:[
      {id:"session",type:"create_session",input:{adventurePaths:[adventure.path],date:"2026-11-19"}},
    ] });
    expect(response.status,response.error).toBe("completed");
    expect(f.read(adventure)).toContain("# DM comment");
    expect(f.read(adventure)).toContain("# backlink note");
    expect(f.read(adventure).startsWith("\uFEFF---\r\n")).toBe(true);
    expect(f.read(adventure).endsWith(body)).toBe(true);
    expect(f.read(adventure).replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("reports uncertain completion with intended paths if the final receipt fails", async () => {
    const f = await authoringFixture();
    const write = f.writeStorage.getMockImplementation()!;
    let receipts = 0;
    f.writeStorage.mockImplementation(async (path, content) => {
      if (path.includes("/receipts/") && ++receipts === 2) throw new Error("Receipt failure");
      return write(path,content);
    });
    const request = fullBatch(f.campaignPath);
    const response = await f.api.execute(request);
    expect(response.status).toBe("interrupted");
    expect(response.error).toContain("final receipt");
    expect(Object.keys(response.plannedResults!)).toHaveLength(7);
    expect(response.results).toEqual({});
    expect((await new AgentContentApi(f.plugin).execute(request)).status).toBe("interrupted");
    expect(f.create).toHaveBeenCalledTimes(7);
  });

  it("reports incomplete recovery and leaves concurrent edits intact", async () => {
    const f = await authoringFixture();
    const tx = new AuthoringTransaction(f.plugin, f.campaignPath, "concurrent-rollback");
    const ctx = tx.context("create");
    const path = `${f.campaignPath}/New.md`;
    await ctx.stageNote(path, "---\ntype: npc\n---\nNew\n");
    ctx.stageEffect({ key:"fail", commit:async () => { const file=f.entries.get(path) as TFile; f.write(file,f.read(file)+"DM edit\n"); throw new Error("Fail"); }, rollback:async () => {} });
    await expect(tx.commit()).rejects.toMatchObject({ recoveryErrors:[expect.stringContaining("Concurrent changes were preserved")] });
    expect(f.read(f.entries.get(path) as TFile)).toContain("DM edit");
  });

  it("does not automatically replay a request interrupted after its intent was persisted", async () => {
    const f = await authoringFixture();
    const request = fullBatch(f.campaignPath);
    await f.api.execute(request);
    const path = `${AGENT_DIRECTORY}/receipts/${request.requestId}.json`;
    const receipt = JSON.parse(f.storage.get(path)!);
    receipt.running = true;
    f.storage.set(path, JSON.stringify(receipt));
    f.create.mockClear();
    const response = await new AgentContentApi(f.plugin).execute(request);
    expect(response.status).toBe("interrupted");
    expect(response.results).toEqual({});
    expect(response.files).toHaveLength(7);
    expect(f.create).not.toHaveBeenCalled();
  });

  it("refuses foreign campaign scene plans and duplicate scene numbers", async () => {
    const f = await authoringFixture();
    const batch = fullBatch(f.campaignPath);
    expect((await f.api.execute(batch)).status).toBe("completed");
    const adventurePath = `${f.campaignPath}/Adventures/The Keep/The Keep.md`;
    const response = await f.api.execute({ schemaVersion:1, requestId:"duplicate-scene", campaignPath:f.campaignPath, operations:[
      { id:"scene", type:"create_scene", input:{ name:"Different Name", adventurePath, sceneNumber:1 } },
    ] });
    expect(response.error).toContain("already exists");
    const foreign = f.addNote("ttrpgs/Other/Scene.md", "---\ntype: scene\n---\n");
    const session = await f.api.execute({ schemaVersion:1, requestId:"foreign-session", campaignPath:f.campaignPath, operations:[
      { id:"session", type:"create_session", input:{ adventurePaths:[adventurePath], plannedScenePaths:[foreign.path] } },
    ] });
    expect(session.status).toBe("failed");
    expect(session.error).toContain("Expected a scene note");
  });
});
