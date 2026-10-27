import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { QuestionResult } from "./metrics";

/**
 * Calibration du juge : un humain répond « cette réponse peut-elle partir au client telle quelle ? » (oui/non)
 * sur un échantillon, et on mesure l'accord de chaque évaluateur automatique avec lui.
 * Côté juge, « oui » = exactitude ≥ 4 ET fidélité ≥ 4.
 */
export const LABELS_FILE = path.join(process.cwd(), "eval", "human-labels.jsonl");

export type HumanLabel = { key: string; id: string; acceptable: boolean };

/** Une note humaine vaut pour un texte de réponse précis : elle reste valable dans tous les runs qui le reproduisent. */
export const answerKey = (r: QuestionResult) =>
  createHash("sha256").update(`${r.id}\n${r.answer.status}\n${r.answer.answer}`).digest("hex").slice(0, 16);

export function loadLabels(file = LABELS_FILE): Map<string, HumanLabel> {
  if (!existsSync(file)) return new Map();
  return new Map(
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as HumanLabel)
      .map((l) => [l.key, l]),
  );
}

export type Agreement = { evaluator: string; agree: number; total: number; lenient: number; harsh: number };

export function judgeAgreement(
  runs: { id: string; results: QuestionResult[] }[],
  labels: Map<string, HumanLabel>,
): { labelled: number; rows: Agreement[] } {
  const tally = new Map<string, Agreement>();
  const add = (evaluator: string, autoOk: boolean, humanOk: boolean) => {
    const t = tally.get(evaluator) ?? { evaluator, agree: 0, total: 0, lenient: 0, harsh: 0 };
    t.total++;
    if (autoOk === humanOk) t.agree++;
    else if (autoOk) t.lenient++;
    else t.harsh++;
    tally.set(evaluator, t);
  };

  // One verdict per (answer, grader): the same answer can appear in several runs. The most recent grading wins,
  // so percentages are over distinct answers, as the page says.
  const distinct = new Map<string, QuestionResult>();
  const verdicts = new Map<string, { judge: string; ok: boolean; human: boolean }>();
  for (const run of [...runs].sort((a, b) => a.id.localeCompare(b.id))) {
    const judge = run.id.match(/judged-by-([a-z]+)/)?.[1] ?? "?";
    for (const r of run.results) {
      const key = answerKey(r);
      distinct.set(key, r);
      const h = labels.get(key);
      if (h) {
        verdicts.set(`${key}:${judge}`, {
          judge,
          ok: r.judge.correctness >= 4 && r.judge.faithfulness >= 4,
          human: h.acceptable,
        });
      }
    }
  }
  for (const v of verdicts.values()) add(`judge:${v.judge}`, v.ok, v.human);
  for (const [key, r] of distinct) {
    const h = labels.get(key);
    if (!h) continue;
    // Règle déterministe : rejeter une réponse à une question non documentée, ou une abstention à tort.
    const abstained = r.answer.status === "not_found" || r.answer.status === "needs_review";
    add("rule:abstention", r.answerable === "no" ? abstained : !abstained, h.acceptable);
  }
  const labelled = [...distinct.keys()].filter((k) => labels.has(k)).length;
  return { labelled, rows: [...tally.values()] };
}
