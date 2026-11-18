import type { EnvAssetInstance } from "../envasset/EnvAssetTypes";
import type { Point } from "../map/types";

interface SightBlockingWall {
  start: Point;
  end: Point;
  type?: string;
  height?: number | null;
  open?: boolean;
  openDirection?: number;
  pivotEnd?: string;
}

function isPivotType(type: string | undefined): boolean {
  return type === 'pivotDoor' || type === 'secretPivot';
}

/** Compute effective endpoints for an open pivot door (rotates around hinge). */
export function getPivotDoorEndpoints(wall: SightBlockingWall): { start: Point; end: Point } {
  if (!wall.open || !isPivotType(wall.type)) {
    return { start: wall.start, end: wall.end };
  }
  const hingeIsStart = (wall.pivotEnd || 'start') === 'start';
  const hinge = hingeIsStart ? wall.start : wall.end;
  const free = hingeIsStart ? wall.end : wall.start;
  const angle = (wall.openDirection || 1) * (Math.PI / 2);
  const dx = free.x - hinge.x;
  const dy = free.y - hinge.y;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const rotated = {
    x: hinge.x + dx * cosA - dy * sinA,
    y: hinge.y + dx * sinA + dy * cosA,
  };
  return hingeIsStart
    ? { start: hinge, end: rotated }
    : { start: rotated, end: hinge };
}

export function getScatterWallHeight(asset: EnvAssetInstance): number | undefined {
  return asset.scatterConfig?.blocksVision ? asset.scatterConfig.wallHeight ?? 10 : undefined;
}

export function buildSightBlockingWalls(
  walls: readonly SightBlockingWall[] = [],
  assets: readonly EnvAssetInstance[] = [],
): SightBlockingWall[] {
  const blockers = walls.filter(wall => {
    if (!wall.start || !wall.end) return false;
    const type = wall.type || 'wall';
    if ((type === 'door' || type === 'secret') && wall.open) return false;
    return type !== 'window' && type !== 'terrain';
  }).map(wall => {
    // The spatial index can retain these endpoints across mutable config updates.
    const { start, end } = getPivotDoorEndpoints(wall);
    return { ...wall, start: { ...start }, end: { ...end } };
  });

  for (const asset of assets) {
    const height = getScatterWallHeight(asset);
    if (height === undefined) continue;

    const { x, y } = asset.position;
    const halfWidth = asset.width / 2;
    const halfHeight = asset.height / 2;
    const radians = (asset.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const toMapPoint = (dx: number, dy: number): Point => ({
      x: x + dx * cos - dy * sin,
      y: y + dx * sin + dy * cos,
    });
    const corners = [
      toMapPoint(-halfWidth, -halfHeight),
      toMapPoint(halfWidth, -halfHeight),
      toMapPoint(halfWidth, halfHeight),
      toMapPoint(-halfWidth, halfHeight),
    ];
    for (let i = 0; i < corners.length; i++) {
      blockers.push({ type: 'wall', start: corners[i]!, end: corners[(i + 1) % corners.length]!, height, open: false });
    }
  }
  return blockers;
}
