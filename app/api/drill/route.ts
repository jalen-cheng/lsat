import { NextRequest, NextResponse } from "next/server";
import { db, type QuestionRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pull up to N random questions of a type, then order them easiest → hardest
// (user difficulty override, else estimate). Default N = 10.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const n = Math.min(50, Math.max(1, Number(url.searchParams.get("n")) || 10));
  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  const d = db();
  const rows = d
    .prepare(
      `
      SELECT * FROM (
        SELECT * FROM questions WHERE qtype = ? ORDER BY RANDOM() LIMIT ?
      )
      ORDER BY COALESCE(difficulty, est_difficulty) ASC, q_number ASC
      `,
    )
    .all(type, n) as QuestionRow[];

  const questions = rows.map((r) => ({
    id: r.id,
    preptest: r.preptest,
    book: r.book,
    section: r.section,
    qNumber: r.q_number,
    stimulus: r.stimulus,
    stem: r.stem,
    choices: JSON.parse(r.choices),
    correctChoice: r.correct_choice,
    selectedChoice: r.selected_choice,
    qtype: r.qtype,
    difficulty: r.difficulty ?? r.est_difficulty,
    estimated: r.difficulty == null,
  }));

  return NextResponse.json({ questions });
}
