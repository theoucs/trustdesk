import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ChatClient, ChatRequest, ChatResponse, EmbedTask, EmbeddingClient } from "./types";

const DIR = path.join(process.cwd(), ".cache", "llm");

function cached<T>(key: unknown, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const hash = createHash("sha256").update(JSON.stringify(key)).digest("hex").slice(0, 32);
  const file = path.join(DIR, `${hash}.json`);
  if (existsSync(file)) return Promise.resolve({ value: JSON.parse(readFileSync(file, "utf8")) as T, hit: true });
  return compute().then((value) => {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return { value, hit: false };
  });
}

/**
 * Cache disque des réponses LLM, indexé par le hash de (fournisseur, modèle, requête complète).
 *
 * - Relancer une évaluation ne consomme pas de quota si rien n'a changé.
 * - Changer UN réglage (prompt, top_k…) ne rappelle l'API que pour les requêtes réellement modifiées.
 * - Les résultats sont reproductibles : même entrée → même sortie, même avec temperature > 0.
 *
 * Utilisé par les scripts d'évaluation uniquement ; l'app en production n'écrit pas sur disque.
 */
export function withDiskCache(client: ChatClient): ChatClient {
  return {
    ...client,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const { value, hit } = await cached({ provider: client.provider, model: client.model, req }, () =>
        client.chat(req),
      );
      return hit ? { ...value, cached: true } : value;
    },
  };
}

/** Même principe pour les embeddings des questions (les extraits, eux, sont dans data/embeddings). */
export function withEmbeddingDiskCache(client: EmbeddingClient): EmbeddingClient {
  return {
    ...client,
    async embed(texts: string[], task: EmbedTask): Promise<number[][]> {
      const { value } = await cached({ provider: client.provider, model: client.model, texts, task }, () =>
        client.embed(texts, task),
      );
      return value;
    },
  };
}
