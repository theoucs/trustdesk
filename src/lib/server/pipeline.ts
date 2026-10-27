import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { chatClient, embeddingClient, type Provider } from "../llm";
import { setRetryPolicy } from "../llm/http";
import { answerQuestion, DEFAULT_ANSWER_CONFIG, type Answer } from "../rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL, type Retriever } from "../rag/retrieve";

// A visitor must never wait on a provider: one short retry, and anything asking for a longer wait (a daily quota
// reset can be 17 hours away) goes straight to the fallbacks below.
setRetryPolicy({ maxRetries: 1, maxWaitMs: 4000 });

export type Draft = Answer & {
  /** live: the requested model answered. fallback-model: the other model did. saved: precomputed answer. */
  source: "live" | "fallback-model" | "saved";
  notice?: string;
};

const NAMES: Record<Provider, string> = { mistral: "Mistral", gemini: "Gemini" };

/** Built once per server instance: chunks and vectors stay in memory. */
let semantic: Promise<Retriever> | undefined;
let keyword: Promise<Retriever> | undefined;

/**
 * Semantic search needs one Gemini embedding call per question. If that call fails (quota, outage), fall back to
 * keyword search (BM25), which needs no API: slightly worse on rephrased questions, but the demo keeps working.
 */
function retrieverFor(onDegraded: () => void): Retriever {
  semantic ??= createRetriever(DEFAULT_RETRIEVAL, { embedder: embeddingClient(DEFAULT_RETRIEVAL.embeddingProvider) });
  keyword ??= createRetriever({ ...DEFAULT_RETRIEVAL, mode: "bm25" });
  return {
    async search(query, k) {
      try {
        return await (await semantic!).search(query, k);
      } catch (err) {
        console.warn("[retrieval] semantic search unavailable, using keyword search:", String(err).slice(0, 200));
        onDegraded();
        return (await keyword!).search(query, k);
      }
    },
  };
}

type SavedAnswers = { builtAt: string; answers: Record<string, Answer> };
let saved: SavedAnswers | null | undefined;
const normalize = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** Answers precomputed for the sample questionnaires (scripts/save-sample-answers.ts), used when no model responds. */
function savedAnswer(question: string): { answer: Answer; builtAt: string } | undefined {
  if (saved === undefined) {
    const file = path.join(process.cwd(), "data", "saved-answers.json");
    saved = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SavedAnswers) : null;
  }
  const answer = saved?.answers[normalize(question)];
  return answer && saved ? { answer, builtAt: saved.builtAt } : undefined;
}

export async function draftAnswer(question: string, generator: Provider): Promise<Draft> {
  let degraded = false;
  const retriever = retrieverFor(() => (degraded = true));
  const keywordNote = () => (degraded ? " Keyword search was used because semantic search is unavailable." : "");

  const order: Provider[] = generator === "mistral" ? ["mistral", "gemini"] : ["gemini", "mistral"];
  for (const [i, provider] of order.entries()) {
    try {
      const answer = await answerQuestion(question, { retriever, llm: chatClient(provider) }, DEFAULT_ANSWER_CONFIG);
      const fallback = i > 0;
      const notice =
        (fallback ? `Drafted by ${NAMES[provider]}: ${NAMES[generator]} is not available right now.` : "") +
        keywordNote();
      return { ...answer, source: fallback ? "fallback-model" : "live", notice: notice.trim() || undefined };
    } catch (err) {
      console.warn(`[answer] ${provider} unavailable:`, String(err).slice(0, 200));
    }
  }

  const s = savedAnswer(question);
  if (s) {
    return {
      ...s.answer,
      source: "saved",
      notice: `The models are not available right now (free tier limits). This is the answer saved on ${s.builtAt.slice(0, 10)}.`,
    };
  }
  throw new Error("No model available");
}
