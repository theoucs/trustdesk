/**
 * Évaluation complète : pipeline de réponse sur tout le jeu de test, puis notation par le LLM juge.
 *
 * Usage :
 *   npm run eval -- --generator mistral --judge gemini
 *   npm run eval -- --generator gemini --judge mistral          (rôles inversés)
 *   npm run eval -- --generator mistral --judge gemini --prompt v2 --k 8 --mode hybrid --label "k8"
 *   options : --limit 5 (sous-ensemble pour tester), --only q36,q42
 *
 * Résultat dans runs/<id>/ : config.json, results.jsonl (détail par question), summary.json.
 */
import "./env";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadQuestions } from "../src/lib/eval/dataset";
import { JUDGE_PROMPT_VERSION, judgeAnswer, questionScore, WEIGHTS } from "../src/lib/eval/judge";
import { summarize, type QuestionResult } from "../src/lib/eval/metrics";
import { chatClient, embeddingClient, type Provider } from "../src/lib/llm";
import { withDiskCache, withEmbeddingDiskCache } from "../src/lib/llm/cache";
import { answerQuestion, DEFAULT_ANSWER_CONFIG, PROMPTS, type AnswerConfig } from "../src/lib/rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL, type RetrievalConfig, type RetrievalMode } from "../src/lib/rag/retrieve";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const generator = (flag("generator") ?? "mistral") as Provider;
const judgeProvider = (flag("judge") ?? (generator === "mistral" ? "gemini" : "mistral")) as Provider;
const retrieval: RetrievalConfig = {
  mode: (flag("mode") as RetrievalMode) ?? DEFAULT_RETRIEVAL.mode,
  embeddingProvider: (flag("embeddings") as Provider) ?? DEFAULT_RETRIEVAL.embeddingProvider,
};
const answerConfig: AnswerConfig = {
  topK: Number(flag("k") ?? DEFAULT_ANSWER_CONFIG.topK),
  temperature: Number(flag("temperature") ?? DEFAULT_ANSWER_CONFIG.temperature),
  promptVersion: (flag("prompt") ?? DEFAULT_ANSWER_CONFIG.promptVersion) as AnswerConfig["promptVersion"],
};
if (!(answerConfig.promptVersion in PROMPTS)) throw new Error(`Prompt inconnu : ${answerConfig.promptVersion}`);

let questions = loadQuestions();
if (flag("only")) questions = questions.filter((q) => flag("only")!.split(",").includes(q.id));
if (flag("limit")) questions = questions.slice(0, Number(flag("limit")));

const llm = withDiskCache(chatClient(generator));
const judge = withDiskCache(chatClient(judgeProvider));
const retriever = await createRetriever(retrieval, {
  embedder: withEmbeddingDiskCache(embeddingClient(retrieval.embeddingProvider)),
});

const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
const label = flag("label") ? `_${flag("label")!.replace(/\W+/g, "-")}` : "";
const runId = `${stamp}_${generator}-judged-by-${judgeProvider}_${answerConfig.promptVersion}${label}`;
const dir = path.join(process.cwd(), "runs", runId);

console.log(`Run ${runId} — ${questions.length} questions\n`);
const results: QuestionResult[] = [];
for (const [i, q] of questions.entries()) {
  const answer = await answerQuestion(q.question, { retriever, llm }, answerConfig);
  const verdict = await judgeAnswer(q, answer, judge);
  const score = questionScore(verdict);
  results.push({
    id: q.id,
    category: q.category,
    answerable: q.answerable,
    question: q.question,
    expected_answer: q.expected_answer,
    expected_sources: q.expected_sources,
    answer,
    judge: verdict,
    score,
  });
  const flagStr = q.answerable === "no" && !["not_found", "needs_review"].includes(answer.status) ? "  ← HALLUCINATION" : "";
  console.log(
    `${String(i + 1).padStart(2)}/${questions.length} ${q.id} ${q.category.padEnd(12)} ${answer.status.padEnd(12)} ` +
      `C${verdict.correctness} F${verdict.faithfulness} K${verdict.completeness} → ${score.toFixed(0).padStart(3)}${flagStr}`,
  );
}

const summary = summarize(results);
let commit = "";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
} catch {}

mkdirSync(dir, { recursive: true });
writeFileSync(
  path.join(dir, "config.json"),
  JSON.stringify(
    {
      runId,
      createdAt: new Date().toISOString(),
      commit,
      generator: { provider: generator, requested: llm.model, served: [...new Set(results.map((r) => r.answer.model))] },
      judge: {
        provider: judgeProvider,
        requested: judge.model,
        served: [...new Set(results.map((r) => r.judge.model))],
        promptVersion: JUDGE_PROMPT_VERSION,
        weights: WEIGHTS,
      },
      retrieval,
      answer: answerConfig,
      questions: questions.length,
    },
    null,
    2,
  ),
);
writeFileSync(path.join(dir, "results.jsonl"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
writeFileSync(path.join(dir, "summary.json"), JSON.stringify(summary, null, 2));

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;
console.log(`
Score global       ${summary.globalScore.toFixed(1)} / 100
Juge (moy. /5)     exactitude ${summary.judge.correctness.toFixed(2)} · fidélité ${summary.judge.faithfulness.toFixed(2)} · complétude ${summary.judge.completeness.toFixed(2)}
Hallucinations     ${pct(summary.hallucinationRate)} des questions sans réponse
Fausses abstentions ${pct(summary.falseAbstentionRate)} des questions avec réponse
Citations          rappel ${pct(summary.citationRecall)} · précision ${pct(summary.citationPrecision)}
Contradiction      ${summary.conflictDetected ? "détectée" : "non détectée"} · réponses bloquées (sans source) : ${summary.unsourcedBlocked}

→ runs/${runId}/`);
