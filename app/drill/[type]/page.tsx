"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Choice = { letter: string; text: string; correct: boolean; selected: boolean };
type DrillQ = {
  id: number;
  preptest: number | null;
  book: string | null;
  section: number | null;
  qNumber: number | null;
  stimulus: string;
  stem: string;
  choices: Choice[];
  correctChoice: string | null;
  qtype: string;
  difficulty: number;
  estimated: boolean;
};

export default function Drill() {
  const params = useParams<{ type: string }>();
  const type = decodeURIComponent(params.type);
  const router = useRouter();

  const [questions, setQuestions] = useState<DrillQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  // per-question picked letter and whether the answer has been revealed
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetch(`/api/drill?type=${encodeURIComponent(type)}&n=10`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions));
  }, [type]);

  const q = questions?.[idx];

  const score = useMemo(() => {
    if (!questions) return { answered: 0, correct: 0 };
    let answered = 0;
    let correct = 0;
    for (const item of questions) {
      if (revealed[item.id]) {
        answered++;
        if (picked[item.id] === item.correctChoice) correct++;
      }
    }
    return { answered, correct };
  }, [questions, revealed, picked]);

  function choose(letter: string) {
    if (!q || revealed[q.id]) return;
    setPicked((p) => ({ ...p, [q.id]: letter }));
  }

  async function submit() {
    if (!q || picked[q.id] == null || revealed[q.id]) return;
    setRevealed((r) => ({ ...r, [q.id]: true }));
    const wasCorrect = picked[q.id] === q.correctChoice;
    fetch("/api/attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: q.id, correct: wasCorrect }),
    });
  }

  if (!questions) return <p className="muted">Loading…</p>;
  if (questions.length === 0)
    return (
      <div className="panel">
        <p>
          No questions banked for <strong>{type}</strong> yet.{" "}
          <Link href="/manage">Add some →</Link>
        </p>
      </div>
    );

  const isLast = idx === questions.length - 1;
  const allDone = score.answered === questions.length;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            {type}
          </h1>
          <div className="muted small">
            Drilling {questions.length} questions · score {score.correct}/{score.answered}
          </div>
        </div>
        <Link className="btn subtle" href="/">
          ← All types
        </Link>
      </div>

      <div className="lh-frame">
        <div className="lh-toolbar">
          <button className="btn subtle small" onClick={() => router.push("/")}>
            Next Section
          </button>
          <button
            className="btn subtle small"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            ← Back
          </button>
          <span className="spacer" />
          <span className="lh-counter">
            {idx + 1} of {questions.length}
          </span>
        </div>

        <div className="lh-section">
          <h2>
            {q!.book ? q!.book : `PrepTest ${q!.preptest}`}
            {q!.section != null
              ? ` · ${q!.book ? "Passage" : "Section"} ${q!.section}`
              : ""}
          </h2>
        </div>
        <div className="lh-progress">
          <span style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>

        <div className="lh-body">
          <div className="lh-stim">{q!.stimulus || <em className="muted">(no stimulus)</em>}</div>
          <div className="lh-ask">
            <p className="lh-qtext">
              {q!.qNumber ? `${q!.qNumber}. ` : ""}
              {q!.stem}
            </p>

            <div>
              {q!.choices.map((c) => {
                const isPicked = picked[q!.id] === c.letter;
                const show = revealed[q!.id];
                let cls = "choice";
                if (isPicked && !show) cls += " picked";
                if (show && c.letter === q!.correctChoice) cls += " reveal-correct";
                if (show && isPicked && c.letter !== q!.correctChoice) cls += " reveal-wrong";
                return (
                  <div key={c.letter} className={cls} onClick={() => choose(c.letter)}>
                    <div className="letter">{c.letter}</div>
                    <div className="text">{c.text}</div>
                    <div className="mark">
                      {show && c.letter === q!.correctChoice ? "✓" : ""}
                      {show && isPicked && c.letter !== q!.correctChoice ? "✗" : ""}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="lh-meta">
              <span className="tag">
                difficulty {q!.difficulty}
                {q!.estimated ? " (est.)" : ""}
              </span>
              {!revealed[q!.id] ? (
                <button className="btn" onClick={submit} disabled={picked[q!.id] == null}>
                  Submit answer
                </button>
              ) : (
                <>
                  <span className={picked[q!.id] === q!.correctChoice ? "tag right" : "tag wrong"}>
                    {picked[q!.id] === q!.correctChoice ? "Correct" : `You picked ${picked[q!.id]} · answer ${q!.correctChoice}`}
                  </span>
                  {!isLast && (
                    <button className="btn ghost" onClick={() => setIdx((i) => i + 1)}>
                      Next question →
                    </button>
                  )}
                </>
              )}
            </div>

            {allDone && (
              <div className="msg ok" style={{ marginTop: 18 }}>
                Set complete — {score.correct}/{questions.length} correct.{" "}
                <Link href="/">Back to types</Link> or{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.reload();
                  }}
                >
                  draw 10 fresh
                </a>
                .
              </div>
            )}
          </div>
        </div>

        <div className="pager">
          {questions.map((item, i) => (
            <button
              key={item.id}
              className={`pg ${i === idx ? "active" : ""} ${revealed[item.id] ? "answered" : ""}`}
              onClick={() => setIdx(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
