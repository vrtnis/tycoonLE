#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readJson, writeJson } from "../lib/fs.mjs";

const args = parseArgs(process.argv.slice(2));
const taskManifest = readJson("benchmark/config/tasks.json");
const taskKeys = taskManifest.tasks.map((task) => task.key);
const baselineSummary = readJson("benchmark/fixtures/baseline-summary.json");
const baselineTrajectoryNotes = readJson("benchmark/fixtures/baseline-trajectory-notes.json");

const rawResults = collectRawResults(args.rawDir || "results/raw");
const scoredResults = rawResults.filter((result) => result.score && result.model && result.task);

if (scoredResults.length === 0) {
  writeOutputs(baselineSummary, baselineTrajectoryNotes);
  console.log("No scored raw results found. Wrote baseline generated site data.");
  process.exit(0);
}

const latestByModelTask = new Map();
for (const result of scoredResults) {
  const key = `${result.model.id}/${result.task.key}`;
  const previous = latestByModelTask.get(key);
  const resultTime = Date.parse(result.finishedAt || result.startedAt || "") || 0;
  const previousTime = previous ? Date.parse(previous.finishedAt || previous.startedAt || "") || 0 : -1;
  if (!previous || resultTime >= previousTime) latestByModelTask.set(key, result);
}

const grouped = new Map();
for (const result of latestByModelTask.values()) {
  if (!grouped.has(result.model.id)) grouped.set(result.model.id, []);
  grouped.get(result.model.id).push(result);
}

const models = [...grouped.entries()]
  .map(([modelId, results]) => summarizeModel(modelId, results))
  .sort((a, b) => b.overall - a.overall);

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "openrouter-results",
  tasks: baselineSummary.tasks,
  models,
};

const trajectoryNotes = buildTrajectoryNotes(models, latestByModelTask);
writeOutputs(summary, trajectoryNotes.length > 0 ? trajectoryNotes : baselineTrajectoryNotes);
console.log(`Extracted ${scoredResults.length} scored task results into generated site data.`);

function summarizeModel(modelId, results) {
  const modelInfo = results[0].model;
  const taskScores = Object.fromEntries(taskKeys.map((taskKey) => [taskKey, 0]));
  for (const result of results) taskScores[result.task.key] = round1(result.score.score);

  const observedScores = results.map((result) => result.score.score);
  const observedFinalScores = results.map((result) => result.score.finalScore);
  const usage = results.map((result) => result.response?.usage || {});
  const cost = usage.reduce((sum, item) => sum + Number(item.costUsd || 0), 0);
  const promptTokens = usage.reduce((sum, item) => sum + Number(item.promptTokens || 0), 0);
  const completionTokens = usage.reduce((sum, item) => sum + Number(item.completionTokens || 0), 0);

  return {
    id: modelId,
    name: modelInfo.name,
    provider: modelInfo.provider,
    overall: round1(mean(observedScores)),
    peakVelocity: round1(mean(results.map((result) => result.score.peakVelocity))),
    finalScore: round1(mean(observedFinalScores)),
    successRate: Math.round((results.filter((result) => result.score.success).length / results.length) * 100),
    invalidActions: round1(mean(results.map((result) => result.score.invalidActions))),
    profit: Math.round(results.reduce((sum, result) => sum + Number(result.score.profit || 0), 0)),
    cost: round2(cost),
    tokensIn: round1(promptTokens / 1_000_000),
    tokensOut: Math.round(completionTokens / 1000),
    tasks: taskScores,
  };
}

function buildTrajectoryNotes(models, resultMap) {
  return models.slice(0, 4).flatMap((model) => {
    const bestTaskKey = Object.entries(model.tasks)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!bestTaskKey) return [];
    const result = resultMap.get(`${model.id}/${bestTaskKey}`);
    const taskLabel = baselineSummary.tasks.find((task) => task.key === bestTaskKey)?.label || bestTaskKey;
    const summaryText = result?.score?.parsedPlan?.summary || firstSentence(result?.response?.content || "");
    return [
      {
        model: model.name,
        task: taskLabel,
        text: summaryText || "Produces a structured plan with route, finance, and risk controls.",
        checkpoints: [
          { at: "0:00", label: "Reads task state" },
          { at: "0:30", label: "Chooses opening action" },
          { at: "1:20", label: "Sets capacity and risk controls" },
        ],
      },
    ];
  });
}

function collectRawResults(root) {
  const files = walkJson(root);
  return files
    .filter((file) => !file.endsWith(`${slash()}run.json`))
    .map((file) => {
      try {
        return readJson(file);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function walkJson(root) {
  try {
    const entries = readdirSync(root);
    return entries.flatMap((entry) => {
      const path = join(root, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) return walkJson(path);
      return path.endsWith(".json") ? [path] : [];
    });
  } catch {
    return [];
  }
}

function writeOutputs(summary, trajectoryNotes) {
  writeJson("results/processed/summary.json", summary);
  writeJson("results/processed/trajectory-notes.json", trajectoryNotes);
  writeJson("src/benchmark/generated/summary.json", summary);
  writeJson("src/benchmark/generated/trajectory-notes.json", trajectoryNotes);
}

function firstSentence(text) {
  return String(text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)[0]?.slice(0, 240) || "";
}

function mean(values) {
  const finite = values.map(Number).filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function slash() {
  return process.platform === "win32" ? "\\" : "/";
}

function parseArgs(argv) {
  const result = { rawDir: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--raw-dir") result.rawDir = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}
