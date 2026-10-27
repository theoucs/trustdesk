/**
 * Compare les runs d'évaluation enregistrés dans runs/.
 *
 * Usage :
 *   npm run compare                 tableau de tous les runs
 *   npm run compare -- --matrix     matrice générateur × juge (derniers runs complets, même prompt)
 *   npm run compare -- --diff <runA> <runB>   questions dont le score a changé entre deux runs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RunConfig } from "../src/lib/data/runs";
import type { QuestionResult, Summary } from "../src/lib/eval/metrics";

type Run = { id: string; config: RunConfig; summary: Summary };

const RUNS = path.join(process.cwd(), "runs");
const runs: Run[] = existsSync(RUNS)
  ? readdirSync(RUNS)
      .filter((d) => existsSync(path.join(RUNS, d, "summary.json")))
      .sort()
      .map((id) => ({
        id,
        config: JSON.parse(readFileSync(path.join(RUNS, id, "config.json"), "utf8")),
        summary: JSON.parse(readFileSync(path.join(RUNS, id, "summary.json"), "utf8")),
      }))
  : [];

const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);
const args = process.argv.slice(2);

if (args[0] === "--diff") {
  const load = (id: string) =>
    new Map(
      readFileSync(path.join(RUNS, id, "results.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as QuestionResult)
        .map((r) => [r.id, r]),
    );
  const [a, b] = [load(args[1]), load(args[2])];
  for (const [id, ra] of a) {
    const rb = b.get(id);
    if (!rb || Math.abs(rb.score - ra.score) < 1) continue;
    const arrow = rb.score > ra.score ? "▲" : "▼";
    console.log(`${arrow} ${id} [${ra.category}] ${ra.score.toFixed(0)} → ${rb.score.toFixed(0)}  ${ra.question}`);
    console.log(`    A (${ra.answer.status}) ${ra.answer.answer.slice(0, 160)}`);
    console.log(`    B (${rb.answer.status}) ${rb.answer.answer.slice(0, 160)}`);
  }
} else if (args[0] === "--matrix") {
  const prompt = args[1] ?? "v1";
  const full = runs.filter((r) => r.config.answer.promptVersion === prompt && r.summary.n === Math.max(...runs.map((x) => x.summary.n)));
  const latest = (g: string, j: string) =>
    full.filter((r) => r.config.generator.provider === g && r.config.judge.provider === j).at(-1);
  const providers = ["mistral", "gemini"];
  console.log(`\nScore global /100 — prompt ${prompt} (lignes : générateur, colonnes : juge)\n`);
  console.log(`${"".padEnd(18)}${providers.map((p) => `juge ${p}`.padStart(16)).join("")}`);
  for (const g of providers) {
    const cells = providers.map((j) => latest(g, j)?.summary.globalScore.toFixed(1) ?? "—");
    console.log(`${`générateur ${g}`.padEnd(18)}${cells.map((c) => c.padStart(16)).join("")}`);
  }
  console.log(
    "\nLecture : un juge qui note mieux son propre modèle (diagonale) que l'autre juge ne le fait révèle un biais d'auto-préférence.",
  );
} else {
  console.log(
    `\n${"run".padEnd(58)} score  exact  fidél  halluc  faux-abst  cit.rappel  bloquées`,
  );
  for (const { id, summary: s } of runs) {
    console.log(
      `${id.padEnd(58)} ${s.globalScore.toFixed(1).padStart(5)}  ${s.judge.correctness.toFixed(2)}   ${s.judge.faithfulness.toFixed(2)}  ${pct(s.hallucinationRate)}     ${pct(s.falseAbstentionRate)}      ${pct(s.citationRecall)}       ${s.unsourcedBlocked}`,
    );
  }
}
