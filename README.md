# Trustdesk

**Drafts answers to security questionnaires and RFPs from a company's documentation — with a source for every answer, and a clear "not in documentation" when there isn't one.**

Live: **[trustdesk.tblabs.dev](https://trustdesk.tblabs.dev)** · Case study: [tblabs.dev/work/trustdesk](https://tblabs.dev/work/trustdesk)

The documentation belongs to **Vantrel**, a fictional SaaS vendor invented for this project: 12 documents written with the gaps, near-misses and one contradiction that real documentation always has.

## What it does

1. Import a questionnaire (`.xlsx`, `.csv`, `.txt`) or paste questions. The question column is detected automatically.
2. For each question, the 5 most relevant documentation sections are retrieved (Gemini embeddings).
3. A model (Mistral Ministral 14B or Gemini 3.5 Flash-Lite) returns schema-constrained JSON: status, answer, cited sections.
4. **Code, not the model, enforces the guarantees**: invented citations are removed, an answer with no valid source is blocked as *Needs review*.
5. Export the drafted questionnaire back to Excel.

Four possible outcomes: **Answered** (including a documented "no") · **Partial** · **Not in documentation** · **Conflicting sources**.

## How it is evaluated

- `eval/questions.jsonl` — 50 questions with reference answers and expected sources: direct, paraphrased, multi-document, French, documented "no", **12 with no answer in the docs**, traps, one contradiction.
- Retrieval measured alone, without any LLM (hit@k, recall@k, MRR).
- Each model drafts, **each model grades** (LLM-as-judge, rubric + reasoning first), plus deterministic checks: invented answers, wrongful abstentions, citation recall.
- `runs/` — every evaluation run: config, per-question results, summary.

Main findings: embeddings alone beat hybrid search on this corpus (99% vs 95% recall@5); grader strictness weighs ~8 points vs ~1 point between models; prompt v2 is in production because it is the only version with **zero invented answers** for both models, even though v3 scores higher with the grader.

## Stack

Next.js 16 · TypeScript · Tailwind · Vercel (Paris region) · Mistral & Gemini APIs (free tiers) · no framework, no vector database (65 sections fit in memory).

## Run it

```bash
npm install
cp .env.example .env.local        # MISTRAL_API_KEY, GEMINI_API_KEY
npm run dev                        # app on http://localhost:3000

npm run eval:retrieval -- --mode embedding        # retrieval only, no LLM call
npm run ask -- "Do you support SCIM?" --generator gemini
npm run eval -- --generator mistral --judge gemini --prompt v2
npm run compare -- --matrix v1
npm run calibrate                                 # grade answers yourself, measure judge-human agreement
```

## Documentation

[`docs/COMMENT_CA_MARCHE.md`](docs/COMMENT_CA_MARCHE.md) (in French) explains every design choice, every measurement and the reasoning behind each decision.
