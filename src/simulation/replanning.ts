import type { TileId, VillagerActionType } from "@/domain";

import type { NpcPromptInput } from "./context-assembler";
import type { ActiveVillagerTask } from "./schedule";

export type NpcReplanReason = "cadence" | "major_event";

export interface PersistedNpcIntent {
  action: VillagerActionType;
  targetTileId?: TileId;
  reasoning: string;
  plannedAtTick: number;
}

export interface NpcReplanState {
  lastPlanTick?: number;
  lastPlanSignature?: string;
  lastMajorEventTick?: number;
  intent?: PersistedNpcIntent;
  intentUpdatedAtTick?: number;
}

interface ShouldRequestNpcReplanInput {
  tick: number;
  intervalTicks: number;
  promptSignature: string;
  lastPlanTick?: number;
  lastPlanSignature?: string;
  lastMajorEventTick?: number;
}

export function createNpcPromptSignature(promptInput: NpcPromptInput): string {
  const memorySignature = promptInput.memorySummary
    .map((memory) => `${memory.id}:${memory.createdAtTick}:${memory.importance.toFixed(2)}`)
    .join("|");
  return [
    promptInput.currentGoal.action,
    promptInput.currentGoal.targetTileId ?? "-",
    promptInput.location.currentTileId,
    promptInput.location.targetTileId ?? "-",
    promptInput.worldTime.minuteOfDay,
    memorySignature,
  ].join("#");
}

export function shouldRequestNpcReplan(input: ShouldRequestNpcReplanInput): NpcReplanReason | undefined {
  const cadenceDue = input.lastPlanTick === undefined || input.tick - input.lastPlanTick >= input.intervalTicks;
  const majorEventDue =
    input.lastMajorEventTick !== undefined &&
    (input.lastPlanTick === undefined || input.lastMajorEventTick > input.lastPlanTick);

  if (!cadenceDue && !majorEventDue) {
    return undefined;
  }

  if (input.lastPlanSignature === input.promptSignature) {
    return undefined;
  }

  return majorEventDue ? "major_event" : "cadence";
}

export function applyNpcIntentToTask(
  task: ActiveVillagerTask,
  intent: PersistedNpcIntent | undefined,
): ActiveVillagerTask {
  if (!intent) {
    return task;
  }

  return {
    ...task,
    action: intent.action,
    targetTileId: intent.targetTileId ?? task.targetTileId,
  };
}
