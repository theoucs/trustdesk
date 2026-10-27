import { readFileSync } from "node:fs";
import path from "node:path";

export type Answerable = "yes" | "partial" | "no";

export type TestQuestion = {
  id: string;
  category: string;
  answerable: Answerable;
  question: string;
  expected_answer: string;
  /** Extraits qui contiennent la réponse, au format `document#Section`. Vide si la doc ne répond pas. */
  expected_sources: string[];
};

export function loadQuestions(file = path.join(process.cwd(), "eval", "questions.jsonl")): TestQuestion[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as TestQuestion);
}
