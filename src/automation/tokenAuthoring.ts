import { TFile } from "obsidian";
import type { CreatureSize, ImageFit, MarkerDefinition, MarkerType } from "../marker/MarkerTypes";
import { CREATURE_SIZE_SQUARES } from "../marker/MarkerTypes";
import { MAP_IMAGE_EXTENSIONS } from "../map/types";
import type { AuthoringContext } from "./types";
import { assertKeys, finiteNumber, object, safeName, string, vaultPath } from "./validation";

const TOKEN_IMAGE_EXTENSIONS = [...MAP_IMAGE_EXTENSIONS, "bmp"];
const BACKGROUNDS: Record<MarkerType, string> = {
  player: "#4a90d9",
  npc: "#6b8e23",
  creature: "#8b0000",
  poi: "#ff0000",
  other: "#ff0000",
};
const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;

export interface TokenAuthoringInput {
  name: string;
  type: MarkerType;
  imagePath?: string;
  imageFit?: ImageFit;
  icon?: string;
  backgroundColor?: string;
  borderColor?: string;
  creatureSize?: CreatureSize;
  senses?: Partial<Record<typeof SENSES[number], number>>;
}

export function requireRasterImage(
  ctx: AuthoringContext, value: unknown, label: string, extensions: readonly string[],
): TFile {
  const path = vaultPath(value, label);
  const file = ctx.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile) || !extensions.includes(file.extension.toLowerCase())) {
    throw new Error(`${label} must identify an existing raster image in the vault`);
  }
  return file;
}

function color(value: unknown, label: string, defaultValue: string): string {
  const parsed = string(value, label, { optional: true }) ?? defaultValue;
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(parsed)) throw new Error(`${label} must be a hex color`);
  return parsed;
}

export async function stageToken(ctx: AuthoringContext, input: TokenAuthoringInput): Promise<string> {
  const name = safeName(input.name, "token.name");
  const { type, imageFit, icon = "" } = input;
  if (!Object.prototype.hasOwnProperty.call(BACKGROUNDS, type)) throw new Error("Invalid token.type");
  if (imageFit !== undefined && imageFit !== "cover" && imageFit !== "contain") {
    throw new Error("token.imageFit must be cover or contain");
  }
  if (typeof icon !== "string" || icon.length > 32 || /[<>\x00-\x1f]/.test(icon)) {
    throw new Error("token.icon must be an emoji or short text");
  }
  const image = input.imagePath !== undefined || type === "creature"
    ? requireRasterImage(ctx, input.imagePath, "token.imagePath", TOKEN_IMAGE_EXTENSIONS)
    : undefined;
  const creatureToken = type === "creature" || type === "npc" || type === "player";
  const creatureSize = input.creatureSize ?? (creatureToken ? "medium" : undefined);
  if (creatureSize !== undefined && (!creatureToken || !Object.prototype.hasOwnProperty.call(CREATURE_SIZE_SQUARES, creatureSize))) {
    throw new Error("Invalid token.creatureSize");
  }
  const senses = input.senses === undefined ? {} : object(input.senses, "token.senses");
  assertKeys(senses, SENSES, "token.senses");
  const senseRanges: TokenAuthoringInput["senses"] = {};
  for (const sense of SENSES) {
    const range = finiteNumber(senses[sense], `token.senses.${sense}`, { optional: true, min: 0 });
    if (range !== undefined) senseRanges[sense] = range;
  }

  const marker: MarkerDefinition = {
    id: ctx.id("marker"),
    name,
    type,
    icon,
    backgroundColor: color(input.backgroundColor, "token.backgroundColor", BACKGROUNDS[type]),
    borderColor: color(input.borderColor, "token.borderColor", "#ffffff"),
    imageFile: image?.path,
    imageFit,
    creatureSize,
    ...senseRanges,
    campaign: ctx.campaignPath.split("/").pop(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  const library = ctx.plugin.markerLibrary;
  if (library.hasMarker(marker.id)) throw new Error(`Marker ID already exists: ${marker.id}`);
  const write = library.prepareMarkerCreate(marker);
  ctx.stageEffect({
    key: marker.id,
    commit: async () => {
      if (image) requireRasterImage(ctx, image.path, "token.imagePath", TOKEN_IMAGE_EXTENSIONS);
      await write.commit();
    },
    rollback: write.rollback,
  });
  return marker.id;
}
