export function calculateActionEconomyModifiers(
  partyActionCount: number,
  enemyActionCount: number,
): { partyActionEconomyMod: number; enemyActionEconomyMod: number } {
  let partyActionEconomyMod = 1.0;
  let enemyActionEconomyMod = 1.0;

  if (partyActionCount <= 0 || enemyActionCount <= 0) {
    return { partyActionEconomyMod, enemyActionEconomyMod };
  }

  const actionRatio = partyActionCount / enemyActionCount;

  if (actionRatio > 2.0) {
    partyActionEconomyMod = 1.0 + Math.min((actionRatio - 1) * 0.1, 0.25);
    enemyActionEconomyMod = Math.max(0.85, 1.0 - (actionRatio - 2) * 0.05);
  } else if (actionRatio < 0.5) {
    const inverseRatio = enemyActionCount / partyActionCount;
    partyActionEconomyMod = Math.max(0.85, 1.0 - (inverseRatio - 2) * 0.05);
    enemyActionEconomyMod = 1.0 + Math.min((inverseRatio - 1) * 0.1, 0.25);
  }

  return { partyActionEconomyMod, enemyActionEconomyMod };
}

export type XpDifficulty = "Trivial" | "Easy" | "Medium" | "Hard" | "Deadly";

export interface XpThresholds {
  easy: number;
  medium: number;
  hard: number;
  deadly: number;
}

export interface XpDifficultyResult {
  rating: XpDifficulty;
  baseXp: number;
  adjustedXp: number;
  multiplier: number;
  thresholds: XpThresholds;
}

const XP_THRESHOLDS_BY_LEVEL: Record<number, XpThresholds> = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

const XP_MULTIPLIERS = [1, 1.5, 2, 2.5, 3, 4] as const;

export function getEncounterXpMultiplier(enemyCount: number, partyCount: number): number {
  if (enemyCount <= 0) return 1;

  let index: number;
  if (enemyCount === 1) index = 0;
  else if (enemyCount === 2) index = 1;
  else if (enemyCount <= 6) index = 2;
  else if (enemyCount <= 10) index = 3;
  else if (enemyCount <= 14) index = 4;
  else index = 5;

  if (partyCount > 0 && partyCount < 3) index += 1;
  else if (partyCount >= 6) index -= 1;

  index = Math.max(0, Math.min(XP_MULTIPLIERS.length - 1, index));
  return XP_MULTIPLIERS[index]!;
}

export function calculatePartyXpThresholds(levels: number[]): XpThresholds {
  return levels.reduce<XpThresholds>(
    (total, rawLevel) => {
      const level = Math.max(1, Math.min(20, Math.round(rawLevel)));
      const thresholds = XP_THRESHOLDS_BY_LEVEL[level]!;
      return {
        easy: total.easy + thresholds.easy,
        medium: total.medium + thresholds.medium,
        hard: total.hard + thresholds.hard,
        deadly: total.deadly + thresholds.deadly,
      };
    },
    { easy: 0, medium: 0, hard: 0, deadly: 0 },
  );
}

export function calculateXpDifficulty(
  baseXp: number,
  enemyCount: number,
  partyLevels: number[],
): XpDifficultyResult {
  const thresholds = calculatePartyXpThresholds(partyLevels);
  const multiplier = getEncounterXpMultiplier(enemyCount, partyLevels.length);
  const adjustedXp = Math.round(baseXp * multiplier);

  let rating: XpDifficulty;
  if (adjustedXp < thresholds.easy) rating = "Trivial";
  else if (adjustedXp < thresholds.medium) rating = "Easy";
  else if (adjustedXp < thresholds.hard) rating = "Medium";
  else if (adjustedXp < thresholds.deadly) rating = "Hard";
  else rating = "Deadly";

  return {
    rating,
    baseXp,
    adjustedXp,
    multiplier,
    thresholds,
  };
}
