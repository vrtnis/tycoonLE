#!/usr/bin/env node
import { join } from "node:path";
import { ensureDir, readJson, writeJson, writeText } from "../lib/fs.mjs";
import { buildTaskPrompt } from "../lib/prompts.mjs";

const manifest = readJson("benchmark/config/tasks.json");
const outDir = "benchmark/generated/tasks";

ensureDir(outDir);

for (const task of manifest.tasks) {
  const taskDir = join(outDir, task.key);
  ensureDir(taskDir);
  writeJson(join(taskDir, "task.json"), task);
  writeInstruction(join(taskDir, "instruction.txt"), buildTaskPrompt(task));
  console.log(`generated ${taskDir}`);
}

console.log(`\nGenerated ${manifest.tasks.length} TycoonBench task definitions.`);

function writeInstruction(path, content) {
  const normalized = `${content.trim()}\n`;
  writeText(path, normalized);
}
