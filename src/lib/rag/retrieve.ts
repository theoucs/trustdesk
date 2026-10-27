import { embeddingClient } from "../llm";
import type { EmbeddingClient, Provider } from "../llm/types";
import { BM25 } from "./bm25";
import { loadChunks } from "./knowledge";
import type { Chunk, ScoredChunk } from "./types";
import { dot, loadEmbeddingIndex, normalize } from "./vectors";

export type RetrievalMode = "bm25" | "embedding" | "hybrid";

export type RetrievalConfig = {
  mode: RetrievalMode;
  /** Modèle d'embeddings utilisé, indépendant du modèle qui rédige la réponse. */
  embeddingProvider: Provider;
};

/**
 * Choix mesuré (npm run eval:retrieval) : sur ce corpus, les embeddings Gemini seuls battent l'hybride
 * (recall@5 99 % contre 95 %), car BM25 fait redescendre les bonnes réponses aux questions reformulées.
 * L'hybride reste disponible : il serait plus sûr sur des références exactes (numéros, codes produits).
 */
export const DEFAULT_RETRIEVAL: RetrievalConfig = { mode: "embedding", embeddingProvider: "gemini" };

export interface Retriever {
  search(query: string, k: number): Promise<ScoredChunk[]>;
}

/**
 * Reciprocal Rank Fusion : fusionne plusieurs classements en n'utilisant que les RANGS.
 *
 * score(d) = Σ_classement 1 / (c + rang(d))   avec c = 60 (valeur standard)
 *
 * Pourquoi les rangs et pas les scores ? Un score BM25 (0 à ~20) et une similarité cosinus
 * (0 à 1) ne sont pas sur la même échelle ; les additionner n'aurait pas de sens.
 * Les rangs, eux, sont comparables. Un extrait bien classé par les deux méthodes remonte en tête.
 */
export function reciprocalRankFusion(rankings: ScoredChunk[][], k: number, c = 60): ScoredChunk[] {
  const scores = new Map<string, { chunk: Chunk; score: number }>();
  for (const ranking of rankings) {
    ranking.forEach(({ chunk }, rank) => {
      const entry = scores.get(chunk.id) ?? { chunk, score: 0 };
      entry.score += 1 / (c + rank + 1);
      scores.set(chunk.id, entry);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

/** Recherche sémantique : la question est vectorisée, puis comparée à tous les extraits (65 produits scalaires). */
function vectorSearch(chunks: Chunk[], provider: Provider, embedder: EmbeddingClient) {
  const index = loadEmbeddingIndex(provider, chunks);
  const vectors = new Map(index.entries.map((e) => [e.id, e.vector]));
  return async (query: string, k: number): Promise<ScoredChunk[]> => {
    const [q] = await embedder.embed([query], "query");
    const qv = normalize(q);
    return chunks
      .map((chunk) => ({ chunk, score: dot(qv, vectors.get(chunk.id)!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  };
}

export async function createRetriever(
  config: RetrievalConfig,
  opts: { chunks?: Chunk[]; embedder?: EmbeddingClient } = {},
): Promise<Retriever> {
  const chunks = opts.chunks ?? loadChunks();
  const bm25 = new BM25(chunks);
  if (config.mode === "bm25") return { search: async (q, k) => bm25.search(q, k) };

  const vector = vectorSearch(chunks, config.embeddingProvider, opts.embedder ?? embeddingClient(config.embeddingProvider));
  if (config.mode === "embedding") return { search: vector };

  return {
    async search(q, k) {
      // On fusionne des listes plus longues que k : un extrait 8e en BM25 et 3e en sémantique doit pouvoir remonter.
      const depth = Math.max(k * 3, 20);
      return reciprocalRankFusion([bm25.search(q, depth), await vector(q, depth)], k);
    },
  };
}
