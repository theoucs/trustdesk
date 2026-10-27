import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Provider } from "../llm/types";
import type { Chunk } from "./types";

export const EMBEDDINGS_DIR = path.join(process.cwd(), "data", "embeddings");

/**
 * Index vectoriel : un vecteur par extrait, calculé une fois (`npm run index`) et versionné dans git.
 * L'app n'a donc à appeler l'API d'embeddings que pour la question de l'utilisateur.
 */
export type EmbeddingIndex = {
  provider: Provider;
  model: string;
  dims: number;
  builtAt: string;
  /** Hash du texte de chaque extrait : si la doc change, l'index est détecté comme périmé. */
  entries: { id: string; textHash: string; vector: number[] }[];
};

export const textHash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export function embeddingIndexPath(provider: Provider) {
  return path.join(EMBEDDINGS_DIR, `${provider}.json`);
}

export function loadEmbeddingIndex(provider: Provider, chunks: Chunk[]): EmbeddingIndex {
  const file = embeddingIndexPath(provider);
  if (!existsSync(file)) throw new Error(`Index d'embeddings ${provider} absent : lancer \`npm run index\`.`);
  const index = JSON.parse(readFileSync(file, "utf8")) as EmbeddingIndex;
  const byId = new Map(index.entries.map((e) => [e.id, e.textHash]));
  const stale = chunks.filter((c) => byId.get(c.id) !== textHash(c.text));
  if (stale.length) {
    throw new Error(
      `Index ${provider} périmé (${stale.length} extraits modifiés, ex. ${stale[0].id}) : relancer \`npm run index\`.`,
    );
  }
  return index;
}

/**
 * Similarité cosinus = cos(angle entre deux vecteurs), de -1 (opposés) à 1 (même direction).
 * Les vecteurs étant normalisés (longueur 1), c'est simplement le produit scalaire.
 */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function normalize(v: number[]): number[] {
  const norm = Math.hypot(...v);
  return norm ? v.map((x) => x / norm) : v;
}
