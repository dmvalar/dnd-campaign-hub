import { describe, expect, it } from "vitest";
import { getWallsHash } from "../../src/utils/VisibilityCache";

const wall = () => ({ start: { x: 10, y: 20 }, end: { x: 30, y: 40 }, height: 10, open: false });

describe("visibility wall fingerprints", () => {
  it.each(["start", "end"] as const)("includes fractional %s coordinates", endpoint => {
    const base = wall();
    const hash = getWallsHash([base]);
    for (const axis of ["x", "y"] as const) {
      const changed = wall();
      changed[endpoint][axis] += 0.0001;
      expect(getWallsHash([changed])).not.toBe(hash);
    }
  });

  it("distinguishes unbounded walls from finite zero and fractional heights", () => {
    const geometry = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const unbounded = getWallsHash([geometry]);
    expect(getWallsHash([{ ...geometry, height: null }])).toBe(unbounded);
    expect(getWallsHash([{ ...geometry, height: undefined }])).toBe(unbounded);
    const zero = getWallsHash([{ ...geometry, height: 0 }]);
    expect(zero).not.toBe(unbounded);
    expect(getWallsHash([{ ...geometry, height: 0.0001 }])).not.toBe(zero);
    expect(getWallsHash([{ ...geometry, height: 0.25 }])).not.toBe(getWallsHash([{ ...geometry, height: 0.5 }]));
  });

  it("reuses equal geometry across arrays and memoizes an unchanged render array", () => {
    const walls = [wall()];
    const hash = getWallsHash(walls);
    expect(getWallsHash(walls)).toBe(hash);
    expect(getWallsHash([wall()])).toBe(hash);
    expect(getWallsHash(walls)).toBe(hash);
    const open = { ...wall(), open: true };
    expect(getWallsHash([open])).not.toBe(hash);
  });

  it("normalizes signed zero coordinates without losing other fractional geometry", () => {
    const base = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const negativeZero = { start: { x: -0, y: 0 }, end: { x: 10, y: -0 } };
    expect(getWallsHash([base])).toBe(getWallsHash([negativeZero]));
  });
});
