/**
 * Calcule les embeddings de tous les extraits et les écrit dans data/embeddings/<fournisseur>.json.
 * À relancer quand la base documentaire change (l'app refuse un index périmé).
 *
 * Usage : npm run index -- [--provider mistral|gemini]   (par défaut : les deux)
 */
import "./env";
import { mkdirSync, writeFileSync } from "node:fs";
import { embeddingClient, type Provider } from "../src/lib/llm";
import { loadChunks } from "../src/lib/rag/knowledge";
import { EMBEDDINGS_DIR, embeddingIndexPath, normalize, textHash, type EmbeddingIndex } from "../src/lib/rag/vectors";

const i = process.argv.indexOf("--provider");
const providers: Provider[] = i >= 0 ? [process.argv[i + 1] as Provider] : ["mistral", "gemini"];
const BATCH = 32;

const chunks = loadChunks();
mkdirSync(EMBEDDINGS_DIR, { recursive: true });

for (const provider of providers) {
  const client = embeddingClient(provider);
  const vectors: number[][] = [];
  for (let b = 0; b < chunks.length; b += BATCH) {
    vectors.push(...(await client.embed(chunks.slice(b, b + BATCH).map((c) => c.text), "document")));
  }
  const index: EmbeddingIndex = {
    provider,
    model: client.model,
    dims: vectors[0].length,
    builtAt: new Date().toISOString(),
    entries: chunks.map((c, j) => ({
      id: c.id,
      textHash: textHash(c.text),
      // 6 décimales suffisent largement pour un cosinus et divisent la taille du fichier par ~3.
      vector: normalize(vectors[j]).map((x) => Math.round(x * 1e6) / 1e6),
    })),
  };
  writeFileSync(embeddingIndexPath(provider), JSON.stringify(index));
  console.log(`${provider} (${client.model}) : ${chunks.length} extraits × ${index.dims} dimensions`);
}
