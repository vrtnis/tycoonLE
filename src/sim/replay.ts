import type { Observation, ReplayManifest } from "./types";

export function assertReplayManifest(value: unknown): ReplayManifest {
  const manifest = value as Partial<ReplayManifest>;
  if (manifest?.schema !== "tycoonle-replay-v1" || !Array.isArray(manifest.events)) {
    throw new Error("Unsupported replay file.");
  }
  return manifest as ReplayManifest;
}

export function observationAt(manifest: ReplayManifest, cursor: number): Observation | null {
  if (!manifest.events.length) return null;
  if (cursor <= 0) return manifest.events[0].before;
  return manifest.events[Math.min(cursor, manifest.events.length) - 1]?.after ?? manifest.events[manifest.events.length - 1]?.after ?? null;
}

export function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function familyLabel(value: string): string {
  return value
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
