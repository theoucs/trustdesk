/**
 * Pré-calcule les réponses aux questions d'exemple (data/saved-answers.json). Si aucun modèle ne répond en production
 * (quota gratuit épuisé, panne), l'app affiche ces réponses avec un message clair, au lieu d'une erreur.
 * À relancer après un changement de prompt ou de documentation.
 *
 * Usage : npm run save-samples
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { chatClient, embeddingClient } from "../src/lib/llm";
import { withDiskCache, withEmbeddingDiskCache } from "../src/lib/llm/cache";
import { answerQuestion, DEFAULT_ANSWER_CONFIG, type Answer } from "../src/lib/rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL } from "../src/lib/rag/retrieve";
import { SAMPLE_QUESTIONS, SAMPLE_SPREADSHEET } from "../src/lib/samples";

const questions = [...new Set([...SAMPLE_QUESTIONS, ...SAMPLE_SPREADSHEET.map(([, q]) => q)])];
const retriever = await createRetriever(DEFAULT_RETRIEVAL, {
  embedder: withEmbeddingDiskCache(embeddingClient(DEFAULT_RETRIEVAL.embeddingProvider)),
});
const llm = withDiskCache(chatClient("mistral"));

const answers: Record<string, Answer> = {};
for (const q of questions) {
  const a = await answerQuestion(q, { retriever, llm }, DEFAULT_ANSWER_CONFIG);
  answers[q.toLowerCase().replace(/\s+/g, " ").trim()] = { ...a, cached: false };
  console.log(`${a.status.padEnd(12)} ${q}`);
}
mkdirSync("data", { recursive: true });
writeFileSync(
  "data/saved-answers.json",
  JSON.stringify({ builtAt: new Date().toISOString(), prompt: DEFAULT_ANSWER_CONFIG.promptVersion, answers }, null, 1),
);
console.log(`\n${questions.length} réponses → data/saved-answers.json`);
