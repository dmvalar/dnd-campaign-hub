import { stringifyYaml } from "obsidian";
import { SCENE_TEMPLATE } from "../templates";
import { TEMPLATE_VERSIONS } from "../migration/types";
import { getSceneNumber, sceneAdventurePath } from "../session/adventureScenes";
import { campaignMetadata, campaignNotes, currentDate, fileName, folderExists, notePaths, optionalText, parentFolder, qualifiedNotePath, singleLineText } from "./campaignNotes";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, finiteNumber, object, safeName, string } from "./validation";

export async function planScene(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "scene");
  assertKeys(fields, ["name", "adventurePath", "sceneNumber", "act", "sceneType", "duration", "difficulty", "goal", "description", "npcPaths", "mapPaths"], "scene");
  const name = safeName(fields.name);
  const adventurePath = qualifiedNotePath(fields.adventurePath, "adventurePath");
  const snapshot = await campaignNotes(ctx);
  snapshot.requireNote(adventurePath, "adventure");
  const number = finiteNumber(fields.sceneNumber, "sceneNumber", { integer: true, min: 1, max: 9999 });
  const act = finiteNumber(fields.act, "act", { optional: true, integer: true, min: 1, max: 99 }) ?? 1;
  const type = string(fields.sceneType, "sceneType", { optional: true }) ?? "exploration";
  if (!["combat", "exploration", "social", "puzzle", "montage"].includes(type)) throw new Error("Invalid sceneType");
  const difficulty = string(fields.difficulty, "difficulty", { optional: true }) ?? "medium";
  if (!["easy", "medium", "hard", "deadly"].includes(difficulty)) throw new Error("Invalid scene difficulty");
  const duration = singleLineText(fields.duration, "duration") ?? "30min";
  const goal = optionalText(fields.goal, "goal") ?? "";
  const description = optionalText(fields.description, "description");
  const npcs = notePaths(fields.npcPaths, "npcPaths");
  for (const path of npcs) snapshot.requireNote(path, "npc");
  const maps = notePaths(fields.mapPaths, "mapPaths");
  const mapIds = maps.map(path => string(snapshot.requireNote(path, "map").map_id, "map ID"));
  const adventures = [...snapshot.notes].filter(([, fm]) => fm.type === "adventure").map(([path]) => path);
  for (const [path, fm] of snapshot.notes) {
    if (sceneAdventurePath(path, fm, adventures, ctx.campaignPath, snapshot.resolveReference) === adventurePath
      && getSceneNumber(path, fm.scene_number) === number) throw new Error(`Scene number ${number} already exists in this adventure`);
  }
  const adventureName = fileName(adventurePath).replace(/\.md$/i, "");
  const parent = parentFolder(adventurePath);
  const dedicated = fileName(parent) === adventureName;
  const existingLegacy = `${parent}/${adventureName} - Scenes`;
  const folder = dedicated ? `${parent}/Scenes`
    : folderExists(ctx, existingLegacy) ? existingLegacy : `${parent}/${adventureName} - Scenes`;
  const notePath = `${folder}/Scene ${number} - ${name}.md`;
  const campaign = await campaignMetadata(ctx);
  const metadata = {
    type: "scene", template_version: TEMPLATE_VERSIONS.scene, name,
    adventure: `[[${adventurePath}]]`, campaign: campaign.name, campaign_path: ctx.campaignPath,
    world: campaign.world, act, scene_number: number, duration, scene_type: type, difficulty, goal,
    status: "not-started", sessions: [], tracker_encounter: "", encounter_file: "", encounter_creatures: [],
    encounter_difficulty: null, selected_party_id: "", selected_party_members: [],
    npc_paths: npcs.map(path => `[[${path}]]`), map_paths: maps.map(path => `[[${path}]]`), date: currentDate(ctx.now),
  };
  const values: Record<string, string> = {
    SCENE_NUMBER: String(number), SCENE_NAME: name, DURATION: duration, TYPE: type, DIFFICULTY: difficulty,
    ACT_NUMBER: String(act), ADVENTURE_NAME: adventurePath,
  };
  let body = SCENE_TEMPLATE.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/\{\{(\w+)\}\}/g, (token, key: string) => values[key] ?? token);
  if (goal) body += `\n## Scene Goal\n\n${goal}\n`;
  if (description) body += `\n## Scene Details\n\n${description}\n`;
  if (npcs.length) body += `\n## NPCs\n\n${npcs.map(path => `- [[${path}]]`).join("\n")}\n`;
  if (mapIds.length) body += `\n## Maps\n\n${mapIds.map(mapId => `\`\`\`dnd-map\n${JSON.stringify({ mapId }, null, 2)}\n\`\`\``).join("\n\n")}\n`;
  await ctx.stageNote(notePath, `---\n${stringifyYaml(metadata)}---\n${body}`);
  return { notePath };
}
