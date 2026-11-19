import { SESSION_GM_TEMPLATE, SESSION_PLAYER_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration/types";
import { sceneAdventurePath } from "../session/adventureScenes";
import { addSessionBacklink } from "../session/SessionBacklinks";
import { updateAuthoringFrontmatter as updateYamlFrontmatter } from "./frontmatter";
import { campaignMetadata, campaignNotes, currentDate, notePaths, optionalText, qualifiedNotePath, renderTemplate, wikiLink } from "./campaignNotes";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, finiteNumber, object, safeName, string } from "./validation";

export async function planSession(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "session");
  assertKeys(fields, ["name", "sessionNumber", "date", "adventurePaths", "plannedScenePaths", "startingScenePath", "partyId", "location", "description"], "session");
  const snapshot = await campaignNotes(ctx);
  const existing = [...snapshot.notes].filter(([, fm]) => fm.type === "session");
  const numbers = existing.map(([path, fm]) => Number(fm.sessionNum ?? fm.session_number ?? path.split("/").pop()?.match(/^(\d{3})_/)?.[1] ?? 0));
  const next = Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
  const number = finiteNumber(fields.sessionNumber, "sessionNumber", { optional: true, integer: true, min: 1, max: 999 }) ?? next;
  if (number > 999 || numbers.includes(number)) throw new Error("Session number is already used or exceeds 999");
  const date = string(fields.date, "date", { optional: true }) ?? currentDate(ctx.now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("date must be a valid YYYY-MM-DD date");
  const name = fields.name === undefined ? `Session ${number}` : safeName(fields.name);
  const adventures = notePaths(fields.adventurePaths, "adventurePaths");
  for (const path of adventures) snapshot.requireNote(path, "adventure");
  const plan = notePaths(fields.plannedScenePaths, "plannedScenePaths");
  const starting = fields.startingScenePath === undefined ? "" : qualifiedNotePath(fields.startingScenePath, "startingScenePath");
  const allAdventures = [...snapshot.notes].filter(([, fm]) => fm.type === "adventure").map(([path]) => path);
  for (const path of [...plan, ...(starting ? [starting] : [])]) {
    const fm = snapshot.requireNote(path, "scene");
    const owner = sceneAdventurePath(path, fm, allAdventures, ctx.campaignPath, snapshot.resolveReference);
    if (!owner || !adventures.includes(owner)) throw new Error(`Scene does not belong to a linked adventure: ${path}`);
  }
  if (starting && plan.length && !plan.includes(starting)) throw new Error("startingScenePath must belong to the explicit scene plan");
  const partyId = string(fields.partyId, "partyId", { optional: true }) ?? "";
  if (partyId) {
    const party = ctx.plugin.partyManager.getParty(partyId);
    if (!party || (party.campaignPath && party.campaignPath !== ctx.campaignPath)) throw new Error("partyId is unavailable in this campaign");
  }
  const campaign = await campaignMetadata(ctx);
  const notePath = `${ctx.campaignPath}/${String(number).padStart(3, "0")}_${date.replace(/-/g, "")}.md`;
  let content = renderTemplate(String(campaign.fields.role).toLowerCase() === "player" ? SESSION_PLAYER_TEMPLATE : SESSION_GM_TEMPLATE, {
    type: "session", template_version: TEMPLATE_VERSIONS.session, name, status: "planned", campaign: campaign.name,
    campaign_path: ctx.campaignPath, world: campaign.world, sessionNum: number, date,
    adventure: adventures[0] ? wikiLink(adventures[0]) : "", adventures: adventures.map(wikiLink),
    planned_scenes: plan.map(wikiLink), starting_scene: starting ? wikiLink(starting) : "", ending_scene: "", party_id: partyId,
    location: optionalText(fields.location, "location") ?? "",
  }).replace(/^# Session[^\r\n]*$/m, () => `# Session ${number}${fields.name === undefined ? "" : ` - ${name}`}`);
  const description = optionalText(fields.description, "description");
  if (description) content += `\n## Session Prep\n\n${description}\n`;
  await ctx.stageNote(notePath, content);
  for (const path of [...adventures, ...(starting ? [starting] : [])]) {
    await ctx.stageUpdate(path, document => updateYamlFrontmatter(document, fm => ({ ...fm, sessions: addSessionBacklink(fm.sessions, notePath) })));
  }
  return { notePath, sessionNumber: number };
}
