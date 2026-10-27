"use client";

import { useRef, useState } from "react";
import { chunkLabel, citationHref } from "@/lib/anchors";
import type { Answer, AnswerStatus } from "@/lib/rag/answer";
import { StatusBadge } from "./status-badge";

const SAMPLE = [
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
].join("\n");

const MAX_QUESTIONS = 20;

/** Excerpts are stored as markdown; show them as readable plain text. */
const plainText = (md: string) =>
  md
    .replace(/\*\*/g, "")
    .replace(/^\|?\s*-{3,}.*$/gm, "")
    .replace(/\|/g, "  ");

const MODELS = [
  { value: "mistral", label: "Mistral — Ministral 14B" },
  { value: "gemini", label: "Google — Gemini 3.5 Flash-Lite" },
] as const;

type Row = {
  question: string;
  state: "queued" | "running" | "done" | "error";
  answer?: Answer;
  error?: string;
};

export function Questionnaire() {
  const [input, setInput] = useState("");
  const [generator, setGenerator] = useState<"mistral" | "gemini">("mistral");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  }>();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  const questions = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function run() {
    const qs = questions.slice(0, MAX_QUESTIONS);
    cancelled.current = false;
    setRunning(true);
    setRows(qs.map((question) => ({ question, state: "queued" })));
    // Sequential on purpose: free-tier model APIs are rate-limited, and rows fill in one by one.
    for (let i = 0; i < qs.length && !cancelled.current; i++) {
      setRows((r) => r.map((row, j) => (j === i ? { ...row, state: "running" } : row)));
      try {
        const res = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: qs[i], generator }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRows((r) => r.map((row, j) => (j === i ? { ...row, state: "done", answer: data } : row)));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Request failed";
        setRows((r) => r.map((row, j) => (j === i ? { ...row, state: "error", error: message } : row)));
        if (message.toLowerCase().includes("limit")) break;
      }
    }
    setRunning(false);
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setNotice(undefined);
    try {
      // Loaded on demand: the spreadsheet libraries are only needed when someone imports or exports a file.
      const { importQuestionnaire } = await import("@/lib/questionnaire-file");
      const { questions: found, detail } = await importQuestionnaire(file);
      if (!found.length) throw new Error("No questions found in this file.");
      setInput(found.join("\n"));
      setRows([]);
      setNotice({
        kind: "ok",
        text: `Imported ${found.length} questions from ${file.name} (${detail}). Review them below, then draft.`,
      });
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof Error ? e.message : "Could not read this file.",
      });
    }
  }

  async function exportXlsx() {
    const { exportQuestionnaire } = await import("@/lib/questionnaire-file");
    await exportQuestionnaire(rows);
  }

  const counts = rows.reduce(
    (acc, r) => {
      if (r.answer) acc[r.answer.status]++;
      return acc;
    },
    { answered: 0, partial: 0, not_found: 0, needs_review: 0 } as Record<AnswerStatus, number>,
  );
  const done = rows.filter((r) => r.state === "done" || r.state === "error").length;

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <span className="text-[13px] font-medium">Questions</span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="rounded border border-border-strong px-2.5 py-1 hover:bg-surface-muted disabled:opacity-50"
              disabled={running}
            >
              Import file…
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                importFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => {
                setInput(SAMPLE);
                setNotice(undefined);
              }}
              className="text-accent hover:underline disabled:opacity-50"
              disabled={running}
            >
              Load sample questions
            </button>
          </div>
        </div>
        {notice && (
          <p
            className={`border-b border-border px-4 py-2 text-[13px] ${notice.kind === "ok" ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}
          >
            {notice.text}
          </p>
        )}
        <div
          className={`relative ${dragging ? "bg-accent-soft" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!running) importFile(e.dataTransfer.files?.[0]);
          }}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-2 grid place-items-center rounded border-2 border-dashed border-accent text-[13px] font-medium text-accent">
              Drop your questionnaire (.xlsx, .csv or .txt)
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"Do you encrypt customer data at rest?\nWhere is customer data hosted?\n…"}
            rows={8}
            className="block w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-6 outline-none placeholder:text-muted/60"
            disabled={running}
          />
        </div>
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Paste questions, drop an Excel/CSV questionnaire on this box, or{" "}
          <a href="/samples/vantrel-security-questionnaire.xlsx" download className="text-accent hover:underline">
            download a sample questionnaire (.xlsx)
          </a>{" "}
          to try the import.
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Drafting model
            <select
              value={generator}
              onChange={(e) => setGenerator(e.target.value as "mistral" | "gemini")}
              className="rounded border border-border-strong bg-surface px-2 py-1 text-text"
              disabled={running}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-muted">
            {questions.length} question{questions.length === 1 ? "" : "s"}
            {questions.length > MAX_QUESTIONS && ` — only the first ${MAX_QUESTIONS} will be processed in this demo`}
          </span>
          <div className="ml-auto flex gap-2">
            {running && (
              <button
                type="button"
                onClick={() => (cancelled.current = true)}
                className="rounded border border-border-strong px-3 py-1.5 text-[13px] hover:bg-surface-muted"
              >
                Stop
              </button>
            )}
            <button
              type="button"
              onClick={run}
              disabled={running || questions.length === 0}
              className="rounded bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {running ? `Drafting ${done + 1} of ${rows.length}…` : "Draft answers"}
            </button>
          </div>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="rounded-md border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2.5 text-[13px]">
            <span className="font-medium">
              {done} / {rows.length} drafted
            </span>
            <span className="text-ok">{counts.answered} answered</span>
            <span className="text-warn">{counts.partial} partial</span>
            <span className="text-none">{counts.not_found} not in documentation</span>
            {counts.needs_review > 0 && <span className="text-bad">{counts.needs_review} need review</span>}
            <button
              type="button"
              onClick={exportXlsx}
              disabled={running}
              className="ml-auto text-accent hover:underline disabled:opacity-50"
            >
              Export to Excel
            </button>
          </div>
          <ol className="divide-y divide-border">
            {rows.map((row, i) => (
              <AnswerRow key={i} index={i + 1} row={row} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function AnswerRow({ index, row }: { index: number; row: Row }) {
  const a = row.answer;
  return (
    <li className="grid gap-x-6 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex gap-3">
        <span className="w-5 shrink-0 pt-px text-right font-mono text-xs text-muted">{index}</span>
        <p className="font-medium">{row.question}</p>
      </div>
      <div className="space-y-2 pl-8 md:pl-0">
        {row.state === "queued" && <p className="text-muted">Queued</p>}
        {row.state === "running" && <p className="animate-pulse text-muted">Searching documentation…</p>}
        {row.state === "error" && <p className="text-bad">{row.error}</p>}
        {a && (
          <>
            <StatusBadge status={a.status} conflict={a.conflict} />
            {a.answer && <p className="whitespace-pre-line">{a.answer}</p>}
            {a.citations.length > 0 && (
              <ul className="space-y-1">
                {a.citations.map((c) => (
                  <li key={c.id}>
                    <details className="group text-[13px]">
                      <summary className="cursor-pointer list-none text-accent">
                        <span className="mr-1 text-muted group-open:hidden">▸</span>
                        <span className="mr-1 hidden text-muted group-open:inline">▾</span>
                        {c.docTitle} › {c.section}
                      </summary>
                      <div className="mt-1.5 rounded border border-border bg-surface-muted px-3 py-2 text-[13px] text-muted">
                        <p className="line-clamp-6 whitespace-pre-line">{plainText(c.excerpt)}</p>
                        <a
                          className="mt-1 inline-block text-accent hover:underline"
                          href={citationHref(c.id)}
                          target="_blank"
                        >
                          Open in knowledge base ↗
                        </a>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
            {a.status === "not_found" && (
              <p className="text-xs text-muted">
                Checked:{" "}
                {a.consulted
                  .slice(0, 3)
                  .map((c) => chunkLabel(c.id))
                  .join(" · ")}
              </p>
            )}
            {a.warnings.length > 0 && <p className="text-xs text-bad">{a.warnings.join(" · ")}</p>}
          </>
        )}
      </div>
    </li>
  );
}
