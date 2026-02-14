import type { TileId, VillagerId } from "@/domain";

export interface VillagerMovementComponent {
  villagerId: VillagerId;
  currentTileId: TileId;
  path: readonly TileId[];
  pathIndex: number;
  lastProcessedTick: number;
  arrivedAtTick?: number;
}

export interface VillagerArrivalEvent {
  type: "arrival";
  villagerId: VillagerId;
  tileId: TileId;
  tick: number;
}

export interface MovementAdvanceResult {
  component: VillagerMovementComponent;
  events: readonly VillagerArrivalEvent[];
}

export function createVillagerMovementComponent(
  villagerId: VillagerId,
  startTileId: TileId,
  initialTick = 0
): VillagerMovementComponent {
  return {
    villagerId,
    currentTileId: startTileId,
    path: [startTileId],
    pathIndex: 0,
    lastProcessedTick: assertNonNegativeInteger(initialTick, "initialTick"),
    arrivedAtTick: initialTick,
  };
}

export function assignVillagerMovementPath(
  component: VillagerMovementComponent,
  path: readonly TileId[],
  tick: number
): VillagerMovementComponent {
  const safeTick = assertNonNegativeInteger(tick, "tick");
  if (path.length === 0) {
    throw new Error("path must include at least one tile");
  }

  return {
    villagerId: component.villagerId,
    currentTileId: path[0],
    path: [...path],
    pathIndex: 0,
    lastProcessedTick: safeTick,
    arrivedAtTick: path.length === 1 ? safeTick : undefined,
  };
}

export function advanceVillagerMovement(
  component: VillagerMovementComponent,
  tick: number
): MovementAdvanceResult {
  const safeTick = assertNonNegativeInteger(tick, "tick");
  if (safeTick <= component.lastProcessedTick || component.path.length <= 1) {
    return {
      component: {
        ...component,
        lastProcessedTick: Math.max(component.lastProcessedTick, safeTick),
      },
      events: [],
    };
  }

  const tickDelta = safeTick - component.lastProcessedTick;
  const nextPathIndex = Math.min(component.path.length - 1, component.pathIndex + tickDelta);
  const nextCurrentTileId = component.path[nextPathIndex];
  const reachedDestination = nextPathIndex === component.path.length - 1;
  const distanceToDestination = component.path.length - 1 - component.pathIndex;
  const arrivalTick =
    reachedDestination && component.arrivedAtTick === undefined
      ? component.lastProcessedTick + distanceToDestination
      : component.arrivedAtTick;

  const nextComponent: VillagerMovementComponent = {
    ...component,
    currentTileId: nextCurrentTileId,
    pathIndex: nextPathIndex,
    lastProcessedTick: safeTick,
    arrivedAtTick: arrivalTick,
  };

  if (!reachedDestination || arrivalTick === undefined || component.arrivedAtTick !== undefined) {
    return { component: nextComponent, events: [] };
  }

  return {
    component: nextComponent,
    events: [
      {
        type: "arrival",
        villagerId: component.villagerId,
        tileId: nextCurrentTileId,
        tick: arrivalTick,
      },
    ],
  };
}

function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}
