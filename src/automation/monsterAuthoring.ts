import { parseVisionSenses } from "../utils/VisionSenses";
import { readStatblock, renderCreatureNote, type CreatureStatblock } from "./statblockAuthoring";
import { stageToken, type TokenAuthoringInput } from "./tokenAuthoring";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, object, safeName, string, vaultPath } from "./validation";

export const MONSTER_INPUT_FIELDS = ["name", "statblock", "token", "description"];
export const MONSTER_TOKEN_FIELDS = ["imagePath", "imageFit", "icon", "backgroundColor", "borderColor"];

interface FantasyStatblocks {
  data?: { bestiary?: unknown; monsters?: unknown };
  api?: { getBestiaryCreatures?: () => unknown };
  saveSettings?: () => Promise<void>;
}

function hasName(source: unknown, name: string): boolean {
  if (!source || typeof source !== "object") return false;
  return Object.values(source).some(entry => typeof entry?.name === "string" && entry.name.toLowerCase() === name.toLowerCase());
}

export function stageFantasyStatblock(ctx: AuthoringContext, stats: CreatureStatblock, notePath: string, desc?: string): void {
  const app = ctx.app as typeof ctx.app & { plugins?: { getPlugin?(id: string): FantasyStatblocks | undefined } };
  const plugin = app.plugins?.getPlugin?.("obsidian-5e-statblocks");
  if (!plugin) return;
  const data = plugin.data;
  if (!data || typeof plugin.saveSettings !== "function" || (data.bestiary !== undefined && !Array.isArray(data.bestiary))) {
    ctx.warn("Fantasy Statblocks registration is unavailable. The monster note includes its own statblock.");
    return;
  }

  const hasCollision = () => {
    if (hasName(data.bestiary, stats.name) || hasName(data.monsters, stats.name)) return true;
    return hasName(plugin.api?.getBestiaryCreatures?.(), stats.name);
  };
  const warnCollision = () => ctx.warn(`Fantasy Statblocks already has an entry for "${stats.name}". The monster note includes its own statblock.`);
  try {
    if (hasCollision()) {
      warnCollision();
      return;
    }
  } catch {
    ctx.warn("Fantasy Statblocks could not check existing names. The monster note includes its own statblock.");
    return;
  }

  const entry = { ...stats, ...(desc === undefined ? {} : { desc }), path: notePath };
  const entrySnapshot = JSON.stringify(entry);
  let claimed: unknown[] | undefined;
  let initializedBestiary = false;
  ctx.stageEffect({
    key: `fantasy-statblocks:${stats.name.toLowerCase()}`,
    async commit() {
      if (hasCollision()) {
        warnCollision();
        return;
      }
      if (data.bestiary === undefined) {
        data.bestiary = [];
        initializedBestiary = true;
      }
      if (!Array.isArray(data.bestiary)) throw new Error("Fantasy Statblocks changed while creating the monster.");
      claimed = data.bestiary;
      claimed.push(entry);
      await plugin.saveSettings!();
    },
    async rollback() {
      if (claimed && data.bestiary !== claimed) throw new Error(`Fantasy Statblocks collection changed after creating "${stats.name}"`);
      const index = claimed?.indexOf(entry) ?? -1;
      if (index < 0 || !claimed || data.bestiary !== claimed) return;
      if (JSON.stringify(entry) !== entrySnapshot) throw new Error(`Fantasy Statblocks entry changed after creating "${stats.name}"`);
      claimed.splice(index, 1);
      if (initializedBestiary && !claimed.length) delete data.bestiary;
      await plugin.saveSettings!();
    },
  });
}

export async function planMonster(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "monster");
  assertKeys(fields, MONSTER_INPUT_FIELDS, "monster");
  const name = safeName(fields.name, "monster.name");
  const { stats, creatureSize, description: statblockDescription } = readStatblock(name, fields.statblock);
  const description = string(fields.description, "monster.description", { optional: true, maxLength: 20_000 });

  const appearance = object(fields.token, "monster.token");
  assertKeys(appearance, MONSTER_TOKEN_FIELDS, "monster.token");
  const imagePath = vaultPath(appearance.imagePath, "monster.token.imagePath");
  const imageFit = string(appearance.imageFit, "monster.token.imageFit", { optional: true });
  if (imageFit !== undefined && imageFit !== "cover" && imageFit !== "contain") {
    throw new Error("monster.token.imageFit must be cover or contain.");
  }
  const token: TokenAuthoringInput = {
    name,
    type: "creature",
    imagePath,
    imageFit,
    icon: string(appearance.icon, "monster.token.icon", { optional: true }),
    backgroundColor: string(appearance.backgroundColor, "monster.token.backgroundColor", { optional: true }),
    borderColor: string(appearance.borderColor, "monster.token.borderColor", { optional: true }),
    creatureSize,
    senses: parseVisionSenses(stats.senses),
  };
  const notePath = `z_Beastiarity/${name}.md`;
  if (await ctx.exists(notePath)) throw new Error(`A file or folder already exists at "${notePath}".`);
  const tokenId = await stageToken(ctx, token);
  await ctx.stageNote(notePath, renderCreatureNote(stats, tokenId, description, statblockDescription));
  stageFantasyStatblock(ctx, stats, notePath, statblockDescription);
  return { notePath, tokenId };
}
