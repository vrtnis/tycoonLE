import summary from "./generated/summary.json";
import trajectoryNotes from "./generated/trajectory-notes.json";

export interface TaskScores {
  singleRoute: number;
  lowCash: number;
  chain: number;
  mixedNetwork: number;
  terrainGap: number;
}

export type BenchmarkProvider = "Anthropic" | "OpenAI" | "Google" | "Moonshot" | "DeepSeek" | "Qwen" | "GLM" | "Fable";

export interface BenchmarkModel {
  id: string;
  name: string;
  provider: BenchmarkProvider;
  overall: number;
  peakVelocity: number;
  finalScore: number;
  successRate: number;
  invalidActions: number;
  profit: number;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  tasks: TaskScores;
}

export interface TaskDefinition {
  key: keyof TaskScores;
  label: string;
  focus: string;
}

export interface TrajectoryNote {
  model: string;
  task: string;
  text: string;
  checkpoints: Array<{ at: string; label: string }>;
}

interface GeneratedSummary {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  tasks: TaskDefinition[];
  models: BenchmarkModel[];
}

const generatedSummary = summary as GeneratedSummary;

export const TASKS: TaskDefinition[] = generatedSummary.tasks;
export const BENCHMARK_MODELS: BenchmarkModel[] = generatedSummary.models;
export const TRAJECTORY_NOTES: TrajectoryNote[] = trajectoryNotes as TrajectoryNote[];

export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}
