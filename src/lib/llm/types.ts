export type Provider = "mistral" | "gemini";

export type ChatRequest = {
  system: string;
  user: string;
  temperature: number;
  /**
   * JSON Schema imposé à la sortie (« structured output »). Le fournisseur contraint le décodage
   * pour que la réponse soit toujours un JSON valide de cette forme : plus besoin de parser du texte libre.
   */
  schema?: { name: string; schema: Record<string, unknown> };
  maxTokens?: number;
};

export type Usage = { inputTokens: number; outputTokens: number };

export type ChatResponse = {
  text: string;
  usage: Usage;
  latencyMs: number;
  model: string;
  /** Vrai si la réponse vient du cache disque (aucun appel API). */
  cached?: boolean;
};

export type EmbedTask = "document" | "query";

export interface ChatClient {
  provider: Provider;
  model: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface EmbeddingClient {
  provider: Provider;
  model: string;
  embed(texts: string[], task: EmbedTask): Promise<number[][]>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}
