import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

export function writeJson(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path, value) {
  const resolved = resolve(path);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, value);
}

export function ensureDir(path) {
  mkdirSync(resolve(path), { recursive: true });
}

export function pathExists(path) {
  return existsSync(resolve(path));
}
