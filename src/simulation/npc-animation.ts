import type { NpcState, TileId, VillagerActionType } from "@/domain";

const ANIMATION_FALLBACK_KEY = "idle.down";

const ANIMATION_FRAMES: Record<string, readonly string[]> = {
  "idle.down": ["o", "O"],
  "planning.down": [".", ":"],
  "moving.up": ["^", "|"],
  "moving.down": ["v", "|"],
  "moving.left": ["<", "="],
  "moving.right": [">", "="],
  "acting.farm": ["f", "F"],
  "acting.chat": ["c", "C"],
  "acting.shop": ["s", "S"],
  "acting.rest": ["r", "R"],
  "resting.down": ["z", "Z"],
};

export type AnimationDirection = "up" | "down" | "left" | "right";

export interface VillagerAnimationState {
  key: string;
  direction: AnimationDirection;
  frameIndex: number;
  frameToken: string;
  lastTick: number;
}

interface VillagerAnimationAdvanceInput {
  previousTileId: TileId;
  currentTileId: TileId;
  npcState: NpcState;
  action: VillagerActionType;
  tick: number;
}

export function createVillagerAnimationState(initialTick = 0): VillagerAnimationState {
  const key = "planning.down";
  return {
    key,
    direction: "down",
    frameIndex: 0,
    frameToken: ANIMATION_FRAMES[key][0],
    lastTick: initialTick,
  };
}

export function advanceVillagerAnimationState(
  previousState: VillagerAnimationState,
  input: VillagerAnimationAdvanceInput,
): VillagerAnimationState {
  const direction = resolveDirection(previousState.direction, input.previousTileId, input.currentTileId);
  const key = resolveAnimationKey(input.npcState, input.action, direction);
  const frames = getAnimationFrames(key);
  const tickDelta = Math.max(0, input.tick - previousState.lastTick);
  const frameIndex =
    key === previousState.key ? (previousState.frameIndex + tickDelta) % frames.length : tickDelta % frames.length;

  return {
    key,
    direction,
    frameIndex,
    frameToken: frames[frameIndex],
    lastTick: input.tick,
  };
}

function resolveAnimationKey(
  npcState: NpcState,
  action: VillagerActionType,
  direction: AnimationDirection,
): string {
  if (npcState === "moving") {
    return `moving.${direction}`;
  }

  if (npcState === "acting") {
    return `acting.${action}`;
  }

  return `${npcState}.${direction}`;
}

function getAnimationFrames(key: string): readonly string[] {
  return ANIMATION_FRAMES[key] ?? ANIMATION_FRAMES[ANIMATION_FALLBACK_KEY];
}

function resolveDirection(
  fallbackDirection: AnimationDirection,
  previousTileId: TileId,
  currentTileId: TileId,
): AnimationDirection {
  const previous = parseTileIdCoordinate(previousTileId);
  const current = parseTileIdCoordinate(currentTileId);
  const deltaX = current.x - previous.x;
  const deltaY = current.y - previous.y;

  if (deltaX === 0 && deltaY === 0) {
    return fallbackDirection;
  }

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? "right" : "left";
  }

  return deltaY >= 0 ? "down" : "up";
}

function parseTileIdCoordinate(tileId: TileId): { x: number; y: number } {
  const [, x = "0", y = "0"] = tileId.split("_");
  return { x: Number.parseInt(x, 10), y: Number.parseInt(y, 10) };
}
