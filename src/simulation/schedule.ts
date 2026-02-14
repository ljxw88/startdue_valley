import type { SimulationTime, TileId, Villager, VillagerActionType, VillagerId } from "@/domain";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const IDLE_ACTION: VillagerActionType = "observe";

export interface VillagerScheduleEntry {
  startMinute: number;
  action: VillagerActionType;
  targetTileId: TileId;
}

export interface VillagerDailySchedule {
  villagerId: VillagerId;
  entries: readonly VillagerScheduleEntry[];
}

export interface ActiveVillagerTask {
  villagerId: VillagerId;
  action: VillagerActionType;
  targetTileId?: TileId;
  source: "schedule" | "idle";
}

export function createVillagerDailySchedule(villager: Villager): VillagerDailySchedule {
  const entries = villager.baseSchedule
    .map((slot) => ({
      startMinute: normalizeHourToMinute(slot.hour),
      action: slot.action,
      targetTileId: slot.targetTileId,
    }))
    .sort((left, right) => left.startMinute - right.startMinute);

  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].startMinute === entries[index].startMinute) {
      throw new Error(`villager ${villager.id} has duplicate schedule hours`);
    }
  }

  return {
    villagerId: villager.id,
    entries,
  };
}

export function resolveActiveVillagerTask(
  schedule: VillagerDailySchedule,
  time: SimulationTime
): ActiveVillagerTask {
  const entries = schedule.entries;
  let low = 0;
  let high = entries.length - 1;
  let activeEntry: VillagerScheduleEntry | undefined;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (entries[mid].startMinute <= time.minuteOfDay) {
      activeEntry = entries[mid];
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!activeEntry) {
    return {
      villagerId: schedule.villagerId,
      action: IDLE_ACTION,
      source: "idle",
    };
  }

  return {
    villagerId: schedule.villagerId,
    action: activeEntry.action,
    targetTileId: activeEntry.targetTileId,
    source: "schedule",
  };
}

export function buildVillagerDailyScheduleIndex(
  villagers: readonly Villager[]
): ReadonlyMap<VillagerId, VillagerDailySchedule> {
  return new Map(villagers.map((villager) => [villager.id, createVillagerDailySchedule(villager)]));
}

function normalizeHourToMinute(hour: number): number {
  if (!Number.isInteger(hour) || hour < 0 || hour >= MINUTES_PER_DAY / MINUTES_PER_HOUR) {
    throw new Error("schedule hour must be an integer between 0 and 23");
  }

  return hour * MINUTES_PER_HOUR;
}
