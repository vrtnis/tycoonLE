#!/usr/bin/env node
import { join } from "node:path";
import { OPENROUTER_MODELS } from "../config/openrouter-models.mjs";
import { ensureDir, readJson, writeJson } from "../lib/fs.mjs";
import { callOpenRouter } from "../lib/openrouter.mjs";
import { buildSystemPrompt, buildTaskPrompt } from "../lib/prompts.mjs";
import { scoreModelResponse } from "../lib/scoring.mjs";

const args = parseArgs(process.argv.slice(2));
const taskManifest = readJson("benchmark/config/tasks.json");
const runId = args.runId || new Date().toISOString().replace(/[:.]/g, "-");
const outRoot = join("results/raw", runId);
const selectedModels = selectModels(args.models);
const selectedTasks = selectTasks(taskManifest.tasks, args.tasks);

if (args.list) {
  console.log("Models:");
  for (const model of OPENROUTER_MODELS) {
    const suffix = model.openrouterModel ? model.openrouterModel : `unavailable: ${model.unavailableReason}`;
    console.log(`  ${model.id}: ${suffix}`);
  }
  console.log("\nTasks:");
  for (const task of taskManifest.tasks) console.log(`  ${task.key}: ${task.label}`);
  process.exit(0);
}

if (!args.dryRun && !process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is required. Use --dry-run to write request previews without model calls.");
  process.exit(1);
}

ensureDir(outRoot);
writeJson(join(outRoot, "run.json"), {
  runId,
  startedAt: new Date().toISOString(),
  provider: "openrouter",
  dryRun: args.dryRun,
  models: selectedModels.map(({ id, name, provider, openrouterModel }) => ({ id, name, provider, openrouterModel })),
  tasks: selectedTasks.map(({ key, label, seed, horizonSteps }) => ({ key, label, seed, horizonSteps })),
});

for (const model of selectedModels) {
  for (const task of selectedTasks) {
    const messages = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildTaskPrompt(task) },
    ];
    const resultPath = join(outRoot, model.id, `${task.key}.json`);

    if (args.dryRun) {
      writeJson(resultPath, {
        runId,
        dryRun: true,
        model: publicModelInfo(model),
        task: publicTaskInfo(task),
        request: { messages },
      });
      console.log(`preview ${model.id}/${task.key}`);
      continue;
    }

    console.log(`running ${model.id}/${task.key} via ${model.openrouterModel}`);
    const startedAt = new Date().toISOString();
    try {
      const response = await callOpenRouter({
        modelConfig: model,
        messages,
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      const score = scoreModelResponse(task, response.content);
      writeJson(resultPath, {
        runId,
        provider: "openrouter",
        startedAt,
        finishedAt: new Date().toISOString(),
        model: publicModelInfo(model),
        task: publicTaskInfo(task),
        request: {
          temperature: model.temperature ?? 0.2,
          maxTokens: model.maxTokens ?? 1500,
          fallbackProviders: false,
        },
        response: {
          id: response.id,
          model: response.model,
          provider: response.provider,
          finishReason: response.finishReason,
          content: response.content,
          latencyMs: response.latencyMs,
          usage: response.usage,
        },
        score,
      });
    } catch (error) {
      writeJson(resultPath, {
        runId,
        provider: "openrouter",
        startedAt,
        finishedAt: new Date().toISOString(),
        model: publicModelInfo(model),
        task: publicTaskInfo(task),
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`failed ${model.id}/${task.key}: ${error instanceof Error ? error.message : error}`);
    }
  }
}

console.log(`\nOpenRouter run artifacts written to ${outRoot}`);

function selectModels(modelIds) {
  const configured = OPENROUTER_MODELS.filter((model) => model.openrouterModel);
  if (!modelIds.length) return configured;
  const wanted = new Set(modelIds);
  return configured.filter((model) => wanted.has(model.id) || wanted.has(model.openrouterModel));
}

function selectTasks(tasks, taskKeys) {
  if (!taskKeys.length) return tasks;
  const wanted = new Set(taskKeys);
  return tasks.filter((task) => wanted.has(task.key) || wanted.has(task.label));
}

function publicModelInfo(model) {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    openrouterModel: model.openrouterModel,
  };
}

function publicTaskInfo(task) {
  return {
    key: task.key,
    label: task.label,
    family: task.family,
    seed: task.seed,
    horizonSteps: task.horizonSteps,
    startingCash: task.startingCash,
  };
}

function parseArgs(argv) {
  const result = { models: [], tasks: [], dryRun: false, list: false, runId: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--list") result.list = true;
    else if (arg === "--models") result.models = splitList(argv[++i]);
    else if (arg === "--tasks") result.tasks = splitList(argv[++i]);
    else if (arg === "--run-id") result.runId = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return result;
}

function splitList(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
