import {
  isMemoryId,
  isMemoryImportance,
  isMemorySourceType,
  isNpcState,
  isTileId,
  isVillagerActionType,
  isVillagerId,
  type LongTermVillagerMemory,
  type NpcState,
  type ShortTermVillagerMemory,
  type TileId,
  type VillagerMemoryStore,
  type VillagerId,
} from "@/domain";

import type { NpcReplanState } from "./replanning";

export const WORLD_SNAPSHOT_VERSION = 1;

export interface PersistedNpcWorldState {
  villagerId: VillagerId;
  currentTileId: TileId;
  targetTileId: TileId;
  npcState: NpcState;
  memoryStore: VillagerMemoryStore;
  replan: NpcReplanState;
}

export interface WorldSnapshot {
  version: number;
  savedAtIso: string;
  world: {
    tick: number;
    day: number;
    minuteOfDay: number;
  };
  npcs: PersistedNpcWorldState[];
}

function isMemoryCreatedAt(value: unknown): value is { day: number; minuteOfDay: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { day?: unknown; minuteOfDay?: unknown };
  return (
    typeof candidate.day === "number" &&
    Number.isInteger(candidate.day) &&
    candidate.day >= 1 &&
    typeof candidate.minuteOfDay === "number" &&
    Number.isInteger(candidate.minuteOfDay) &&
    candidate.minuteOfDay >= 0 &&
    candidate.minuteOfDay <= 1_439
  );
}

function isShortTermMemory(value: unknown): value is ShortTermVillagerMemory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    villagerId?: unknown;
    type?: unknown;
    summary?: unknown;
    source?: unknown;
    createdAt?: unknown;
    importance?: unknown;
    bucket?: unknown;
    expiresAfterTicks?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    !isMemoryId(candidate.id) ||
    typeof candidate.villagerId !== "string" ||
    !isVillagerId(candidate.villagerId) ||
    typeof candidate.type !== "string" ||
    typeof candidate.summary !== "string" ||
    !candidate.source ||
    typeof candidate.source !== "object" ||
    !isMemoryCreatedAt(candidate.createdAt) ||
    typeof candidate.bucket !== "string" ||
    candidate.bucket !== "short_term" ||
    typeof candidate.expiresAfterTicks !== "number" ||
    !Number.isInteger(candidate.expiresAfterTicks) ||
    candidate.expiresAfterTicks <= 0 ||
    typeof candidate.importance !== "number" ||
    !isMemoryImportance(candidate.importance)
  ) {
    return false;
  }

  const source = candidate.source as { type?: unknown; actorVillagerId?: unknown; eventId?: unknown };
  return (
    typeof source.type === "string" &&
    isMemorySourceType(source.type) &&
    (source.actorVillagerId === undefined ||
      (typeof source.actorVillagerId === "string" && isVillagerId(source.actorVillagerId))) &&
    (source.eventId === undefined || typeof source.eventId === "string")
  );
}

function isLongTermMemory(value: unknown): value is LongTermVillagerMemory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    villagerId?: unknown;
    type?: unknown;
    summary?: unknown;
    source?: unknown;
    createdAt?: unknown;
    importance?: unknown;
    bucket?: unknown;
    reinforcementCount?: unknown;
  };

  if (
    typeof candidate.id !== "string" ||
    !isMemoryId(candidate.id) ||
    typeof candidate.villagerId !== "string" ||
    !isVillagerId(candidate.villagerId) ||
    typeof candidate.type !== "string" ||
    typeof candidate.summary !== "string" ||
    !candidate.source ||
    typeof candidate.source !== "object" ||
    !isMemoryCreatedAt(candidate.createdAt) ||
    typeof candidate.bucket !== "string" ||
    candidate.bucket !== "long_term" ||
    typeof candidate.reinforcementCount !== "number" ||
    !Number.isInteger(candidate.reinforcementCount) ||
    candidate.reinforcementCount < 0 ||
    typeof candidate.importance !== "number" ||
    !isMemoryImportance(candidate.importance)
  ) {
    return false;
  }

  const source = candidate.source as { type?: unknown; actorVillagerId?: unknown; eventId?: unknown };
  return (
    typeof source.type === "string" &&
    isMemorySourceType(source.type) &&
    (source.actorVillagerId === undefined ||
      (typeof source.actorVillagerId === "string" && isVillagerId(source.actorVillagerId))) &&
    (source.eventId === undefined || typeof source.eventId === "string")
  );
}

function isVillagerMemoryStore(value: unknown): value is VillagerMemoryStore {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { villagerId?: unknown; shortTerm?: unknown; longTerm?: unknown };
  return (
    typeof candidate.villagerId === "string" &&
    isVillagerId(candidate.villagerId) &&
    Array.isArray(candidate.shortTerm) &&
    candidate.shortTerm.every(isShortTermMemory) &&
    Array.isArray(candidate.longTerm) &&
    candidate.longTerm.every(isLongTermMemory)
  );
}

function isNpcReplanState(value: unknown): value is NpcReplanState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    lastPlanTick?: unknown;
    lastPlanSignature?: unknown;
    lastMajorEventTick?: unknown;
    intent?: unknown;
    intentUpdatedAtTick?: unknown;
  };

  if (
    (candidate.lastPlanTick !== undefined &&
      (typeof candidate.lastPlanTick !== "number" || !Number.isInteger(candidate.lastPlanTick))) ||
    (candidate.lastPlanSignature !== undefined && typeof candidate.lastPlanSignature !== "string") ||
    (candidate.lastMajorEventTick !== undefined &&
      (typeof candidate.lastMajorEventTick !== "number" || !Number.isInteger(candidate.lastMajorEventTick))) ||
    (candidate.intentUpdatedAtTick !== undefined &&
      (typeof candidate.intentUpdatedAtTick !== "number" || !Number.isInteger(candidate.intentUpdatedAtTick)))
  ) {
    return false;
  }

  if (candidate.intent === undefined) {
    return true;
  }

  if (!candidate.intent || typeof candidate.intent !== "object") {
    return false;
  }

  const intent = candidate.intent as {
    action?: unknown;
    targetTileId?: unknown;
    reasoning?: unknown;
    plannedAtTick?: unknown;
  };
  return (
    typeof intent.action === "string" &&
    isVillagerActionType(intent.action) &&
    (intent.targetTileId === undefined || (typeof intent.targetTileId === "string" && isTileId(intent.targetTileId))) &&
    typeof intent.reasoning === "string" &&
    typeof intent.plannedAtTick === "number" &&
    Number.isInteger(intent.plannedAtTick)
  );
}

function isPersistedNpcWorldState(value: unknown): value is PersistedNpcWorldState {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    villagerId?: unknown;
    currentTileId?: unknown;
    targetTileId?: unknown;
    npcState?: unknown;
    memoryStore?: unknown;
    replan?: unknown;
  };

  return (
    typeof candidate.villagerId === "string" &&
    isVillagerId(candidate.villagerId) &&
    typeof candidate.currentTileId === "string" &&
    isTileId(candidate.currentTileId) &&
    typeof candidate.targetTileId === "string" &&
    isTileId(candidate.targetTileId) &&
    typeof candidate.npcState === "string" &&
    isNpcState(candidate.npcState) &&
    isVillagerMemoryStore(candidate.memoryStore) &&
    isNpcReplanState(candidate.replan)
  );
}

export function parseWorldSnapshot(value: unknown): WorldSnapshot | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as {
    version?: unknown;
    savedAtIso?: unknown;
    world?: unknown;
    npcs?: unknown;
  };
  if (
    candidate.version !== WORLD_SNAPSHOT_VERSION ||
    typeof candidate.savedAtIso !== "string" ||
    !candidate.world ||
    typeof candidate.world !== "object" ||
    !Array.isArray(candidate.npcs) ||
    !candidate.npcs.every(isPersistedNpcWorldState)
  ) {
    return undefined;
  }

  const world = candidate.world as { tick?: unknown; day?: unknown; minuteOfDay?: unknown };
  if (
    typeof world.tick !== "number" ||
    !Number.isInteger(world.tick) ||
    world.tick < 0 ||
    typeof world.day !== "number" ||
    !Number.isInteger(world.day) ||
    world.day < 1 ||
    typeof world.minuteOfDay !== "number" ||
    !Number.isInteger(world.minuteOfDay) ||
    world.minuteOfDay < 0 ||
    world.minuteOfDay > 1_439
  ) {
    return undefined;
  }

  return {
    version: WORLD_SNAPSHOT_VERSION,
    savedAtIso: candidate.savedAtIso,
    world: {
      tick: world.tick,
      day: world.day,
      minuteOfDay: world.minuteOfDay,
    },
    npcs: candidate.npcs,
  };
}
