import type { Metadata } from "next";
import { Questionnaire } from "@/components/questionnaire";

export const metadata: Metadata = { title: "Questionnaire" };

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Security questionnaire</h1>
        <p className="mt-1 text-muted">
          Import a security questionnaire or RFP spreadsheet, or paste the questions one per line. Each answer is drafted from
          Vantrel&apos;s approved documentation and links to its source. When the documentation does not cover a
          question, it is flagged instead of answered.
        </p>
      </div>
      <Questionnaire />
    </div>
  );
}
