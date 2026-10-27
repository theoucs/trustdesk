import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Fichiers lus avec fs à l'exécution : à embarquer explicitement dans les fonctions serverless.
  outputFileTracingIncludes: {
    "/api/answer": ["./knowledge-base/**/*", "./data/**/*"],
    "/evaluation": ["./runs/**/*", "./eval/human-labels.jsonl"],
    "/evaluation/*": ["./runs/**/*"],
    "/knowledge/*": ["./knowledge-base/**/*"],
  },
};

export default nextConfig;
