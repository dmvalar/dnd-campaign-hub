import { describe, expect, it } from "vitest";
import {
  calculateActionEconomyModifiers,
  calculatePartyXpThresholds,
  calculateXpDifficulty,
  getEncounterXpMultiplier,
} from "../../src/encounter/DifficultyMath";

describe("encounter/DifficultyMath", () => {
  it("leaves balanced action counts unchanged", () => {
    expect(calculateActionEconomyModifiers(4, 4)).toEqual({
      partyActionEconomyMod: 1,
      enemyActionEconomyMod: 1,
    });
  });

  it("rewards a heavily outnumbering party and slightly dampens solo enemies", () => {
    expect(calculateActionEconomyModifiers(6, 1)).toEqual({
      partyActionEconomyMod: 1.25,
      enemyActionEconomyMod: 0.85,
    });
  });

  it("rewards a heavily outnumbering enemy side and slightly dampens the party", () => {
    expect(calculateActionEconomyModifiers(2, 8)).toEqual({
      partyActionEconomyMod: 0.9,
      enemyActionEconomyMod: 1.25,
    });
  });

  it("returns neutral modifiers when either side has no actions", () => {
    expect(calculateActionEconomyModifiers(0, 4)).toEqual({
      partyActionEconomyMod: 1,
      enemyActionEconomyMod: 1,
    });
    expect(calculateActionEconomyModifiers(4, 0)).toEqual({
      partyActionEconomyMod: 1,
      enemyActionEconomyMod: 1,
    });
  });

  it("sums per-character XP thresholds by level", () => {
    expect(calculatePartyXpThresholds([3, 3, 3, 3])).toEqual({
      easy: 300,
      medium: 600,
      hard: 900,
      deadly: 1600,
    });
  });

  it("adjusts XP multipliers for small and large parties", () => {
    expect(getEncounterXpMultiplier(2, 4)).toBe(1.5);
    expect(getEncounterXpMultiplier(2, 2)).toBe(2);
    expect(getEncounterXpMultiplier(2, 6)).toBe(1);
  });

  it("classifies adjusted XP against party thresholds", () => {
    expect(calculateXpDifficulty(500, 1, [3, 3, 3, 3]).rating).toBe("Easy");
    expect(calculateXpDifficulty(700, 2, [3, 3, 3, 3])).toMatchObject({
      rating: "Hard",
      baseXp: 700,
      adjustedXp: 1050,
      multiplier: 1.5,
    });
    expect(calculateXpDifficulty(1200, 2, [3, 3, 3, 3]).rating).toBe("Deadly");
  });
});
