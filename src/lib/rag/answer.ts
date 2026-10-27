import type { ChatClient, Usage } from "../llm/types";
import type { Retriever } from "./retrieve";
import type { Chunk } from "./types";

/**
 * - answered     : la documentation répond (y compris quand la réponse est « non », si c'est écrit).
 * - partial      : la documentation répond en partie, ou se contredit.
 * - not_found    : la documentation ne contient pas la réponse.
 * - needs_review : le modèle a affirmé quelque chose sans citer de source valide → bloqué, relecture humaine.
 *                  Ce statut n'est jamais produit par le modèle, seulement par la validation.
 */
export type AnswerStatus = "answered" | "partial" | "not_found" | "needs_review";

export type AnswerConfig = {
  topK: number;
  temperature: number;
  promptVersion: keyof typeof PROMPTS;
};

export const DEFAULT_ANSWER_CONFIG: AnswerConfig = { topK: 5, temperature: 0, promptVersion: "v1" };

export type Citation = { id: string; doc: string; docTitle: string; section: string; excerpt: string };

export type Answer = {
  question: string;
  status: AnswerStatus;
  answer: string;
  citations: Citation[];
  /** Le modèle a signalé que deux sources se contredisent. */
  conflict: boolean;
  /** Extraits consultés (affichés quand la réponse est not_found : « voici ce qui a été vérifié »). */
  consulted: { id: string; score: number }[];
  /** Problèmes détectés par la validation (citation inventée, réponse sans source…). */
  warnings: string[];
  model: string;
  usage: Usage;
  latencyMs: number;
  cached: boolean;
};

/**
 * Le prompt est versionné : chaque run d'évaluation enregistre la version utilisée,
 * pour pouvoir attribuer un changement de score à un changement de prompt.
 */
export const PROMPTS = {
  v1: `You are a pre-sales security analyst at Vantrel. You fill in security questionnaires and RFPs sent by prospects, using ONLY the documentation excerpts provided.

Rules:
1. Use only the information in the excerpts. Never use outside knowledge, even if you believe it is true (for example about AWS or about industry standards).
2. Every statement must be supported by at least one excerpt. Cite excerpts by their label (S1, S2...) in "citations".
3. Choose the status:
   - "answered": the excerpts fully answer the question. If the documentation explicitly says something is NOT supported or NOT available, that is an answer ("No, ..."), not a missing answer.
   - "partial": the excerpts answer only part of the question. State what is documented and explicitly say which part is not documented.
   - "not_found": the excerpts do not contain the answer. Do not guess, do not infer from related information, and do not answer "no" just because something is not mentioned. Write a short sentence saying the information is not in the documentation, and leave "citations" empty.
4. If two excerpts contradict each other, set "conflict" to true, state both versions with their citations, and use status "partial".
5. Write like a professional questionnaire answer: direct, factual, 1 to 4 sentences, no marketing language, no promises beyond the documentation. Mention plan restrictions (e.g. "Enterprise plan only") when the excerpts state them.
6. Answer in the language of the question.`,
} as const;

const ANSWER_SCHEMA = {
  name: "questionnaire_answer",
  schema: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["answered", "partial", "not_found"] },
      answer: { type: "string" },
      citations: { type: "array", items: { type: "string" } },
      conflict: { type: "boolean" },
    },
    required: ["status", "answer", "citations", "conflict"],
    additionalProperties: false,
  },
};

/**
 * Les extraits sont présentés avec des étiquettes courtes (S1, S2…) plutôt que leurs identifiants longs :
 * un modèle recopie beaucoup plus fiablement « S3 » que « 04-identity-access#Vantrel employee access to customer data ».
 * On retraduit ensuite les étiquettes en vrais identifiants.
 */
function formatContext(chunks: Chunk[]): string {
  return chunks
    .map((c, i) => `[S${i + 1}] ${c.docTitle} (v${c.docVersion}) — ${c.section}\n${c.body}`)
    .join("\n\n---\n\n");
}

export async function answerQuestion(
  question: string,
  deps: { retriever: Retriever; llm: ChatClient },
  config: AnswerConfig = DEFAULT_ANSWER_CONFIG,
): Promise<Answer> {
  const retrieved = await deps.retriever.search(question, config.topK);
  const chunks = retrieved.map((r) => r.chunk);

  const res = await deps.llm.chat({
    system: PROMPTS[config.promptVersion],
    user: `Documentation excerpts:\n\n${formatContext(chunks)}\n\n===\n\nQuestionnaire question: ${question}`,
    temperature: config.temperature,
    schema: ANSWER_SCHEMA,
    maxTokens: 600,
  });

  const base = {
    question,
    consulted: retrieved.map((r) => ({ id: r.chunk.id, score: r.score })),
    model: res.model,
    usage: res.usage,
    latencyMs: res.latencyMs,
    cached: res.cached ?? false,
  };

  let parsed: { status: AnswerStatus; answer: string; citations: string[]; conflict: boolean };
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return {
      ...base,
      status: "needs_review",
      answer: "",
      citations: [],
      conflict: false,
      warnings: [`Sortie non JSON : ${res.text.slice(0, 200)}`],
    };
  }

  return { ...base, ...validate(parsed, chunks) };
}

/**
 * Garde-fou après génération : on ne fait pas confiance au modèle sur ses propres citations.
 * - Une étiquette qui ne correspond à aucun extrait fourni est retirée (citation inventée).
 * - Une réponse « answered »/« partial » sans aucune citation valide est bloquée en needs_review :
 *   l'outil n'affiche jamais une affirmation non sourcée comme si elle était fiable.
 * - Une réponse « not_found » avec citations : on retire les citations (rien n'a été trouvé, rien à citer).
 */
export function validate(
  parsed: { status: AnswerStatus; answer: string; citations: string[]; conflict: boolean },
  chunks: Chunk[],
): Pick<Answer, "status" | "answer" | "citations" | "conflict" | "warnings"> {
  const warnings: string[] = [];
  const citations: Citation[] = [];
  for (const label of new Set(parsed.citations ?? [])) {
    const m = String(label).match(/^\[?S(\d+)\]?$/i);
    const chunk = m ? chunks[Number(m[1]) - 1] : undefined;
    if (!chunk) {
      warnings.push(`Citation invalide retirée : « ${label} »`);
      continue;
    }
    citations.push({
      id: chunk.id,
      doc: chunk.doc,
      docTitle: chunk.docTitle,
      section: chunk.section,
      excerpt: chunk.body,
    });
  }

  let status = parsed.status;
  if (status === "not_found" && citations.length) {
    warnings.push("Réponse not_found accompagnée de citations : citations ignorées");
    citations.length = 0;
  }
  if ((status === "answered" || status === "partial") && citations.length === 0) {
    warnings.push("Réponse sans source valide : bloquée pour relecture");
    status = "needs_review";
  }
  return { status, answer: parsed.answer?.trim() ?? "", citations, conflict: Boolean(parsed.conflict), warnings };
}
