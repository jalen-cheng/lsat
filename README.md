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
