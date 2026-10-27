import "server-only";

/**
 * Limite de débit pour la démo publique : protège le quota gratuit des API contre un usage abusif.
 * Fenêtre glissante par IP + plafond global par jour.
 *
 * Limite connue : en mémoire, donc propre à chaque instance serverless (Vercel peut en lancer plusieurs).
 * C'est un garde-fou « best effort » ; la version robuste stocke les compteurs dans Postgres (Supabase).
 */
const PER_IP = { max: 30, windowMs: 10 * 60_000 };
const DAILY_MAX = Number(process.env.DAILY_ANSWER_LIMIT ?? 500);

const hits = new Map<string, number[]>();
let day = "";
let dailyCount = 0;

export function checkRateLimit(ip: string): { ok: true } | { ok: false; reason: string } {
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dailyCount = 0;
  }
  if (dailyCount >= DAILY_MAX) return { ok: false, reason: "The demo has reached its daily limit. Please come back tomorrow." };

  const recent = (hits.get(ip) ?? []).filter((t) => now - t < PER_IP.windowMs);
  if (recent.length >= PER_IP.max) {
    return { ok: false, reason: "Too many requests. Please wait a few minutes before drafting more answers." };
  }
  recent.push(now);
  hits.set(ip, recent);
  dailyCount++;
  return { ok: true };
}
