import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chunkDocument } from "./chunk";
import type { Chunk } from "./types";

export const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge-base");

/** Lit tous les documents markdown de la base et les découpe en extraits. */
export function loadChunks(dir = KNOWLEDGE_DIR): Chunk[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .flatMap((f) => chunkDocument(f.replace(/\.md$/, ""), readFileSync(path.join(dir, f), "utf8")));
}
