// Imports the original practice questions from the bundled study-guide EPUB into
// the local bank. Two reliable sources are imported:
//
//   • Chapter 4  (c012)  — 300 Logical Reasoning questions, answers in c013
//   • Chapter 8  (c018)  — 200 Reading Comprehension questions (20 passages ×
//                          10), answers in c019
//
// The Part-4 "Practice Exam" (c025) is intentionally skipped: its answer key
// (c026) is aggregated prose rather than a clean per-question key and does not
// align 1:1, so importing it would risk attaching wrong answers.
//
// Run:  node --experimental-strip-types scripts/import-epub.ts
// Idempotent: re-running deletes and replaces each book's rows.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { db } from "../lib/db.ts";
import { classifyLR, classifyRC } from "../lib/classify.ts";

// ----------------------------- html helpers -----------------------------
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  mdash: "—", ndash: "–", hellip: "…", eacute: "é",
};
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED[n] ?? m);
}
// Strip tags with NO substitution (so the drop-cap "<span>Q</span>uestion"
// rejoins as "Question"), then decode + collapse whitespace.
function stripInline(s: string): string {
  return decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
const BR = /<br\s*\/?>/i;
const CHOICE = /^\(([A-E])\)\s*(.*)$/s;

function paragraphs(segment: string): { text: string; raw: string }[] {
  const out: { text: string; raw: string }[] = [];
  for (const m of segment.matchAll(/<p\b[^>]*>(.*?)<\/p>/gis)) {
    const text = stripInline(m[1]);
    if (text) out.push({ text, raw: m[1] });
  }
  return out;
}

type Choice = { letter: string; text: string; correct: boolean; selected: boolean };
type Q = {
  book: string; section: number | null; qNumber: number | null;
  position: number | null; total: number | null;
  stimulus: string; stem: string; choices: Choice[];
  correctChoice: string | null; qtype: string;
};

// ----------------------------- LR (c012 / c013) -----------------------------
function parseLR(dir: string): Q[] {
  const html = fs.readFileSync(path.join(dir, "c012.xhtml"), "utf8");
  const body = html.slice(html.indexOf("<body"));

  // answer key: each "Question N: X" lives in its own <p>, separate from its
  // "Explanation:" paragraph — so parse per-paragraph and match the whole line.
  const answers = new Map<number, string>();
  const ansHtml = fs.readFileSync(path.join(dir, "c013.xhtml"), "utf8");
  for (const p of paragraphs(ansHtml.slice(ansHtml.indexOf("<body")))) {
    const m = p.text.match(/^Question\s+(\d+):\s*([A-E])\b/);
    if (m) answers.set(Number(m[1]), m[2]);
  }

  // locate each "Question N" marker
  const markers = [...body.matchAll(/<p\b[^>]*>\s*Question\s+(\d+)\s*<\/p>/gi)];
  const out: Q[] = [];
  for (let i = 0; i < markers.length; i++) {
    const n = Number(markers[i][1]);
    const start = markers[i].index! + markers[i][0].length;
    const end = i + 1 < markers.length ? markers[i + 1].index! : body.length;
    const segment = body.slice(start, end);
    const ps = paragraphs(segment);

    const firstChoiceIdx = ps.findIndex((p) => CHOICE.test(p.text));
    if (firstChoiceIdx <= 0) continue; // need at least a stem + choices

    const choices: Choice[] = [];
    for (const p of ps.slice(firstChoiceIdx)) {
      const cm = p.text.match(CHOICE);
      if (cm) choices.push({ letter: cm[1], text: cm[2].trim(), correct: false, selected: false });
    }
    if (choices.length < 2) continue;

    const stem = ps[firstChoiceIdx - 1].text;
    const stimulus = ps.slice(0, firstChoiceIdx - 1).map((p) => p.text).join("\n");
    const correct = answers.get(n) ?? null;
    if (correct) for (const c of choices) c.correct = c.letter === correct;

    out.push({
      book: "LR Practice (Ch.4)", section: null, qNumber: n,
      position: null, total: null, stimulus, stem, choices,
      correctChoice: correct, qtype: classifyLR(stem),
    });
  }
  return out;
}

// ----------------------------- RC (c018 / c019) -----------------------------
function parseRC(dir: string): Q[] {
  const html = fs.readFileSync(path.join(dir, "c018.xhtml"), "utf8");
  const body = html.slice(html.indexOf("<body"));
  const ansHtml = fs.readFileSync(path.join(dir, "c019.xhtml"), "utf8");

  // Answer key, keyed by passage number → array of letters (in order).
  const ansByPassage = new Map<number, string[]>();
  const ansMarkers = [...ansHtml.matchAll(/<p\b[^>]*>\s*Passage\s+(\d+)\s+Answers\s*:?\s*<\/p>/gi)];
  for (let i = 0; i < ansMarkers.length; i++) {
    const pno = Number(ansMarkers[i][1]);
    const start = ansMarkers[i].index! + ansMarkers[i][0].length;
    const end = i + 1 < ansMarkers.length ? ansMarkers[i + 1].index! : ansHtml.length;
    const olm = ansHtml.slice(start, end).match(/<ol\b[^>]*>(.*?)<\/ol>/is);
    const letters: string[] = [];
    if (olm) {
      for (const li of olm[1].matchAll(/<li\b[^>]*>(.*?)<\/li>/gis)) {
        const lm = stripInline(li[1]).match(/^\(([A-E])\)/);
        letters.push(lm ? lm[1] : "");
      }
    }
    ansByPassage.set(pno, letters);
  }

  // Passages: "Passage N (Type)" → passage text + an <ol> of questions.
  const pMarkers = [...body.matchAll(/<p\b[^>]*>\s*Passage\s+(\d+)\s*\(([^)]*)\)\s*<\/p>/gi)];
  let globalNo = 0;
  const out: Q[] = [];
  for (let i = 0; i < pMarkers.length; i++) {
    const pno = Number(pMarkers[i][1]);
    const start = pMarkers[i].index! + pMarkers[i][0].length;
    const end = i + 1 < pMarkers.length ? pMarkers[i + 1].index! : body.length;
    const seg = body.slice(start, end);

    const olStart = seg.search(/<ol\b/i);
    const passageHtml = olStart >= 0 ? seg.slice(0, olStart) : seg;
    // passage text = paragraphs that aren't the "Questions for Passage" header
    const passage = paragraphs(passageHtml)
      .filter((p) => !/^questions for passage/i.test(p.text))
      .map((p) => p.text)
      .join("\n");

    const olm = seg.match(/<ol\b[^>]*>(.*?)<\/ol>/is);
    if (!olm) continue;
    const lis = [...olm[1].matchAll(/<li\b[^>]*>(.*?)<\/li>/gis)];
    const letters = ansByPassage.get(pno) ?? [];

    lis.forEach((li, j) => {
      const parts = li[1].split(BR);
      const stem = stripInline(parts[0]);
      const choices: Choice[] = [];
      for (const part of parts.slice(1)) {
        const cm = stripInline(part).match(CHOICE);
        if (cm) choices.push({ letter: cm[1], text: cm[2].trim(), correct: false, selected: false });
      }
      if (choices.length < 2 || !stem) return;
      globalNo++;
      const correct = letters[j] || null;
      if (correct) for (const c of choices) c.correct = c.letter === correct;
      out.push({
        book: "RC Practice (Ch.8)", section: pno, qNumber: globalNo,
        position: j + 1, total: lis.length, stimulus: passage, stem, choices,
        correctChoice: correct, qtype: classifyRC(stem),
      });
    });
  }
  return out;
}

// ----------------------------- insert -----------------------------
function insertBook(label: string, questions: Q[]) {
  const d = db();
  const now = new Date().toISOString();
  d.prepare("DELETE FROM questions WHERE book = ?").run(label); // idempotent re-import
  const stmt = d.prepare(`
    INSERT INTO questions
      (preptest, book, section, q_number, position, total, stimulus, stem, choices,
       correct_choice, selected_choice, was_wrong, qtype, qtype_auto,
       difficulty, est_difficulty, source, created_at)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, 3, 'book', ?)
  `);
  d.prepare("BEGIN").run();
  try {
    for (const q of questions) {
      stmt.run(
        q.book, q.section, q.qNumber, q.position, q.total, q.stimulus, q.stem,
        JSON.stringify(q.choices), q.correctChoice, q.qtype, q.qtype, now,
      );
    }
    d.prepare("COMMIT").run();
  } catch (e) {
    d.prepare("ROLLBACK").run();
    throw e;
  }
}

// ----------------------------- main -----------------------------
function main() {
  const root = process.cwd();
  const epub = fs.readdirSync(root).find((f) => f.toLowerCase().endsWith(".epub"));
  if (!epub) {
    console.error("No .epub found in project root.");
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lsat-epub-"));
  execSync(`unzip -o -q ${JSON.stringify(path.join(root, epub))} -d ${JSON.stringify(tmp)}`);

  const lr = parseLR(tmp);
  const rc = parseRC(tmp);

  // sanity report
  const lrNoAns = lr.filter((q) => !q.correctChoice).length;
  const rcNoAns = rc.filter((q) => !q.correctChoice).length;
  console.log(`Source: ${epub}`);
  console.log(`LR parsed: ${lr.length}  (missing answer: ${lrNoAns})`);
  console.log(`RC parsed: ${rc.length}  (missing answer: ${rcNoAns})`);

  insertBook("LR Practice (Ch.4)", lr);
  insertBook("RC Practice (Ch.8)", rc);

  // type breakdown
  const breakdown = new Map<string, number>();
  for (const q of [...lr, ...rc]) breakdown.set(q.qtype, (breakdown.get(q.qtype) ?? 0) + 1);
  console.log("\nBy question type:");
  for (const [t, n] of [...breakdown.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${t}`);
  }
  console.log(`\nInserted ${lr.length + rc.length} questions into ./data/lsat.db`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
