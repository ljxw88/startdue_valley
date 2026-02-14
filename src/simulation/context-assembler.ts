import type {
  SimulationTime,
  TileId,
  Villager,
  VillagerMemory,
  VillagerMemoryStore,
} from "@/domain";

import type { ActiveVillagerTask } from "./schedule";

const DEFAULT_MEMORY_TOKEN_BUDGET = 180;
const RECENT_EVENT_LIMIT = 5;

export interface NpcContextAssemblerInput {
  villager: Villager;
  activeTask: ActiveVillagerTask;
  memoryStore: VillagerMemoryStore;
  currentTileId: TileId;
  targetTileId?: TileId;
  time: SimulationTime;
  memoryTokenBudget?: number;
}

export interface NpcContextMemorySummary {
  id: VillagerMemory["id"];
  summary: string;
  type: VillagerMemory["type"];
  importance: number;
  createdAtTick: number;
}

export interface NpcPromptInput {
  villagerId: Villager["id"];
  villagerName: string;
  role: Villager["role"];
  mood: Villager["mood"];
  location: {
    currentTileId: TileId;
    targetTileId?: TileId;
  };
  currentGoal: {
    action: ActiveVillagerTask["action"];
    source: ActiveVillagerTask["source"];
    targetTileId?: TileId;
  };
  recentEvents: readonly string[];
  memorySummary: readonly NpcContextMemorySummary[];
  worldTime: {
    day: number;
    minuteOfDay: number;
    tick: number;
  };
}

export function assembleNpcPromptInput(input: NpcContextAssemblerInput): NpcPromptInput {
  const memoryTokenBudget = input.memoryTokenBudget ?? DEFAULT_MEMORY_TOKEN_BUDGET;
  const rankedMemories = rankMemoriesByPriority(input.memoryStore);
  const memorySummary = summarizeTopMemories(rankedMemories, memoryTokenBudget);
  const recentEvents = rankedMemories
    .slice(0, RECENT_EVENT_LIMIT)
    .map((memory) => memory.summary);

  return {
    villagerId: input.villager.id,
    villagerName: input.villager.name,
    role: input.villager.role,
    mood: input.villager.mood,
    location: {
      currentTileId: input.currentTileId,
      targetTileId: input.targetTileId,
    },
    currentGoal: {
      action: input.activeTask.action,
      source: input.activeTask.source,
      targetTileId: input.activeTask.targetTileId ?? input.targetTileId,
    },
    recentEvents,
    memorySummary,
    worldTime: {
      day: input.time.day,
      minuteOfDay: input.time.minuteOfDay,
      tick: input.time.tick,
    },
  };
}

function rankMemoriesByPriority(memoryStore: VillagerMemoryStore): readonly VillagerMemory[] {
  return [...memoryStore.shortTerm, ...memoryStore.longTerm].sort((left, right) => {
    if (left.importance !== right.importance) {
      return right.importance - left.importance;
    }

    return right.createdAt.tick - left.createdAt.tick;
  });
}

function summarizeTopMemories(
  memories: readonly VillagerMemory[],
  memoryTokenBudget: number
): readonly NpcContextMemorySummary[] {
  const summary: NpcContextMemorySummary[] = [];
  let consumedBudget = 0;

  for (const memory of memories) {
    const entryCost = estimateTokenCost(memory.summary);
    if (entryCost > memoryTokenBudget) {
      continue;
    }

    if (consumedBudget + entryCost > memoryTokenBudget) {
      break;
    }

    summary.push({
      id: memory.id,
      summary: memory.summary,
      type: memory.type,
      importance: memory.importance,
      createdAtTick: memory.createdAt.tick,
    });
    consumedBudget += entryCost;
  }

  return summary;
}

function estimateTokenCost(content: string): number {
  const normalized = content.trim();
  if (normalized.length === 0) {
    return 1;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}
