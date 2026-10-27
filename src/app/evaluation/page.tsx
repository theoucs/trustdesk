import type { Metadata } from "next";
import Link from "next/link";
import { listRuns, type RunInfo } from "@/lib/data/runs";

export const metadata: Metadata = { title: "Quality" };

const PROVIDERS = ["mistral", "gemini"] as const;
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
  const prompts = [...new Set(runs.map((r) => r.config.answer.promptVersion))].sort().reverse();
  const latestPrompt = prompts[0];
  const full = runs.filter((r) => r.summary.n === Math.max(...runs.map((x) => x.summary.n)));
  const cell = (g: string, j: string, prompt = latestPrompt): RunInfo | undefined =>
    full.find((r) => r.config.generator.provider === g && r.config.judge.provider === j && r.config.answer.promptVersion === prompt);
  // "Headline" run: each model judged by the other one, to avoid self-preference.
  const cross = PROVIDERS.map((g) => cell(g, g === "mistral" ? "gemini" : "mistral")).filter(Boolean) as RunInfo[];

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Answer quality</h1>
        <p className="mt-1 text-muted">
          Every configuration is tested against a fixed set of 50 questionnaire questions with expert reference answers —
          including questions the documentation does not answer, misleading near-matches and one contradiction between
          two documents. A second model grades each answer for correctness, faithfulness to sources and completeness.
        </p>
      </div>

      {runs.length === 0 && <p className="text-muted">No evaluation run yet.</p>}

      {cross.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Current configuration · prompt {latestPrompt}</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {cross.map((r) => (
              <div key={r.id} className="space-y-3 rounded-md border border-border bg-surface-muted p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {NAMES[r.config.generator.provider]}{" "}
                    <span className="font-mono text-xs text-muted">{r.config.generator.served.join(", ")}</span>
                  </p>
                  <Link href={`/evaluation/${r.id}`} className="text-[13px] text-accent hover:underline">
                    Details →
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Overall score" value={`${r.summary.globalScore.toFixed(1)}`} hint={`/100 · graded by ${NAMES[r.config.judge.provider]}`} />
                  <Metric label="Invented answers" value={pct(r.summary.hallucinationRate)} hint="on questions the docs don't answer" />
                  <Metric label="Missed answers" value={pct(r.summary.falseAbstentionRate)} hint="said “not documented” wrongly" />
                  <Metric label="Expected sources cited" value={pct(r.summary.citationRecall)} hint={`${r.summary.unsourcedBlocked} unsourced answer(s) blocked`} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {prompts.map((prompt) => (
        <section key={prompt} className="space-y-3">
          <h2 className="font-semibold">Model × grader matrix · prompt {prompt}</h2>
          <p className="max-w-3xl text-[13px] text-muted">
            Each model drafts all answers once; each answer set is then graded by both models. If a grader scores its
            own model higher than the other grader does, that gap is self-preference bias — which is why the headline
            numbers above use cross-grading.
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
                        <td key={j} className={`border border-border px-3 py-2 ${g === j ? "bg-surface-muted" : "bg-surface"}`}>
                          {r ? (
                            <Link href={`/evaluation/${r.id}`} className="font-semibold tabular-nums text-accent hover:underline">
                              {r.summary.globalScore.toFixed(1)}
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
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
                  {["Run", "Drafted by", "Graded by", "Prompt", "Retrieval", "Score", "Invented", "Missed", "Sources"].map((h) => (
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
