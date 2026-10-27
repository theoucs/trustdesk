import type { Chunk, ScoredChunk } from "./types";

/**
 * BM25 : recherche par mots-clés, la référence historique des moteurs de recherche.
 *
 * score(q, d) = Σ_terme IDF(t) · tf·(k1+1) / (tf + k1·(1 − b + b·|d|/avgdl))
 *
 * - IDF : un mot rare (« SCIM ») pèse plus qu'un mot fréquent (« data »).
 * - tf saturé par k1 : répéter un mot 10 fois ne rend pas un document 10× plus pertinent.
 * - b normalise par la longueur : un long document n'est pas avantagé juste parce qu'il contient plus de mots.
 *
 * Forces : exact sur les termes techniques et acronymes (SOC 2, RPO, SAML).
 * Faiblesses : aucun sens des synonymes ni de la langue (« hébergées » ≠ « hosted »).
 */

const STOPWORDS = new Set(
  (
    "a an the and or of to in on for with by from at as is are was were be been it its this that these those " +
    "do does did you your yours we our us they their can could will would should may might what which who whom " +
    "how when where why if any all there have has had not no yes please provide describe list " +
    "le la les un une des du de et ou en au aux est sont vos votre nos notre vous nous que qui quoi quel quelle " +
    "quels quelles pour par sur dans avec il elle ils elles ce cette ces se sa son ses"
  ).split(" "),
);

/** Normalise : minuscules, sans accents, découpe sur tout ce qui n'est pas lettre/chiffre. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/**
 * Racinisation minimale (anglais) : « encrypted », « encryption » → « encrypt ».
 * Volontairement simple ; un vrai stemmer (Porter) ferait mieux mais ajoute une dépendance.
 */
export function stem(t: string): string {
  if (t.length <= 4) return t;
  // Pluriels d'abord : « processes » → « process », « policies » → « policy », mais « access » reste « access ».
  if (t.endsWith("ies")) t = t.slice(0, -3) + "y";
  else if (/(ss|x|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) t = t.slice(0, -1);
  // Appliqué jusqu'à stabilité pour que « provisioning » et « provision » aboutissent à la même racine.
  for (let changed = true; changed; ) {
    changed = false;
    for (const suffix of ["ation", "ion", "ing", "ed"]) {
      if (t.endsWith(suffix) && t.length - suffix.length >= 4) {
        t = t.slice(0, -suffix.length);
        changed = true;
        break;
      }
    }
  }
  return t;
}

export class BM25 {
  private docs: { chunk: Chunk; tf: Map<string, number>; len: number }[];
  private df = new Map<string, number>();
  private avgdl: number;

  constructor(
    chunks: Chunk[],
    private k1 = 1.2,
    private b = 0.75,
  ) {
    this.docs = chunks.map((chunk) => {
      const tokens = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { chunk, tf, len: tokens.length };
    });
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(this.docs.length, 1);
  }

  private idf(term: string): number {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query: string, k: number): ScoredChunk[] {
    const terms = [...new Set(tokenize(query))];
    return this.docs
      .map(({ chunk, tf, len }) => {
        let score = 0;
        for (const t of terms) {
          const f = tf.get(t);
          if (!f) continue;
          score += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * len) / this.avgdl));
        }
        return { chunk, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
