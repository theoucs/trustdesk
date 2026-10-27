import type { AnswerStatus } from "@/lib/rag/answer";

const STYLES: Record<AnswerStatus, { label: string; className: string }> = {
  answered: { label: "Answered", className: "bg-ok-soft text-ok" },
  partial: { label: "Partial", className: "bg-warn-soft text-warn" },
  not_found: { label: "Not in documentation", className: "bg-none-soft text-none" },
  needs_review: { label: "Needs review", className: "bg-bad-soft text-bad" },
};

export function StatusBadge({ status, conflict }: { status: AnswerStatus; conflict?: boolean }) {
  const s = STYLES[status];
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${s.className}`}>
        {s.label}
      </span>
      {conflict && (
        <span className="inline-block whitespace-nowrap rounded bg-bad-soft px-1.5 py-0.5 text-[11px] font-medium text-bad">
          Conflicting sources
        </span>
      )}
    </span>
  );
}
