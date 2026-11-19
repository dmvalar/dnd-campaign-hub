import { NPC_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration/types";
import { campaignMetadata, currentDate, optionalText, renderTemplate } from "./campaignNotes";
import { stageToken, type TokenAuthoringInput } from "./tokenAuthoring";
import { readStatblock, renderInlineStatblock } from "./statblockAuthoring";
import { stageFantasyStatblock } from "./monsterAuthoring";
import { parseVisionSenses } from "../utils/VisionSenses";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, object, safeName } from "./validation";

export async function planNpc(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "npc");
  const narrative = { motivation: "motivation", pursuit: "pursuit", physicalDetail: "physical_detail", speechPattern: "speech_pattern", activeProblem: "active_problem" };
  assertKeys(fields, ["name", ...Object.keys(narrative), "description", "token", "statblock"], "npc");
  const name = safeName(fields.name);
  const campaign = await campaignMetadata(ctx);
  const notePath = `${ctx.campaignPath}/NPCs/${name}.md`;
  const marker = fields.token === undefined ? {} : object(fields.token, "npc.token");
  assertKeys(marker, ["imagePath", "imageFit", "icon", "backgroundColor", "borderColor", "creatureSize", "senses"], "npc.token");
  const statblock = fields.statblock === undefined ? undefined : readStatblock(name, fields.statblock);
  if (statblock && marker.creatureSize !== undefined && marker.creatureSize !== statblock.creatureSize) throw new Error("NPC token size must match its statblock size");
  // NPCs always have a reusable token, matching the interactive creation flow.
  const tokenId = await stageToken(ctx, { ...marker, name, type: "npc",
    creatureSize: statblock?.creatureSize ?? marker.creatureSize,
    senses: marker.senses ?? (statblock ? parseVisionSenses(statblock.stats.senses) : undefined),
  } as TokenAuthoringInput);
  const fm: Record<string, unknown> = {
    type: "npc", template_version: TEMPLATE_VERSIONS.npc, name, campaign: campaign.name,
    campaign_path: ctx.campaignPath, world: campaign.world, date: currentDate(ctx.now), token_id: tokenId,
  };
  const placeholders: Record<string, string> = { name };
  for (const [key, property] of Object.entries(narrative)) {
    const value = optionalText(fields[key], `npc.${key}`) ?? "";
    fm[property] = value;
    placeholders[property] = value;
  }
  if (statblock) {
    const { type, ...stats } = statblock.stats;
    Object.assign(fm, stats, { type: "npc", creature_type: type, statblock: true, layout: "Basic 5e Layout",
      fage_stats: stats.stats.map(score => Math.floor((score - 10) / 2)) });
  }
  let content = renderTemplate(NPC_TEMPLATE, fm, placeholders);
  if (statblock) {
    content = content.replace("```statblock\n# Leave empty or add stat block here\n```", renderInlineStatblock(statblock.stats, statblock.description));
    stageFantasyStatblock(ctx, statblock.stats, notePath, statblock.description);
  }
  const description = optionalText(fields.description, "npc.description");
  if (description) content += `\n## NPC Details\n\n${description}\n`;
  await ctx.stageNote(notePath, content);
  return { notePath, tokenId };
}
