import type { TileId, VillagerId } from "./identifiers";

export const NPC_STATES = ["idle", "planning", "moving", "acting", "resting"] as const;
export const VILLAGER_ACTIONS = ["walk", "farm", "chat", "shop", "rest", "observe"] as const;

export type NpcState = (typeof NPC_STATES)[number];
export type VillagerActionType = (typeof VILLAGER_ACTIONS)[number];

export interface VillagerAction {
  type: VillagerActionType;
  actorId: VillagerId;
  targetTileId?: TileId;
  targetVillagerId?: VillagerId;
}

export function isNpcState(value: string): value is NpcState {
  return NPC_STATES.includes(value as NpcState);
}

export function isVillagerActionType(value: string): value is VillagerActionType {
  return VILLAGER_ACTIONS.includes(value as VillagerActionType);
}
