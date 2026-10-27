import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { marked } from "marked";
import { sectionAnchor } from "../anchors";
import { KNOWLEDGE_DIR } from "../rag/knowledge";

export type KbDoc = {
  slug: string;
  title: string;
  version: string;
  lastUpdated: string;
  owner: string;
  sections: string[];
  html: string;
};

function parse(slug: string, raw: string): KbDoc {
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta: Record<string, string> = {};
  for (const line of fm?.[1].split("\n") ?? []) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  const body = raw.slice(fm?.[0].length ?? 0).replace(/^# .*\n/, "");
  const sections = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const renderer = new marked.Renderer();
  renderer.heading = ({ tokens, depth }) => {
    const text = tokens.map((t) => ("text" in t ? t.text : "")).join("");
    return `<h${depth} id="${sectionAnchor(text)}">${text}</h${depth}>`;
  };
  return {
    slug,
    title: meta.title ?? slug,
    version: meta.version ?? "",
    lastUpdated: meta.last_updated ?? "",
    owner: meta.owner ?? "",
    sections,
    html: marked.parse(body, { renderer, async: false }),
  };
}

export function listDocs(): KbDoc[] {
  return readdirSync(KNOWLEDGE_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parse(f.replace(/\.md$/, ""), readFileSync(path.join(KNOWLEDGE_DIR, f), "utf8")));
}

export function getDoc(slug: string): KbDoc | undefined {
  return listDocs().find((d) => d.slug === slug);
}
