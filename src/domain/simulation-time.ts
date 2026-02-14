export interface SimulationTime {
  tick: number;
  day: number;
  minuteOfDay: number;
}

export function isSimulationTime(value: unknown): value is SimulationTime {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Number.isInteger(candidate.tick) && (candidate.tick as number) >= 0 &&
    Number.isInteger(candidate.day) && (candidate.day as number) >= 1 &&
    Number.isInteger(candidate.minuteOfDay) &&
    (candidate.minuteOfDay as number) >= 0 &&
    (candidate.minuteOfDay as number) < 1440
  );
}
