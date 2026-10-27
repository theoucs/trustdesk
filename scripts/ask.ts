/**
 * Pose une question au pipeline complet depuis le terminal.
 * Usage : npm run ask -- "Do you support SCIM?" [--generator mistral|gemini] [--prompt v1|v2|v3]
 */
import "./env";
import { chatClient, embeddingClient, type Provider } from "../src/lib/llm";
import { withDiskCache, withEmbeddingDiskCache } from "../src/lib/llm/cache";
import { answerQuestion, DEFAULT_ANSWER_CONFIG, type AnswerConfig } from "../src/lib/rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL } from "../src/lib/rag/retrieve";

const args = process.argv.slice(2);
const g = args.indexOf("--generator");
const p = args.indexOf("--prompt");
const generator = (g >= 0 ? args[g + 1] : "mistral") as Provider;
const promptVersion = (p >= 0 ? args[p + 1] : DEFAULT_ANSWER_CONFIG.promptVersion) as AnswerConfig["promptVersion"];
const flagIdx = [g, g + 1, p, p + 1].filter((i) => i >= 0);
const question = args.filter((_, i) => !flagIdx.includes(i)).join(" ");

const retriever = await createRetriever(DEFAULT_RETRIEVAL, {
  embedder: withEmbeddingDiskCache(embeddingClient(DEFAULT_RETRIEVAL.embeddingProvider)),
});
const a = await answerQuestion(
  question,
  { retriever, llm: withDiskCache(chatClient(generator)) },
  { ...DEFAULT_ANSWER_CONFIG, promptVersion },
);

console.log(`\n[${a.status.toUpperCase()}]${a.conflict ? " ⚠ sources contradictoires" : ""}  (${a.model}, ${a.latencyMs} ms${a.cached ? ", cache" : ""})\n`);
console.log(a.answer + "\n");
for (const c of a.citations) console.log(`  ↳ ${c.docTitle} › ${c.section}`);
if (a.status === "not_found") console.log(`  Consulté : ${a.consulted.slice(0, 3).map((c) => c.id).join(", ")}`);
for (const w of a.warnings) console.log(`  ! ${w}`);
