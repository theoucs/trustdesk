import { geminiChat, geminiEmbeddings } from "./gemini";
import { mistralChat, mistralEmbeddings } from "./mistral";
import type { ChatClient, EmbeddingClient, Provider } from "./types";

export * from "./types";

/**
 * Modèles par défaut : les meilleurs accessibles sur les offres gratuites, de gamme comparable
 * (petits modèles rapides). Sur l'offre gratuite Mistral, mistral-small/medium ont un quota de 0 req/min :
 * seuls les « ministral » (3B, 8B, 14B) sont utilisables. En face, Gemini Flash-Lite plutôt que Flash,
 * qui est un modèle plus gros avec raisonnement (thinking) : la comparaison serait déséquilibrée.
 *
 * Versions figées plutôt que les alias `-latest` : un alias peut pointer vers un nouveau modèle
 * du jour au lendemain. Même ainsi, le fournisseur peut rediriger (gemini-3.5-flash répond en 3.6) :
 * chaque run enregistre donc le modèle réellement renvoyé par l'API.
 */
export const DEFAULT_MODELS: Record<Provider, string> = {
  mistral: "ministral-14b-2512",
  gemini: "gemini-3.5-flash-lite",
};

export const EMBEDDING_MODELS: Record<Provider, string> = {
  mistral: "mistral-embed",
  gemini: "gemini-embedding-001",
};

export function chatClient(provider: Provider, model = DEFAULT_MODELS[provider]): ChatClient {
  return provider === "mistral" ? mistralChat(model) : geminiChat(model);
}

export function embeddingClient(provider: Provider): EmbeddingClient {
  return provider === "mistral"
    ? mistralEmbeddings(EMBEDDING_MODELS.mistral)
    : geminiEmbeddings(EMBEDDING_MODELS.gemini);
}
