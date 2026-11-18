import { Notice } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrapCreationModal } from "../../src/trap/TrapCreationModal";
import { parseYamlFrontmatter, updateYamlFrontmatter } from "../../src/utils/YamlFrontmatter";
import { noteVaultFixture } from "../encounter/noteVaultFixture";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<typeof import("../mocks/obsidian")>(),
  Notice: vi.fn(),
}));

const originalPath = "Vault Assets/Needles.md";
const renamedPath = "Vault Assets/Blade.md";

async function setup(edit = true, type: TrapCreationModal["trapType"] = "simple") {
  const vault = noteVaultFixture();
  const file = edit ? vault.addNote(originalPath, "") : undefined;
  const deleteTrapStatblocks = vi.fn();
  const plugin = { deleteTrapStatblocks } as unknown as TrapCreationModal["plugin"];
  const modal = new TrapCreationModal(vault.app, plugin, undefined, undefined, file?.path);
  const close = vi.fn();
  const saveMonsters = vi.fn();
  Object.assign(vault.app, { plugins: { getPlugin: () => ({ saveMonsters }) } });
  Object.assign(modal, {
    app: vault.app, close,
    trapName: "Needles", trapType: type, trigger: "Enter the corridor.",
    adventurePath: "Keep/Explore.md", scenePath: "Keep/Gate.md",
    elements: [{ name: "Darts", element_type: "active", initiative: 10, save_dc: 12, damage: "2d4" }],
    countermeasures: [{ method: "Block the holes", dc: 14, checks_needed: 2 }],
  });
  const generated = modal.createTrapContent("Keep", "World");
  const original = updateYamlFrontmatter(generated, (fm) => ({
    ...fm, template_version: "1.3.1", date: "2024-03-21", aliases: ["Spike room"],
    elements: [{ ...(fm.elements as object[])[0], custom: { reveal: "North wall" } }],
    countermeasures: [{ ...(fm.countermeasures as object[])[0], supplies: ["wax"] }],
  })).replace("*How to describe and introduce this trap*", "Point out [[Bent Needles]] scattered on the floor.")
    .replace(/\*\*Created:\*\* [^\n]+/, "**Created:** 2024-03-21")
    .replace("*Record when this trap was encountered and what happened*", "[[Session 7]] — Sal spotted it first.\n\n## Treasure\n\nA spare key.\n");
  if (file) {
    vault.write(file, original);
    await modal.loadTrapData();
  }
  return { ...vault, modal, file: file!, original, close, deleteTrapStatblocks, saveMonsters };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("TrapCreationModal note save", () => {
  it.each(["simple", "complex"] as const)("refreshes the generated %s overview and preserves GM text and current YAML", async (type) => {
    const f = await setup(true, type);
    const latest = f.original.replace("A spare key.", "A spare key and [[Gold Ring]].")
      .replace("    reveal: North wall", "    reveal: East wall")
      .replace("aliases:\n", "other:\n  secret: Old well\naliases:\n")
      .replace(/\n/g, "\r\n");
    f.write(f.file, latest);
    f.modal.trapName = "Blade";
    f.modal.trapInitiative = 17;
    f.modal.trigger = "Cross the threshold.";
    f.modal.elements[0]!.save_dc = 16;
    await f.modal.createTrap();

    expect(f.entries.get(renamedPath)).toBe(f.file);
    expect(f.entries.has(originalPath)).toBe(false);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.create).not.toHaveBeenCalled();
    expect(f.openFile).toHaveBeenCalledWith(f.file);
    expect(f.deleteTrapStatblocks).toHaveBeenCalledWith("Needles");
    expect(f.saveMonsters).toHaveBeenCalledTimes(1);
    expect(f.renameFile.mock.invocationCallOrder[0]).toBeLessThan(f.deleteTrapStatblocks.mock.invocationCallOrder[0]!);
    const saved = parseYamlFrontmatter(f.read(f.file));
    expect(saved.frontmatter).toMatchObject({
      trap_name: "Blade", trap_type: type, trap_initiative: 17, trigger: "Cross the threshold.",
      date: "2024-03-21", template_version: "1.3.1", aliases: ["Spike room"], other: { secret: "Old well" },
      campaign: "Keep", world: "World", adventure: "Explore", scene: "Gate",
      elements: [{ name: "Darts", custom: { reveal: "East wall" }, save_dc: 16 }],
      countermeasures: [{ method: "Block the holes", supplies: ["wax"] }],
    });
    expect(saved.body).toContain("# Blade\r\n");
    expect(saved.body).toContain("### Trigger Condition\r\nCross the threshold.");
    expect(saved.body).toContain('source: "Trap: Blade"');
    expect(saved.body).toContain("DC 16 DEX saving throw");
    expect(saved.body).not.toContain('source: "Trap: Needles"');
    expect(saved.body.slice(saved.body.indexOf("## Trap Elements & Effects"))).toBe(latest.slice(latest.indexOf("## Trap Elements & Effects")));
  });

  it("updates exact original details and leaves manually changed statblocks with their annotations", async () => {
    const f = await setup();
    const authored = '    desc: "Custom statblock text — pin the target"\n';
    const latest = f.original.replace(/^    desc: "DC 12[^\n]+\n/m, authored);
    f.write(f.file, latest);
    f.modal.trigger = "Lift the lid.";
    await f.modal.createTrap();
    const saved = parseYamlFrontmatter(f.read(f.file));
    expect(saved.body).toContain("### Trigger Condition\nLift the lid.");
    expect(saved.body.slice(saved.body.indexOf("## Statblocks"))).toBe(latest.slice(latest.indexOf("## Statblocks")));
    expect(saved.body).toContain(authored);
  });

  it("leaves a relocated generated overview in a code example untouched", async () => {
    const f = await setup();
    const originalBody = parseYamlFrontmatter(f.original).body.trimStart();
    const customBody = "\n# Reference notes\n\n~~~~markdown\n" + originalBody + "~~~~\n";
    f.write(f.file, f.original.replace(parseYamlFrontmatter(f.original).body, customBody));
    f.modal.trapName = "Blade";
    f.modal.trigger = "Lift the lid.";
    await f.modal.createTrap();
    expect(parseYamlFrontmatter(f.read(f.file)).body).toBe(customBody);
  });

  it.each(["file", "folder"] as const)("blocks a rename over a %s before changing notes or statblocks", async (kind) => {
    const f = await setup();
    const target = kind === "file" ? f.addNote(renamedPath, "Keep me") : f.addFolder(renamedPath).get(renamedPath);
    f.modal.trapName = "Blade";
    await f.modal.createTrap();
    expect(f.entries.get(originalPath)).toBe(f.file);
    expect(f.entries.get(renamedPath)).toBe(target);
    expect(f.read(f.file)).toBe(f.original);
    if (target && kind === "file") expect(f.read(target as typeof f.file)).toBe("Keep me");
    expect(f.process).not.toHaveBeenCalled();
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.deleteTrapStatblocks).not.toHaveBeenCalled();
    expect(f.saveMonsters).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });

  it.each(["file", "folder"] as const)("blocks creation over an existing %s", async (kind) => {
    const f = await setup(false);
    const path = "z_Traps/Needles.md";
    const target = kind === "file" ? f.addNote(path, "Keep me") : f.addFolder(path).get(path);
    await f.modal.createTrap();
    expect(f.entries.get(path)).toBe(target);
    if (target && kind === "file") expect(f.read(target as typeof f.file)).toBe("Keep me");
    expect(f.create).not.toHaveBeenCalled();
    expect(f.createFolder).not.toHaveBeenCalled();
    expect(f.deleteTrapStatblocks).not.toHaveBeenCalled();
    expect(f.saveMonsters).not.toHaveBeenCalled();
  });

  it("keeps the create draft available after a create failure and registers statblocks only after retry", async () => {
    const f = await setup(false);
    f.create.mockRejectedValueOnce(new Error("injected create failure"));
    await f.modal.createTrap();
    expect(f.entries.has("z_Traps/Needles.md")).toBe(false);
    expect(f.saveMonsters).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();

    await f.modal.createTrap();
    const created = f.entries.get("z_Traps/Needles.md") as typeof f.file;
    expect(parseYamlFrontmatter(f.read(created)).body).toContain("## GM Notes");
    expect(f.saveMonsters).toHaveBeenCalledTimes(1);
  });

  it("handles write failure, then retries file and row renames without losing custom keys", async () => {
    const f = await setup();
    f.modal.trapName = "Blade";
    f.modal.elements[0]!.name = "Swinging blade";
    f.modal.countermeasures[0]!.method = "Jam the blades";
    f.process.mockRejectedValueOnce(new Error("injected write failure"));
    await f.modal.createTrap();
    expect(f.read(f.file)).toBe(f.original);
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.deleteTrapStatblocks).not.toHaveBeenCalled();

    f.renameFile.mockRejectedValueOnce(new Error("injected rename failure"));
    await f.modal.createTrap();
    expect(f.entries.get(originalPath)).toBe(f.file);
    expect(f.entries.has(renamedPath)).toBe(false);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining(`Edits were saved to "${originalPath}"`));
    expect(f.deleteTrapStatblocks).not.toHaveBeenCalled();
    expect(f.saveMonsters).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();

    await f.modal.createTrap();
    expect(f.entries.get(renamedPath)).toBe(f.file);
    expect(f.entries.has(originalPath)).toBe(false);
    expect(f.remove).not.toHaveBeenCalled();
    expect(f.deleteTrapStatblocks).toHaveBeenCalledExactlyOnceWith("Needles");
    expect(f.saveMonsters).toHaveBeenCalledTimes(1);
    expect(parseYamlFrontmatter(f.read(f.file)).frontmatter).toMatchObject({
      elements: [{ name: "Swinging blade", custom: { reveal: "North wall" } }],
      countermeasures: [{ method: "Jam the blades", supplies: ["wax"] }],
    });
  });

  it("keeps both notes when a competing file appears after the source is written", async () => {
    const f = await setup();
    const process = f.process.getMockImplementation()!;
    f.process.mockImplementationOnce(async (file, update) => {
      const result = await process(file, update);
      f.addNote(renamedPath, "Competitor");
      return result;
    });
    f.modal.trapName = "Blade";
    await f.modal.createTrap();
    expect(f.entries.get(originalPath)).toBe(f.file);
    expect(f.read(f.file)).toContain("# Blade");
    expect(f.read(f.entries.get(renamedPath) as typeof f.file)).toBe("Competitor");
    expect(f.renameFile).not.toHaveBeenCalled();
    expect(f.deleteTrapStatblocks).not.toHaveBeenCalled();
    expect(f.close).not.toHaveBeenCalled();
  });
});
