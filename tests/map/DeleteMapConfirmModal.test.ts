import { type App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { DeleteMapConfirmModal } from "../../src/map-views/DeleteMapConfirmModal";
import { removeMapCodeBlocks } from "../../src/map-views/removeMapCodeBlocks";

function block(source: string, open = "```dnd-map", close = "```"): string {
  return `${open}\n${source}\n${close}`;
}

const mapA = block('{"mapId":"A"}');
const mapB = block('{"mapId":"B"}');

describe("DeleteMapConfirmModal note cleanup", () => {
  it("removes only B after A and prose, using the latest content inside vault.process", async () => {
    const file = new TFile();
    const before = "# Maps\n\n" + mapA + "\n\nRead [[The Room]] first.  \n\n";
    const after = "\n\nBack to [[Session 4]].\n";
    let document = before + mapB + after;
    const pendingEdit = "\nLatest GM edit.\t\n";
    const process = vi.fn(async (_file: TFile, update: (content: string) => string) => {
      document += pendingEdit;
      document = update(document);
      return document;
    });
    const vault = {
      adapter: { exists: vi.fn(async () => false) },
      getAbstractFileByPath: vi.fn(() => file),
      process,
      read: vi.fn(async () => document),
      modify: vi.fn(),
    };
    const app = { vault } as unknown as App;
    const plugin = { getMapAnnotationPath: () => "maps/B.json" } as unknown as ConstructorParameters<typeof DeleteMapConfirmModal>[1];
    const onDeleted = vi.fn();
    const modal = new DeleteMapConfirmModal(app, plugin, "B", "Map B", "Maps.md", onDeleted);
    // The test Obsidian Modal has no constructor behavior.
    Object.assign(modal, { app });
    await (modal as unknown as { performDelete(removeCodeBlock: boolean): Promise<void> }).performDelete(true);

    expect(vault.getAbstractFileByPath).toHaveBeenCalledExactlyOnceWith("Maps.md");
    expect(process).toHaveBeenCalledExactlyOnceWith(file, expect.any(Function));
    expect(vault.read).not.toHaveBeenCalled();
    expect(vault.modify).not.toHaveBeenCalled();
    expect(document).toBe(before + after + pendingEdit);
    expect(onDeleted).toHaveBeenCalledOnce();
  });
});

describe("removeMapCodeBlocks", () => {
  it("preserves intervening non-map fences that also contain the target ID", () => {
    const nonMap = block('{"mapId":"B"}', "```json");
    const before = `${mapA}\n\nProse.\n${nonMap}\n\n`;
    expect(removeMapCodeBlocks(before + mapB, "B")).toBe(before);
  });

  it.each([
    '{"mapId":"B",}',
    '{"name":"Missing ID"}',
    '{"mapId":""}',
    '{"mapId":" B "}',
    '{"mapId":"b"}',
    '{"mapId":"A","extra":{"mapId":"B"}}',
    '{"extra":{"mapId":"B"}}',
    '{"name":"{\\"mapId\\":\\"B\\"}"}',
    '[{"mapId":"B"}]',
    '"B"',
    'null',
  ])("retains a block with config %s", (source) => {
    const unrelated = block(source) + "\n\n";
    expect(removeMapCodeBlocks(unrelated + mapB, "B")).toBe(unrelated);
  });

  it("matches decoded string IDs exactly, including regex metacharacters and JSON escapes", () => {
    const id = 'a.$*+?^{}()|[]\\"—\n';
    const target = block(JSON.stringify({ mapId: id }));
    const nearMatch = block(JSON.stringify({ mapId: id + "suffix" }));
    const numeric = block('{"mapId":12}');
    expect(removeMapCodeBlocks(nearMatch + "\n\n" + target, id)).toBe(nearMatch + "\n\n");
    expect(removeMapCodeBlocks(numeric, "12")).toBe(numeric);
  });

  it("removes repeated matches while keeping CRLF, tabs, blank lines and trailing spaces", () => {
    const crlf = (value: string) => value.replace(/\n/g, "\r\n");
    const before = "\uFEFFHeading  \r\n\r\n";
    const between = "\r\n\t\r\nKeep this.  \r\n";
    const after = "\r\n\r\n";
    const backticks = crlf(block('{"mapId":"B"}', "```` dnd-map\t", "````` \t"));
    const tildes = crlf(block('{"mapId":"B"}', "~~~~dnd-map", "~~~~~"));
    expect(removeMapCodeBlocks(before + backticks + between + tildes + after, "B")).toBe(before + between + after);
  });

  it.each([
    ["`````markdown", "`````", "````"],
    ["~~~~markdown", "~~~~", "~~~"],
  ])("preserves map examples inside %s", (open, close, shorter) => {
    const example = `${open}\n${mapB}\n${shorter}\n${close} extra\n${mapB}\n${close}\n\n`;
    expect(removeMapCodeBlocks(example + mapB, "B")).toBe(example);
  });

  it.each([
    mapB.slice(0, -3),
    block('{"mapId":"B"}', "````dnd-map", "```"),
    block('{"mapId":"B"}', "~~~~dnd-map", "`````"),
    "````markdown\n" + mapB,
  ])("preserves an unclosed fence", (unclosed) => {
    expect(removeMapCodeBlocks(unclosed, "B")).toBe(unclosed);
  });

  it.each([
    "\uFEFF---\nexample: |\n" + mapB + "\n---",
    "Prose <!--\n" + mapB + "\n--> More prose <!--\n" + mapB + "\n-->",
    "Prose %%\n" + mapB + "\n%% More prose %%\n" + mapB + "\n%%",
    "<pre>\n</script>\n\n" + mapB + "\n</pre>",
    "<div\n  class='example'>\n" + mapB + "\n</div>",
    mapB.replace(/^/gm, "> "),
    "- ````markdown\n" + mapB.replace(/^/gm, "  ") + "\n  ````",
    "10. ~~~~markdown\n" + mapB.replace(/^/gm, "    ") + "\n    ~~~~",
  ])("preserves map examples in literal or ambiguous Markdown contexts", (example) => {
    const before = example + "\n\n";
    expect(removeMapCodeBlocks(before + mapB, "B")).toBe(before);
  });

  it("resumes scanning after same-line comments", () => {
    const before = "Prose <!-- a comment --> %% and a second comment %%\n\n";
    expect(removeMapCodeBlocks(before + mapB, "B")).toBe(before);
  });
});
