import { ADVENTURE_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration/types";
import { campaignMetadata, currentDate, optionalText, renderTemplate } from "./campaignNotes";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, finiteNumber, object, safeName } from "./validation";

export async function planAdventure(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "adventure");
  assertKeys(fields, ["name", "problem", "levelFrom", "levelTo", "expectedSessions", "description"], "adventure");
  const name = safeName(fields.name);
  const from = finiteNumber(fields.levelFrom, "levelFrom", { optional: true, integer: true, min: 1, max: 20 }) ?? 1;
  const to = finiteNumber(fields.levelTo, "levelTo", { optional: true, integer: true, min: from, max: 20 }) ?? from;
  const expected = finiteNumber(fields.expectedSessions, "expectedSessions", { optional: true, integer: true, min: 1, max: 1000 }) ?? 3;
  const problem = optionalText(fields.problem, "problem") ?? "";
  const description = optionalText(fields.description, "description");
  const campaign = await campaignMetadata(ctx);
  const notePath = `${ctx.campaignPath}/Adventures/${name}/${name}.md`;
  let content = renderTemplate(ADVENTURE_TEMPLATE, {
    type: "adventure", template_version: TEMPLATE_VERSIONS.adventure, name,
    campaign: campaign.name, campaign_path: ctx.campaignPath, world: campaign.world,
    status: "planning", level_range: `${from}-${to}`, current_act: 1,
    expected_sessions: expected, sessions: [], date: currentDate(ctx.now),
  }, { name, THE_PROBLEM: problem });
  if (description) content += `\n## Adventure Details\n\n${description}\n`;
  await ctx.stageNote(notePath, content);
  return { notePath };
}
