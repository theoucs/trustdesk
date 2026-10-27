import { readSheet } from "read-excel-file/browser";
import writeExcelFile from "write-excel-file/browser";
import type { Answer } from "./rag/answer";

export type ImportResult = { questions: string[]; detail: string };

const HEADER = /question|requirement|exigence|control|item|description/i;
const MIN_LENGTH = 12;

/**
 * Real questionnaires are spreadsheets with a title block, an ID column, a domain column, empty response columns…
 * Find the column that holds the questions: a header that looks like "Question", otherwise the column with the most
 * question-like cells (long text, often ending with "?").
 */
function questionsFromRows(rows: string[][]): { questions: string[]; column?: string } {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = { col: -1, score: 0, headerRow: -1 };
  for (let c = 0; c < width; c++) {
    let score = 0;
    let headerRow = -1;
    rows.forEach((r, i) => {
      const v = (r[c] ?? "").trim();
      if (headerRow < 0 && v.length < 40 && HEADER.test(v)) headerRow = i;
      if (v.length >= MIN_LENGTH) score += v.endsWith("?") ? 2 : 1;
    });
    if (headerRow >= 0) score += 5;
    if (score > best.score) best = { col: c, score, headerRow };
  }
  if (best.col < 0) return { questions: [] };
  const seen = new Set<string>();
  const questions = rows
    .slice(best.headerRow + 1)
    .map((r) => (r[best.col] ?? "").replace(/\s+/g, " ").trim())
    .filter((q) => {
      if (q.length < MIN_LENGTH || seen.has(q)) return false;
      seen.add(q);
      return true;
    });
  return { questions, column: best.headerRow >= 0 ? rows[best.headerRow][best.col] : undefined };
}

/** Minimal CSV parser (quoted fields, escaped quotes, comma or semicolon separators as exported by Excel in France). */
function parseCsv(text: string): string[][] {
  const firstLine = text.split("\n")[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep || ch === "\n") {
      row.push(field);
      field = "";
      if (ch === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export async function importQuestionnaire(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const sheet = await readSheet(file);
    const rows = sheet.map((r) => r.map((c) => (c == null ? "" : String(c))));
    const { questions, column } = questionsFromRows(rows);
    return { questions, detail: column ? `column “${column}”` : "question column detected" };
  }
  if (name.endsWith(".csv")) {
    const { questions, column } = questionsFromRows(parseCsv(await file.text()));
    return { questions, detail: column ? `column “${column}”` : "question column detected" };
  }
  if (name.endsWith(".txt")) {
    const questions = (await file.text())
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= MIN_LENGTH);
    return { questions, detail: "one question per line" };
  }
  throw new Error("Unsupported file type. Use .xlsx, .csv or .txt.");
}

const STATUS_LABEL: Record<Answer["status"], string> = {
  answered: "Answered",
  partial: "Partial",
  not_found: "Not in documentation",
  needs_review: "Needs review",
};

/** The filled questionnaire, as a spreadsheet the sales engineer can review and send back. */
export async function exportQuestionnaire(rows: { question: string; answer?: Answer; error?: string }[]) {
  const header = ["#", "Question", "Draft answer", "Status", "Sources", "Notes"].map((value) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#E8EEF5",
  }));
  const data = [
    header,
    ...rows.map((r, i) => [
      { value: i + 1 },
      { value: r.question, wrap: true },
      { value: r.answer?.answer ?? r.error ?? "", wrap: true },
      { value: r.answer ? STATUS_LABEL[r.answer.status] + (r.answer.conflict ? " · conflicting sources" : "") : "" },
      { value: (r.answer?.citations ?? []).map((c) => `${c.docTitle} › ${c.section}`).join("\n"), wrap: true },
      { value: (r.answer?.warnings ?? []).join("\n"), wrap: true },
    ]),
  ];
  const blob = await writeExcelFile(data, {
    columns: [{ width: 5 }, { width: 50 }, { width: 70 }, { width: 22 }, { width: 45 }, { width: 30 }],
    stickyRowsCount: 1,
  }).toBlob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "vantrel-questionnaire-draft.xlsx" });
  a.click();
  URL.revokeObjectURL(url);
}
