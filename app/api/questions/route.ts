import { NextRequest, NextResponse } from "next/server";
import { db, type QuestionRow } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function shape(r: QuestionRow) {
  return {
    id: r.id,
    preptest: r.preptest,
    book: r.book,
    section: r.section,
    qNumber: r.q_number,
    position: r.position,
    total: r.total,
    stimulus: r.stimulus,
    stem: r.stem,
    choices: JSON.parse(r.choices),
    correctChoice: r.correct_choice,
    selectedChoice: r.selected_choice,
    wasWrong: r.was_wrong,
    qtype: r.qtype,
    qtypeAuto: r.qtype_auto,
    difficulty: r.difficulty,
    estDifficulty: r.est_difficulty,
    source: r.source,
  };
}

// List banked questions, optionally filtered by type / preptest.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const preptest = url.searchParams.get("preptest");

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (type) {
    where.push("qtype = ?");
    params.push(type);
  }
  if (preptest) {
    where.push("preptest = ?");
    params.push(Number(preptest));
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db()
    .prepare(
      `SELECT * FROM questions ${clause} ORDER BY preptest DESC, section, q_number`,
    )
    .all(...params) as QuestionRow[];

  return NextResponse.json({ questions: rows.map(shape) });
}
