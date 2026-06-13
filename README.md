# LSAT Drill — local wrong-question bank & trainer

A personal, **fully local** study tool. You paste questions you missed on
LawHub; it parses them, classifies them by question type, stores them in a
SQLite file on your machine, and drills you — prioritizing the types you're
weakest on. Nothing is sent anywhere; the database is a plain file at
`./data/lsat.db`.

> Scope note: this app does **not** scrape LawHub. Automated extraction of
> their content violates LawHub's Terms of Service, and the LSAT questions are
> LSAC's copyrighted material — keeping a copy local doesn't change that. The
> intended use is you manually copying the questions *you personally got wrong*
> for review, which is ordinary studying. You provide the input; the app just
> organizes and quizzes you.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Requires Node 22+ (uses the built-in `node:sqlite` — no native build step).

## Importing real PrepTests from the scanned PDFs

`Tests and Answers/` holds real LSAT PrepTest booklets (`N.pdf`, scanned
images) paired with Kaplan "Explained" answer books (`NA.pdf`, digital text).
The pipeline OCRs the booklets and pairs each question with the Kaplan answer:

```bash
pip3 install pymupdf pytesseract pillow pypdf   # one-time
brew install tesseract                          # OCR engine

python3 scripts/ocr_tests.py --all              # OCR + parse → scripts/out/*.json
node --experimental-strip-types scripts/import-pdf.ts   # classify + load into DB
```

How it works (`scripts/ocr_tests.py`):

- **Section types** are read from each section's directions ("brief statements"
  → LR, "set of conditions" → Analytical, "passage" → RC). **Analytical
  Reasoning (logic games) sections are skipped** — they're no longer on the LSAT.
- Each LR/RC page is rendered at 300 DPI and OCR'd **one column at a time**
  (LSAT is two-column) to preserve reading order.
- LR questions are split into **stimulus + question stem**; RC questions are
  grouped under their **passage** (detected via the `(5)(10)(15)` line markers,
  which only passages carry).
- Correct answers come from the Kaplan text (`N. (X)` per section).
- OCR text is cached under `scripts/ocr_cache/`, so re-parsing never re-OCRs.

`import-pdf.ts` classifies every question with the app's own classifier and
**replaces the simulated EPUB questions** with these real ones (`source='preptest'`).

### August-2024 PrepTest renumbering

On import, old PrepTest numbers are converted to the new August-2024-format
numbers (`lib/pt-map.ts`). A new PrepTest is the 3 scored sections of one old
test + 1 experimental section from another; this maps each old test to the new
test whose scored content it supplies (e.g. **PT 33 → PT 109**). Mapping is done
at the PrepTest level, not the section level, because the Kaplan source PDFs
don't preserve LSAC's canonical section order (logic games appears last here,
not in section 1). Consequences:

- **24 tests** (old PT 24–56 subset) → new **PT 101–127**.
- **13 tests** (PT 7–18, 21, 23) predate the format and keep their old numbers.
- **12 tests** (PT 19, 20, 22, 30–32, 40–42, 50–52) only donate *experimental*
  sections to new tests — their content scatters and can't be section-aligned
  reliably, so they keep their old numbers (the questions are still real and
  drillable; experimental sections don't affect scoring).

### Known limitations (OCR of scanned PDFs)

- **LR** extraction is essentially clean.
- **RC passage seams**: a passage's first sentence (before its first line
  marker) can occasionally cling to the previous question, or a trailing word
  from the previous passage can lead the next one. Stems, choices, and answers
  are correct; the passage *body* is intact, but the very edges can be rough.
- A small number of questions per test may be dropped if OCR garbles their
  choice markers; questions whose answer can't be matched are skipped (not
  imported), since they aren't drillable.

## Importing the bundled study-guide EPUB

If you have the practice-question EPUB in the project root, load its questions
into the bank in one shot:

```bash
node --experimental-strip-types scripts/import-epub.ts
```

This imports two sources with clean, per-question answer keys:

- **300 Logical Reasoning** questions (Chapter 4) — classified into LR types
- **200 Reading Comprehension** questions (Chapter 8, 20 passages × 10) —
  classified into RC sub-types

It is **idempotent** — re-running replaces those rows. Book questions have no
"you got it wrong" status (they're fresh practice), so they fill the drill pool
and the per-type counts but don't affect your real-test accuracy ranking; that
ranking still comes from the questions you paste into the Manage tab.

> The EPUB's Part-4 "Practice Exam" (~140 questions) is **deliberately not
> imported**: unlike the two chapters above, its answer key is aggregated prose
> that doesn't map 1:1 to questions, so importing it would risk attaching wrong
> answers. It's the natural candidate if you later want to add more.

## Workflow

1. **Manage wrong questions** tab → choose the PrepTest (101–159).
2. On a LawHub review page (the screen that shows a question with
   Correct/Incorrect markers), select all (Ctrl+A / Cmd+A) and copy.
3. Paste into the textarea → **Parse & preview**. It detects the stimulus,
   stem, choices, which answer is correct, which you picked, and guesses the
   question type. Fix the type in the dropdown if needed.
4. **Save** → it lands in your bank (re-saving the same question updates it).
5. **Drill** tab → types are ranked weakest-first by your real-test accuracy.
   Click **Start** to pull 10 random questions of that type, ordered
   easiest → hardest, in a LawHub-style interface.

## What's automatic vs. approximate

- **Right/wrong** is read exactly from the `Correct` / `Incorrect (Selected)`
  markers in the paste.
- **Question type** is auto-classified from the stem with keyword rules
  (`lib/classify.ts`) — a strong first guess you can override anywhere.
- **Difficulty** is *not* in LawHub's review dump, so it's estimated from the
  question's position in its section (`lib/difficulty.ts`). Override per
  question in the bank table; your value always wins for drill ordering.

## Layout

```
lib/parser.ts      Ctrl+A dump → structured questions
lib/classify.ts    stem → question type (heuristic)
lib/difficulty.ts  position → estimated 1–5 difficulty
lib/db.ts          node:sqlite schema + connection
lib/import.ts      upsert parsed questions
app/page.tsx           Drill home (types ranked by weakness)
app/manage/page.tsx    Paste / preview / bank management
app/drill/[type]/...   LawHub-style drill session
app/api/*              route handlers (preview, import, stats, drill, …)
```
