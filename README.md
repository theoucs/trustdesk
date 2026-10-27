# Trustdesk — RFP & security questionnaire assistant

Répond aux questionnaires de sécurité / RFP à partir de la documentation d'un éditeur SaaS fictif (**Vantrel**), en citant ses sources et en disant clairement quand l'information n'est pas documentée. Évalué sur un jeu de 50 questions avec un LLM-as-judge (Mistral ↔ Gemini).

- `knowledge-base/` — documentation fictive de Vantrel (12 documents)
- `eval/questions.jsonl` — jeu de test (réponses et sources attendues)
- `src/lib/rag/` — découpage, recherche (BM25, embeddings, fusion RRF)
- `scripts/` — évaluations en ligne de commande
- `docs/COMMENT_CA_MARCHE.md` — **explication complète du fonctionnement**

```bash
npm install
cp .env.example .env.local   # clés Mistral + Gemini
npm run eval:retrieval -- --verbose   # évalue la recherche (sans clé API)
```
