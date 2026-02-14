export type VillagerId = `villager_${string}`;
export type TileId = `tile_${number}_${number}`;
export type MemoryId = `memory_${string}`;
export type JobId = `job_${string}`;

export function isVillagerId(value: string): value is VillagerId {
  return value.startsWith("villager_") && value.length > "villager_".length;
}

export function isTileId(value: string): value is TileId {
  return /^tile_\d+_\d+$/.test(value);
}

export function isMemoryId(value: string): value is MemoryId {
  return value.startsWith("memory_") && value.length > "memory_".length;
}

export function isJobId(value: string): value is JobId {
  return value.startsWith("job_") && value.length > "job_".length;
}
