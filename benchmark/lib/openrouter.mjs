const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function callOpenRouter({ modelConfig, messages, apiKey }) {
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is required to run model calls.");
  }
  if (!modelConfig.openrouterModel) {
    throw new Error(`${modelConfig.id} does not have an OpenRouter model slug configured.`);
  }

  const body = {
    model: modelConfig.openrouterModel,
    messages,
    temperature: modelConfig.temperature ?? 0.2,
    max_tokens: modelConfig.maxTokens ?? 1500,
    stream: false,
    provider: {
      allow_fallbacks: false,
      require_parameters: true,
    },
  };

  if (modelConfig.reasoningEffort) {
    body.reasoning_effort = modelConfig.reasoningEffort;
  }

  const startedAt = Date.now();
  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://vrtnis.github.io/tycoonbench/",
      "X-Title": process.env.OPENROUTER_APP_TITLE || "TycoonBench",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - startedAt;
  const payload = await response.json().catch(async () => ({ rawText: await response.text() }));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`OpenRouter ${response.status}: ${message}`);
  }

  const choice = payload.choices?.[0];
  const content = choice?.message?.content ?? "";

  return {
    id: payload.id,
    model: payload.model || modelConfig.openrouterModel,
    provider: payload.provider,
    content,
    finishReason: choice?.finish_reason,
    usage: normalizeUsage(payload.usage),
    latencyMs,
    raw: payload,
  };
}

function normalizeUsage(usage = {}) {
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
  const cost = Number(usage.cost ?? usage.total_cost ?? usage.cost_usd ?? 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: usage.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: usage.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0,
    costUsd: Number.isFinite(cost) ? cost : 0,
  };
}
