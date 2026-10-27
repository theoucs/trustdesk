/** Charge `.env.local` pour les scripts lancés hors de Next.js (Next le fait tout seul pour l'app). */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// Clés dédiées aux évaluations, si elles existent : une évaluation complète consomme ~150 requêtes Gemini, et le quota
// gratuit est compté par projet Google. Avec une clé d'un autre projet, les évaluations ne vident pas le quota de l'app.
if (process.env.GEMINI_EVAL_API_KEY) process.env.GEMINI_API_KEY = process.env.GEMINI_EVAL_API_KEY;
if (process.env.MISTRAL_EVAL_API_KEY) process.env.MISTRAL_API_KEY = process.env.MISTRAL_EVAL_API_KEY;
