import type { Metadata } from "next";
import { Questionnaire } from "@/components/questionnaire";

export const metadata: Metadata = { title: "Questionnaire" };

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-xl font-semibold tracking-tight">Security questionnaire</h1>
        <p className="mt-1 text-muted">
          Import a questionnaire or paste the questions, one per line. Answers are drafted from Vantrel&apos;s
          documentation and link to their source. If the documentation doesn&apos;t cover a question, it is flagged
          instead of answered.
        </p>
      </div>
      <Questionnaire />
    </div>
  );
}
