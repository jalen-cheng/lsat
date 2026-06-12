import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record a drill attempt (whether you got it right in-app).
export async function POST(req: NextRequest) {
  const { question_id, correct } = (await req.json()) as {
    question_id?: number;
    correct?: boolean;
  };
  if (!question_id) {
    return NextResponse.json({ error: "question_id required" }, { status: 400 });
  }
  const d = db();
  d.prepare(
    "INSERT INTO attempts (question_id, correct, created_at) VALUES (?, ?, ?)",
  ).run(question_id, correct ? 1 : 0, new Date().toISOString());
  return NextResponse.json({ ok: true });
}
