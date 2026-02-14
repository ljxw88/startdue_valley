type LlmProvider = "mock" | "openai" | "anthropic";

const numberEnvDefaults = {
  NEXT_PUBLIC_SIM_TICK_MS: "1000",
  NEXT_PUBLIC_SIM_TIME_SCALE: "1",
  NEXT_PUBLIC_SIM_DAY_LENGTH_TICKS: "1440"
} as const;

const llmProvider = getLlmProvider(process.env.LLM_PROVIDER);
const envName = process.env.NODE_ENV ?? "development";

const config = {
  NODE_ENV: envName,
  LLM_PROVIDER: llmProvider,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  NEXT_PUBLIC_SIM_TICK_MS: parsePositiveInt(
    process.env.NEXT_PUBLIC_SIM_TICK_MS ?? numberEnvDefaults.NEXT_PUBLIC_SIM_TICK_MS,
    "NEXT_PUBLIC_SIM_TICK_MS"
  ),
  NEXT_PUBLIC_SIM_TIME_SCALE: parsePositiveNumber(
    process.env.NEXT_PUBLIC_SIM_TIME_SCALE ?? numberEnvDefaults.NEXT_PUBLIC_SIM_TIME_SCALE,
    "NEXT_PUBLIC_SIM_TIME_SCALE"
  ),
  NEXT_PUBLIC_SIM_DAY_LENGTH_TICKS: parsePositiveInt(
    process.env.NEXT_PUBLIC_SIM_DAY_LENGTH_TICKS ?? numberEnvDefaults.NEXT_PUBLIC_SIM_DAY_LENGTH_TICKS,
    "NEXT_PUBLIC_SIM_DAY_LENGTH_TICKS"
  )
} as const;

if (config.NODE_ENV === "production") {
  if (config.LLM_PROVIDER === "openai" && !config.OPENAI_API_KEY) {
    throw new Error("Missing required production env var: OPENAI_API_KEY");
  }
  if (config.LLM_PROVIDER === "anthropic" && !config.ANTHROPIC_API_KEY) {
    throw new Error("Missing required production env var: ANTHROPIC_API_KEY");
  }
}

export const env = config;

function getLlmProvider(value: string | undefined): LlmProvider {
  if (!value) {
    return "mock";
  }
  if (value === "mock" || value === "openai" || value === "anthropic") {
    return value;
  }
  throw new Error(`Invalid LLM_PROVIDER value: ${value}`);
}

function parsePositiveInt(rawValue: string, key: string): number {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function parsePositiveNumber(rawValue: string, key: string): number {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be a positive number`);
  }
  return value;
}
