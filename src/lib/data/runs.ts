import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { QuestionResult, Summary } from "../eval/metrics";

const RUNS_DIR = path.join(process.cwd(), "runs");

export type RunConfig = {
  runId: string;
  createdAt: string;
  generator: { provider: string; requested: string; served: string[] };
  judge: { provider: string; requested: string; served: string[]; promptVersion: string };
  retrieval: { mode: string; embeddingProvider: string };
  answer: { topK: number; temperature: number; promptVersion: string };
  questions: number;
};

export type RunInfo = { id: string; config: RunConfig; summary: Summary };

export function listRuns(): RunInfo[] {
  if (!existsSync(RUNS_DIR)) return [];
  return readdirSync(RUNS_DIR)
    .filter((d) => existsSync(path.join(RUNS_DIR, d, "summary.json")))
    .sort()
    .reverse()
    .map((id) => ({
      id,
      config: JSON.parse(readFileSync(path.join(RUNS_DIR, id, "config.json"), "utf8")),
      summary: JSON.parse(readFileSync(path.join(RUNS_DIR, id, "summary.json"), "utf8")),
    }));
}

export function getRunResults(id: string): QuestionResult[] {
  return readFileSync(path.join(RUNS_DIR, id, "results.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as QuestionResult);
}
