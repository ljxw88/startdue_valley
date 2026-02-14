import { type NextRequest, NextResponse } from "next/server";

import {
  createLlmAdapterProvider,
  LlmAdapterApiError,
  LlmAdapterRateLimitError,
  type NpcDecisionRequest,
} from "@/ai";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as NpcDecisionRequest | null;
  if (!body?.context) {
    return NextResponse.json({ error: "Request must include context" }, { status: 400 });
  }

  const provider = createLlmAdapterProvider();
  const startedAt = Date.now();
  try {
    const result = await provider.decide({ context: body.context });
    console.info("[ai] NPC decision request completed", {
      villagerId: body.context.villagerId,
      provider: result.observability.provider,
      status: "ok",
      latencyMs: result.observability.latencyMs,
      tokenUsage: result.observability.tokenUsage,
      decisionValidity: result.observability.decisionValidity,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof LlmAdapterRateLimitError) {
      console.warn("[ai] NPC decision request failed", {
        villagerId: body.context.villagerId,
        status: "rate_limited",
        latencyMs: Math.max(1, Date.now() - startedAt),
      });
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof LlmAdapterApiError) {
      const status = error.status >= 500 ? "provider_error" : "request_error";
      console.error("[ai] NPC decision request failed", {
        villagerId: body.context.villagerId,
        status,
        httpStatus: error.status,
        latencyMs: Math.max(1, Date.now() - startedAt),
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
