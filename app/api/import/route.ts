import { NextRequest, NextResponse } from "next/server";
import { importQuestions, type ImportQuestion } from "@/lib/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    preptest?: number;
    source?: string;
    questions?: ImportQuestion[];
  };
  const preptest = Number(body.preptest);
  if (!preptest || !Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json(
      { error: "preptest and a non-empty questions array are required" },
      { status: 400 },
    );
  }
  try {
    const result = importQuestions(
      preptest,
      body.source || "wrong-bank",
      body.questions,
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
