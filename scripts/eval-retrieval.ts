/**
 * Évalue uniquement la RECHERCHE, sans aucun appel LLM (gratuit, instantané, déterministe).
 *
 * Pour chaque question qui a une réponse dans la doc :
 *  - hit@k    : au moins un extrait attendu est-il dans les k premiers ?
 *  - recall@k : quelle part des extraits attendus est dans les k premiers ? (compte pour les questions multi-docs)
 *  - MRR      : 1 / rang du premier extrait attendu (1 = trouvé en tête, 0.5 = en 2e…)
 *
 * Si la recherche rate l'extrait, le meilleur LLM du monde ne pourra pas répondre :
 * c'est la première chose à mesurer.
 *
 * Usage : npm run eval:retrieval -- [--mode bm25|embedding|hybrid] [--embeddings mistral|gemini] [--k 5] [--verbose]
 */
import "./env";
import { loadQuestions } from "../src/lib/eval/dataset";
import { embeddingClient, type Provider } from "../src/lib/llm";
import { withEmbeddingDiskCache } from "../src/lib/llm/cache";
import { createRetriever, type RetrievalMode } from "../src/lib/rag/retrieve";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const K = Number(flag("k") ?? 5);
const MODE = (flag("mode") ?? "hybrid") as RetrievalMode;
const EMBEDDINGS = (flag("embeddings") ?? "gemini") as Provider;
const VERBOSE = args.includes("--verbose");

async function main() {
  const retriever = await createRetriever(
    { mode: MODE, embeddingProvider: EMBEDDINGS },
    { embedder: withEmbeddingDiskCache(embeddingClient(EMBEDDINGS)) },
  );
  const questions = loadQuestions();

  type Row = { category: string; hit: number; recall: number; rr: number };
  const rows: Row[] = [];
  const misses: string[] = [];
  const topScores = { answerable: [] as number[], unanswerable: [] as number[] };

  for (const q of questions) {
    const results = await retriever.search(q.question, K);
    const ids = results.map((r) => r.chunk.id);
    const top = results[0]?.score ?? 0;

    if (q.expected_sources.length === 0) {
      topScores.unanswerable.push(top);
      continue;
    }
    topScores.answerable.push(top);

    const found = q.expected_sources.filter((s) => ids.includes(s));
    const firstRank = ids.findIndex((id) => q.expected_sources.includes(id));
    rows.push({
      category: q.category,
      hit: found.length > 0 ? 1 : 0,
      recall: found.length / q.expected_sources.length,
      rr: firstRank >= 0 ? 1 / (firstRank + 1) : 0,
    });
    if (found.length < q.expected_sources.length) {
      misses.push(
        `  ${q.id} [${q.category}] ${q.question}\n` +
          `     attendu : ${q.expected_sources.filter((s) => !ids.includes(s)).join(", ")}\n` +
          `     obtenu  : ${ids.slice(0, 3).join(", ") || "(rien)"}`,
      );
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(5);

  const label = MODE === "bm25" ? "bm25" : `${MODE} (embeddings ${EMBEDDINGS})`;
  console.log(`\nRecherche « ${label} », k=${K} — ${rows.length} questions avec sources attendues\n`);
  console.log("catégorie      n   hit@k  recall@k   MRR");
  const categories = [...new Set(rows.map((r) => r.category))];
  for (const c of [...categories, "TOTAL"]) {
    const rs = c === "TOTAL" ? rows : rows.filter((r) => r.category === c);
    console.log(
      `${c.padEnd(12)} ${String(rs.length).padStart(3)}   ${pct(avg(rs.map((r) => r.hit)))}    ${pct(avg(rs.map((r) => r.recall)))}   ${avg(rs.map((r) => r.rr)).toFixed(2)}`,
    );
  }

  // Le score du meilleur extrait permet-il de détecter les questions sans réponse ?
  // Si les deux distributions se chevauchent, un simple seuil ne suffira pas : il faudra le LLM.
  const stats = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return `min ${s[0].toFixed(2)} · médiane ${s[Math.floor(s.length / 2)].toFixed(2)} · max ${s[s.length - 1].toFixed(2)}`;
  };
  console.log(`\nScore du 1er extrait — questions avec réponse : ${stats(topScores.answerable)}`);
  console.log(`Score du 1er extrait — questions sans réponse : ${stats(topScores.unanswerable)}`);

  if (VERBOSE && misses.length) console.log(`\nExtraits attendus manqués :\n${misses.join("\n")}`);
}

await main();
