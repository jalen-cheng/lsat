// Loads the OCR'd real-PrepTest questions (scripts/out/*.json, produced by
// ocr_tests.py) into the local bank, classifying each with the app's own
// classifier. Per the request, this REPLACES the simulated book questions.
//
//   * source='preptest' rows are fully replaced on each run (idempotent).
//   * source='book' rows (the 500 simulations) are deleted.
//   * Logic-games questions were already excluded upstream by the OCR parser.
//
// Run: node --experimental-strip-types scripts/import-pdf.ts

import fs from "node:fs";
import path from "node:path";
import { db } from "../lib/db.ts";
import { classifyLR, classifyRC } from "../lib/classify.ts";
import { estimateDifficulty } from "../lib/difficulty.ts";
import { toNewPt } from "../lib/pt-map.ts";

type RawChoice = { letter: string; text: string };
type RawQ = {
  preptest: number;
  section: number;
  section_type: "LR" | "RC";
  qnum: number;
  stimulus: string;
  stem: string;
  choices: RawChoice[];
  correct: string | null;
};

const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "out");

function load(): RawQ[] {
  const files = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json"));
  const all: RawQ[] = [];
  for (const f of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(OUT_DIR, f), "utf8")) as RawQ[];
    all.push(...arr);
  }
  return all;
}

function main() {
  const d = db();
  const questions = load();
  if (questions.length === 0) {
    console.error(`No JSON found in ${OUT_DIR}. Run ocr_tests.py first.`);
    process.exit(1);
  }

  // section sizes (max qnum per preptest+section) for the difficulty estimate
  const sizes = new Map<string, number>();
  for (const q of questions) {
    const k = `${q.preptest}.${q.section}`;
    sizes.set(k, Math.max(sizes.get(k) ?? 0, q.qnum));
  }

  const now = new Date().toISOString();
  d.prepare("BEGIN").run();
  try {
    d.prepare("DELETE FROM questions WHERE source = 'preptest'").run();
    d.prepare("DELETE FROM questions WHERE source = 'book'").run(); // drop the 500 sims

    const stmt = d.prepare(`
      INSERT INTO questions
        (preptest, book, section, q_number, position, total, stimulus, stem, choices,
         correct_choice, selected_choice, was_wrong, qtype, qtype_auto,
         difficulty, est_difficulty, source, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, 'preptest', ?)
    `);

    let lr = 0, rc = 0, skipped = 0, dupes = 0;
    const byType = new Map<string, number>();
    const seen = new Set<string>();

    let converted = 0;
    for (const q of questions) {
      if (!q.correct) { skipped++; continue; } // not drillable without an answer
      const preptest = toNewPt(q.preptest); // old PrepTest → August-2024 number
      if (preptest !== q.preptest) converted++;
      const key = `${preptest}.${q.section}.${q.qnum}`;
      if (seen.has(key)) { dupes++; continue; } // OCR sometimes repeats a qnum
      seen.add(key);
      const total = sizes.get(`${q.preptest}.${q.section}`) ?? 25;
      const qtype = q.section_type === "RC" ? classifyRC(q.stem) : classifyLR(q.stem);
      const choices = q.choices.map((c) => ({
        letter: c.letter,
        text: c.text,
        correct: q.correct != null && c.letter === q.correct,
        selected: false,
      }));
      stmt.run(
        preptest,
        q.section,
        q.qnum,
        q.qnum,
        total,
        q.stimulus,
        q.stem,
        JSON.stringify(choices),
        q.correct,
        qtype,
        qtype,
        estimateDifficulty(q.qnum, total),
        now,
      );
      if (q.section_type === "RC") rc++; else lr++;
      byType.set(qtype, (byType.get(qtype) ?? 0) + 1);
    }
    d.prepare("COMMIT").run();

    const tests = new Set(questions.map((q) => q.preptest));
    console.log(`Imported ${lr + rc} real questions from ${tests.size} PrepTest(s): LR=${lr} RC=${rc} (skipped ${skipped} no-answer, ${dupes} duplicate qnums)`);
    console.log(`Relabeled ${converted} questions from old → August-2024 PrepTest numbers (101–127).`);
    console.log("\nBy type:");
    for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${t}`);
    }
  } catch (e) {
    d.prepare("ROLLBACK").run();
    throw e;
  }
}

main();
