import type { NextRequest } from "next/server";
import type { Provider } from "@/lib/llm";
import { draftAnswer } from "@/lib/server/pipeline";
import { checkRateLimit } from "@/lib/server/rate-limit";

const MAX_QUESTION_LENGTH = 600;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { question?: unknown; generator?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const generator: Provider = body?.generator === "gemini" ? "gemini" : "mistral";

  if (!question) return Response.json({ error: "Question is required." }, { status: 400 });
  if (question.length > MAX_QUESTION_LENGTH) {
    return Response.json({ error: `Questions are limited to ${MAX_QUESTION_LENGTH} characters.` }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = checkRateLimit(ip);
  if (!limit.ok) return Response.json({ error: limit.reason }, { status: 429 });

  try {
    return Response.json(await draftAnswer(question, generator));
  } catch (err) {
    console.error("[answer]", err);
    return Response.json(
      {
        error:
          "Both models are unavailable right now (free tier limits). The sample questions still work, or try again in a few hours.",
      },
      { status: 502 },
    );
  }
}
