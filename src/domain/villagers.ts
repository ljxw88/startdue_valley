import type { VillagerActionType } from "./actions";
import type { JobRole } from "./jobs";
import type { TileId, VillagerId } from "./identifiers";

export const VILLAGER_MOODS = ["neutral", "happy", "focused", "tired", "social"] as const;

export type VillagerMood = (typeof VILLAGER_MOODS)[number];

export interface VillagerTraits {
  friendliness: number;
  diligence: number;
  curiosity: number;
}

export interface Villager {
  id: VillagerId;
  name: string;
  homeTileId: TileId;
  spawnTileId: TileId;
  role: JobRole;
  mood: VillagerMood;
  currentAction: VillagerActionType;
  baseSchedule: readonly VillagerScheduleSlot[];
  traits: VillagerTraits;
}

export interface VillagerScheduleSlot {
  hour: number;
  action: VillagerActionType;
  targetTileId: TileId;
}

export const VILLAGER_REGISTRY: readonly Villager[] = [
  {
    id: "villager_ava",
    name: "Ava",
    homeTileId: "tile_1_1",
    spawnTileId: "tile_1_3",
    role: "farmer",
    mood: "focused",
    currentAction: "observe",
    baseSchedule: [
      { hour: 6, action: "walk", targetTileId: "tile_2_7" },
      { hour: 12, action: "farm", targetTileId: "tile_3_7" },
      { hour: 18, action: "rest", targetTileId: "tile_1_1" },
    ],
    traits: { friendliness: 0.48, diligence: 0.91, curiosity: 0.36 },
  },
  {
    id: "villager_ben",
    name: "Ben",
    homeTileId: "tile_2_1",
    spawnTileId: "tile_2_3",
    role: "merchant",
    mood: "social",
    currentAction: "observe",
    baseSchedule: [
      { hour: 7, action: "walk", targetTileId: "tile_8_5" },
      { hour: 11, action: "shop", targetTileId: "tile_9_5" },
      { hour: 19, action: "rest", targetTileId: "tile_2_1" },
    ],
    traits: { friendliness: 0.83, diligence: 0.62, curiosity: 0.57 },
  },
  {
    id: "villager_cora",
    name: "Cora",
    homeTileId: "tile_9_1",
    spawnTileId: "tile_7_3",
    role: "builder",
    mood: "neutral",
    currentAction: "observe",
    baseSchedule: [
      { hour: 6, action: "walk", targetTileId: "tile_6_4" },
      { hour: 14, action: "walk", targetTileId: "tile_5_9" },
      { hour: 20, action: "rest", targetTileId: "tile_9_1" },
    ],
    traits: { friendliness: 0.55, diligence: 0.79, curiosity: 0.44 },
  },
  {
    id: "villager_dax",
    name: "Dax",
    homeTileId: "tile_10_1",
    spawnTileId: "tile_8_3",
    role: "fisher",
    mood: "happy",
    currentAction: "observe",
    baseSchedule: [
      { hour: 5, action: "walk", targetTileId: "tile_3_9" },
      { hour: 10, action: "rest", targetTileId: "tile_6_4" },
      { hour: 21, action: "rest", targetTileId: "tile_10_1" },
    ],
    traits: { friendliness: 0.61, diligence: 0.58, curiosity: 0.73 },
  },
  {
    id: "villager_eli",
    name: "Eli",
    homeTileId: "tile_1_1",
    spawnTileId: "tile_5_3",
    role: "caretaker",
    mood: "neutral",
    currentAction: "observe",
    baseSchedule: [
      { hour: 8, action: "walk", targetTileId: "tile_6_3" },
      { hour: 13, action: "chat", targetTileId: "tile_5_4" },
      { hour: 22, action: "rest", targetTileId: "tile_1_1" },
    ],
    traits: { friendliness: 0.89, diligence: 0.67, curiosity: 0.41 },
  },
] as const;

const VILLAGER_REGISTRY_BY_ID = new Map(VILLAGER_REGISTRY.map((villager) => [villager.id, villager]));

export function listVillagers(): readonly Villager[] {
  return VILLAGER_REGISTRY;
}

export function getVillagerById(id: VillagerId): Villager | undefined {
  return VILLAGER_REGISTRY_BY_ID.get(id);
}

export function getVillagerSpawnTileId(id: VillagerId): TileId | undefined {
  return VILLAGER_REGISTRY_BY_ID.get(id)?.spawnTileId;
}

export function getVillagerHomeTileId(id: VillagerId): TileId | undefined {
  return VILLAGER_REGISTRY_BY_ID.get(id)?.homeTileId;
}

export function isVillagerMood(value: string): value is VillagerMood {
  return VILLAGER_MOODS.includes(value as VillagerMood);
}

export function isTraitScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
