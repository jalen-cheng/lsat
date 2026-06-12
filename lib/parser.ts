// Parses the LawHub "Ctrl+A → paste" review-page dump into structured questions.
//
// A single page dump looks roughly like:
//
//   Skip to main content
//   ...nav chrome...
//   Find Text, Type Here
//   Section 1
//   14 of 25
//   <stimulus paragraph(s)>
//   14. <question stem, may wrap several lines>
//   A
//   <choice A text>
//   Incorrect
//   B
//   <choice B text>
//   Incorrect
//   ...
//   E
//   <choice E text>
//   Correct
//   662 Penn Street | Newtown PA 18940, USA | 1.800.336.3982
//   All content © 2026 ...
//
// We tolerate multiple questions concatenated into one paste, and minor chrome
// drift, by anchoring on the "N of M" position markers and the choice status
// lines ("Correct" / "Incorrect", with optional "(Selected)").

export type Choice = {
  letter: string;
  text: string;
  correct: boolean;
  selected: boolean;
};

export type ParsedQuestion = {
  section: number | null;
  position: number | null; // the "14" in "14 of 25"
  total: number | null; // the "25" in "14 of 25"
  qNumber: number | null; // the "14" in "14. <stem>"
  stimulus: string;
  stem: string;
  choices: Choice[];
  correctChoice: string | null;
  selectedChoice: string | null;
  wasWrong: boolean | null; // null when the dump shows no selection
};

const STATUS_RE = /^(Correct|Incorrect)(\s*\(Selected\))?\s*$/i;
const CHOICE_LETTER_RE = /^([A-E])\s*$/;
const POSITION_RE = /^(\d+)\s+of\s+(\d+)\s*$/i;
const SECTION_RE = /^Section\s+(\d+)\s*$/i;
const STEM_RE = /^(\d+)\.\s+(.*)$/;
const FOOTER_RE = /(Penn Street|All content ©|All rights reserved)/i;

// Chrome lines we always drop.
const NOISE = new Set(
  [
    "skip to main content",
    "lawhub home",
    "home",
    "explore",
    "lsat prep",
    "law school transparency",
    "learning library",
    "resource center",
    "marketplace",
    "library",
    "find text, type here",
  ].map((s) => s.toLowerCase()),
);

function cleanLines(raw: string): string[] {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !NOISE.has(l.toLowerCase()))
    .filter((l) => !/^\//.test(l)) // stray breadcrumb slashes
    .filter((l) => !FOOTER_RE.test(l));
}

// Split a flat line list into per-question segments, anchored on "N of M".
function segment(lines: string[]): { section: number | null; body: string[] }[] {
  const anchors: number[] = [];
  lines.forEach((l, i) => {
    if (POSITION_RE.test(l)) anchors.push(i);
  });
  if (anchors.length === 0) return [{ section: null, body: lines }];

  let currentSection: number | null = null;
  const segments: { section: number | null; body: string[] }[] = [];
  for (let a = 0; a < anchors.length; a++) {
    const start = anchors[a];
    const end = a + 1 < anchors.length ? anchors[a + 1] : lines.length;
    // Look just above the anchor for the nearest Section header.
    const lookFrom = a === 0 ? 0 : anchors[a - 1];
    for (let i = lookFrom; i < start; i++) {
      const m = lines[i].match(SECTION_RE);
      if (m) currentSection = Number(m[1]);
    }
    segments.push({ section: currentSection, body: lines.slice(start, end) });
  }
  return segments;
}

function parseSegment(section: number | null, body: string[]): ParsedQuestion | null {
  if (body.length === 0) return null;

  const posMatch = body[0].match(POSITION_RE);
  const position = posMatch ? Number(posMatch[1]) : null;
  const total = posMatch ? Number(posMatch[2]) : null;

  // Find the stem line: "14. ..." — the first line matching STEM_RE.
  let stemIdx = -1;
  for (let i = 1; i < body.length; i++) {
    if (STEM_RE.test(body[i])) {
      stemIdx = i;
      break;
    }
  }

  // Find the first choice-letter line.
  let firstChoiceIdx = -1;
  for (let i = (stemIdx >= 0 ? stemIdx : 1); i < body.length; i++) {
    if (CHOICE_LETTER_RE.test(body[i])) {
      firstChoiceIdx = i;
      break;
    }
  }
  if (firstChoiceIdx === -1) return null; // no answer choices → not a usable question

  // Stimulus = everything between the position line and the stem line.
  const stimEnd = stemIdx >= 0 ? stemIdx : firstChoiceIdx;
  const stimulus = body.slice(1, stimEnd).join("\n").trim();

  // Stem = from the stem line up to the first choice.
  let qNumber: number | null = null;
  let stem = "";
  if (stemIdx >= 0) {
    const m = body[stemIdx].match(STEM_RE)!;
    qNumber = Number(m[1]);
    const stemLines = [m[2], ...body.slice(stemIdx + 1, firstChoiceIdx)];
    stem = stemLines.join(" ").replace(/\s+/g, " ").trim();
  } else {
    stem = body.slice(1, firstChoiceIdx).join(" ").replace(/\s+/g, " ").trim();
  }

  // Walk the choices.
  const choices: Choice[] = [];
  let i = firstChoiceIdx;
  while (i < body.length) {
    const letterMatch = body[i].match(CHOICE_LETTER_RE);
    if (!letterMatch) {
      i++;
      continue;
    }
    const letter = letterMatch[1];
    const textParts: string[] = [];
    let correct = false;
    let selected = false;
    let j = i + 1;
    for (; j < body.length; j++) {
      const status = body[j].match(STATUS_RE);
      if (status) {
        correct = /^correct/i.test(status[1]);
        selected = /\(Selected\)/i.test(body[j]);
        break;
      }
      if (CHOICE_LETTER_RE.test(body[j])) break; // next choice without an explicit status
      textParts.push(body[j]);
    }
    choices.push({
      letter,
      text: textParts.join(" ").replace(/\s+/g, " ").trim(),
      correct,
      selected,
    });
    i = j + 1;
  }

  if (choices.length === 0) return null;

  const correctChoice = choices.find((c) => c.correct)?.letter ?? null;
  const selectedChoice = choices.find((c) => c.selected)?.letter ?? null;
  const wasWrong =
    selectedChoice === null ? null : selectedChoice !== correctChoice;

  return {
    section,
    position,
    total,
    qNumber,
    stimulus,
    stem,
    choices,
    correctChoice,
    selectedChoice,
    wasWrong,
  };
}

export function parseDump(raw: string): ParsedQuestion[] {
  const lines = cleanLines(raw);
  return segment(lines)
    .map((s) => parseSegment(s.section, s.body))
    .filter((q): q is ParsedQuestion => q !== null && q.choices.length >= 2);
}
