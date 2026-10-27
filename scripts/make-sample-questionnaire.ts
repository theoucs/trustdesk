/**
 * Génère le questionnaire exemple téléchargeable dans l'app (public/samples/).
 * Mise en forme d'un vrai questionnaire client : bandeau titre, colonnes ID / domaine / question / réponse vide.
 * Usage : npx tsx scripts/make-sample-questionnaire.ts
 */
import writeExcelFile from "write-excel-file/node";
import { SAMPLE_SPREADSHEET } from "../src/lib/samples";

const Q = SAMPLE_SPREADSHEET;

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
