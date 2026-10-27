/**
 * Questions d'exemple de l'app. Partagées entre l'interface (« Load sample questions »), le fichier Excel
 * téléchargeable (scripts/make-sample-questionnaire.ts) et les réponses de secours pré-calculées
 * (scripts/save-sample-answers.ts), utilisées quand aucun modèle ne répond.
 */
export const SAMPLE_QUESTIONS = [
  "Is customer data encrypted at rest? Which algorithm is used?",
  "Where is customer data hosted for European customers?",
  "Do you support SAML-based single sign-on with Okta?",
  "Can your support engineers access our financial data?",
  "What are your RPO and RTO?",
  "Is SMS-based two-factor authentication supported?",
  "Do you have a bug bounty program, and what are the reward amounts?",
  "Is Vantrel Plan FedRAMP authorized?",
  "Can you provide your SOC 1 report?",
  "How long after contract termination is our data deleted?",
  "Les données sont-elles hébergées en France ?",
];

/** Contenu du questionnaire Excel d'exemple : [domaine, question]. */
export const SAMPLE_SPREADSHEET: [string, string][] = [
  ["Data protection", "Is customer data encrypted at rest? Please specify the algorithm and key management."],
  ["Data protection", "Which TLS versions are supported for data in transit?"],
  ["Hosting", "Where is customer data hosted for European customers?"],
  ["Hosting", "Les données sont-elles hébergées en France ?"],
  ["Identity", "Do you support SAML-based single sign-on with Okta?"],
  ["Identity", "Is SMS-based two-factor authentication supported?"],
  ["Access control", "Can your support engineers access our financial data?"],
  ["Resilience", "What are your RPO and RTO?"],
  ["Compliance", "Can you provide your SOC 2 Type II report?"],
  ["Compliance", "Is Vantrel Plan FedRAMP authorized?"],
  ["Compliance", "Can you provide your SOC 1 report?"],
  ["Security testing", "Do you have a bug bounty program, and what are the reward amounts?"],
  ["Data lifecycle", "How long after contract termination is our data deleted?"],
  ["Third parties", "Please list your sub-processors."],
  ["Insurance", "What is the coverage amount of your cyber insurance policy?"],
];
