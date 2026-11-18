import { describe, expect, it } from "vitest";
import type { EnvAssetInstance } from "../../src/envasset/EnvAssetTypes";
import { mixScatterVisibilityDigest, mixWallVisibilityDigest } from "../../src/map-views/playerMapDigest";

function hashDigest(mix: (n: (value: number) => void, s: (value: string) => void) => void): number {
  let h = 5381;
  const n = (value: number) => { h = ((h << 5) + h + (value | 0)) | 0; };
  const s = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) + h + value.charCodeAt(i)) | 0;
    }
  };

  mix(n, s);
  return h;
}

function hashWall(wall: any): number {
  return hashDigest((n, s) => mixWallVisibilityDigest(wall, n, s));
}

describe("map/playerMapDigest", () => {
  it("changes when wall endpoints change", () => {
    const base = hashWall({
      id: "wall-1",
      type: "wall",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
    });
    const moved = hashWall({
      id: "wall-1",
      type: "wall",
      start: { x: 11, y: 20 },
      end: { x: 30, y: 40 },
    });

    expect(moved).not.toBe(base);
  });

  it("changes when wall visibility behavior changes", () => {
    const closedDoor = hashWall({
      id: "door-1",
      type: "door",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: false,
    });
    const openDoor = hashWall({
      id: "door-1",
      type: "door",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: true,
    });
    const window = hashWall({
      id: "door-1",
      type: "window",
      start: { x: 10, y: 20 },
      end: { x: 30, y: 40 },
      open: false,
    });

    expect(openDoor).not.toBe(closedDoor);
    expect(window).not.toBe(closedDoor);
  });

  it("distinguishes unbounded wall height from explicit zero and retains fractional endpoints", () => {
    const wall = { start: { x: 10, y: 20 }, end: { x: 30, y: 40 } };
    expect(hashWall({ ...wall, height: null })).toBe(hashWall(wall));
    expect(hashWall({ ...wall, height: 0 })).not.toBe(hashWall(wall));
    expect(hashWall({ ...wall, start: { x: 10.001, y: 20 } })).not.toBe(hashWall(wall));
  });
});

describe("scatter visibility digest", () => {
  const asset: EnvAssetInstance = {
    id: "scatter", assetId: "debris", position: { x: 10, y: 20 },
    width: 30, height: 40, rotation: 0, zIndex: 0, placedAt: 0,
    scatterConfig: { blocksVision: true },
  };
  const hashScatter = (...assets: EnvAssetInstance[]) => hashDigest((n, s) => mixScatterVisibilityDigest(assets, n, s));

  it.each<[string, Partial<EnvAssetInstance>]>([
    ["x", { position: { x: 10.001, y: 20 } }],
    ["y", { position: { x: 10, y: 20.001 } }],
    ["width", { width: 30.001 }],
    ["height", { height: 40.001 }],
    ["rotation", { rotation: 0.001 }],
    ["wall height", { scatterConfig: { blocksVision: true, wallHeight: 10.001 } }],
    ["blocking state", { scatterConfig: { blocksVision: false } }],
  ])("tracks changes to %s", (_field, update) => {
    expect(hashScatter({ ...asset, ...update })).not.toBe(hashScatter(asset));
  });

  it("normalizes the height default and ignores decorative assets", () => {
    const explicitHeight = { ...asset, scatterConfig: { blocksVision: true, wallHeight: 10 } };
    const zeroHeight = { ...asset, scatterConfig: { blocksVision: true, wallHeight: 0 } };
    const decorative = { ...asset, id: "decorative", scatterConfig: undefined };
    expect(hashScatter(explicitHeight)).toBe(hashScatter(asset));
    expect(hashScatter(zeroHeight)).not.toBe(hashScatter(asset));
    expect(hashScatter(decorative, asset)).toBe(hashScatter(asset));
  });
});
