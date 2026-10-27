# Comment ça marche — RFP Assistant

> Document vivant, mis à jour à chaque étape du projet. Objectif : pouvoir expliquer le projet en 2 minutes, puis tenir un deep dive technique de 45 minutes.

**État d'avancement**

- [x] Étape 1 — Corpus documentaire fictif (Vantrel)
- [x] Étape 2 — Jeu de test (50 questions)
- [~] Étape 3 — Découpage + recherche : BM25 ✅, embeddings + fusion en attente des clés API
- [ ] Étape 4 — Clients Mistral / Gemini + génération de réponses
- [ ] Étape 5 — LLM-as-judge + scores + comparaison
- [ ] Étape 6 — App web (`trustdesk.tblabs.dev`) + vitrine tblabs.dev

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
  question ──► RECHERCHE hybride (BM25 + embeddings) ─┘──► top-k extraits
                         │
                         ▼
               GARDE-FOU : pertinence trop faible ? ──oui──► "Not in documentation"
                         │ non                                (+ sections les plus proches)
                         ▼
               LLM « répondeur » (Mistral ou Gemini)
               → JSON {answer, status, citations[]}
                         │
                         ▼
               VALIDATION : citations réelles ? sinon rétrogradé + signalé
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

### 5.4 Prochaine étape : recherche hybride

- **Embeddings** : un modèle transforme chaque texte en vecteur (~1 000 nombres) tel que deux textes de **sens** proche ont des vecteurs proches, même sans mot commun, même dans deux langues différentes. Similarité mesurée par le cosinus de l'angle entre vecteurs.
- **Fusion RRF** (*Reciprocal Rank Fusion*, déjà codée dans `retrieve.ts`) : on combine les classements BM25 et embeddings en n'utilisant que les **rangs** (score = Σ 1/(60 + rang)). On ne peut pas additionner directement un score BM25 (0-20) et un cosinus (0-1), mais les rangs sont comparables.
- Hypothèse à vérifier : l'hybride garde les 100 % de BM25 sur `direct` et remonte `paraphrase` et `french`.

---

## 6. Questions probables en entretien (enrichi au fil du projet)

**« Pourquoi ne pas juste mettre toute la doc dans le prompt ? Les contextes font 128k tokens maintenant. »**
Ici ça tiendrait (~5k tokens). Mais : (1) coût et latence multipliés à chaque question, (2) en vraie entreprise la base documentaire fait des milliers de pages, (3) les modèles exploitent moins bien l'information au milieu d'un long contexte (« lost in the middle »), (4) la recherche donne une **liste explicite d'extraits candidats**, ce qui rend les citations vérifiables. Bonne réponse nuancée : *pour un petit corpus stable, le long contexte est une option légitime ; c'est un compromis à mesurer, et ce projet permet justement de le mesurer.*

**« Comment savez-vous que votre système est bon ? »**
Jeu de test avec réponses attendues, incluant des questions sans réponse, des pièges et une contradiction. Métriques déterministes (recherche, abstention, citations) + LLM juge pour la qualité sémantique. Chaque changement de réglage = un run comparé au précédent.

**« Pourquoi pas uniquement des embeddings ? C'est plus moderne. »**
Les embeddings sont mauvais sur les termes exacts et rares : acronymes (SCIM, RPO), numéros de version (TLS 1.2), noms de produits. Or un questionnaire de sécurité en est rempli. BM25 est exact sur ces termes, les embeddings sur le sens. L'hybride combine les deux, et les mesures de l'étape 3 montrent concrètement les faiblesses de chacun.

**« Comment choisir la taille des chunks ? »**
Trop petit : l'extrait perd son contexte (« 35 days » sans savoir de quoi). Trop grand : le vecteur d'embedding « moyenne » plusieurs idées et devient flou, et on envoie du bruit au LLM. Ici, le découpage suit la structure du document. En général, on le choisit **en mesurant** hit@k / recall@k sur un jeu de test — c'est précisément pour ça que l'évaluation de la recherche est séparée.

*(À compléter : température, sortie structurée, biais du juge, coût, passage en production…)*
