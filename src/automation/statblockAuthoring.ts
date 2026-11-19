import { stringifyYaml } from "obsidian";
import { TEMPLATE_VERSIONS } from "../migration/types";
import type { CreatureSize } from "../marker/MarkerTypes";
import { assertKeys, finiteNumber, object, string } from "./validation";

const sizeNames = {
  tiny: "Tiny", small: "Small", medium: "Medium", large: "Large", huge: "Huge", gargantuan: "Gargantuan",
};
const abilities = ["str", "dex", "con", "int", "wis", "cha"];
const skills = [
  "acrobatics", "animal handling", "arcana", "athletics", "deception", "history", "insight", "intimidation",
  "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion",
  "sleight of hand", "stealth", "survival",
];

const textFields = {
  subtype: "subtype",
  alignment: "alignment",
  hitDice: "hit_dice",
  damageVulnerabilities: "damage_vulnerabilities",
  damageResistances: "damage_resistances",
  damageImmunities: "damage_immunities",
  conditionImmunities: "condition_immunities",
  senses: "senses",
  languages: "languages",
};
const featureFields = {
  traits: "traits", actions: "actions", bonusActions: "bonus_actions", reactions: "reactions", legendaryActions: "legendary_actions",
};
type Feature = { name: string; desc: string };
type Bonus = Record<string, number>;

export interface CreatureStatblock extends Record<string, unknown> {
  name: string;
  size: string;
  type: string;
  ac: number;
  hp: number;
  speed: string;
  stats: number[];
  cr: string;
  senses?: string;
  saves?: Bonus[];
  skillsaves?: Bonus[];
}

export const STATBLOCK_INPUT_FIELDS = [
  "size", "creatureType", "ac", "hp", "speed", "stats", "cr", "saves", "skillsaves", "description",
  ...Object.keys(textFields), ...Object.keys(featureFields),
];

export function readChallengeRating(value: unknown, label: string): string {
  if (value === 0.125) return "1/8";
  if (value === 0.25) return "1/4";
  if (value === 0.5) return "1/2";
  if (typeof value !== "number" && typeof value !== "string") throw new Error(`${label} is required.`);
  const cr = String(value).trim();
  if (!/^(?:[0-9]|[12][0-9]|30|1\/[248])$/.test(cr)) {
    throw new Error(`${label} must be 0 through 30, 1/8, 1/4, or 1/2.`);
  }
  return cr;
}

function readBonuses(value: unknown, allowed: string[], label: string): Bonus[] {
  const fields = object(value, label);
  const normalized = new Map<string, number>();
  for (const [key, bonus] of Object.entries(fields)) {
    const name = key.toLowerCase().replace(/\s+/g, "");
    if (!allowed.includes(name) || normalized.has(name)) throw new Error(`${label} has an invalid or repeated entry "${key}".`);
    normalized.set(name, finiteNumber(bonus, `${label}.${key}`, { integer: true })!);
  }
  return Array.from(normalized, ([key, bonus]) => ({ [key]: bonus }));
}

function readFeatures(value: unknown, label: string): Feature[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error(`${label} must be an array of up to 100 entries.`);
  return value.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const row = object(entry, itemLabel);
    assertKeys(row, ["name", "desc"], itemLabel);
    return {
      name: string(row.name, `${itemLabel}.name`, { maxLength: 500 })!,
      desc: string(row.desc, `${itemLabel}.desc`, { maxLength: 20_000 })!,
    };
  });
}

export function readStatblock(name: string, input: unknown) {
  const fields = object(input, "statblock");
  assertKeys(fields, STATBLOCK_INPUT_FIELDS, "statblock");
  const size = string(fields.size, "statblock.size")!.toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(sizeNames, size)) {
    throw new Error("statblock.size must be Tiny, Small, Medium, Large, Huge, or Gargantuan.");
  }
  const creatureSize = size as CreatureSize;
  if (!Array.isArray(fields.stats) || fields.stats.length !== 6) {
    throw new Error("statblock.stats must contain six scores in STR, DEX, CON, INT, WIS, CHA order.");
  }

  const stats: CreatureStatblock = {
    name,
    size: sizeNames[creatureSize],
    type: string(fields.creatureType, "statblock.creatureType", { maxLength: 100 })!,
    ac: finiteNumber(fields.ac, "statblock.ac", { integer: true, min: 1 })!,
    hp: finiteNumber(fields.hp, "statblock.hp", { integer: true, min: 1 })!,
    speed: string(fields.speed, "statblock.speed", { maxLength: 500 })!,
    stats: fields.stats.map((score, index) => finiteNumber(score, `statblock.stats[${index}]`, { integer: true, min: 1, max: 30 })!),
    cr: readChallengeRating(fields.cr, "statblock.cr"),
  };
  for (const [key, field] of Object.entries(textFields)) {
    const value = string(fields[key], `statblock.${key}`, { optional: true, maxLength: 2_000 });
    if (value !== undefined) stats[field] = value;
  }
  for (const [key, field] of Object.entries(featureFields)) {
    if (fields[key] !== undefined) stats[field] = readFeatures(fields[key], `statblock.${key}`);
  }
  if (fields.saves !== undefined) stats.saves = readBonuses(fields.saves, abilities, "statblock.saves");
  if (fields.skillsaves !== undefined) {
    stats.skillsaves = readBonuses(fields.skillsaves, skills.map(skill => skill.replace(/ /g, "")), "statblock.skillsaves");
  }
  const description = string(fields.description, "statblock.description", { optional: true, maxLength: 20_000 });
  return { stats, creatureSize, description };
}

const signed = (value: number) => value >= 0 ? `+${value}` : String(value);

export function renderInlineStatblock(stats: CreatureStatblock, description?: string): string {
  const yaml = stringifyYaml({ ...stats, ...(description === undefined ? {} : { desc: description }) }).trimEnd();
  const length = (yaml.match(/`+/g) ?? []).reduce((size, run) => Math.max(size, run.length + 1), 3);
  const fence = "`".repeat(length);
  return `${fence}statblock\n${yaml}\n${fence}`;
}

function renderBonuses(rows: Bonus[]): string {
  return rows.flatMap(row => Object.entries(row)).map(([key, bonus]) => {
    const label = skills.find(skill => skill.replace(/ /g, "") === key) ?? key.toUpperCase();
    return `${label} ${signed(bonus)}`;
  }).join(", ");
}

export function renderCreatureNote(stats: CreatureStatblock, tokenId: string, description?: string, statblockDescription?: string): string {
  const { type, ...fields } = stats;
  const modifiers = stats.stats.map(score => Math.floor((score - 10) / 2));
  const frontmatter = stringifyYaml({
    statblock: true,
    layout: "Basic 5e Layout",
    ...fields,
    type: "creature",
    creature_type: type,
    ...(statblockDescription === undefined ? {} : { desc: statblockDescription }),
    fage_stats: modifiers,
    token_id: tokenId,
    template_version: TEMPLATE_VERSIONS.creature,
  }).trimEnd();

  const classification = `${stats.size} ${stats.type}${stats.subtype ? ` (${stats.subtype})` : ""}${stats.alignment ? `, ${stats.alignment}` : ""}`;
  const body = [
    `# ${stats.name}`,
    "```dnd-hub\n```",
    `*${classification}*`,
    `- **Armor Class** ${stats.ac}\n- **Hit Points** ${stats.hp}${stats.hit_dice ? ` (${stats.hit_dice})` : ""}\n- **Speed** ${stats.speed}`,
    `| ${abilities.map(ability => ability.toUpperCase()).join(" | ")} |\n| ${abilities.map(() => "---").join(" | ")} |\n| ${stats.stats.map((score, index) => `${score} (${signed(modifiers[index]!)})`).join(" | ")} |`,
  ];
  const details: Array<[string, unknown]> = [
    ["Saving Throws", stats.saves?.length ? renderBonuses(stats.saves) : undefined],
    ["Skills", stats.skillsaves?.length ? renderBonuses(stats.skillsaves) : undefined],
    ["Damage Vulnerabilities", stats.damage_vulnerabilities],
    ["Damage Resistances", stats.damage_resistances],
    ["Damage Immunities", stats.damage_immunities],
    ["Condition Immunities", stats.condition_immunities],
    ["Senses", stats.senses],
    ["Languages", stats.languages],
    ["Challenge", stats.cr],
  ];
  body.push(details.filter(([, value]) => value !== undefined).map(([label, value]) => `- **${label}** ${value}`).join("\n"));

  const sections = {
    traits: "Traits", actions: "Actions", bonus_actions: "Bonus Actions", reactions: "Reactions", legendary_actions: "Legendary Actions",
  };
  for (const [key, title] of Object.entries(sections)) {
    const entries = stats[key] as Feature[] | undefined;
    if (entries?.length) body.push(`## ${title}`, ...entries.map(({ name, desc }) => `**${name}.** ${desc}`));
  }
  if (statblockDescription || description) body.push("## Description", ...[statblockDescription, description].filter((value): value is string => !!value));

  body.push(renderInlineStatblock(stats, statblockDescription));
  return `---\n${frontmatter}\n---\n\n${body.join("\n\n")}\n`;
}
