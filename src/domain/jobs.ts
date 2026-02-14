import type { JobId } from "./identifiers";

export const JOB_ROLES = ["farmer", "merchant", "fisher", "builder", "caretaker"] as const;

export type JobRole = (typeof JOB_ROLES)[number];

export interface VillagerJob {
  id: JobId;
  role: JobRole;
  displayName: string;
}

export function isJobRole(value: string): value is JobRole {
  return JOB_ROLES.includes(value as JobRole);
}
