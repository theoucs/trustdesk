import { LLMError } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Espacement minimal entre deux appels à un même fournisseur.
 * Les offres gratuites limitent le nombre de requêtes par minute : mieux vaut s'étaler
 * que d'enchaîner les erreurs 429.
 */
const lastCall = new Map<string, number>();
async function throttle(key: string, minIntervalMs: number) {
  const wait = (lastCall.get(key) ?? 0) + minIntervalMs - Date.now();
  lastCall.set(key, Date.now() + Math.max(wait, 0));
  if (wait > 0) await sleep(wait);
}

/**
 * Politique de nouvelles tentatives. Les scripts d'évaluation peuvent attendre longtemps (un run de 30 minutes peut
 * patienter une minute). Une page web, non : quand un quota quotidien est épuisé, Gemini demande d'attendre jusqu'à
 * 17 heures, et un visiteur ne doit pas rester bloqué. Le serveur de l'app réduit donc ces limites (voir pipeline.ts)
 * et passe à son plan B.
 */
const retryPolicy = { maxRetries: 5, maxWaitMs: Infinity };
export function setRetryPolicy(policy: Partial<typeof retryPolicy>) {
  Object.assign(retryPolicy, policy);
}

/**
 * POST JSON avec nouvelles tentatives sur les erreurs passagères :
 * 429 (quota/débit) et 5xx (surcharge du fournisseur). Attente exponentielle
 * (2 s, 4 s, 8 s…) avec un peu d'aléa, ou la durée indiquée par le serveur s'il en donne une.
 * Les autres erreurs (400 requête invalide, 401 clé refusée) échouent immédiatement : réessayer ne changerait rien.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  opts: { throttleKey: string; minIntervalMs: number },
): Promise<T> {
  const { maxRetries, maxWaitMs } = retryPolicy;
  for (let attempt = 0; ; attempt++) {
    await throttle(opts.throttleKey, opts.minIntervalMs);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      throw new LLMError(`${opts.throttleKey} HTTP ${res.status}: ${text.slice(0, 500)}`, res.status);
    }
    const retryAfter = Number(res.headers.get("retry-after")) * 1000 || parseGeminiRetryDelay(text);
    const backoff = retryAfter || 2000 * 2 ** attempt + Math.random() * 500;
    if (backoff > maxWaitMs) {
      throw new LLMError(`${opts.throttleKey} HTTP ${res.status} (attente demandée ${Math.round(backoff / 1000)} s)`, res.status);
    }
    console.warn(`  ↻ ${opts.throttleKey} HTTP ${res.status}, nouvel essai dans ${(backoff / 1000).toFixed(1)} s`);
    await sleep(backoff);
  }
}

/** Gemini indique le délai d'attente dans le corps de l'erreur 429 (« retryDelay": "17s" »). */
function parseGeminiRetryDelay(body: string): number {
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(Number(m[1]) * 1000) : 0;
}
