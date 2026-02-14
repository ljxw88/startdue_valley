import type { NpcState, TileId, Villager } from "@/domain";

import { assignVillagerMovementPath, type VillagerMovementComponent } from "./movement";
import type { PathfindingResult, PathfindingService } from "./pathfinding";
import type { ActiveVillagerTask } from "./schedule";

export interface VillagerPlanningInput {
  villager: Villager;
  movement: VillagerMovementComponent;
  activeTask: ActiveVillagerTask;
  pathfinding: PathfindingService;
  tick: number;
  previousTargetTileId?: TileId;
  blockedTileIds?: readonly TileId[];
}

export interface VillagerPlanningResult {
  targetTileId: TileId;
  requestedPath: boolean;
  movement: VillagerMovementComponent;
  npcState: NpcState;
  pathfindingResult?: PathfindingResult;
}

export function resolveTaskTargetTile(
  villager: Villager,
  task: ActiveVillagerTask,
  fallbackTileId: TileId,
): TileId {
  if (task.targetTileId) {
    return task.targetTileId;
  }

  if (task.action === "rest") {
    return villager.homeTileId;
  }

  return fallbackTileId;
}

export function planVillagerMovementIntent(input: VillagerPlanningInput): VillagerPlanningResult {
  const targetTileId = resolveTaskTargetTile(input.villager, input.activeTask, input.movement.currentTileId);
  const hasPathToTarget = input.movement.path[input.movement.path.length - 1] === targetTileId;
  const targetChanged = input.previousTargetTileId !== targetTileId;
  const requestedPath = targetChanged || !hasPathToTarget;
  if (!requestedPath) {
    return {
      targetTileId,
      requestedPath: false,
      movement: input.movement,
      npcState: input.movement.currentTileId === targetTileId ? "acting" : "moving",
    };
  }

  const pathfindingResult = input.pathfinding.findPath({
    startTileId: input.movement.currentTileId,
    destinationTileId: targetTileId,
    blockedTileIds: input.blockedTileIds,
  });
  if (pathfindingResult.status !== "found") {
    return {
      targetTileId,
      requestedPath: true,
      movement: input.movement,
      npcState: "planning",
      pathfindingResult,
    };
  }

  const movement = assignVillagerMovementPath(input.movement, pathfindingResult.path, input.tick);
  return {
    targetTileId,
    requestedPath: true,
    movement,
    npcState: movement.path.length > 1 ? "moving" : "acting",
    pathfindingResult,
  };
}
