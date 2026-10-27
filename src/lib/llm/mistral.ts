import { postJson } from "./http";
import type { ChatClient, ChatRequest, ChatResponse, EmbedTask, EmbeddingClient } from "./types";

const BASE = "https://api.mistral.ai/v1";
// Offre gratuite « Experiment » : débit limité ; 1,1 s entre deux appels reste sous la limite.
const THROTTLE = { throttleKey: "mistral", minIntervalMs: 1100 };

function key() {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new Error("MISTRAL_API_KEY manquante (.env.local)");
  return { Authorization: `Bearer ${k}` };
}

type MistralChat = {
  model: string;
  choices: { message: { content: string } }[];
  usage: { prompt_tokens: number; completion_tokens: number };
};

export function mistralChat(model: string): ChatClient {
  return {
    provider: "mistral",
    model,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const start = Date.now();
      const res = await postJson<MistralChat>(
        `${BASE}/chat/completions`,
        {
          model,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          ...(req.schema && {
            response_format: {
              type: "json_schema",
              json_schema: { name: req.schema.name, schema: req.schema.schema, strict: true },
            },
          }),
        },
        key(),
        THROTTLE,
      );
      return {
        text: res.choices[0]?.message.content ?? "",
        usage: { inputTokens: res.usage.prompt_tokens, outputTokens: res.usage.completion_tokens },
        latencyMs: Date.now() - start,
        model: res.model,
      };
    },
  };
}

export function mistralEmbeddings(model = "mistral-embed"): EmbeddingClient {
  return {
    provider: "mistral",
    model,
    // mistral-embed ne distingue pas documents et requêtes : `task` est ignoré.
    async embed(texts: string[], _task: EmbedTask): Promise<number[][]> {
      const res = await postJson<{ data: { embedding: number[] }[] }>(
        `${BASE}/embeddings`,
        { model, input: texts },
        key(),
        THROTTLE,
      );
      return res.data.map((d) => d.embedding);
    },
  };
}
