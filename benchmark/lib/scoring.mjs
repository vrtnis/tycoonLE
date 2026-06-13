const SCORE_FLOOR = 28;
const SCORE_CEILING = 88;

export function scoreModelResponse(task, content) {
  const parseResult = parseJsonResponse(content);
  const text = normalizeText(content);
  const termScores = task.scoreTerms.map((term) => {
    const matched = term.keywords.filter((keyword) => text.includes(normalizeText(keyword)));
    return {
      key: term.key,
      weight: term.weight,
      matched,
      score: matched.length > 0 ? term.weight : 0,
    };
  });

  const plan = parseResult.value;
  const structureScore = scoreStructure(plan);
  const termTotal = termScores.reduce((sum, term) => sum + term.score, 0);
  const invalidActions = estimateInvalidActions(parseResult, plan);
  const rawScore = SCORE_FLOOR + termTotal + structureScore - invalidActions * 4;
  const score = clamp(round1(rawScore), 0, 100);
  const finalScore = clamp(round1(score + (structureScore > 8 ? 1.6 : -1.2)), 0, 100);

  return {
    score: clamp(score, SCORE_FLOOR, SCORE_CEILING),
    finalScore: clamp(finalScore, SCORE_FLOOR, SCORE_CEILING),
    peakVelocity: round1(4 + score / 6.2),
    success: score >= 60,
    invalidActions,
    profit: Math.round((score - 48) * 820 + task.startingCash * 0.035),
    termScores,
    parseStatus: parseResult.ok ? "json" : "text",
    parsedPlan: parseResult.ok ? plan : null,
  };
}

function parseJsonResponse(content) {
  const trimmed = String(content || "").trim();
  const direct = tryParseJson(trimmed);
  if (direct.ok) return direct;

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseJson(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return { ok: false, value: null, error: "No JSON object found." };
}

function tryParseJson(value) {
  try {
    return { ok: true, value: JSON.parse(value), error: null };
  } catch (error) {
    return { ok: false, value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function scoreStructure(plan) {
  if (!plan || typeof plan !== "object") return 0;
  let score = 0;
  if (typeof plan.summary === "string" && plan.summary.length > 12) score += 2;
  if (plan.firstAction && typeof plan.firstAction === "object") score += 3;
  if (plan.financing && typeof plan.financing === "object") score += 2;
  if (Array.isArray(plan.plan) && plan.plan.length >= 2) score += 5;
  if (Array.isArray(plan.riskControls) && plan.riskControls.length > 0) score += 3;
  if (plan.expectedOutcome && typeof plan.expectedOutcome === "object") score += 2;
  return Math.min(score, 14);
}

function estimateInvalidActions(parseResult, plan) {
  if (!parseResult.ok) return 3;
  if (!plan || typeof plan !== "object") return 2;
  let invalid = 0;
  if (!plan.firstAction?.type) invalid += 1;
  if (!Array.isArray(plan.plan) || plan.plan.length === 0) invalid += 1;
  if (!Array.isArray(plan.riskControls)) invalid += 1;
  return invalid;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
