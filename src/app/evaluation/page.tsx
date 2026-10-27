import type { Metadata } from "next";
import Link from "next/link";
import { getRunResults, listRuns, type RunInfo } from "@/lib/data/runs";
import { judgeAgreement, loadLabels } from "@/lib/eval/calibration";
import { DEFAULT_ANSWER_CONFIG } from "@/lib/rag/answer";
import { DEFAULT_RETRIEVAL } from "@/lib/rag/retrieve";

export const metadata: Metadata = { title: "Quality" };

const PROVIDERS = ["mistral", "gemini"] as const;
const REFERENCE_GRADER = "gemini";
const EVALUATOR_NAMES: Record<string, string> = {
  "judge:gemini": "Gemini as grader",
  "judge:mistral": "Ministral 14B as grader",
  "rule:abstention": "Deterministic rule (abstention)",
};
const NAMES: Record<string, string> = { mistral: "Mistral", gemini: "Gemini" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

export default function EvaluationPage() {
  const runs = listRuns();
  const latestPrompt = DEFAULT_ANSWER_CONFIG.promptVersion;
  // Only runs on the full test set with the production retrieval settings are compared (k=8 experiments are listed
  // below but kept out of the matrix).
  const full = runs.filter(
    (r) =>
      r.summary.n === Math.max(...runs.map((x) => x.summary.n)) &&
      r.config.answer.topK === DEFAULT_ANSWER_CONFIG.topK &&
      r.config.retrieval.mode === DEFAULT_RETRIEVAL.mode,
  );
  const prompts = [...new Set(full.map((r) => r.config.answer.promptVersion))].sort();
  // Latest run first in `runs`, so find() returns the most recent run for a cell.
  const cell = (g: string, j: string, prompt: string = latestPrompt): RunInfo | undefined =>
    full.find(
      (r) =>
        r.config.generator.provider === g && r.config.judge.provider === j && r.config.answer.promptVersion === prompt,
    );
  const matrixPrompts = prompts.filter((p) => PROVIDERS.every((g) => PROVIDERS.every((j) => cell(g, j, p))));
  // Headline grader: Gemini. Calibrated against human labels (see "Grader calibration" below), it agrees with a person
  // far more often than Ministral 14B, and the v1 matrix showed no self-preference. When the reference grading is not
  // available yet for a model, its score is shown as pending rather than taken from another grader: scores from
  // different graders are not comparable. Deterministic metrics don't depend on the grader, so any run provides them.
  const calibration = judgeAgreement(
    runs.map((r) => ({ id: r.id, results: getRunResults(r.id) })),
    loadLabels(),
  );
  const headline = PROVIDERS.flatMap((g) => {
    const graded = cell(g, REFERENCE_GRADER);
    const run = graded ?? PROVIDERS.map((j) => cell(g, j)).find(Boolean);
    return run ? [{ generator: g, run, graded }] : [];
  });

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Answer quality</h1>
        <p className="mt-1 text-muted">
          Each change is tested on the same 50 questions, each with a reference answer. 12 of them are not answered by
          the documentation, and on one of them two documents contradict each other. A model grades every answer, and code
          counts invented answers and missing sources.
        </p>
      </div>

      {runs.length === 0 && <p className="text-muted">No evaluation run yet.</p>}

      {headline.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Current configuration · prompt {latestPrompt}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {headline.map(({ generator, run: r, graded }) => (
              <div key={generator} className="space-y-3 rounded-md border border-border bg-surface-muted p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {NAMES[generator]}{" "}
                    <span className="font-mono text-xs text-muted">{r.config.generator.served.join(", ")}</span>
                  </p>
                  <Link href={`/evaluation/${r.id}`} className="text-[13px] text-accent hover:underline">
                    Details →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric
                    label="Overall score"
                    value={graded ? graded.summary.globalScore.toFixed(1) : "Pending"}
                    hint={
                      graded
                        ? `out of 100, graded by ${NAMES[REFERENCE_GRADER]}`
                        : `not graded by ${NAMES[REFERENCE_GRADER]} yet`
                    }
                  />
                  <Metric
                    label="Invented answers"
                    value={pct(r.summary.hallucinationRate)}
                    hint="on the 12 undocumented questions"
                  />
                  <Metric
                    label="Missed answers"
                    value={pct(r.summary.falseAbstentionRate)}
                    hint="marked “not documented” by mistake"
                  />
                  <Metric
                    label="Expected sources cited"
                    value={pct(r.summary.citationRecall)}
                    hint={`${r.summary.unsourcedBlocked} blocked for lack of a source`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {calibration.labelled > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Grader calibration</h2>
          <p className="max-w-3xl text-[13px] text-muted">
            {calibration.labelled} answers were also graded by hand, mostly ones where the two graders disagreed. The
            question was simple: could this answer go to the customer as is? The scores above use the grader that agrees
            most with the person.
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-muted">
                <tr>
                  {["Evaluator", "Agrees with the person", "Too lenient", "Too strict", "Gradings compared"].map(
                    (h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calibration.rows.map((t) => {
                  const rate = t.agree / t.total;
                  return (
                    <tr key={t.evaluator}>
                      <td className="px-3 py-2">{EVALUATOR_NAMES[t.evaluator] ?? t.evaluator}</td>
                      <td
                        className={`px-3 py-2 font-semibold tabular-nums ${rate >= 0.85 ? "text-ok" : rate >= 0.6 ? "text-warn" : "text-bad"}`}
                      >
                        {pct(rate)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{t.lenient}</td>
                      <td className="px-3 py-2 tabular-nums">{t.harsh}</td>
                      <td className="px-3 py-2 tabular-nums text-muted">{t.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {prompts.length > 1 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Prompt versions</h2>
          <p className="max-w-3xl text-[13px] text-muted">
            Each version fixes errors found in the weakest answers of the previous one. v2 is in use because it is the
            only one where neither model invented an answer. v3 scores higher but invents one again.
          </p>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-muted">
                <tr>
                  <th rowSpan={2} className="px-3 py-2 align-bottom font-medium">
                    Prompt
                  </th>
                  {PROVIDERS.map((g) => (
                    <th key={g} colSpan={3} className="px-3 pt-2 font-medium text-text">
                      {NAMES[g]}{" "}
                      <span className="font-normal text-muted">
                        (graded by {NAMES[g === "mistral" ? "gemini" : "mistral"]})
                      </span>
                    </th>
                  ))}
                </tr>
                <tr>
                  {PROVIDERS.flatMap((g) =>
                    ["Score", "Invented", "Missed"].map((h) => (
                      <th key={g + h} className="px-3 pb-2 font-normal">
                        {h}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prompts.map((p) => (
                  <tr key={p} className={p === latestPrompt ? "bg-accent-soft/50" : ""}>
                    <td className="px-3 py-2 font-mono text-xs">
                      {p}
                      {p === latestPrompt && <span className="ml-2 font-sans text-accent">in use</span>}
                    </td>
                    {PROVIDERS.map((g) => {
                      const r = cell(g, g === "mistral" ? "gemini" : "mistral", p);
                      return r ? (
                        [
                          <td key="s" className="px-3 py-2 font-semibold tabular-nums">
                            {r.summary.globalScore.toFixed(1)}
                          </td>,
                          <td
                            key="h"
                            className={`px-3 py-2 tabular-nums ${r.summary.hallucinationRate > 0 ? "text-bad" : "text-ok"}`}
                          >
                            {pct(r.summary.hallucinationRate)}
                          </td>,
                          <td key="m" className="px-3 py-2 tabular-nums">
                            {pct(r.summary.falseAbstentionRate)}
                          </td>,
                        ]
                      ) : (
                        <td key={g} colSpan={3} className="px-3 py-2 text-muted">
                          Not run
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {matrixPrompts.map((prompt) => (
        <section key={prompt} className="space-y-3">
          <h2 className="font-semibold">Model × grader matrix · prompt {prompt}</h2>
          <p className="max-w-3xl text-[13px] text-muted">
            Both answer sets are graded by both models. Only compare scores in the same column, since graders are not
            equally strict. Neither grader favoured its own model.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-[420px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="px-3 py-2" />
                  {PROVIDERS.map((j) => (
                    <th key={j} className="px-3 py-2 text-left font-medium text-muted">
                      Graded by {NAMES[j]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROVIDERS.map((g) => (
                  <tr key={g}>
                    <th className="px-3 py-2 text-left font-medium text-muted">Drafted by {NAMES[g]}</th>
                    {PROVIDERS.map((j) => {
                      const r = cell(g, j, prompt);
                      return (
                        <td
                          key={j}
                          className={`border border-border px-3 py-2 ${g === j ? "bg-surface-muted" : "bg-surface"}`}
                        >
                          {r ? (
                            <Link
                              href={`/evaluation/${r.id}`}
                              className="font-semibold tabular-nums text-accent hover:underline"
                            >
                              {r.summary.globalScore.toFixed(1)}
                            </Link>
                          ) : (
                            <span className="text-muted">Not run</span>
                          )}
                          {g === j && <span className="ml-2 text-xs text-muted">self-graded</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {runs.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">All runs</h2>
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-border bg-surface-muted text-muted">
                <tr>
                  {[
                    "Run",
                    "Drafted by",
                    "Graded by",
                    "Prompt",
                    "Retrieval",
                    "Score",
                    "Invented",
                    "Missed",
                    "Sources",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-muted">
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/evaluation/${r.id}`} className="text-accent hover:underline">
                        {r.config.createdAt.slice(0, 16).replace("T", " ")}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{NAMES[r.config.generator.provider]}</td>
                    <td className="px-3 py-2">{NAMES[r.config.judge.provider]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.config.answer.promptVersion}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                      {r.config.retrieval.mode} · k={r.config.answer.topK}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{r.summary.globalScore.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(r.summary.hallucinationRate)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(r.summary.falseAbstentionRate)}</td>
                    <td className="px-3 py-2 tabular-nums">{pct(r.summary.citationRecall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
