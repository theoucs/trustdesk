/**
 * Pose une question au pipeline complet depuis le terminal.
 * Usage : npm run ask -- "Do you support SCIM?" [--generator mistral|gemini]
 */
import "./env";
import { chatClient, embeddingClient, type Provider } from "../src/lib/llm";
import { withDiskCache, withEmbeddingDiskCache } from "../src/lib/llm/cache";
import { answerQuestion } from "../src/lib/rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL } from "../src/lib/rag/retrieve";

const args = process.argv.slice(2);
const g = args.indexOf("--generator");
const generator = (g >= 0 ? args[g + 1] : "mistral") as Provider;
const question = args.filter((_, i) => i !== g && i !== g + 1).join(" ");

const retriever = await createRetriever(DEFAULT_RETRIEVAL, {
  embedder: withEmbeddingDiskCache(embeddingClient(DEFAULT_RETRIEVAL.embeddingProvider)),
});
const a = await answerQuestion(question, { retriever, llm: withDiskCache(chatClient(generator)) });

console.log(`\n[${a.status.toUpperCase()}]${a.conflict ? " ⚠ sources contradictoires" : ""}  (${a.model}, ${a.latencyMs} ms${a.cached ? ", cache" : ""})\n`);
console.log(a.answer + "\n");
for (const c of a.citations) console.log(`  ↳ ${c.docTitle} › ${c.section}`);
if (a.status === "not_found") console.log(`  Consulté : ${a.consulted.slice(0, 3).map((c) => c.id).join(", ")}`);
for (const w of a.warnings) console.log(`  ! ${w}`);
