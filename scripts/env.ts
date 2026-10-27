/** Charge `.env.local` pour les scripts lancés hors de Next.js (Next le fait tout seul pour l'app). */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
