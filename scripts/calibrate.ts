/**
 * Calibration du juge : un humain note un échantillon de réponses, puis on mesure l'accord de chaque juge avec lui.
 *
 * Question posée à l'humain, volontairement binaire et métier : « Cette réponse peut-elle partir au client telle quelle ? »
 * Côté juge, « oui » = exactitude ≥ 4 ET fidélité ≥ 4.
 *
 * Les notes humaines sont enregistrées dans eval/human-labels.jsonl, indexées par (question, texte de la réponse) :
 * elles restent valables pour tous les runs qui produisent exactement la même réponse.
 *
 * Usage : npm run calibrate -- [--n 15]          (notation interactive, puis rapport)
 *         npm run calibrate -- --report           (rapport seul)
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import type { QuestionResult } from "../src/lib/eval/metrics";

const RUNS = path.join(process.cwd(), "runs");
const LABELS = path.join(process.cwd(), "eval", "human-labels.jsonl");
const args = process.argv.slice(2);
const N = Number(args[args.indexOf("--n") + 1]) || 15;

type Label = { key: string; id: string; acceptable: boolean };
const keyOf = (r: QuestionResult) =>
  createHash("sha256").update(`${r.id}\n${r.answer.status}\n${r.answer.answer}`).digest("hex").slice(0, 16);

const labels = new Map<string, Label>(
  existsSync(LABELS)
    ? readFileSync(LABELS, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Label)
        .map((l) => [l.key, l])
    : [],
);

const runs = readdirSync(RUNS)
  .filter((d) => existsSync(path.join(RUNS, d, "results.jsonl")))
  .map((id) => ({
    id,
    results: readFileSync(path.join(RUNS, id, "results.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as QuestionResult),
  }));

// Toutes les réponses distinctes rencontrées dans les runs (une réponse notée par deux juges n'apparaît qu'une fois).
const distinct = new Map<string, QuestionResult>();
for (const run of runs) for (const r of run.results) distinct.set(keyOf(r), r);

if (!args.includes("--report")) {
  // Échantillon : en priorité les réponses où les deux juges ne sont pas d'accord, puis des réponses au hasard.
  const verdicts = new Map<string, boolean[]>();
  for (const run of runs)
    for (const r of run.results) {
      const k = keyOf(r);
      verdicts.set(k, [...(verdicts.get(k) ?? []), r.judge.correctness >= 4 && r.judge.faithfulness >= 4]);
    }
  const todo = [...distinct.entries()].filter(([k]) => !labels.has(k));
  const disputed = todo.filter(([k]) => new Set(verdicts.get(k)).size > 1);
  const rest = todo.filter(([k]) => new Set(verdicts.get(k)).size <= 1).sort(() => Math.random() - 0.5);
  const sample = [...disputed, ...rest].slice(0, N);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n${sample.length} réponses à noter (${disputed.length} où les juges ne sont pas d'accord).`);
  console.log("Pour chacune : peut-elle partir au client telle quelle ?  o = oui · n = non · s = passer · q = quitter\n");
  for (const [i, [key, r]] of sample.entries()) {
    console.log("─".repeat(80));
    console.log(`[${i + 1}/${sample.length}] ${r.id} · ${r.question}`);
    console.log(`\n  Réponse de référence : ${r.expected_answer}`);
    console.log(`\n  Réponse produite [${r.answer.status}${r.answer.conflict ? ", conflit signalé" : ""}] :\n  ${r.answer.answer}`);
    for (const c of r.answer.citations) console.log(`    ↳ ${c.docTitle} › ${c.section}`);
    const a = (await rl.question("\n  Envoyable telle quelle ? (o/n/s/q) ")).trim().toLowerCase();
    if (a === "q") break;
    if (a !== "o" && a !== "n") continue;
    const label: Label = { key, id: r.id, acceptable: a === "o" };
    labels.set(key, label);
    appendFileSync(LABELS, JSON.stringify(label) + "\n");
  }
  rl.close();
}

// Rapport : accord de chaque juge (et de la métrique déterministe) avec l'humain.
console.log(`\n${labels.size} réponses notées par un humain.\n`);
type Tally = { agree: number; total: number; lenient: number; harsh: number };
const tally = new Map<string, Tally>();
const add = (name: string, judgeOk: boolean, humanOk: boolean) => {
  const t = tally.get(name) ?? { agree: 0, total: 0, lenient: 0, harsh: 0 };
  t.total++;
  if (judgeOk === humanOk) t.agree++;
  else if (judgeOk) t.lenient++;
  else t.harsh++;
  tally.set(name, t);
};
for (const run of runs) {
  const judge = run.id.match(/judged-by-(\w+)/)?.[1] ?? "?";
  for (const r of run.results) {
    const h = labels.get(keyOf(r));
    if (h) add(`juge ${judge}`, r.judge.correctness >= 4 && r.judge.faithfulness >= 4, h.acceptable);
  }
}
for (const [key, r] of distinct) {
  const h = labels.get(key);
  if (!h) continue;
  // Règle déterministe : une réponse est rejetée si elle répond à une question non documentée, ou s'abstient à tort.
  const abstained = r.answer.status === "not_found" || r.answer.status === "needs_review";
  add("règle déterministe (abstention)", r.answerable === "no" ? abstained : !abstained, h.acceptable);
}
console.log("évaluateur                          accord   trop indulgent   trop sévère   (n)");
for (const [name, t] of tally) {
  console.log(
    `${name.padEnd(34)} ${`${Math.round((100 * t.agree) / t.total)}%`.padStart(6)}   ${String(t.lenient).padStart(14)}   ${String(t.harsh).padStart(11)}   (${t.total})`,
  );
}
