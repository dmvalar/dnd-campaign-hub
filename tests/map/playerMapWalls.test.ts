import { describe, expect, it } from "vitest";
import { buildSightBlockingWalls } from "../../src/map-views/playerMapWalls";

describe("player map sight-blocking walls", () => {
  it("follows the clockwise-rotated scatter footprint and preserves explicit zero height", () => {
    const walls = buildSightBlockingWalls([], [{
      id: "scatter", assetId: "debris", position: { x: 80, y: 100 },
      width: 30, height: 10, rotation: 90, zIndex: 0, placedAt: 0,
      scatterConfig: { blocksVision: true, wallHeight: 0 },
    }]);
    const corners = [
      { x: 85, y: 85 }, { x: 85, y: 115 }, { x: 75, y: 115 }, { x: 75, y: 85 },
    ];
    expect(walls).toHaveLength(4);
    walls.forEach((wall, i) => {
      const corner = corners[i]!;
      expect(wall.start.x).toBeCloseTo(corner.x);
      expect(wall.start.y).toBeCloseTo(corner.y);
      expect(wall.end).toEqual(walls[(i + 1) % walls.length]!.start);
      expect(wall.height).toBe(0);
    });
  });

  it("keeps rotated pivot doors and closed doors while omitting transparent wall types", () => {
    const segment = { start: { x: 10, y: 10 }, end: { x: 20, y: 10 } };
    const closed = { ...segment, type: "door", open: false };
    const pivot = { ...segment, type: "secretPivot", open: true, pivotEnd: "end", openDirection: -1 };
    const walls = buildSightBlockingWalls([
      closed, pivot,
      { ...segment, type: "door", open: true },
      { ...segment, type: "secret", open: true },
      { ...segment, type: "window" },
      { ...segment, type: "terrain" },
    ]);

    expect(walls).toEqual([
      closed, { ...pivot, start: { x: 20, y: 20 }, end: segment.end },
    ]);
    segment.end.x = 30;
    expect(walls[0]?.end.x).toBe(20);
    expect(walls[1]?.end.x).toBe(20);
  });
});
