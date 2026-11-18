import type { EnvAssetInstance } from "../envasset/EnvAssetTypes";
import { getScatterWallHeight } from "./playerMapWalls";

type DigestNumber = (value: number) => void;
type DigestString = (value: string) => void;

function digestNumber(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? String(num) : "";
}

function digestString(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

export function mixWallVisibilityDigest(
  wall: any,
  n: DigestNumber,
  s: DigestString,
): void {
  const type = digestString(wall?.type || "wall");
  s(type);
  if (wall?.id) s(digestString(wall.id));

  s(`${digestNumber(wall?.start?.x)},${digestNumber(wall?.start?.y)},${digestNumber(wall?.end?.x)},${digestNumber(wall?.end?.y)};`);
  n(wall?.open ? 1 : 0);
  s(wall?.height == null ? "unbounded;" : `${digestNumber(wall.height)};`);

  if (wall?.openDirection !== undefined) {
    s(`${digestNumber(wall.openDirection)};`);
  }
  if (wall?.pivotEnd) {
    s(digestString(wall.pivotEnd));
  }
}

export function mixScatterVisibilityDigest(
  assets: readonly EnvAssetInstance[],
  n: DigestNumber,
  s: DigestString,
): void {
  for (const asset of assets) {
    const wallHeight = getScatterWallHeight(asset);
    if (wallHeight === undefined) continue;

    // Forward the complete numbers so fractional edits survive the integer mixer.
    n(1);
    const { x, y } = asset.position;
    s(`${x},${y},${asset.width},${asset.height},${asset.rotation || 0},${wallHeight};`);
  }
}
