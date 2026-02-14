import type { SimulationTime } from "@/domain";

const MINUTES_PER_DAY = 1440;

export interface SimulationClockConfig {
  tickIntervalMs: number;
  timeScale: number;
  dayLengthTicks: number;
  initialTick?: number;
}

export class SimulationClock {
  private readonly dayLengthTicks: number;
  private tickIntervalMs: number;
  private timeScale: number;
  private paused = false;
  private tick = 0;
  private accumulatedScaledMs = 0;

  constructor(config: SimulationClockConfig) {
    this.tickIntervalMs = assertPositiveNumber(config.tickIntervalMs, "tickIntervalMs");
    this.timeScale = assertPositiveNumber(config.timeScale, "timeScale");
    this.dayLengthTicks = assertPositiveInteger(config.dayLengthTicks, "dayLengthTicks");
    this.tick = assertNonNegativeInteger(config.initialTick ?? 0, "initialTick");
  }

  getSnapshot(): SimulationTime {
    return toSimulationTime(this.tick, this.dayLengthTicks);
  }

  isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setTimeScale(nextTimeScale: number): void {
    this.timeScale = assertPositiveNumber(nextTimeScale, "timeScale");
  }

  setTickIntervalMs(nextTickIntervalMs: number): void {
    this.tickIntervalMs = assertPositiveNumber(nextTickIntervalMs, "tickIntervalMs");
  }

  advance(elapsedRealMs: number): SimulationTime {
    const safeElapsedMs = assertNonNegativeNumber(elapsedRealMs, "elapsedRealMs");
    if (this.paused || safeElapsedMs === 0) {
      return this.getSnapshot();
    }

    this.accumulatedScaledMs += safeElapsedMs * this.timeScale;
    const wholeTicks = Math.floor(this.accumulatedScaledMs / this.tickIntervalMs);
    if (wholeTicks === 0) {
      return this.getSnapshot();
    }

    this.accumulatedScaledMs -= wholeTicks * this.tickIntervalMs;
    this.tick += wholeTicks;
    return this.getSnapshot();
  }

  reset(nextTick = 0): SimulationTime {
    this.tick = assertNonNegativeInteger(nextTick, "nextTick");
    this.accumulatedScaledMs = 0;
    return this.getSnapshot();
  }
}

export function toSimulationTime(tick: number, dayLengthTicks: number): SimulationTime {
  const safeTick = assertNonNegativeInteger(tick, "tick");
  const safeDayLengthTicks = assertPositiveInteger(dayLengthTicks, "dayLengthTicks");
  const day = Math.floor(safeTick / safeDayLengthTicks) + 1;
  const dayTick = safeTick % safeDayLengthTicks;
  const minuteOfDay = Math.min(
    MINUTES_PER_DAY - 1,
    Math.floor((dayTick * MINUTES_PER_DAY) / safeDayLengthTicks)
  );
  return {
    tick: safeTick,
    day,
    minuteOfDay
  };
}

function assertPositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function assertPositiveNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
  return value;
}

function assertNonNegativeNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a non-negative number`);
  }
  return value;
}
