/**
 * Génère le questionnaire exemple téléchargeable dans l'app (public/samples/).
 * Mise en forme d'un vrai questionnaire client : bandeau titre, colonnes ID / domaine / question / réponse vide.
 * Usage : npx tsx scripts/make-sample-questionnaire.ts
 */
import writeExcelFile from "write-excel-file/node";

const Q: [string, string][] = [
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

const bold = { fontWeight: "bold" as const };
const head = (value: string) => ({ value, ...bold, backgroundColor: "#D9E1F2" });
const data = [
  [{ value: "Vendor Security Assessment — Northwind Retail Group", ...bold, fontSize: 14 }],
  [{ value: "Vendor: Vantrel SAS · Please complete the 'Vendor response' column and return by email." }],
  [],
  [head("ID"), head("Domain"), head("Question"), head("Vendor response"), head("Comments")],
  ...Q.map(([domain, q], i) => [
    { value: `SEC-${String(i + 1).padStart(2, "0")}` },
    { value: domain },
    { value: q, wrap: true },
    { value: "" },
    { value: "" },
  ]),
];

await writeExcelFile(data, {
  columns: [{ width: 9 }, { width: 18 }, { width: 70 }, { width: 50 }, { width: 25 }],
}).toFile("public/samples/vantrel-security-questionnaire.xlsx");
console.log(`${Q.length} questions → public/samples/vantrel-security-questionnaire.xlsx`);
