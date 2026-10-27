import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/status-badge";
import { chunkLabel } from "@/lib/anchors";
import { getRunResults, listRuns } from "@/lib/data/runs";

export function generateStaticParams() {
  return listRuns().map((r) => ({ run: r.id }));
}

export const metadata: Metadata = { title: "Evaluation run" };

const NAMES: Record<string, string> = { mistral: "Mistral", gemini: "Gemini" };
const EXPECTED: Record<string, string> = { yes: "Documented", partial: "Partly documented", no: "Not documented" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

function scoreColor(score: number) {
  if (score >= 85) return "text-ok";
  if (score >= 50) return "text-warn";
  return "text-bad";
}

export default function RunPage({ params }: PageProps<"/evaluation/[run]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading run…</p>}>
      <RunContent params={params} />
    </Suspense>
  );
}

async function RunContent({ params }: { params: PageProps<"/evaluation/[run]">["params"] }) {
  const { run: id } = await params;
  const run = listRuns().find((r) => r.id === id);
  if (!run) notFound();
  const results = getRunResults(id);
  const { config: c, summary: s } = run;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/evaluation" className="text-[13px] text-muted hover:text-text">
          ← Answer quality
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Drafted by {NAMES[c.generator.provider]}, graded by {NAMES[c.judge.provider]}
        </h1>
        <p className="mt-1 text-xs text-muted">
          <span className="font-mono">{c.generator.served.join(", ")}</span> →{" "}
          <span className="font-mono">{c.judge.served.join(", ")}</span> · prompt {c.answer.promptVersion} · retrieval{" "}
          {c.retrieval.mode} ({c.retrieval.embeddingProvider} embeddings), top {c.answer.topK} · temperature{" "}
          {c.answer.temperature} · {c.createdAt.slice(0, 16).replace("T", " ")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {[
          ["Overall score", s.globalScore.toFixed(1)],
          ["Correctness", `${s.judge.correctness.toFixed(2)} / 5`],
          ["Faithfulness", `${s.judge.faithfulness.toFixed(2)} / 5`],
          ["Invented answers", pct(s.hallucinationRate)],
          ["Missed answers", pct(s.falseAbstentionRate)],
          ["Expected sources cited", pct(s.citationRecall)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface px-3 py-2.5">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border bg-surface-muted text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Category</th>
              {Object.keys(s.byCategory).map((cat) => (
                <th key={cat} className="px-3 py-2 font-medium">
                  {cat.replace("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2 text-muted">Score</td>
              {Object.entries(s.byCategory).map(([cat, v]) => (
                <td key={cat} className={`px-3 py-2 font-semibold tabular-nums ${scoreColor(v.score)}`}>
                  {v.score.toFixed(0)}
                  <span className="ml-1 text-xs font-normal text-muted">n={v.n}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ol className="divide-y divide-border rounded-md border border-border bg-surface">
        {results.map((r) => (
          <li key={r.id}>
            <details className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 hover:bg-surface-muted">
                <span className={`font-mono text-sm font-semibold tabular-nums ${scoreColor(r.score)}`}>
                  {r.score.toFixed(0)}
                </span>
                <span>
                  <span className="font-medium">{r.question}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-mono">{r.id}</span>·<span>{r.category.replace("_", " ")}</span>·
                    <span>expected: {EXPECTED[r.answerable]}</span>
                  </span>
                </span>
                <StatusBadge status={r.answer.status} conflict={r.answer.conflict} />
              </summary>
              <div className="grid gap-4 border-t border-border bg-surface-muted px-4 py-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Drafted answer</p>
                  <p className="whitespace-pre-line">{r.answer.answer || "—"}</p>
                  {r.answer.citations.length > 0 && (
                    <ul className="text-xs text-muted">
                      {r.answer.citations.map((ci) => (
                        <li key={ci.id}>
                          ↳ {ci.docTitle} › {ci.section}
                          {!r.expected_sources.includes(ci.id) && r.expected_sources.length > 0 && " (not in expected sources)"}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.answer.warnings.length > 0 && <p className="text-xs text-bad">{r.answer.warnings.join(" · ")}</p>}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Reference answer</p>
                  <p>{r.expected_answer}</p>
                  {r.expected_sources.length > 0 && (
                    <p className="text-xs text-muted">Expected: {r.expected_sources.map(chunkLabel).join(" · ")}</p>
                  )}
                  <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Grader · correctness {r.judge.correctness} · faithfulness {r.judge.faithfulness} · completeness{" "}
                    {r.judge.completeness}
                  </p>
                  <p className="text-muted">{r.judge.reasoning}</p>
                </div>
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  );
}
