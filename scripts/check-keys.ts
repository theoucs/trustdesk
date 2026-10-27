/**
 * Vérifie que les clés API répondent et liste les modèles disponibles.
 * N'affiche jamais les clés. Usage : npm run check:keys
 */
import "./env";

async function listMistral() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return console.log("MISTRAL_API_KEY absente");
  const res = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) return console.log(`Mistral : HTTP ${res.status}`);
  const { data } = (await res.json()) as { data: { id: string }[] };
  console.log(`Mistral OK — ${data.length} modèles :\n  ${data.map((m) => m.id).sort().join(", ")}`);
}

async function listGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.log("GEMINI_API_KEY absente");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    headers: { "x-goog-api-key": key },
  });
  if (!res.ok) return console.log(`Gemini : HTTP ${res.status}`);
  const { models } = (await res.json()) as { models: { name: string; supportedGenerationMethods: string[] }[] };
  const fmt = (method: string) =>
    models.filter((m) => m.supportedGenerationMethods.includes(method)).map((m) => m.name.replace("models/", "")).join(", ");
  console.log(`Gemini OK\n  génération : ${fmt("generateContent")}\n  embeddings : ${fmt("embedContent")}`);
}

await listMistral();
await listGemini();
