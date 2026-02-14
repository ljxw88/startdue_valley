import type { VillagerActionType } from "@/domain";

export interface ResourceInventory {
  crops: number;
  coins: number;
  goodwill: number;
}

interface ResourceInventoryDelta {
  crops?: number;
  coins?: number;
  goodwill?: number;
}

const INITIAL_RESOURCE_INVENTORY: ResourceInventory = {
  crops: 12,
  coins: 30,
  goodwill: 0,
};

const ACTION_RESOURCE_DELTAS: Partial<Record<VillagerActionType, ResourceInventoryDelta>> = {
  farm: {
    crops: 2,
  },
  chat: {
    goodwill: 1,
  },
  shop: {
    crops: -1,
    coins: 3,
  },
  rest: {
    goodwill: 1,
  },
};

export function createInitialResourceInventory(): ResourceInventory {
  return { ...INITIAL_RESOURCE_INVENTORY };
}

export function applyActionResourceEffects(
  inventory: ResourceInventory,
  actions: readonly VillagerActionType[],
): ResourceInventory {
  return actions.reduce((currentInventory, action) => {
    const delta = ACTION_RESOURCE_DELTAS[action];
    if (!delta) {
      return currentInventory;
    }

    return {
      crops: Math.max(0, currentInventory.crops + (delta.crops ?? 0)),
      coins: Math.max(0, currentInventory.coins + (delta.coins ?? 0)),
      goodwill: Math.max(0, currentInventory.goodwill + (delta.goodwill ?? 0)),
    };
  }, inventory);
}
