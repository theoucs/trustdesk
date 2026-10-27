import { normalize } from "../rag/vectors";
import { postJson } from "./http";
import type { ChatClient, ChatRequest, ChatResponse, EmbedTask, EmbeddingClient } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// Offre gratuite : quelques requêtes par minute selon le modèle ; le retry gère les 429 restants.
const THROTTLE = { throttleKey: "gemini", minIntervalMs: 4000 };

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY manquante (.env.local)");
  return { "x-goog-api-key": k };
}

type GeminiResponse = {
  modelVersion?: string;
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

export function geminiChat(model: string): ChatClient {
  return {
    provider: "gemini",
    model,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const start = Date.now();
      const res = await postJson<GeminiResponse>(
        `${BASE}/${model}:generateContent`,
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: "user", parts: [{ text: req.user }] }],
          generationConfig: {
            temperature: req.temperature,
            maxOutputTokens: req.maxTokens,
            ...(req.schema && { responseMimeType: "application/json", responseJsonSchema: req.schema.schema }),
          },
        },
        key(),
        THROTTLE,
      );
      const candidate = res.candidates?.[0];
      // Les modèles « thinking » peuvent renvoyer des parties de raisonnement : on ne garde que la réponse.
      const text = (candidate?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("");
      if (!text) throw new Error(`Gemini : réponse vide (finishReason=${candidate?.finishReason ?? "?"})`);
      const u = res.usageMetadata ?? {};
      return {
        text,
        // Les tokens de raisonnement sont facturés comme des tokens de sortie : on les compte.
        usage: {
          inputTokens: u.promptTokenCount ?? 0,
          outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
        },
        latencyMs: Date.now() - start,
        model: res.modelVersion ?? model,
      };
    },
  };
}

/**
 * gemini-embedding-001 produit des vecteurs de 3072 dimensions, mais il est entraîné en « Matryoshka » :
 * les N premières dimensions forment déjà un bon vecteur. On en garde 768 (4× plus léger à stocker),
 * perte de qualité minime selon Google. Les vecteurs tronqués doivent être renormalisés.
 */
const GEMINI_EMBED_DIMS = 768;

export function geminiEmbeddings(model = "gemini-embedding-001"): EmbeddingClient {
  return {
    provider: "gemini",
    model,
    async embed(texts: string[], task: EmbedTask): Promise<number[][]> {
      // Gemini optimise différemment le vecteur d'une question et celui d'un document à retrouver.
      const taskType = task === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT";
      const res = await postJson<{ embeddings: { values: number[] }[] }>(
        `${BASE}/${model}:batchEmbedContents`,
        {
          requests: texts.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: GEMINI_EMBED_DIMS,
          })),
        },
        key(),
        { throttleKey: "gemini-embed", minIntervalMs: 1000 },
      );
      return res.embeddings.map((e) => normalize(e.values));
    },
  };
}
