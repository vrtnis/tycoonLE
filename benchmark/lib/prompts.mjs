export function buildTaskPrompt(task) {
  const scoreTerms = task.scoreTerms.map((term) => `- ${term.key}: ${term.key.replace(/-/g, " ")}`).join("\n");

  return [
    "You are operating a Tycoon Learning Environment logistics company.",
    "Choose a concrete plan for the benchmark task below.",
    "",
    `Task: ${task.label}`,
    `Objective: ${task.objective}`,
    `World state: ${task.worldState}`,
    `Decision frame: ${task.decisionFrame}`,
    `Starting cash: ${task.startingCash}`,
    `Horizon steps: ${task.horizonSteps}`,
    "",
    "Scoring rewards plans that cover:",
    scoreTerms,
    "",
    "Return only valid JSON with this shape:",
    JSON.stringify(
      {
        summary: "one sentence",
        firstAction: {
          type: "build_route | take_loan | add_vehicle | wait",
          mode: "road | rail | air | water",
          cargo: "cargo name",
          reason: "why this action comes first",
        },
        financing: {
          takeLoan: false,
          reserveCash: 0,
          repaymentTrigger: "when repayment starts",
        },
        plan: [
          { step: 1, action: "specific action", reason: "short operational reason" },
          { step: 2, action: "specific action", reason: "short operational reason" },
        ],
        riskControls: ["risk and mitigation"],
        expectedOutcome: {
          profitDirection: "up | flat | down",
          mainBottleneck: "bottleneck to monitor",
        },
      },
      null,
      2,
    ),
  ].join("\n");
}

export function buildSystemPrompt() {
  return [
    "You are a concise benchmark agent for transport-economy planning.",
    "Optimize for operational score, not prose quality.",
    "Be specific about route mode, cargo, financing, capacity, and risk.",
    "Return JSON only. Do not include Markdown fences.",
  ].join(" ");
}
