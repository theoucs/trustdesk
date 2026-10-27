import type { Chunk } from "./types";

type Frontmatter = { title?: string; version?: string };

function parseFrontmatter(raw: string): { meta: Frontmatter; content: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { meta: {}, content: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, content: raw.slice(match[0].length) };
}

/**
 * Découpe un document par section `##`.
 *
 * Choix : découpage « structurel » plutôt qu'en fenêtres de N tokens. Les sections de
 * la doc sont courtes (50-300 mots) et autonomes, donc une section = une idée = une
 * citation lisible. Une fenêtre fixe couperait un tableau ou une phrase en deux.
 * Le texte avant la première section (titre + intro) est ignoré s'il est vide de contenu.
 */
export function chunkDocument(doc: string, raw: string): Chunk[] {
  const { meta, content } = parseFrontmatter(raw);
  const docTitle = meta.title ?? doc;
  const docVersion = meta.version ?? "";

  const chunks: Chunk[] = [];
  const parts = content.split(/^## /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const section = part.slice(0, newline).trim();
    const body = part.slice(newline + 1).trim();
    if (!body) continue;
    chunks.push({
      id: `${doc}#${section}`,
      doc,
      docTitle,
      docVersion,
      section,
      body,
      text: `${docTitle} — ${section}\n\n${body}`,
    });
  }
  return chunks;
}
