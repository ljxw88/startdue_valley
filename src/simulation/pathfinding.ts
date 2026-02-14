import type { Tile, TileId } from "@/domain";

export interface PathfindingRequest {
  startTileId: TileId;
  destinationTileId: TileId;
  blockedTileIds?: readonly TileId[];
}

export type PathfindingResult =
  | {
      status: "found";
      path: readonly TileId[];
      fromCache: boolean;
    }
  | {
      status: "unreachable";
      reason: "unknown-start" | "unknown-destination" | "blocked-start" | "blocked-destination" | "no-route";
      path: readonly TileId[];
    };

interface PathfindingNode {
  id: TileId;
  x: number;
  y: number;
  walkable: boolean;
  neighbors: readonly TileId[];
}

export interface PathfindingService {
  findPath(request: PathfindingRequest): PathfindingResult;
}

export function createPathfindingService(
  tiles: readonly Tile[],
  maxCachedRoutes = 256,
): PathfindingService {
  const normalizedMaxCachedRoutes = Number.isInteger(maxCachedRoutes) && maxCachedRoutes > 0 ? maxCachedRoutes : 1;
  const nodesById = createNodesById(tiles);
  const routeCache = new Map<string, readonly TileId[]>();

  return {
    findPath(request: PathfindingRequest): PathfindingResult {
      const startNode = nodesById.get(request.startTileId);
      if (!startNode) {
        return { status: "unreachable", reason: "unknown-start", path: [] };
      }

      const destinationNode = nodesById.get(request.destinationTileId);
      if (!destinationNode) {
        return { status: "unreachable", reason: "unknown-destination", path: [] };
      }

      const blocked = new Set(request.blockedTileIds ?? []);
      const startBlocked = blocked.has(startNode.id) || !startNode.walkable;
      if (startBlocked) {
        return { status: "unreachable", reason: "blocked-start", path: [] };
      }

      const destinationBlocked = blocked.has(destinationNode.id) || !destinationNode.walkable;
      if (destinationBlocked) {
        return { status: "unreachable", reason: "blocked-destination", path: [] };
      }

      if (startNode.id === destinationNode.id) {
        return { status: "found", path: [startNode.id], fromCache: false };
      }

      const cacheKey = toCacheKey(startNode.id, destinationNode.id, blocked);
      const cachedPath = routeCache.get(cacheKey);
      if (cachedPath) {
        routeCache.delete(cacheKey);
        routeCache.set(cacheKey, cachedPath);
        return { status: "found", path: cachedPath, fromCache: true };
      }

      const path = findShortestPath(nodesById, startNode.id, destinationNode.id, blocked);
      if (!path) {
        return { status: "unreachable", reason: "no-route", path: [] };
      }

      routeCache.set(cacheKey, path);
      if (routeCache.size > normalizedMaxCachedRoutes) {
        const oldestKey = routeCache.keys().next().value;
        if (oldestKey) routeCache.delete(oldestKey);
      }

      return { status: "found", path, fromCache: false };
    },
  };
}

function createNodesById(tiles: readonly Tile[]): Map<TileId, PathfindingNode> {
  const coordinatesToId = new Map<string, TileId>();
  for (const tile of tiles) {
    coordinatesToId.set(toCoordinateKey(tile.coordinate.x, tile.coordinate.y), tile.id);
  }

  const nodesById = new Map<TileId, PathfindingNode>();
  for (const tile of tiles) {
    const neighbors = [
      coordinatesToId.get(toCoordinateKey(tile.coordinate.x + 1, tile.coordinate.y)),
      coordinatesToId.get(toCoordinateKey(tile.coordinate.x - 1, tile.coordinate.y)),
      coordinatesToId.get(toCoordinateKey(tile.coordinate.x, tile.coordinate.y + 1)),
      coordinatesToId.get(toCoordinateKey(tile.coordinate.x, tile.coordinate.y - 1)),
    ].filter((value): value is TileId => value !== undefined);

    nodesById.set(tile.id, {
      id: tile.id,
      x: tile.coordinate.x,
      y: tile.coordinate.y,
      walkable: tile.walkable,
      neighbors,
    });
  }

  return nodesById;
}

function findShortestPath(
  nodesById: ReadonlyMap<TileId, PathfindingNode>,
  startTileId: TileId,
  destinationTileId: TileId,
  blockedTileIds: ReadonlySet<TileId>,
): readonly TileId[] | undefined {
  const openSet = new Set<TileId>([startTileId]);
  const closedSet = new Set<TileId>();
  const cameFrom = new Map<TileId, TileId>();
  const gScore = new Map<TileId, number>([[startTileId, 0]]);
  const fScore = new Map<TileId, number>([
    [startTileId, heuristicDistance(nodesById, startTileId, destinationTileId)],
  ]);

  while (openSet.size > 0) {
    const current = pickLowestScore(openSet, fScore);
    if (!current) return undefined;
    if (current === destinationTileId) {
      return reconstructPath(cameFrom, current);
    }

    openSet.delete(current);
    closedSet.add(current);

    const currentNode = nodesById.get(current);
    if (!currentNode) continue;

    for (const neighborId of currentNode.neighbors) {
      if (closedSet.has(neighborId) || blockedTileIds.has(neighborId)) {
        continue;
      }

      const neighborNode = nodesById.get(neighborId);
      if (!neighborNode || !neighborNode.walkable) {
        continue;
      }

      const tentativeScore = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + 1;
      if (tentativeScore >= (gScore.get(neighborId) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }

      cameFrom.set(neighborId, current);
      gScore.set(neighborId, tentativeScore);
      fScore.set(neighborId, tentativeScore + heuristicDistance(nodesById, neighborId, destinationTileId));
      openSet.add(neighborId);
    }
  }

  return undefined;
}

function heuristicDistance(
  nodesById: ReadonlyMap<TileId, PathfindingNode>,
  fromId: TileId,
  toId: TileId,
): number {
  const fromNode = nodesById.get(fromId);
  const toNode = nodesById.get(toId);
  if (!fromNode || !toNode) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(fromNode.x - toNode.x) + Math.abs(fromNode.y - toNode.y);
}

function pickLowestScore(openSet: ReadonlySet<TileId>, fScore: ReadonlyMap<TileId, number>): TileId | undefined {
  let bestId: TileId | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const tileId of openSet) {
    const score = fScore.get(tileId) ?? Number.POSITIVE_INFINITY;
    if (score < bestScore) {
      bestScore = score;
      bestId = tileId;
    }
  }

  return bestId;
}

function reconstructPath(cameFrom: ReadonlyMap<TileId, TileId>, current: TileId): readonly TileId[] {
  const path: TileId[] = [current];
  let currentStep: TileId | undefined = current;

  while (currentStep) {
    const previousStep = cameFrom.get(currentStep);
    if (!previousStep) {
      break;
    }

    path.unshift(previousStep);
    currentStep = previousStep;
  }

  return path;
}

function toCacheKey(startTileId: TileId, destinationTileId: TileId, blockedTileIds: ReadonlySet<TileId>): string {
  const blockedPart =
    blockedTileIds.size === 0 ? "" : [...blockedTileIds].sort((left, right) => left.localeCompare(right)).join(",");
  return `${startTileId}->${destinationTileId}|${blockedPart}`;
}

function toCoordinateKey(x: number, y: number): string {
  return `${x},${y}`;
}
