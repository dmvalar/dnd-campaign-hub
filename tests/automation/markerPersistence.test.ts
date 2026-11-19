import { describe, expect, it } from "vitest";
import { authoringFixture } from "./fixture";
import { MarkerLibrary } from "../../src/marker/MarkerLibrary";

const marker = { id:"new-marker", name:"Goblin", type:"creature" as const, icon:"", imageFile:"Assets/goblin.png", backgroundColor:"#ff0000", createdAt:1, updatedAt:1 };
const path = ".custom-obsidian/plugins/dnd-campaign-hub/markers.json";

describe("strict marker authoring effects", () => {
  it("uses the vault's config folder and creates/rolls back only its own marker", async () => {
    const f = await authoringFixture();
    const library = f.plugin.markerLibrary;
    const effect = library.prepareMarkerCreate(marker);
    expect(library.getAllMarkers()).toEqual([]);
    expect(f.writeStorage).not.toHaveBeenCalled();
    await effect.commit();
    await library.setMarker({...marker,id:"other",name:"DM token"});
    await effect.rollback();
    expect(library.getAllMarkers().map(entry => entry.id)).toEqual(["other"]);
    expect(JSON.parse(f.storage.get(path)!).markers.map((entry: {id:string})=>entry.id)).toEqual(["other"]);
  });

  it("rejects persistence failures without registering an in-memory marker", async () => {
    const f = await authoringFixture();
    f.adapterProcess.mockRejectedValueOnce(new Error("No space"));
    const effect = f.plugin.markerLibrary.prepareMarkerCreate(marker);
    await expect(effect.commit()).rejects.toThrow("No space");
    await effect.rollback();
    expect(f.plugin.markerLibrary.hasMarker(marker.id)).toBe(false);
    expect(JSON.parse(f.storage.get(path)!).markers).toEqual([]);
  });

  it("confirms a write that rejects after storing the complete new snapshot", async () => {
    const f = await authoringFixture();
    const process = f.adapterProcess.getMockImplementation()!;
    f.adapterProcess.mockImplementationOnce(async (path, update) => { await process(path,update); throw new Error("Late failure"); });
    const effect = f.plugin.markerLibrary.prepareMarkerCreate(marker);
    await effect.commit();
    expect(f.plugin.markerLibrary.getMarker(marker.id)).toEqual(marker);
    await effect.rollback();
    expect(JSON.parse(f.storage.get(path)!).markers).toEqual([]);
  });

  it("preserves external library edits and refuses to overwrite a stale snapshot", async () => {
    const f = await authoringFixture();
    const external = JSON.stringify({version:"1.0.0",markers:[{...marker,id:"external"}]});
    f.storage.set(path,external);
    const effect = f.plugin.markerLibrary.prepareMarkerCreate(marker);
    await expect(effect.commit()).rejects.toThrow("changed on disk");
    await effect.rollback();
    expect(f.storage.get(path)).toBe(external);
    expect(f.plugin.markerLibrary.hasMarker(marker.id)).toBe(false);
  });

  it("does not delete a marker edited by the DM after creation", async () => {
    const f = await authoringFixture();
    const effect = f.plugin.markerLibrary.prepareMarkerCreate(marker);
    await effect.commit();
    await f.plugin.markerLibrary.setMarker({...marker,name:"DM revision"});
    await expect(effect.rollback()).rejects.toThrow("changed after creation");
    expect(f.plugin.markerLibrary.getMarker(marker.id)?.name).toBe("DM revision");
  });

  it("copies a legacy default-folder library when adopting a custom config directory", async () => {
    const f = await authoringFixture();
    f.storage.delete(path);
    const legacyPath = ".obsidian/plugins/dnd-campaign-hub/markers.json";
    const legacy = JSON.stringify({version:"1.0.0",markers:[marker]});
    f.storage.set(legacyPath,legacy);
    const library = new MarkerLibrary(f.app,"dnd-campaign-hub");
    await library.load();
    expect(library.getMarker(marker.id)).toEqual(marker);
    expect(f.storage.get(legacyPath)).toBe(legacy);
    expect(JSON.parse(f.storage.get(path)!).markers).toEqual([marker]);
  });
});
