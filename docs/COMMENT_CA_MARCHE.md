# Comment ça marche — RFP Assistant

> Document vivant, mis à jour à chaque étape du projet. Objectif : pouvoir expliquer le projet en 2 minutes, puis tenir un deep dive technique de 45 minutes.

**État d'avancement**

- [x] Étape 1 — Corpus documentaire fictif (Vantrel)
- [x] Étape 2 — Jeu de test (50 questions)
- [x] Étape 3 — Découpage + recherche (BM25, embeddings, fusion RRF) — mesurée
- [x] Étape 4 — Clients Mistral / Gemini + génération de réponses sourcées
- [x] Étape 5 — LLM-as-judge, score global, matrice 2×2, itération de prompt
- [~] Étape 6 — App web Trustdesk (fonctionne en local) ; déploiement `trustdesk.tblabs.dev` + vitrine tblabs.dev à faire

**Commandes utiles**

| Commande | Rôle | Appels API ? |
|---|---|---|
| `npm run dev` | lance l'app sur http://localhost:3000 | oui (à chaque question) |
| `npm run eval:retrieval -- --mode bm25\|embedding\|hybrid` | évalue la recherche seule | non (cache) |
| `npm run ask -- "Do you support SCIM?" --generator gemini` | pose une question en ligne de commande | oui |
| `npm run eval -- --generator mistral --judge gemini [--prompt v2] [--k 8]` | évaluation complète, écrit `runs/<id>/` | oui |
| `npm run compare` / `-- --matrix v1` / `-- --diff <runA> <runB>` | compare les runs | non |
| `npm run index` | recalcule les embeddings des documents | oui |

---

## 1. Le pitch en 30 secondes

Les éditeurs SaaS B2B reçoivent en permanence des **questionnaires de sécurité et RFP** (« Chiffrez-vous les données au repos ? », « Où sont hébergées nos données ? », « Avez-vous un SOC 2 ? »). Remplir ces questionnaires prend des jours à des équipes Sales Engineering / Security.

Cet outil répond automatiquement à partir de la documentation interne de l'éditeur, avec deux règles non négociables :

1. **Chaque réponse cite ses sources** (document + section).
2. **Si l'information n'est pas dans la documentation, il le dit** au lieu d'inventer.

Et surtout : **on mesure** la qualité. Un jeu de test avec réponses attendues + un LLM juge permettent de noter chaque version du système et de comparer deux modèles (Mistral vs Gemini) objectivement.

> Phrase clé pour l'entretien : *« Le problème d'un assistant RFP n'est pas de générer du texte, c'est de générer du texte sur lequel un commercial peut engager l'entreprise. Une réponse fausse dans un questionnaire de sécurité peut devenir une obligation contractuelle. Donc la traçabilité et l'abstention comptent plus que l'éloquence. »*

---

## 2. Architecture générale

```
                       ┌──────────────────────────────┐
  knowledge-base/*.md  │  INGESTION (une fois)        │
  (doc de Vantrel) ──► │  découpage par section       │──► index (chunks + embeddings, JSON)
                       └──────────────────────────────┘
                                                      │
  question ──► RECHERCHE (embeddings Gemini ; BM25 et hybride en option) ─┘──► 5 meilleurs extraits
                         │
                         ▼
               LLM « répondeur » (Mistral ou Gemini), prompt versionné
               → JSON imposé {status, answer, citations[S1..S5], conflict}
                         │
                         ▼
               VALIDATION (code, pas LLM) : citations existantes ?
               réponse affirmative sans source valide → bloquée « Needs review »
                         │
                         ▼
                    réponse affichée

  ÉVALUATION : 50 questions ──► pipeline ──► métriques déterministes
                                          └─► LLM « juge » (l'autre modèle) ──► score global
```

**Choix de stack** : tout en TypeScript dans un seul projet Next.js (même stack que metarenastats : Next.js + Vercel + Supabase). Le code qui tourne dans l'app web est **exactement** celui qui est évalué par les scripts d'évaluation — pas de divergence entre « ce qu'on teste » et « ce qu'on déploie ».

**Pas de LangChain, pas de base vectorielle.** Le corpus fait 65 extraits (~5k tokens) ; une similarité cosinus en mémoire prend moins d'une milliseconde. Ajouter un framework ou une base vectorielle aurait ajouté de la complexité sans bénéfice, et rendu le système moins explicable.

---

## 3. Le corpus : Vantrel (étape 1)

**Vantrel** est un éditeur fictif (Lyon) d'un SaaS de planification financière, *Vantrel Plan*. Sa documentation (`knowledge-base/`, en anglais comme les vrais RFP) contient 12 documents typiques de ce qu'une équipe sécurité/juridique maintient :

| Document | Contenu |
|---|---|
| 01 Company overview | Entité, modèle SaaS only, plans, organisation sécurité |
| 02 Security whitepaper | Certifications, chiffrement, isolation, SDLC, RH, rétention |
| 03 Infrastructure & hosting | AWS, régions EU/US, réseau, logs |
| 04 Identity & access | SSO, MFA, SCIM, rôles, audit logs, accès employés |
| 05 DPA (summary) | RGPD, transferts, notification de violation, suppression |
| 06 Sub-processors | Liste des sous-traitants |
| 07 Business continuity | RPO/RTO, sauvegardes, tests PRA |
| 08 Incident response | Sévérités, communication, bug bounty |
| 09 SLA & support | Disponibilité, crédits, maintenance, temps de réponse |
| 10 Vulnerability management | Pentests, délais de correction |
| 11 AI features policy | Fonctions IA, non-utilisation des données pour l'entraînement |
| 12 Product FAQ | Navigateurs, API, intégrations, accessibilité |

**Pièges volontaires** (ce qui rend l'évaluation intéressante) :

- **Trous** : FedRAMP, HIPAA, assurance cyber, escrow… ne sont mentionnés nulle part.
- **Faux amis** : le document infra mentionne le *SOC 1 d'AWS* — un modèle paresseux répondra « oui, nous avons un SOC 1 ». La FAQ support donne des délais de *première réponse* et précise que ce ne sont pas des délais de résolution.
- **Une contradiction** : le livre blanc dit « données supprimées sous 90 jours après résiliation », le DPA dit « 30 jours de grâce + 30 jours » (≈ 60 jours). Dans la vraie vie, la documentation est toujours incohérente quelque part ; le bon comportement est de **signaler** l'incohérence en citant les deux sources, pas d'en choisir une au hasard.

---

## 4. Le jeu de test (étape 2)

Fichier : `eval/questions.jsonl` — une question par ligne :

```json
{"id":"q36","category":"unanswerable","answerable":"no",
 "question":"Is Vantrel Plan FedRAMP authorized?",
 "expected_answer":"Not in the documentation.","expected_sources":[]}
```

**50 questions, 9 catégories :**

| Catégorie | Nb | Ce qu'elle teste |
|---|---|---|
| direct | 15 | Question formulée avec les mots de la doc — le cas facile |
| paraphrase | 6 | « Vos ingénieurs voient-ils nos chiffres de budget ? » → la doc dit « employee access to customer data ». Teste la recherche **sémantique** (BM25 seul échoue souvent) |
| multi_doc | 5 | La réponse est répartie sur 2-3 documents |
| partial | 4 | La doc répond à moitié (bug bounty : existe, montant des primes inconnu) |
| negative | 5 | La réponse est « non », et c'est **écrit** (« SMS MFA is not supported »). À ne pas confondre avec « pas dans la doc » |
| unanswerable | 6 | Rien dans la doc → doit s'abstenir |
| trap | 5 | Rien dans la doc, mais un passage *ressemble* à une réponse (SOC 1 d'AWS) |
| conflict | 1 | Deux sources se contredisent → doit le signaler |
| french | 3 | Question en français sur une doc en anglais (cas réel : client français). Teste la recherche **multilingue** |

Répartition par réponse attendue : **33 oui / 5 partielles / 12 sans réponse (24 %)**.

**Pourquoi distinguer `negative` et `unanswerable` ?** C'est une erreur classique des systèmes RAG : « Supportez-vous le SMS MFA ? » → la bonne réponse est « Non (source : IAM doc) », pas « je ne sais pas ». Un système trop prudent qui s'abstient partout aurait un bon score d'abstention mais serait inutile. Le jeu de test pénalise les deux excès.

`expected_sources` référence `document#Section`, ce qui permet de mesurer la qualité de la **recherche** indépendamment de la génération (voir étape 3).

---

## 5. Découpage et recherche (étape 3)

### 5.1 Découpage (« chunking ») — `src/lib/rag/chunk.ts`

Chaque section `##` d'un document devient un **extrait** (chunk), identifié par `document#Section` (ex. `04-identity-access#User provisioning`). 65 extraits au total.

- **Découpage structurel plutôt qu'en fenêtres de N tokens.** Les sections de doc sont courtes et autonomes : une section = une idée = une citation lisible par un humain. Une fenêtre fixe de 512 tokens couperait des tableaux en deux et produirait des citations du type « chunk 37 ».
- **Le titre du document et de la section est ajouté au texte indexé.** Une section intitulée « Backups » ne dit pas de quel produit elle parle ; « Business Continuity — Backups » si. Technique connue sous le nom de *contextual chunk headers*.
- **Limite** : sur une vraie base (PDF de 80 pages, wiki Confluence), il faudrait un découpage hiérarchique avec recouvrement. Ici le corpus est propre, c'est un choix assumé.

### 5.2 BM25 — `src/lib/rag/bm25.ts`

BM25 est l'algorithme de recherche par mots-clés utilisé par Elasticsearch, Lucene, etc. Intuition :

- un mot **rare** dans le corpus (« SCIM ») pèse beaucoup plus qu'un mot **fréquent** (« data ») → c'est l'IDF ;
- répéter un mot 10 fois ne rend pas un texte 10× plus pertinent → saturation (paramètre `k1 = 1.2`) ;
- un long texte n'est pas avantagé juste parce qu'il contient plus de mots → normalisation par la longueur (`b = 0.75`).

Prétraitement : minuscules, suppression des accents, des mots vides (« the », « de »…) et racinisation légère (« encrypted », « encryption » → « encrypt »).

### 5.3 Mesurer la recherche sans LLM — `npm run eval:retrieval`

Avant de parler de LLM, on vérifie que **le bon extrait est retrouvé**. Si la recherche rate, le meilleur modèle du monde ne peut pas répondre — ou pire, il répond à partir du mauvais extrait.

- **hit@5** : un des extraits attendus est-il dans les 5 premiers ?
- **recall@5** : quelle part des extraits attendus est dans les 5 premiers ? (important pour les questions multi-documents)
- **MRR** (*Mean Reciprocal Rank*) : 1 si le bon extrait est en tête, 0,5 s'il est 2e, 0,33 s'il est 3e…

Ces métriques sont **gratuites, instantanées et déterministes** : on peut tester 50 variantes de découpage sans dépenser un appel API.

**Résultats BM25 seul (k = 5) :**

| Catégorie | n | hit@5 | recall@5 | MRR |
|---|---|---|---|---|
| direct | 15 | 100 % | 100 % | 0,87 |
| paraphrase | 6 | **67 %** | **58 %** | **0,30** |
| multi_doc | 5 | 100 % | 83 % | 0,80 |
| partial | 4 | 100 % | 100 % | 1,00 |
| negative | 5 | 100 % | 100 % | 0,90 |
| french | 2 | 100 % | 100 % | 0,67 |
| **Total** | 38 | **95 %** | **91 %** | **0,78** |

**Lecture :**

1. **BM25 est excellent quand la question reprend le vocabulaire de la doc** (100 % sur `direct`), ce qui est fréquent dans les questionnaires de sécurité, très normés.
2. **Il s'effondre sur les reformulations.** « *Can your engineers see our budget figures?* » ne partage aucun mot utile avec la section « *Vantrel employee access to customer data* ». C'est le problème du **décalage de vocabulaire**, que les embeddings résolvent.
3. Le français passe ici… grâce aux noms propres (« Microsoft Entra ID », « France »). Une question française sans nom propre échouerait.
4. **Un seuil sur le score BM25 ne permet pas de détecter les questions sans réponse.** Score du meilleur extrait : de 3,2 à 17,7 pour les questions avec réponse, de 0 à 7,9 pour celles sans réponse. Les deux plages se chevauchent : « *Do you use post-quantum cryptography?* » matche fortement la section Encryption sans y trouver de réponse. **Conclusion : la décision « la réponse est-elle dans la doc ? » doit être prise par le LLM, qui lit les extraits** ; le seuil de recherche ne servira qu'à filtrer les cas évidents (score nul).

### 5.4 Embeddings — `src/lib/rag/vectors.ts`, `npm run index`

Un **modèle d'embedding** transforme un texte en vecteur (une liste de ~1 000 nombres) de façon à ce que deux textes de **sens** proche aient des vecteurs proches — même sans aucun mot commun, même dans deux langues différentes. On mesure la proximité par la **similarité cosinus** (le cosinus de l'angle entre les deux vecteurs : 1 = même direction). Les vecteurs étant normalisés à une longueur de 1, c'est simplement un produit scalaire.

- Les 65 extraits sont vectorisés **une seule fois** (`npm run index`) et stockés dans `data/embeddings/<fournisseur>.json`, versionné. À l'exécution, seule la question est vectorisée (1 appel API).
- Chaque vecteur est accompagné du hash du texte de l'extrait : si la doc change sans qu'on relance l'indexation, l'app **refuse de démarrer** au lieu de chercher dans un index périmé.
- `mistral-embed` : 1 024 dimensions. `gemini-embedding-001` : 3 072 dimensions, réduites à **768** — le modèle est entraîné en *Matryoshka* (les premières dimensions portent l'essentiel de l'information), ce qui permet de tronquer en perdant peu. 4× moins de stockage.
- Gemini distingue `RETRIEVAL_QUERY` et `RETRIEVAL_DOCUMENT` : une question courte et une section de doc ne se « ressemblent » pas en surface, le modèle les projette de façon asymétrique pour mieux les apparier.

### 5.5 Fusion hybride (RRF) — `src/lib/rag/retrieve.ts`

*Reciprocal Rank Fusion* : on combine les classements BM25 et embeddings en n'utilisant que les **rangs** : score = Σ 1/(60 + rang). On ne peut pas additionner directement un score BM25 (0-20) et un cosinus (0-1), mais les rangs sont comparables.

### 5.6 Résultats : quelle recherche choisir ? (mesuré, k = 5)

| Méthode | hit@5 | recall@5 | MRR |
|---|---|---|---|
| BM25 seul | 95 % | 91 % | 0,78 |
| Embeddings Mistral | 97 % | 93 % | 0,94 |
| **Embeddings Gemini** | **100 %** | **99 %** | **0,96** |
| Hybride BM25 + Mistral | 100 % | 96 % | 0,91 |
| Hybride BM25 + Gemini | 100 % | 95 % | 0,90 |

**Ce qu'on en retire (et ce qu'on peut dire en entretien) :**

1. **Les embeddings règlent le problème des reformulations** : paraphrase passe de 67 % à 100 % (Gemini).
2. **Surprise : l'hybride fait moins bien que les embeddings Gemini seuls.** La « bonne pratique » hybride n'est pas universelle : ici BM25 pousse des extraits non pertinents dans le classement fusionné sur les questions reformulées. Les embeddings Gemini sont déjà excellents sur les termes exacts de ce corpus. **Choix retenu : embeddings Gemini seuls**, hybride disponible en option.
3. **Nuance honnête** : 38 questions, c'est petit. L'écart hybride/embeddings tient à 2-3 questions. Sur une vraie base pleine de références produits, de numéros de version ou de codes, BM25 reprendrait de l'intérêt — à re-mesurer.
4. **Le seuil de similarité ne sépare toujours pas les questions sans réponse** (cosinus du meilleur extrait : 0,65-0,80 avec réponse, 0,61-0,77 sans). « Post-quantum cryptography » est sémantiquement très proche de la section Encryption. **Confirmé : c'est au LLM de décider**, en lisant les extraits. D'où l'importance du prompt et de l'évaluation de l'abstention.
5. Le modèle d'embedding est **figé et indépendant** du modèle qui rédige : quand on compare Mistral et Gemini en rédaction, ils reçoivent exactement les mêmes extraits. Sinon on comparerait deux systèmes, pas deux modèles.

---

## 6. Génération des réponses (étape 4)

### 6.1 Les clients API — `src/lib/llm/`

Appels HTTP directs (`fetch`), sans SDK : ~60 lignes par fournisseur, tout est visible.

- **Interface commune** `ChatClient.chat({system, user, temperature, schema})` → `{text, usage, latencyMs, model}`. Changer de fournisseur = changer un paramètre (`--generator gemini`).
- **Retry avec backoff exponentiel** sur 429 (quota) et 5xx (surcharge) : 2 s, 4 s, 8 s… + un peu d'aléa (*jitter*, pour ne pas que des clients en échec réessaient tous en même temps). Si le serveur indique combien attendre (`Retry-After`, ou `retryDelay` chez Gemini), on respecte. Les erreurs 400/401 échouent immédiatement : réessayer ne changerait rien.
- **Throttle** : un espacement minimal entre appels, pour rester sous les quotas gratuits plutôt que d'enchaîner les 429.
- **Cache disque** (`.cache/llm/`, scripts uniquement) indexé par le hash de (modèle + requête complète). Relancer une évaluation est gratuit ; changer un réglage ne rappelle l'API que pour les requêtes réellement modifiées. Rend aussi les runs **reproductibles**.

### 6.2 Les modèles, et ce que les offres gratuites ont appris

| Rôle | Mistral | Gemini |
|---|---|---|
| Rédaction / juge | `ministral-14b-2512` | `gemini-3.5-flash-lite` |
| Embeddings | `mistral-embed` | `gemini-embedding-001` (retenu) |

Découvertes faites en testant (bons sujets d'entretien, ce sont de vrais problèmes de déploiement) :

- **Sur l'offre gratuite Mistral, `mistral-small` et `mistral-medium` ont un quota de 0 requête/minute** (visible dans l'en-tête `x-ratelimit-limit-req-minute: 0`). Seuls les *Ministral* (3B, 8B, 14B) sont utilisables. On a donc choisi le plus gros disponible, et mis en face un Gemini **de gamme comparable** (Flash-Lite plutôt que Flash, qui est plus gros et « réfléchit » avant de répondre — 279 tokens de raisonnement pour dire « pong »).
- **Les noms de version ne sont pas une garantie** : en demandant `gemini-3.5-flash`, l'API a répondu avec `gemini-3.6-flash`. Chaque run enregistre donc le modèle **réellement servi** (`served` dans `config.json`), pas seulement celui demandé.
- **Latence très variable sur le gratuit** : Gemini Flash-Lite répond entre 0,8 s et 10 s pour la même taille de requête (file d'attente partagée). Ministral 14B : ~1 s stable. À prendre en compte pour une démo publique.
- **Gouvernance des données** : sur les offres gratuites, les fournisseurs peuvent utiliser les requêtes pour améliorer leurs modèles. Acceptable ici (données fictives), **inacceptable** pour la vraie documentation d'un client — en production : offre payante avec engagement de non-entraînement, ou modèle auto-hébergé (les poids Ministral sont ouverts).

### 6.3 Le prompt et la sortie structurée — `src/lib/rag/answer.ts`

Le modèle reçoit les 5 extraits étiquetés `[S1]`…`[S5]` (titre du doc, version, section, contenu) et la question. Il doit renvoyer **un JSON imposé par un schéma** :

```json
{ "status": "answered | partial | not_found", "answer": "…", "citations": ["S2"], "conflict": false }
```

- **Sortie structurée (« structured output »)** : on transmet un JSON Schema à l'API ; le fournisseur **contraint le décodage** — à chaque token, seuls les tokens qui gardent le JSON valide sont autorisés. Plus de parsing de texte libre, plus de « Voici la réponse : ```json… ».
- **Étiquettes courtes** (S1, S2) plutôt que les identifiants longs : un petit modèle recopie fiablement « S3 », beaucoup moins « 04-identity-access#Vantrel employee access to customer data ». Le code retraduit ensuite.
- **Température 0** : on veut la réponse la plus probable, pas de créativité. (La température divise les scores des tokens avant le softmax : basse → distribution « pointue », le token le plus probable gagne presque toujours ; haute → distribution aplatie, plus de diversité.)
- **Le prompt est versionné** (`v1`, `v2`…) et chaque run enregistre la version : un changement de score est attribuable à un changement de prompt.

### 6.4 La validation après génération — on ne fait pas confiance au modèle

Le code (pas un LLM) vérifie la sortie :

- une citation qui ne correspond à aucun extrait fourni → **retirée** (citation inventée) ;
- une réponse `answered`/`partial` **sans aucune citation valide** → statut forcé à **`needs_review`** : l'outil n'affiche jamais une affirmation non sourcée comme fiable ;
- une réponse `not_found` avec des citations → citations retirées.

Pour `not_found`, l'interface affiche quand même les sections consultées (« Checked: … ») : le commercial voit ce qui a été cherché, et peut aller vérifier ou escalader à l'équipe sécurité.

> Principe à retenir : **le LLM propose, le code dispose.** Les garanties (toujours une source, jamais de citation inventée) sont assurées par du code déterministe, pas par une consigne dans un prompt.

---

## 7. Évaluation : LLM-as-judge (étape 5)

### 7.1 Deux types de métriques — `src/lib/eval/metrics.ts`

**Déterministes (calculées par le code, sans LLM)** — les « garde-fous » :

| Métrique | Définition | Pourquoi |
|---|---|---|
| **Hallucinations** | % des questions *sans réponse dans la doc* où l'outil a quand même répondu | Le pire défaut : une fausse affirmation dans un questionnaire |
| **Fausses abstentions** | % des questions *avec réponse* où l'outil a dit « pas dans la doc » | Le défaut inverse : un outil qui refuse tout est inutile |
| **Rappel des citations** | % des extraits attendus effectivement cités | Traçabilité |
| **Précision des citations** | % des citations qui font partie des extraits attendus | Borne basse (un autre extrait peut aussi être pertinent) |
| Contradiction détectée | la question q47 est-elle signalée `conflict` ? | |

**Sémantiques (LLM juge)** — ce que le code ne sait pas évaluer : « *99,95 % de disponibilité mensuelle* » et « *uptime de 99.95% par mois* » sont la même réponse.

### 7.2 Le juge — `src/lib/eval/judge.ts`

Le juge reçoit la question, **la réponse de référence** (écrite à la main), la réponse générée et **le texte des extraits cités**. Il note de 1 à 5 :

- **Exactitude** (correctness) : les faits correspondent-ils à la référence ? Répondre à une question non documentée = 1.
- **Fidélité** (faithfulness) : chaque affirmation est-elle dans les extraits cités ? Détecte l'hallucination *même quand la réponse se trouve être juste* (connaissances générales du modèle).
- **Complétude** : les points clés de la référence sont-ils couverts ?

Bonnes pratiques appliquées : **grille explicite** pour chaque note (sinon notes instables) ; **raisonnement écrit avant les notes** (le modèle conclut après avoir analysé, au lieu de justifier après coup) ; température 0 ; sortie JSON contrainte ; consigne explicite **contre le biais de longueur** (les LLM juges préfèrent les réponses longues).

**Score global /100** = moyenne sur les questions de : 50 % exactitude + 30 % fidélité + 20 % complétude (notes ramenées de [1;5] à [0;1]). L'exactitude pèse le plus ; la fidélité ensuite, parce qu'une réponse non sourcée est inutilisable dans un questionnaire même si elle est juste.

### 7.3 Pourquoi l'autre modèle juge, et la matrice 2×2

Un LLM tend à **mieux noter les textes qui lui ressemblent** (biais d'auto-préférence, documenté dans la littérature). D'où :

- le score « officiel » de chaque modèle est donné par **l'autre** modèle (Mistral jugé par Gemini, Gemini jugé par Mistral) ;
- on calcule aussi la **matrice complète** : chaque jeu de réponses (rédigé une seule fois, grâce au cache) est noté par les deux juges. Si un juge note son propre modèle plus haut que ne le fait l'autre juge, l'écart mesure le biais.

⏳ *Résultats de la matrice v1 : section 7.5 (complétée à la fin des runs).*

### 7.4 Le juge n'est pas infaillible : un exemple réel

Question piège q44 : « *What is your mean time to resolve P1 incidents?* » (la doc ne donne que des délais de **première réponse**, en précisant que ce ne sont pas des délais de résolution).

Ministral répond en statut `partial` : « *La doc donne des délais de première réponse (1 h / 4 h)… mais pas de MTTR.* » Le texte est honnête — mais le **statut** est faux : un commercial qui filtre sur « Answered/Partial » l'enverrait au client comme une réponse.

- La métrique déterministe le compte comme **hallucination** (statut ≠ not_found sur une question sans réponse).
- Le **juge Gemini lui donne 5/5/5** : il a lu le texte, jugé qu'il disait bien « pas de MTTR », et ignoré le statut.

**Leçon** : un LLM juge est **complaisant** sur les cas limites ; c'est pourquoi on garde des métriques déterministes à côté, et pourquoi on relit à la main un échantillon des notes du juge (« calibrer le juge »). Ni l'un ni l'autre ne suffit seul.

### 7.5 Itérer : du prompt v1 au prompt v2 (analyse d'erreurs)

Méthode : lire les réponses les moins bien notées du run v1, classer les erreurs, corriger **une cause à la fois**, re-mesurer.

| Erreur observée (v1) | Exemple | Cause | Correction |
|---|---|---|---|
| Markdown et « (S1) » dans le texte | `**AES-256**` | consigne de style absente | v2 : « plain text only, never write labels in the answer » |
| Statut `partial` sur une info voisine | q44 MTTR → délais de 1re réponse | définition de `partial` ambiguë | v2 : « ne substitue pas une info voisine → not_found » |
| `partial` par excès de prudence | « Hébergées en France ? » → oui, Paris, mais *partial* | idem | v2 : « ne rétrograde pas pour des nuances que tu ajoutes toi-même » |
| Condition mal appliquée | Datadog US « pour les clients US » lu comme « pour tous » | raisonnement | v2 : règle 5 « applique les conditions (plan, région) précisément » |
| « Non documenté » alors que ça l'est | q24 : accès bastion des employés | **recherche** : la bonne section n'était pas dans les 5 extraits | pas un problème de prompt → test séparé avec k = 8 |

⏳ *Résultats v1 → v2 → v2 k=8 : complétés à la fin des runs.*

---

## 8. L'application Trustdesk (étape 6)

Next.js 16 (App Router) + Tailwind, même stack que metarenastats. Design volontairement **sobre et « outil B2B »** (pas de chat, pas de dégradés, pas d'icône ✨) : un commercial doit pouvoir s'en servir sans se demander si c'est un gadget.

| Page | Contenu |
|---|---|
| `/` Questionnaire | Coller des questions (une par ligne) ou charger un questionnaire exemple → tableau qui se remplit ligne par ligne : réponse, statut coloré, sources dépliables (extrait + lien vers le document), sections consultées si non trouvé. Export CSV. |
| `/knowledge` | Les 12 documents, versions, propriétaires. Chaque section a une ancre : les citations y renvoient directement et la section est surlignée. |
| `/evaluation` (« Quality ») | Scores du réglage actuel, matrice modèle × juge, historique des runs ; détail par run avec, pour chaque question, réponse, référence, notes et raisonnement du juge. |

Choix techniques :

- **Une route API** `POST /api/answer` appelle exactement le même `answerQuestion()` que les scripts d'évaluation.
- **Questions traitées une par une** côté navigateur : les quotas gratuits l'imposent, et l'utilisateur voit le tableau se remplir au lieu d'attendre 1 minute devant un spinner.
- **Les clés API ne quittent jamais le serveur** (pas de préfixe `NEXT_PUBLIC_`).
- **Limitation de débit** (30 questions / 10 min par IP, plafond journalier) pour protéger le quota gratuit. Limite connue : compteur en mémoire, donc par instance serverless → version robuste dans Postgres (Supabase), prévue au déploiement.
- Pages documentation et évaluation **pré-rendues au build** (statiques) : elles lisent des fichiers du dépôt.

---

## 9. Questions probables en entretien (enrichi au fil du projet)

**« Pourquoi ne pas juste mettre toute la doc dans le prompt ? Les contextes font 128k tokens maintenant. »**
Ici ça tiendrait (~5k tokens). Mais : (1) coût et latence multipliés à chaque question, (2) en vraie entreprise la base documentaire fait des milliers de pages, (3) les modèles exploitent moins bien l'information au milieu d'un long contexte (« lost in the middle »), (4) la recherche donne une **liste explicite d'extraits candidats**, ce qui rend les citations vérifiables. Bonne réponse nuancée : *pour un petit corpus stable, le long contexte est une option légitime ; c'est un compromis à mesurer, et ce projet permet justement de le mesurer.*

**« Comment savez-vous que votre système est bon ? »**
Jeu de test avec réponses attendues, incluant des questions sans réponse, des pièges et une contradiction. Métriques déterministes (recherche, abstention, citations) + LLM juge pour la qualité sémantique. Chaque changement de réglage = un run comparé au précédent.

**« Pourquoi pas uniquement des embeddings ? C'est plus moderne. »**
Les embeddings sont mauvais sur les termes exacts et rares : acronymes (SCIM, RPO), numéros de version (TLS 1.2), noms de produits. Or un questionnaire de sécurité en est rempli. BM25 est exact sur ces termes, les embeddings sur le sens. L'hybride combine les deux, et les mesures de l'étape 3 montrent concrètement les faiblesses de chacun.

**« Comment choisir la taille des chunks ? »**
Trop petit : l'extrait perd son contexte (« 35 days » sans savoir de quoi). Trop grand : le vecteur d'embedding « moyenne » plusieurs idées et devient flou, et on envoie du bruit au LLM. Ici, le découpage suit la structure du document. En général, on le choisit **en mesurant** hit@k / recall@k sur un jeu de test — c'est précisément pour ça que l'évaluation de la recherche est séparée.

**« Comment empêchez-vous les hallucinations ? »**
On ne les « empêche » pas, on les **réduit et on les mesure** : (1) le modèle ne reçoit que des extraits de la doc et la consigne de n'utiliser qu'eux ; (2) statut `not_found` explicite, avec des exemples de pièges dans le prompt ; (3) validation par le code : pas de source valide → réponse bloquée ; (4) taux d'hallucination mesuré sur 12 questions sans réponse à chaque changement. Et (5) en production : un humain valide avant envoi — l'outil rédige des **brouillons**.

**« Pourquoi un LLM juge plutôt que des métriques classiques (BLEU, ROUGE, similarité) ? »**
Ces métriques comptent les mots en commun avec la référence. « Non, le SMS n'est pas supporté » et « Oui, le SMS est supporté » ont presque tous leurs mots en commun. Le juge évalue le sens. Mais il a ses biais (auto-préférence, longueur, complaisance) : d'où le juge croisé, la matrice 2×2, la grille explicite et les métriques déterministes en parallèle.

**« Qu'est-ce que la température ? »**
Le modèle produit un score (logit) pour chaque token possible ; le softmax les transforme en probabilités. La température divise les logits avant le softmax : T → 0, le token le plus probable est quasi toujours choisi (déterministe) ; T = 1, distribution d'origine ; T > 1, plus de diversité. Pour des réponses factuelles et pour un juge : 0.

**« Combien ça coûterait en production ? »**
Chaque run enregistre les tokens consommés. Une réponse ≈ 900 tokens en entrée (5 extraits + consigne) et 60-100 en sortie. Avec un modèle de cette gamme facturé quelques dixièmes de dollar par million de tokens, un questionnaire de 300 questions (~300 000 tokens) coûte quelques centimes. Le vrai coût est ailleurs : la maintenance de la documentation et la relecture humaine.

**« Que faudrait-il pour passer en production chez un vrai client ? »**
Connecteurs vers les vraies sources (Confluence, Drive, PDF) avec découpage adapté ; mise à jour incrémentale de l'index ; permissions (un commercial ne doit pas voir la doc interne RH) ; offre API sans entraînement sur les données, ou modèle auto-hébergé ; boucle de feedback (réponses corrigées par l'équipe sécurité réinjectées comme réponses de référence) ; journal d'audit de qui a envoyé quoi ; et le jeu de test lancé automatiquement à chaque modification (CI), comme des tests unitaires.

**« Pourquoi Ministral 14B et pas un plus gros modèle ? »**
Contrainte de l'offre gratuite (les autres modèles Mistral ont un quota nul) — mais c'est aussi un argument : pour une tâche **très contrainte** (lire 5 extraits, extraire, citer, ou s'abstenir), un petit modèle bien encadré par la recherche, le prompt et la validation suffit souvent. C'est exactement ce que l'évaluation permet de vérifier au lieu de le supposer.
