import { db } from "./db";
import { classify } from "./classify";
import { estimateDifficulty } from "./difficulty";
import type { ParsedQuestion } from "./parser";

export type ImportQuestion = ParsedQuestion & { qtype?: string };

export type ImportResult = { inserted: number; updated: number };

// Insert or update a batch of (already parsed, possibly hand-edited) questions
// for one preptest. Re-importing the same (preptest, section, q_number) updates
// in place so you can safely paste a section twice.
export function importQuestions(
  preptest: number,
  source: string,
  questions: ImportQuestion[],
): ImportResult {
  const d = db();
  const now = new Date().toISOString();

  const findStmt = d.prepare(
    `SELECT id FROM questions WHERE preptest = ? AND section IS ? AND q_number IS ?`,
  );
  const insertStmt = d.prepare(`
    INSERT INTO questions
      (preptest, section, q_number, position, total, stimulus, stem, choices,
       correct_choice, selected_choice, was_wrong, qtype, qtype_auto,
       difficulty, est_difficulty, source, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `);
  const updateStmt = d.prepare(`
    UPDATE questions SET
      position = ?, total = ?, stimulus = ?, stem = ?, choices = ?,
      correct_choice = ?, selected_choice = ?, was_wrong = ?,
      qtype = ?, qtype_auto = ?, est_difficulty = ?, source = ?
    WHERE id = ?
  `);

  let inserted = 0;
  let updated = 0;

  const run = d.prepare("BEGIN");
  run.run();
  try {
    for (const q of questions) {
      const auto = classify(q.stem, q.stimulus);
      const qtype = q.qtype || auto;
      const est = estimateDifficulty(q.position, q.total);
      const choicesJson = JSON.stringify(q.choices);
      const wasWrong = q.wasWrong === null ? null : q.wasWrong ? 1 : 0;

      const existing =
        q.qNumber != null
          ? (findStmt.get(preptest, q.section, q.qNumber) as { id: number } | undefined)
          : undefined;

      if (existing) {
        updateStmt.run(
          q.position,
          q.total,
          q.stimulus,
          q.stem,
          choicesJson,
          q.correctChoice,
          q.selectedChoice,
          wasWrong,
          qtype,
          auto,
          est,
          source,
          existing.id,
        );
        updated++;
      } else {
        insertStmt.run(
          preptest,
          q.section,
          q.qNumber,
          q.position,
          q.total,
          q.stimulus,
          q.stem,
          choicesJson,
          q.correctChoice,
          q.selectedChoice,
          wasWrong,
          qtype,
          auto,
          est,
          source,
          now,
        );
        inserted++;
      }
    }
    d.prepare("COMMIT").run();
  } catch (e) {
    d.prepare("ROLLBACK").run();
    throw e;
  }

  return { inserted, updated };
}
