import type { ChatClient, Usage } from "../llm/types";
import type { Answer } from "../rag/answer";
import type { TestQuestion } from "./dataset";

export type JudgeScores = {
  reasoning: string;
  /** 1-5 : les faits de la réponse correspondent-ils à la réponse attendue ? */
  correctness: number;
  /** 1-5 : chaque affirmation est-elle appuyée par les extraits cités ? (détecte l'hallucination) */
  faithfulness: number;
  /** 1-5 : la réponse couvre-t-elle les points clés attendus ? */
  completeness: number;
};

export type JudgeResult = JudgeScores & { model: string; usage: Usage; cached: boolean };

export const JUDGE_PROMPT_VERSION = "j1";

/**
 * Le juge reçoit : la question, la réponse de référence, la réponse générée ET le texte des extraits cités.
 * Il peut donc noter deux choses différentes :
 *  - l'exactitude, par rapport à la référence (rédigée par un humain) ;
 *  - la fidélité, par rapport aux sources (la réponse dit-elle quelque chose que les extraits ne disent pas ?).
 *
 * Bonnes pratiques appliquées :
 *  - grille explicite pour chaque note (sinon le juge note « au feeling » et de façon instable) ;
 *  - raisonnement AVANT les notes (le modèle « réfléchit » puis conclut, au lieu de justifier après coup) ;
 *  - température 0 et sortie JSON contrainte ;
 *  - consigne explicite contre le biais de longueur (les LLM juges préfèrent les réponses longues).
 */
const SYSTEM = `You are a strict evaluator of answers to security questionnaires. An assistant answered a questionnaire question using a company's documentation. You compare its answer to a reference answer written by an expert, and check it against the documentation excerpts it cited.

Score each criterion from 1 to 5:

correctness — are the facts in the answer consistent with the reference answer?
  5: all facts match the reference, no wrong statement.
  3: main point right, but a secondary fact is wrong or missing an important qualification (e.g. plan restriction).
  1: main point wrong. This includes: answering a question whose reference says it is NOT in the documentation (any "yes" or "no" or inferred answer counts as wrong), or saying "not documented" when the reference gives an answer.
  If the reference says the information is not documented and the assistant says so: 5.
  If the reference flags contradicting sources: the answer must mention both versions to get 5.

faithfulness — is every statement supported by the cited excerpts?
  5: everything is stated in the excerpts.
  3: mostly supported, with a minor unsupported addition or extrapolation.
  1: key claims are not in the excerpts (hallucination or outside knowledge).
  An answer that only says the information is not documented scores 5.

completeness — does the answer cover the key points of the reference?
  5: all key points. 3: some key points missing. 1: most key points missing.
  Do not reward length: extra details beyond the reference neither add nor remove points, unless they are wrong.
  If the reference says the information is not documented, an answer saying so scores 5.

Write your reasoning first (2-4 sentences), then the scores.`;

const SCHEMA = {
  name: "judgement",
  schema: {
    type: "object",
    properties: {
      reasoning: { type: "string" },
      correctness: { type: "integer", minimum: 1, maximum: 5 },
      faithfulness: { type: "integer", minimum: 1, maximum: 5 },
      completeness: { type: "integer", minimum: 1, maximum: 5 },
    },
    required: ["reasoning", "correctness", "faithfulness", "completeness"],
    additionalProperties: false,
  },
};

export async function judgeAnswer(q: TestQuestion, a: Answer, judge: ChatClient): Promise<JudgeResult> {
  const cited = a.citations.length
    ? a.citations.map((c) => `### ${c.docTitle} — ${c.section}\n${c.excerpt}`).join("\n\n")
    : "(no excerpt cited)";
  const user = `Question: ${q.question}

Reference answer: ${q.expected_answer}

Assistant status: ${a.status}${a.conflict ? " (flagged conflicting sources)" : ""}
Assistant answer: ${a.answer || "(empty)"}

Excerpts cited by the assistant:
${cited}`;

  // Deux pannes observées avec Ministral 14B en juge : un raisonnement trop long coupé par la limite de tokens, et une
  // boucle dégénérée (un guillemet ouvert dans le raisonnement, puis des tabulations jusqu'à la limite). La sortie
  // structurée garantit la forme du JSON, pas qu'il se termine. On réessaie avec plus de place, puis avec une
  // température un peu plus haute, qui suffit à sortir de la boucle. Chaque essai a sa propre entrée de cache.
  const attempts = [
    { temperature: 0, maxTokens: 800 },
    { temperature: 0, maxTokens: 2000 },
    { temperature: 0.4, maxTokens: 1200 },
  ];
  let res: Awaited<ReturnType<ChatClient["chat"]>> | undefined;
  let s: JudgeScores | undefined;
  for (const a of attempts) {
    res = await judge.chat({ system: SYSTEM, user, schema: SCHEMA, ...a });
    try {
      s = JSON.parse(res.text) as JudgeScores;
      break;
    } catch {
      console.warn(`  ↻ juge ${judge.model} : JSON invalide (${res.text.length} caractères), nouvel essai`);
    }
  }
  if (!s || !res) throw new Error(`Juge ${judge.model} : aucune sortie JSON valide après ${attempts.length} essais`);
  const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(Number(n)) || 1));
  return {
    reasoning: s.reasoning,
    correctness: clamp(s.correctness),
    faithfulness: clamp(s.faithfulness),
    completeness: clamp(s.completeness),
    model: res.model,
    usage: res.usage,
    cached: res.cached ?? false,
  };
}

/**
 * Score d'une question sur 100 : moyenne pondérée des notes du juge, ramenées de [1;5] à [0;1].
 * L'exactitude pèse le plus ; la fidélité ensuite, car une réponse non sourcée est inutilisable
 * dans un questionnaire, même si elle se trouve être juste.
 */
export const WEIGHTS = { correctness: 0.5, faithfulness: 0.3, completeness: 0.2 };

export function questionScore(j: JudgeScores): number {
  const n = (x: number) => (x - 1) / 4;
  return (
    100 *
    (WEIGHTS.correctness * n(j.correctness) +
      WEIGHTS.faithfulness * n(j.faithfulness) +
      WEIGHTS.completeness * n(j.completeness))
  );
}
