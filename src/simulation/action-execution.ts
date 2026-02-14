import type { NpcState, VillagerActionType } from "@/domain";

import type { ActiveVillagerTask } from "./schedule";

const ACTION_DURATION_TICKS: Record<VillagerActionType, number> = {
  walk: 0,
  observe: 0,
  farm: 6,
  chat: 4,
  shop: 5,
  rest: 8,
};

const ACTION_LABELS: Partial<Record<VillagerActionType, string>> = {
  farm: "Farming",
  chat: "Chatting",
  shop: "Shopping",
  rest: "Resting",
};

export interface VillagerActionExecution {
  action: VillagerActionType;
  taskSignature: string;
  startedAtTick: number;
  completesAtTick: number;
  completedAtTick?: number;
}

export interface VillagerActionExecutionProgress {
  execution: VillagerActionExecution;
  completed: boolean;
  npcState: NpcState;
}

export function createVillagerTaskSignature(task: ActiveVillagerTask): string {
  return `${task.action}|${task.targetTileId ?? "none"}|${task.source}`;
}

export function beginVillagerActionExecution(
  task: ActiveVillagerTask,
  tick: number,
  taskSignature: string,
): VillagerActionExecution | undefined {
  const duration = ACTION_DURATION_TICKS[task.action];
  if (duration <= 0) {
    return undefined;
  }

  return {
    action: task.action,
    taskSignature,
    startedAtTick: tick,
    completesAtTick: tick + duration,
  };
}

export function advanceVillagerActionExecution(
  execution: VillagerActionExecution,
  tick: number,
): VillagerActionExecutionProgress {
  if (execution.completedAtTick !== undefined || tick < execution.completesAtTick) {
    return {
      execution,
      completed: false,
      npcState: execution.action === "rest" ? "resting" : "acting",
    };
  }

  return {
    execution: {
      ...execution,
      completedAtTick: tick,
    },
    completed: true,
    npcState: "planning",
  };
}

export function shouldStartVillagerActionExecution(
  execution: VillagerActionExecution | undefined,
  taskSignature: string,
): boolean {
  return !execution || execution.taskSignature !== taskSignature;
}

export function getVillagerActionIndicator(action: VillagerActionType): string | undefined {
  return ACTION_LABELS[action];
}
