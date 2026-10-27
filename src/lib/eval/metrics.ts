import type { Answer } from "../rag/answer";
import type { TestQuestion } from "./dataset";
import { questionScore, type JudgeResult } from "./judge";

export type QuestionResult = {
  id: string;
  category: string;
  answerable: TestQuestion["answerable"];
  question: string;
  expected_answer: string;
  expected_sources: string[];
  answer: Answer;
  judge: JudgeResult;
  score: number;
};

export type Summary = {
  n: number;
  /** Score global /100 : moyenne des scores par question (notes du juge pondérées). */
  globalScore: number;
  judge: { correctness: number; faithfulness: number; completeness: number };
  /**
   * Métriques déterministes (sans LLM) — les « garde-fous » :
   * - hallucinationRate : part des questions SANS réponse dans la doc où l'outil a quand même répondu. Le pire défaut.
   * - abstentionRecall : part des questions sans réponse correctement refusées (= 1 − hallucinationRate).
   * - falseAbstentionRate : part des questions AVEC réponse où l'outil a dit « pas dans la doc ». Défaut inverse.
   * - citationRecall : part des extraits attendus effectivement cités.
   * - citationPrecision : part des citations qui font partie des extraits attendus (borne basse :
   *   un autre extrait peut aussi être pertinent).
   * - unsourcedBlocked : réponses bloquées par la validation (affirmation sans source valide).
   */
  hallucinationRate: number;
  abstentionRecall: number;
  falseAbstentionRate: number;
  citationRecall: number;
  citationPrecision: number;
  conflictDetected: number;
  unsourcedBlocked: number;
  byCategory: Record<string, { n: number; score: number }>;
  tokens: { generatorIn: number; generatorOut: number; judgeIn: number; judgeOut: number };
  avgLatencyMs: number;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const abstained = (a: Answer) => a.status === "not_found" || a.status === "needs_review";

export function summarize(results: QuestionResult[]): Summary {
  const unanswerable = results.filter((r) => r.answerable === "no");
  const answerable = results.filter((r) => r.answerable !== "no");
  const withSources = answerable.filter((r) => r.expected_sources.length);
  const conflicts = results.filter((r) => r.category === "conflict");

  const byCategory: Summary["byCategory"] = {};
  for (const c of [...new Set(results.map((r) => r.category))]) {
    const rs = results.filter((r) => r.category === c);
    byCategory[c] = { n: rs.length, score: avg(rs.map((r) => r.score)) };
  }

  const cited = (r: QuestionResult) => r.answer.citations.map((c) => c.id);
  return {
    n: results.length,
    globalScore: avg(results.map((r) => r.score)),
    judge: {
      correctness: avg(results.map((r) => r.judge.correctness)),
      faithfulness: avg(results.map((r) => r.judge.faithfulness)),
      completeness: avg(results.map((r) => r.judge.completeness)),
    },
    hallucinationRate: avg(unanswerable.map((r) => (abstained(r.answer) ? 0 : 1))),
    abstentionRecall: avg(unanswerable.map((r) => (abstained(r.answer) ? 1 : 0))),
    falseAbstentionRate: avg(answerable.map((r) => (abstained(r.answer) ? 1 : 0))),
    citationRecall: avg(
      withSources.map((r) => r.expected_sources.filter((s) => cited(r).includes(s)).length / r.expected_sources.length),
    ),
    citationPrecision: avg(
      withSources
        .filter((r) => cited(r).length)
        .map((r) => cited(r).filter((id) => r.expected_sources.includes(id)).length / cited(r).length),
    ),
    conflictDetected: avg(conflicts.map((r) => (r.answer.conflict ? 1 : 0))),
    unsourcedBlocked: results.filter((r) => r.answer.status === "needs_review").length,
    byCategory,
    tokens: {
      generatorIn: results.reduce((s, r) => s + r.answer.usage.inputTokens, 0),
      generatorOut: results.reduce((s, r) => s + r.answer.usage.outputTokens, 0),
      judgeIn: results.reduce((s, r) => s + r.judge.usage.inputTokens, 0),
      judgeOut: results.reduce((s, r) => s + r.judge.usage.outputTokens, 0),
    },
    avgLatencyMs: avg(results.map((r) => r.answer.latencyMs)),
  };
}

export { questionScore };
