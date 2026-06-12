import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

// Single local SQLite file, kept beside the project in ./data.
// Nothing leaves the machine.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "lsat.db");

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      preptest      INTEGER,                  -- set for LawHub paste rows; NULL for book rows
      book          TEXT,                     -- set for book-sourced rows (e.g. "LR Practice"); NULL for paste rows
      section       INTEGER,
      q_number      INTEGER,
      position      INTEGER,
      total         INTEGER,
      stimulus      TEXT NOT NULL DEFAULT '',
      stem          TEXT NOT NULL DEFAULT '',
      choices       TEXT NOT NULL,            -- JSON: [{letter,text,correct,selected}]
      correct_choice TEXT,
      selected_choice TEXT,
      was_wrong     INTEGER,                  -- 1 = missed on the real test
      qtype         TEXT NOT NULL DEFAULT 'Other',
      qtype_auto    TEXT NOT NULL DEFAULT 'Other',
      difficulty    INTEGER,                  -- user override (nullable)
      est_difficulty INTEGER NOT NULL DEFAULT 3,
      source        TEXT NOT NULL DEFAULT 'wrong-bank',
      created_at    TEXT NOT NULL,
      UNIQUE (preptest, section, q_number)
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      correct     INTEGER NOT NULL,           -- 1/0 for this drill attempt
      created_at  TEXT NOT NULL,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(qtype);
    CREATE INDEX IF NOT EXISTS idx_attempts_q ON attempts(question_id);
  `);
  _db = d;
  return _db;
}

export type QuestionRow = {
  id: number;
  preptest: number | null;
  book: string | null;
  section: number | null;
  q_number: number | null;
  position: number | null;
  total: number | null;
  stimulus: string;
  stem: string;
  choices: string;
  correct_choice: string | null;
  selected_choice: string | null;
  was_wrong: number | null;
  qtype: string;
  qtype_auto: string;
  difficulty: number | null;
  est_difficulty: number;
  source: string;
  created_at: string;
};
