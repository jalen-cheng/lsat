import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ALL_TYPES } from "@/lib/classify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-type aggregates used to rank the drill home page by weakness.
//
// "Original accuracy" = how you did on the real test (was_wrong flag from the
// paste). "Drill accuracy" = your attempts inside this app. Priority sorts the
// weakest, most-practiced-worthy types first.
export async function GET() {
  const d = db();

  const rows = d
    .prepare(
      `
      SELECT
        q.qtype AS qtype,
        COUNT(*) AS total,
        SUM(CASE WHEN q.was_wrong = 1 THEN 1 ELSE 0 END) AS missed,
        SUM(CASE WHEN q.was_wrong = 0 THEN 1 ELSE 0 END) AS correct_first,
        (SELECT COUNT(*) FROM attempts a JOIN questions q2 ON a.question_id = q2.id WHERE q2.qtype = q.qtype) AS drill_total,
        (SELECT COUNT(*) FROM attempts a JOIN questions q2 ON a.question_id = q2.id WHERE q2.qtype = q.qtype AND a.correct = 1) AS drill_correct
      FROM questions q
      GROUP BY q.qtype
      `,
    )
    .all() as {
    qtype: string;
    total: number;
    missed: number;
    correct_first: number;
    drill_total: number;
    drill_correct: number;
  }[];

  const byType = new Map(rows.map((r) => [r.qtype, r]));

  // Seed canonical types so empty categories still render (with 0 counts).
  const types = new Set<string>([...ALL_TYPES, ...rows.map((r) => r.qtype)]);

  const stats = [...types].map((qtype) => {
    const r = byType.get(qtype);
    const total = r?.total ?? 0;
    const missed = r?.missed ?? 0;
    const known = (r?.missed ?? 0) + (r?.correct_first ?? 0); // questions with a known outcome
    const realAccuracy = known > 0 ? (known - missed) / known : null;
    const drillTotal = r?.drill_total ?? 0;
    const drillCorrect = r?.drill_correct ?? 0;
    const drillAccuracy = drillTotal > 0 ? drillCorrect / drillTotal : null;
    return {
      qtype,
      total,
      missed,
      realAccuracy,
      drillTotal,
      drillAccuracy,
    };
  });

  // Priority score: types you have data for and do worst on float to the top.
  // Empty types sink to the bottom. Lower accuracy + more questions = higher.
  const scored = stats.map((s) => {
    const acc = s.realAccuracy;
    let priority: number;
    if (s.total === 0) priority = -1; // nothing banked yet
    else if (acc === null) priority = 0.5 + Math.min(s.total, 20) / 1000;
    else priority = (1 - acc) * 10 + Math.min(s.total, 20) / 100;
    return { ...s, priority };
  });

  scored.sort((a, b) => b.priority - a.priority);

  return NextResponse.json({ stats: scored });
}
