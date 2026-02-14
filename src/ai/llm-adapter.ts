import { env } from "@/config/env";
import { isTileId } from "@/domain";
import { isVillagerActionType } from "@/domain/actions";
import type { NpcPromptInput } from "@/simulation";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-3-5-haiku-latest";

export interface NpcDecision {
  action: ReturnType<typeof resolveActionType>;
  reasoning: string;
  targetTileId?: NpcPromptInput["location"]["currentTileId"];
}

export interface LlmTokenUsage {
  requestTokens: number;
  responseTokens: number;
  totalTokens: number;
}

export interface NpcDecisionObservability {
  provider: "mock" | "openai" | "anthropic";
  latencyMs: number;
  tokenUsage: LlmTokenUsage;
  decisionValidity: "accepted" | "rewritten";
  policyViolations: readonly NpcDecisionPolicyViolation[];
}

export interface NpcDecisionResult {
  decision: NpcDecision;
  observability: NpcDecisionObservability;
}

export interface NpcDecisionPolicyViolation {
  policyId: string;
  reason: string;
  originalAction: NpcPromptInput["currentGoal"]["action"];
  finalAction: NpcPromptInput["currentGoal"]["action"];
  outcome: "rewrite" | "block";
}

export interface NpcDecisionRequest {
  context: NpcPromptInput;
}

export interface LlmAdapterProvider {
  decide(request: NpcDecisionRequest): Promise<NpcDecisionResult>;
}

export class LlmAdapterApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "LlmAdapterApiError";
    this.status = status;
  }
}

export class LlmAdapterRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmAdapterRateLimitError";
  }
}

export function createLlmAdapterProvider(): LlmAdapterProvider {
  if (env.LLM_PROVIDER === "openai") {
    return new OpenAiAdapterProvider();
  }
  if (env.LLM_PROVIDER === "anthropic") {
    return new AnthropicAdapterProvider();
  }
  return new MockAdapterProvider();
}

class MockAdapterProvider implements LlmAdapterProvider {
  async decide(request: NpcDecisionRequest): Promise<NpcDecisionResult> {
    const startedAt = Date.now();
    const action = request.context.currentGoal.action;
    const reasoning = `Mock plan for ${request.context.villagerName} following scheduled ${action} task.`;
    const prompt = buildProviderPrompt(request.context);
    const decision: NpcDecision = {
      action,
      targetTileId: request.context.currentGoal.targetTileId,
      reasoning,
    };
    const moderation = applyDecisionGuardrails(decision, request.context);
    return {
      decision: moderation.decision,
      observability: {
        provider: "mock",
        latencyMs: Math.max(1, Date.now() - startedAt),
        tokenUsage: {
          requestTokens: estimateTokenCount(prompt),
          responseTokens: estimateTokenCount(reasoning),
          totalTokens: estimateTokenCount(prompt) + estimateTokenCount(reasoning),
        },
        decisionValidity: moderation.decisionValidity,
        policyViolations: moderation.policyViolations,
      },
    };
  }
}

class OpenAiAdapterProvider implements LlmAdapterProvider {
  async decide(request: NpcDecisionRequest): Promise<NpcDecisionResult> {
    if (!env.OPENAI_API_KEY) {
      throw new LlmAdapterApiError("OPENAI_API_KEY is required for OpenAI provider", 500);
    }

    const prompt = buildProviderPrompt(request.context);
    const startedAt = Date.now();
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return a safe NPC decision JSON object." },
          { role: "user", content: prompt },
        ],
      }),
    });
    const payload = await parseApiPayload(response);
    const content = readOpenAiContent(payload);
    if (typeof content !== "string") {
      throw new LlmAdapterApiError("OpenAI response is missing decision content", 502);
    }

    const decision = parseAndValidateDecision(content, request.context);
    const moderation = applyDecisionGuardrails(decision, request.context);
    return {
      decision: moderation.decision,
      observability: {
        provider: "openai",
        latencyMs: Math.max(1, Date.now() - startedAt),
        tokenUsage: readOpenAiUsage(payload, prompt, content),
        decisionValidity: moderation.decisionValidity,
        policyViolations: moderation.policyViolations,
      },
    };
  }
}

class AnthropicAdapterProvider implements LlmAdapterProvider {
  async decide(request: NpcDecisionRequest): Promise<NpcDecisionResult> {
    if (!env.ANTHROPIC_API_KEY) {
      throw new LlmAdapterApiError("ANTHROPIC_API_KEY is required for Anthropic provider", 500);
    }

    const prompt = buildProviderPrompt(request.context);
    const startedAt = Date.now();
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 180,
        system: "Return a safe NPC decision JSON object.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const payload = await parseApiPayload(response);
    const content = readAnthropicContent(payload);
    if (typeof content !== "string") {
      throw new LlmAdapterApiError("Anthropic response is missing decision content", 502);
    }

    const decision = parseAndValidateDecision(content, request.context);
    const moderation = applyDecisionGuardrails(decision, request.context);
    return {
      decision: moderation.decision,
      observability: {
        provider: "anthropic",
        latencyMs: Math.max(1, Date.now() - startedAt),
        tokenUsage: readAnthropicUsage(payload, prompt, content),
        decisionValidity: moderation.decisionValidity,
        policyViolations: moderation.policyViolations,
      },
    };
  }
}

async function parseApiPayload(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 429) {
    throw new LlmAdapterRateLimitError("LLM provider rate limit hit");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorText = readErrorMessage(payload) ?? `LLM provider request failed with status ${response.status}`;
    throw new LlmAdapterApiError(errorText, response.status);
  }

  if (!payload || typeof payload !== "object") {
    throw new LlmAdapterApiError("LLM provider returned invalid JSON payload", 502);
  }

  return payload as Record<string, unknown>;
}

function buildProviderPrompt(context: NpcPromptInput): string {
  return JSON.stringify({
    instruction:
      "Respond with JSON only: {\"action\":string,\"reasoning\":string,\"targetTileId\"?:string}.",
    context,
    allowedActions: ["walk", "farm", "chat", "shop", "rest", "observe"],
  });
}

interface DecisionPolicyRule {
  id: string;
  disallowedActions: readonly NpcPromptInput["currentGoal"]["action"][];
  evaluate: (context: NpcPromptInput) => boolean;
  outcome:
    | { type: "rewrite"; action: NpcPromptInput["currentGoal"]["action"]; reason: string }
    | { type: "block"; reason: string };
}

const DECISION_POLICY_RULES: readonly DecisionPolicyRule[] = [
  {
    id: "role-restriction-shop",
    disallowedActions: ["shop"],
    evaluate: (context) => context.role !== "merchant",
    outcome: {
      type: "block",
      reason: "Only merchant-role villagers may execute shop actions.",
    },
  },
  {
    id: "role-restriction-farm",
    disallowedActions: ["farm"],
    evaluate: (context) => context.role !== "farmer",
    outcome: {
      type: "rewrite",
      action: "observe",
      reason: "Non-farmer villagers cannot execute farm actions.",
    },
  },
  {
    id: "quiet-hours-social",
    disallowedActions: ["chat", "shop"],
    evaluate: (context) => context.worldTime.minuteOfDay < 360 || context.worldTime.minuteOfDay >= 1320,
    outcome: {
      type: "rewrite",
      action: "observe",
      reason: "Social and market actions are disallowed during quiet hours.",
    },
  },
];

interface DecisionModerationResult {
  decision: NpcDecision;
  decisionValidity: NpcDecisionObservability["decisionValidity"];
  policyViolations: readonly NpcDecisionPolicyViolation[];
}

function applyDecisionGuardrails(decision: NpcDecision, context: NpcPromptInput): DecisionModerationResult {
  let moderatedAction = decision.action;
  let moderatedTargetTileId = decision.targetTileId;
  const policyViolations: NpcDecisionPolicyViolation[] = [];

  for (const rule of DECISION_POLICY_RULES) {
    if (!rule.disallowedActions.includes(moderatedAction) || !rule.evaluate(context)) {
      continue;
    }

    if (rule.outcome.type === "block") {
      logDecisionPolicyViolation(rule.id, {
        outcome: "block",
        reason: rule.outcome.reason,
        originalAction: moderatedAction,
      });
      throw new LlmAdapterApiError(`Decision blocked by policy ${rule.id}: ${rule.outcome.reason}`, 422);
    }

    const originalAction = moderatedAction;
    moderatedAction = rule.outcome.action;
    if (!actionRequiresTarget(moderatedAction)) {
      moderatedTargetTileId = undefined;
    }

    const violation: NpcDecisionPolicyViolation = {
      policyId: rule.id,
      reason: rule.outcome.reason,
      originalAction,
      finalAction: moderatedAction,
      outcome: "rewrite",
    };
    policyViolations.push(violation);
    logDecisionPolicyViolation(rule.id, violation);
  }

  return {
    decision: {
      action: moderatedAction,
      reasoning: decision.reasoning,
      targetTileId: moderatedTargetTileId,
    },
    decisionValidity: policyViolations.length > 0 ? "rewritten" : "accepted",
    policyViolations,
  };
}

function parseAndValidateDecision(rawContent: string, context: NpcPromptInput): NpcDecision {
  let payload: {
    action?: unknown;
    reasoning?: unknown;
    targetTileId?: unknown;
  };
  try {
    payload = JSON.parse(rawContent) as {
      action?: unknown;
      reasoning?: unknown;
      targetTileId?: unknown;
    };
  } catch {
    logDecisionRejection("invalid-json", { rawContent });
    throw new LlmAdapterApiError("Decision response is not valid JSON", 502);
  }

  if (!payload || typeof payload !== "object") {
    logDecisionRejection("invalid-payload-shape", { payload });
    throw new LlmAdapterApiError("Decision response payload must be an object", 502);
  }

  if (typeof payload.reasoning !== "string" || payload.reasoning.trim().length === 0) {
    logDecisionRejection("missing-reasoning", { payload });
    throw new LlmAdapterApiError("Decision JSON must include non-empty reasoning", 502);
  }

  const action = resolveActionType(payload.action, payload);
  const targetTileId = resolveTargetTileId(payload.targetTileId);
  const normalizedIntent = normalizeDecisionIntent({ action, targetTileId }, context);
  return {
    action: normalizedIntent.action,
    reasoning: payload.reasoning.trim(),
    targetTileId: normalizedIntent.targetTileId,
  };
}

function normalizeDecisionIntent(
  decision: Pick<NpcDecision, "action" | "targetTileId">,
  context: NpcPromptInput
): Pick<NpcDecision, "action" | "targetTileId"> {
  const fallbackTargetTileId = context.currentGoal.targetTileId ?? context.location.targetTileId;
  const mappedTargetTileId = decision.targetTileId ?? fallbackTargetTileId;

  if (actionRequiresTarget(decision.action) && !mappedTargetTileId) {
    logDecisionRejection("missing-required-target", { action: decision.action });
    throw new LlmAdapterApiError(
      `Decision JSON must include targetTileId for action ${decision.action}`,
      502
    );
  }

  return {
    action: decision.action,
    targetTileId: mappedTargetTileId,
  };
}

function actionRequiresTarget(action: NpcPromptInput["currentGoal"]["action"]): boolean {
  return action === "walk" || action === "farm" || action === "shop";
}

function resolveActionType(
  value: unknown,
  payload: {
    action?: unknown;
    reasoning?: unknown;
    targetTileId?: unknown;
  }
): NpcPromptInput["currentGoal"]["action"] {
  if (typeof value === "string" && isVillagerActionType(value)) {
    return value;
  }
  logDecisionRejection("invalid-action", { payload });
  throw new LlmAdapterApiError("Decision JSON contains invalid action", 502);
}

function resolveTargetTileId(value: unknown): NpcDecision["targetTileId"] {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && isTileId(value)) {
    return value;
  }
  logDecisionRejection("invalid-target-tile-id", { targetTileId: value });
  throw new LlmAdapterApiError("Decision JSON contains invalid targetTileId", 502);
}

function logDecisionRejection(reason: string, details: unknown): void {
  console.error("[ai] Rejected NPC decision", { reason, details });
}

function logDecisionPolicyViolation(policyId: string, details: unknown): void {
  console.warn("[ai] NPC decision policy violation", { policyId, details });
}

function readErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function readOpenAiContent(payload: Record<string, unknown>): string | undefined {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined;
  }

  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") {
    return undefined;
  }

  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : undefined;
}

function readAnthropicContent(payload: Record<string, unknown>): string | undefined {
  const contentList = payload.content;
  if (!Array.isArray(contentList) || contentList.length === 0) {
    return undefined;
  }

  const firstContent = contentList[0];
  if (!firstContent || typeof firstContent !== "object") {
    return undefined;
  }

  const text = (firstContent as { text?: unknown }).text;
  return typeof text === "string" ? text : undefined;
}

function readOpenAiUsage(payload: Record<string, unknown>, prompt: string, content: string): LlmTokenUsage {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") {
    return estimateUsage(prompt, content);
  }

  const requestTokens = readNonNegativeNumber((usage as { prompt_tokens?: unknown }).prompt_tokens);
  const responseTokens = readNonNegativeNumber((usage as { completion_tokens?: unknown }).completion_tokens);
  const totalTokens = readNonNegativeNumber((usage as { total_tokens?: unknown }).total_tokens);
  if (requestTokens === undefined || responseTokens === undefined || totalTokens === undefined) {
    return estimateUsage(prompt, content);
  }

  return { requestTokens, responseTokens, totalTokens };
}

function readAnthropicUsage(payload: Record<string, unknown>, prompt: string, content: string): LlmTokenUsage {
  const usage = payload.usage;
  if (!usage || typeof usage !== "object") {
    return estimateUsage(prompt, content);
  }

  const requestTokens = readNonNegativeNumber((usage as { input_tokens?: unknown }).input_tokens);
  const responseTokens = readNonNegativeNumber((usage as { output_tokens?: unknown }).output_tokens);
  if (requestTokens === undefined || responseTokens === undefined) {
    return estimateUsage(prompt, content);
  }

  return {
    requestTokens,
    responseTokens,
    totalTokens: requestTokens + responseTokens,
  };
}

function estimateUsage(prompt: string, content: string): LlmTokenUsage {
  const requestTokens = estimateTokenCount(prompt);
  const responseTokens = estimateTokenCount(content);
  return {
    requestTokens,
    responseTokens,
    totalTokens: requestTokens + responseTokens,
  };
}

function estimateTokenCount(content: string): number {
  const normalized = content.trim();
  if (normalized.length === 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function readNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
