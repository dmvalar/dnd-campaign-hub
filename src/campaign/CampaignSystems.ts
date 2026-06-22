export const CAMPAIGN_SYSTEM_DND_5E = "dnd-5e";
export const CAMPAIGN_SYSTEM_HOW_TO_BE_A_HERO = "how-to-be-a-hero";
export const CAMPAIGN_SYSTEM_OTHER = "other";

export type CampaignSystemId =
  | typeof CAMPAIGN_SYSTEM_DND_5E
  | typeof CAMPAIGN_SYSTEM_HOW_TO_BE_A_HERO
  | "pathfinder-2e"
  | "call-of-cthulhu"
  | "savage-worlds"
  | "fate-core"
  | "osr"
  | typeof CAMPAIGN_SYSTEM_OTHER;

export type CampaignSystemOption = {
  id: CampaignSystemId;
  label: string;
};

export const CAMPAIGN_SYSTEM_OPTIONS: CampaignSystemOption[] = [
  { id: CAMPAIGN_SYSTEM_DND_5E, label: "Dungeons & Dragons 5th Edition" },
  { id: CAMPAIGN_SYSTEM_HOW_TO_BE_A_HERO, label: "How to be a Hero" },
  { id: "pathfinder-2e", label: "Pathfinder 2nd Edition" },
  { id: "call-of-cthulhu", label: "Call of Cthulhu" },
  { id: "savage-worlds", label: "Savage Worlds" },
  { id: "fate-core", label: "FATE Core" },
  { id: "osr", label: "Old School Renaissance" },
  { id: CAMPAIGN_SYSTEM_OTHER, label: "Other / Custom" },
];

const LEGACY_SYSTEM_LABELS: Record<string, CampaignSystemId> = {
  "d&d 5e": CAMPAIGN_SYSTEM_DND_5E,
  "dungeons & dragons 5th edition": CAMPAIGN_SYSTEM_DND_5E,
  "how to be a hero": CAMPAIGN_SYSTEM_HOW_TO_BE_A_HERO,
  "pathfinder 2e": "pathfinder-2e",
  "pathfinder 2nd edition": "pathfinder-2e",
  "call of cthulhu": "call-of-cthulhu",
  "savage worlds": "savage-worlds",
  "fate": "fate-core",
  "fate core": "fate-core",
  "osr": "osr",
  "old school renaissance": "osr",
  "other": CAMPAIGN_SYSTEM_OTHER,
  "other / custom": CAMPAIGN_SYSTEM_OTHER,
};

export function normalizeCampaignSystem(value: string | null | undefined): CampaignSystemId {
  const raw = String(value || "").trim();
  if (!raw) return CAMPAIGN_SYSTEM_DND_5E;
  const direct = CAMPAIGN_SYSTEM_OPTIONS.find((option) => option.id === raw);
  if (direct) return direct.id;
  return LEGACY_SYSTEM_LABELS[raw.toLowerCase()] || CAMPAIGN_SYSTEM_OTHER;
}

export function getCampaignSystemLabel(value: string | null | undefined): string {
  const id = normalizeCampaignSystem(value);
  return CAMPAIGN_SYSTEM_OPTIONS.find((option) => option.id === id)?.label || "Other / Custom";
}

export function isHowToBeAHeroSystem(value: string | null | undefined): boolean {
  return normalizeCampaignSystem(value) === CAMPAIGN_SYSTEM_HOW_TO_BE_A_HERO;
}
