import { stringifyYaml } from "obsidian";
import { TEMPLATE_VERSIONS } from "../migration/types";
import { EncounterBuilder, type EncounterCreature } from "../encounter/EncounterBuilder";
import type { ResolvedPartyMember, StoredEncounterCreature } from "../party/PartyTypes";
import { updateAuthoringFrontmatter as updateYamlFrontmatter } from "./frontmatter";
import { campaignNotes, currentDate, noteFields, optionalText, qualifiedNotePath } from "./campaignNotes";
import { readChallengeRating } from "./statblockAuthoring";
import type { AuthoringContext, AuthoringResult } from "./types";
import { assertKeys, boolean, finiteNumber, object, safeName, string, within } from "./validation";

export async function planEncounter(ctx: AuthoringContext, input: unknown): Promise<AuthoringResult> {
  const fields = object(input, "encounter");
  assertKeys(fields, ["name", "scenePath", "adventurePath", "creatures", "includeParty", "selectedPartyId", "selectedPartyMembers", "description"], "encounter");
  const name = safeName(fields.name);
  const manager = ctx.plugin.partyManager;
  if (manager.getEncounter(name)) throw new Error(`A stored encounter named "${name}" already exists`);
  const scenePath = fields.scenePath === undefined ? undefined : qualifiedNotePath(fields.scenePath, "scenePath");
  let adventurePath = fields.adventurePath === undefined ? undefined : qualifiedNotePath(fields.adventurePath, "adventurePath");
  const notes = await campaignNotes(ctx);
  if (adventurePath) notes.requireNote(adventurePath, "adventure");
  if (scenePath) {
    const scene = notes.requireNote(scenePath, "scene");
    const { sceneAdventurePath } = await import("../session/adventureScenes");
    const adventures = [...notes.notes].filter(([, fm]) => fm.type === "adventure").map(([path]) => path);
    const owner = sceneAdventurePath(scenePath, scene, adventures, ctx.campaignPath, notes.resolveReference);
    if (!owner || (adventurePath && owner !== adventurePath)) throw new Error("Scene does not belong to the requested adventure");
    adventurePath = owner;
    if (scene.tracker_encounter || scene.encounter_file) throw new Error("Scene already has an encounter; an agent create request cannot replace it");
  }
  if (!Array.isArray(fields.creatures) || !fields.creatures.length || fields.creatures.length > 100) throw new Error("creatures must contain 1 to 100 entries");
  const snapshots = new Map<string, Record<string, unknown>>();
  const creatures: EncounterCreature[] = [];
  let count = 0;
  for (const raw of fields.creatures) {
    const row = object(raw, "creature");
    assertKeys(row, ["path", "count", "initiative", "currentHp", "thp", "friendly", "hidden"], "creature");
    const path = qualifiedNotePath(row.path, "creature.path");
    if (!within(path, ctx.campaignPath) && !within(path, "z_Beastiarity")) throw new Error("Creature is outside the campaign and bestiary");
    const fm = noteFields(await ctx.readNote(path));
    if (fm.type !== "creature" && fm.type !== "npc") throw new Error(`Expected a creature or NPC statblock: ${path}`);
    if (fm.type === "npc") notes.requireNote(path, "npc");
    const maximum = finiteNumber(fm.hp_max ?? fm.hp, "creature HP", { integer: true, min: 1 });
    const ac = finiteNumber(fm.ac, "creature AC", { integer: true, min: 1 });
    const current = finiteNumber(row.currentHp, "currentHp", { optional: true, integer: true, min: 0, max: maximum }) ?? maximum;
    const copies = finiteNumber(row.count, "count", { optional: true, integer: true, min: 1, max: 100 }) ?? 1;
    count += copies;
    if (count > 500) throw new Error("An encounter can contain at most 500 creatures");
    const initiative = finiteNumber(row.initiative, "initiative", { optional: true, integer: true, min: -100, max: 100 });
    const dex = Array.isArray(fm.stats) ? fm.stats[1] : 10;
    const creature: EncounterCreature = {
      name: string(fm.name, "creature name"), path, count: copies, hp: current, maxHp: maximum,
      thp: finiteNumber(row.thp, "thp", { optional: true, integer: true, min: 0 }) ?? 0,
      ac, cr: readChallengeRating(fm.cr, "creature CR"), tokenId: typeof fm.token_id === "string" ? fm.token_id : undefined,
      initBonus: typeof dex === "number" ? Math.floor((dex - 10) / 2) : 0,
      initiative, fixedInitiative: initiative !== undefined,
      isFriendly: boolean(row.friendly, "friendly"), isHidden: boolean(row.hidden, "hidden"),
    };
    snapshots.set(path, fm);
    creatures.push(creature);
  }
  const includeParty = boolean(fields.includeParty, "includeParty");
  const selectedPartyId = string(fields.selectedPartyId, "selectedPartyId", { optional: true });
  const party = selectedPartyId ? manager.getParty(selectedPartyId) : manager.getPartiesForCampaign(ctx.campaignPath)[0];
  if ((selectedPartyId || includeParty) && (!party || (party.campaignPath && party.campaignPath !== ctx.campaignPath))) throw new Error("Selected party is not available in this campaign");
  let partyMembers: ResolvedPartyMember[] = includeParty && party ? await manager.resolveMembers(party.id) : [];
  if (fields.selectedPartyMembers !== undefined) {
    if (!Array.isArray(fields.selectedPartyMembers)) throw new Error("selectedPartyMembers must be an array of member names");
    const names = fields.selectedPartyMembers.map(value => string(value, "selectedPartyMembers entry"));
    if (includeParty && names.some(value => !partyMembers.some(member => member.name === value))) throw new Error("Selected party member was not found in the party");
    partyMembers = partyMembers.filter(member => names.includes(member.name));
  }
  partyMembers = partyMembers.filter(member => member.enabled && !member.absent);
  const builder = new EncounterBuilder(ctx.app, ctx.plugin);
  builder.creatures = creatures;
  builder.includeParty = includeParty;
  if (!partyMembers.length && !creatures.some(creature => creature.isFriendly)) ctx.warn("No active party supplied; difficulty uses the plugin's default estimate for four level-3 PCs.");
  const calculation = await builder.calculateEncounterDifficulty({ statblocks: snapshots, partyMembers: partyMembers.map(member => ({ ...member, hp: member.maxHp })) });
  const { analysis, partyStats, enemyStats } = calculation;
  const difficulty = {
    rating: analysis.difficulty, color: analysis.difficultyColor,
    party_count: partyStats.memberCount, party_avg_level: partyStats.avgLevel,
    party_total_hp: partyStats.totalHP, party_avg_ac: partyStats.avgAC, party_total_dpr: partyStats.totalDPR,
    party_dpr_override_count: partyStats.dprOverrideCount, party_attack_override_count: partyStats.attackOverrideCount,
    party_hit_chance: analysis.partyHitChance * 100, party_action_economy_mod: analysis.partyActionEconomyMod,
    party_effective_dpr: analysis.partyEffectiveDPR, enemy_count: enemyStats.creatureCount,
    enemy_total_hp: enemyStats.totalHP, enemy_avg_ac: enemyStats.avgAC, enemy_total_dpr: enemyStats.totalDPR,
    enemy_hit_chance: analysis.enemyHitChance * 100, enemy_action_economy_mod: analysis.enemyActionEconomyMod,
    enemy_effective_dpr: analysis.enemyEffectiveDPR, xp_rating: analysis.xpDifficulty.rating,
    base_xp: analysis.xpDifficulty.baseXp, adjusted_xp: analysis.xpDifficulty.adjustedXp,
    xp_multiplier: analysis.xpDifficulty.multiplier, easy_threshold: analysis.xpDifficulty.thresholds.easy,
    medium_threshold: analysis.xpDifficulty.thresholds.medium, hard_threshold: analysis.xpDifficulty.thresholds.hard,
    deadly_threshold: analysis.xpDifficulty.thresholds.deadly, rounds_to_defeat: analysis.roundsToDefeatEnemies,
    rounds_party_survives: analysis.roundsToDefeatParty, survival_ratio: analysis.survivalRatio,
  };
  const notePath = `${ctx.campaignPath}/z_Encounters/${name}.md`;
  const rows = creatures.map(creature => ({
    name: creature.name, count: creature.count, path: creature.path, hp: creature.hp, hp_max: creature.maxHp,
    ac: creature.ac, cr: creature.cr, thp: creature.thp, token_id: creature.tokenId, init_bonus: creature.initBonus,
    initiative: creature.initiative, fixed_initiative: creature.fixedInitiative,
    is_friendly: creature.isFriendly, is_hidden: creature.isHidden,
  }));
  const partyRows = partyMembers.map(member => ({ name: member.name, note_path: member.notePath, level: member.level,
    hp: member.hp, hp_max: member.maxHp, thp: member.thp, ac: member.ac, token_id: member.tokenId, init_bonus: member.initBonus }));
  const metadata = { type: "encounter", template_version: TEMPLATE_VERSIONS.encounter, name, date: currentDate(ctx.now), campaign_path: ctx.campaignPath,
    scene_path: scenePath, adventure_path: adventurePath, include_party: includeParty,
    selected_party_id: party?.id, selected_party_name: party?.name, party_members: partyRows,
    use_color_names: false, creatures: rows, difficulty };
  const description = optionalText(fields.description, "description") ?? "";
  await ctx.stageNote(notePath, `---\n${stringifyYaml(metadata)}---\n\n# ${name}\n\n\`\`\`dnd-hub\n\`\`\`\n\n## Difficulty Analysis\n\n\`\`\`dnd-hub-view\nencounter-difficulty\n\`\`\`\n\n## Creatures\n\n\`\`\`dnd-hub-view\nencounter-creatures\n\`\`\`\n\n## GM Notes\n\n${description}\n`);
  const combatants: StoredEncounterCreature[] = partyMembers.map(member => manager.memberToEncounterCreature(member));
  for (const creature of creatures) {
    for (let index = 0; index < creature.count; index++) combatants.push({
      id: ctx.id("combatant"), name: creature.name, display: creature.count > 1 ? `${creature.name} ${index + 1}` : creature.name,
      initiative: creature.initiative ?? 0, fixedInitiative: creature.fixedInitiative, modifier: creature.initBonus ?? 0,
      hp: creature.hp!, currentHP: creature.hp!, maxHP: creature.maxHp!, tempHP: creature.thp ?? 0,
      ac: creature.ac!, currentAC: creature.ac!, cr: creature.cr, notePath: creature.path, tokenId: creature.tokenId,
      enabled: true, hidden: creature.isHidden ?? false, friendly: creature.isFriendly ?? false, trap: false, player: false, statuses: [],
    });
  }
  const stored = manager.buildEncounter(name, combatants, scenePath ?? notePath);
  const effect = manager.prepareEncounterCreate(name, stored);
  ctx.stageEffect({ key: `encounter:${name.toLowerCase()}`, ...effect });
  if (scenePath) await ctx.stageUpdate(scenePath, document => updateYamlFrontmatter(document, fm => ({
    ...fm, tracker_encounter: name, encounter_file: `[[${notePath}]]`, encounter_creatures: rows,
    encounter_difficulty: { difficulty: analysis.difficulty, roundsToDefeat: analysis.roundsToDefeatEnemies,
      survivalRatio: analysis.survivalRatio, partyHP: partyStats.totalHP, partyEffectiveDPR: analysis.partyEffectiveDPR,
      enemyHP: enemyStats.totalHP, enemyEffectiveDPR: analysis.enemyEffectiveDPR, enemyCount: enemyStats.creatureCount, partyCount: partyStats.memberCount },
    selected_party_id: party?.id ?? "", selected_party_members: partyMembers.map(member => member.name),
  })));
  return { notePath, encounterName: name };
}
