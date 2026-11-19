import { stringifyYaml } from "obsidian";
import { normalizeMapAnnotations } from "../map/MapFactory";
import { prepareMapAnnotationCreate } from "../map/MapPersistence";
import { MAP_IMAGE_EXTENSIONS } from "../map/types";
import { requireRasterImage } from "./tokenAuthoring";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, finiteNumber, object, safeName, string } from "./validation";

export async function planMap(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "map");
  assertKeys(fields, ["name", "imagePath", "type", "gridType", "gridSize", "scaleValue", "scaleUnit", "width", "height"], "map");
  const name = safeName(fields.name);
  const image = requireRasterImage(ctx, fields.imagePath, "imagePath", MAP_IMAGE_EXTENSIONS);
  const type = string(fields.type, "type", { optional: true }) ?? "battlemap";
  const gridType = string(fields.gridType, "gridType", { optional: true }) ?? "square";
  const scaleUnit = string(fields.scaleUnit, "scaleUnit", { optional: true }) ?? "feet";
  if (!["battlemap", "regional", "world"].includes(type)) throw new Error("Invalid map type");
  if (!["square", "hex-horizontal", "hex-vertical", "none"].includes(gridType)) throw new Error("Invalid gridType");
  if (!["feet", "miles", "km"].includes(scaleUnit)) throw new Error("Invalid scaleUnit");
  const gridSize = finiteNumber(fields.gridSize, "gridSize", { optional: true, integer: true, min: 1, max: 4096 }) ?? 70;
  const scaleValue = finiteNumber(fields.scaleValue, "scaleValue", { optional: true, min: 0.001, max: 1_000_000 }) ?? 5;
  if ((fields.width === undefined) !== (fields.height === undefined)) throw new Error("Provide both width and height or neither");
  const dimensions = fields.width === undefined ? await ctx.plugin.mapManager.getImageDimensions(image) : {
    width: finiteNumber(fields.width, "width", { integer: true, min: 1, max: 100_000 }),
    height: finiteNumber(fields.height, "height", { integer: true, min: 1, max: 100_000 }),
  };
  if (!(dimensions.width > 0 && dimensions.height > 0)) throw new Error("Could not read map image dimensions; provide width and height");
  const mapId = ctx.id("map");
  const config = normalizeMapAnnotations({ mapId, name, imageFile: image.path, type, gridType, gridSize,
    scale: { value: scaleValue, unit: scaleUnit }, dimensions, lastModified: new Date(ctx.now).toISOString() });
  const notePath = `${ctx.campaignPath}/Maps/${name}.md`;
  await ctx.stageNote(notePath, `---\n${stringifyYaml({ type: "map", name, campaign_path: ctx.campaignPath, map_id: mapId })}---\n\n# ${name}\n\n\`\`\`dnd-map\n${JSON.stringify({ mapId }, null, 2)}\n\`\`\`\n`);
  const write = prepareMapAnnotationCreate(ctx.plugin, mapId, config);
  ctx.stageEffect({ key: `map:${mapId}`, commit: async () => {
    requireRasterImage(ctx, image.path, "imagePath", MAP_IMAGE_EXTENSIONS);
    await write.commit();
  }, rollback: write.rollback });
  return { notePath, mapId };
}
