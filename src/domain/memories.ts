import type { MemoryId, VillagerId } from "./identifiers";
import type { SimulationTime } from "./simulation-time";

export const MEMORY_TYPES = ["observation", "interaction", "task", "emotion", "goal"] as const;
export const MEMORY_SOURCE_TYPES = ["self", "world", "villager", "system"] as const;
export const MEMORY_BUCKETS = ["short_term", "long_term"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemorySourceType = (typeof MEMORY_SOURCE_TYPES)[number];
export type MemoryBucket = (typeof MEMORY_BUCKETS)[number];

export interface VillagerMemorySource {
  type: MemorySourceType;
  actorVillagerId?: VillagerId;
  eventId?: string;
}

export interface VillagerMemoryBase {
  id: MemoryId;
  villagerId: VillagerId;
  type: MemoryType;
  summary: string;
  source: VillagerMemorySource;
  createdAt: SimulationTime;
  importance: number;
}

export interface ShortTermVillagerMemory extends VillagerMemoryBase {
  bucket: "short_term";
  expiresAfterTicks: number;
}

export interface LongTermVillagerMemory extends VillagerMemoryBase {
  bucket: "long_term";
  reinforcementCount: number;
}

export type VillagerMemory = ShortTermVillagerMemory | LongTermVillagerMemory;

export interface VillagerMemoryStore {
  villagerId: VillagerId;
  shortTerm: readonly ShortTermVillagerMemory[];
  longTerm: readonly LongTermVillagerMemory[];
}

export interface MemoryPruningPolicy {
  shortTermMaxEntries: number;
  longTermMaxEntries: number;
  shortTermMaxAgeTicks: number;
  promotionImportanceThreshold: number;
  longTermMinImportance: number;
}

export const DEFAULT_MEMORY_PRUNING_POLICY: MemoryPruningPolicy = {
  shortTermMaxEntries: 40,
  longTermMaxEntries: 120,
  shortTermMaxAgeTicks: 1_440,
  promotionImportanceThreshold: 0.7,
  longTermMinImportance: 0.2,
};

export function isMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType);
}

export function isMemorySourceType(value: string): value is MemorySourceType {
  return MEMORY_SOURCE_TYPES.includes(value as MemorySourceType);
}

export function isMemoryBucket(value: string): value is MemoryBucket {
  return MEMORY_BUCKETS.includes(value as MemoryBucket);
}

export function isMemoryImportance(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
