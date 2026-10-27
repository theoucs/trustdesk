import "server-only";
import { chatClient, embeddingClient, type Provider } from "../llm";
import { answerQuestion, DEFAULT_ANSWER_CONFIG, type Answer } from "../rag/answer";
import { createRetriever, DEFAULT_RETRIEVAL, type Retriever } from "../rag/retrieve";

/** Le retriever (extraits + vecteurs chargés en mémoire) est construit une fois par instance serveur. */
let retriever: Promise<Retriever> | undefined;
function getRetriever() {
  retriever ??= createRetriever(DEFAULT_RETRIEVAL, { embedder: embeddingClient(DEFAULT_RETRIEVAL.embeddingProvider) });
  return retriever;
}

export async function draftAnswer(question: string, generator: Provider): Promise<Answer> {
  return answerQuestion(question, { retriever: await getRetriever(), llm: chatClient(generator) }, DEFAULT_ANSWER_CONFIG);
}
