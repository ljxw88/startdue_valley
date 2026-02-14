import type { MemoryId, VillagerId } from "./identifiers";

export const MEMORY_TYPES = ["observation", "interaction", "task", "emotion", "goal"] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface VillagerMemory {
  id: MemoryId;
  villagerId: VillagerId;
  type: MemoryType;
  summary: string;
  createdAtTick: number;
  importance: number;
}

export function isMemoryType(value: string): value is MemoryType {
  return MEMORY_TYPES.includes(value as MemoryType);
}

export function isMemoryImportance(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
