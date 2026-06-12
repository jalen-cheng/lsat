"use client";

import { useEffect, useState, useCallback } from "react";
import { ALL_TYPES } from "@/lib/classify";

type Choice = { letter: string; text: string; correct: boolean; selected: boolean };
type Parsed = {
  section: number | null;
  position: number | null;
  total: number | null;
  qNumber: number | null;
  stimulus: string;
  stem: string;
  choices: Choice[];
  correctChoice: string | null;
  selectedChoice: string | null;
  wasWrong: boolean | null;
  qtype: string;
};

type BankItem = {
  id: number;
  preptest: number | null;
  book: string | null;
  section: number | null;
  qNumber: number | null;
  stem: string;
  qtype: string;
  qtypeAuto: string;
  difficulty: number | null;
  estDifficulty: number;
  wasWrong: number | null;
};

const PTS = Array.from({ length: 159 - 101 + 1 }, (_, i) => 101 + i);

export default function Manage() {
  const [preptest, setPreptest] = useState(159);
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const parse = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const d = await r.json();
      setParsed(d.questions);
      if (!d.questions.length)
        setMsg({ kind: "err", text: "No questions detected. Paste a full Ctrl+A of a LawHub review page." });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!parsed?.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preptest, source: "wrong-bank", questions: parsed }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "import failed");
      setMsg({
        kind: "ok",
        text: `Saved to PrepTest ${preptest}: ${d.inserted} new, ${d.updated} updated.`,
      });
      setParsed(null);
      setRaw("");
      loadBank();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  // ---- existing bank ----
  const [bank, setBank] = useState<BankItem[]>([]);
  const [filterPt, setFilterPt] = useState<string>("");
  const loadBank = useCallback(() => {
    const q = filterPt ? `?preptest=${filterPt}` : "";
    fetch(`/api/questions${q}`)
      .then((r) => r.json())
      .then((d) => setBank(d.questions));
  }, [filterPt]);
  useEffect(() => {
    loadBank();
  }, [loadBank]);

  const updateType = async (id: number, qtype: string) => {
    await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qtype }),
    });
    setBank((b) => b.map((x) => (x.id === id ? { ...x, qtype } : x)));
  };
  const updateDiff = async (id: number, difficulty: number | null) => {
    await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ difficulty }),
    });
    setBank((b) => b.map((x) => (x.id === id ? { ...x, difficulty } : x)));
  };
  const remove = async (id: number) => {
    await fetch(`/api/questions/${id}`, { method: "DELETE" });
    setBank((b) => b.filter((x) => x.id !== id));
  };

  return (
    <div>
      <h1 className="page-title">Manage wrong questions</h1>
      <p className="page-sub">
        Pick the PrepTest, then paste a LawHub review page (Ctrl+A → paste).
        It’s parsed, auto-classified by question type, and right/wrong is read
        from the “Correct / Incorrect (Selected)” markers.
      </p>

      <div className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <label className="field">
            PrepTest
            <select value={preptest} onChange={(e) => setPreptest(Number(e.target.value))}>
              {PTS.map((p) => (
                <option key={p} value={p}>
                  PrepTest {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          placeholder="Paste the full page here (Ctrl+A on a LawHub review page, then Ctrl+V)…"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={parse} disabled={busy || !raw.trim()}>
            Parse &amp; preview
          </button>
          {parsed && parsed.length > 0 && (
            <button className="btn ghost" onClick={save} disabled={busy}>
              Save {parsed.length} to PrepTest {preptest}
            </button>
          )}
        </div>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </div>

      {parsed && parsed.length > 0 && (
        <div className="panel">
          <h3 style={{ marginTop: 0 }}>Preview — {parsed.length} question(s)</h3>
          {parsed.map((q, i) => (
            <div className="preview-card" key={i}>
              <div className="preview-head">
                <strong>
                  Q{q.qNumber ?? "?"}
                  {q.section != null ? ` · S${q.section}` : ""}
                </strong>
                {q.wasWrong === true && <span className="tag wrong">missed</span>}
                {q.wasWrong === false && <span className="tag right">got it right</span>}
                {q.wasWrong === null && <span className="tag">no answer marked</span>}
                <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <span>type</span>
                  <select
                    value={q.qtype}
                    onChange={(e) =>
                      setParsed((p) =>
                        p!.map((x, j) => (j === i ? { ...x, qtype: e.target.value } : x)),
                      )
                    }
                  >
                    {typeOptions(q.qtype)}
                  </select>
                </label>
              </div>
              <div className="stem-preview">{q.stem || <em className="muted">(no stem detected)</em>}</div>
              <div style={{ marginTop: 6 }}>
                {q.choices.map((c) => (
                  <div
                    key={c.letter}
                    className={`choice-mini ${c.correct ? "correct" : ""} ${
                      c.selected && !c.correct ? "selwrong" : ""
                    }`}
                  >
                    {c.letter}. {c.text}
                    {c.correct ? "  ✓" : ""}
                    {c.selected ? "  (you picked)" : ""}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Your bank ({bank.length})</h3>
          <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <span>filter PT</span>
            <select value={filterPt} onChange={(e) => setFilterPt(e.target.value)}>
              <option value="">all</option>
              {PTS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        {bank.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            Nothing banked yet.
          </p>
        ) : (
          <table className="bank-table">
            <thead>
              <tr>
                <th>PT</th>
                <th>Q</th>
                <th>Stem</th>
                <th>Type</th>
                <th>Diff</th>
                <th>Result</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bank.map((q) => (
                <tr key={q.id}>
                  <td>{q.book ? q.book : q.preptest}</td>
                  <td>
                    {q.section != null ? `${q.book ? "P" : "S"}${q.section}·` : ""}
                    {q.qNumber ?? "?"}
                  </td>
                  <td style={{ maxWidth: 420 }}>{q.stem.slice(0, 130)}{q.stem.length > 130 ? "…" : ""}</td>
                  <td>
                    <select value={q.qtype} onChange={(e) => updateType(q.id, e.target.value)}>
                      {typeOptions(q.qtype)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={q.difficulty ?? ""}
                      onChange={(e) =>
                        updateDiff(q.id, e.target.value === "" ? null : Number(e.target.value))
                      }
                      title={`estimated ${q.estDifficulty}`}
                    >
                      <option value="">~{q.estDifficulty}</option>
                      {[1, 2, 3, 4, 5].map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {q.wasWrong === 1 ? (
                      <span className="tag wrong">missed</span>
                    ) : q.wasWrong === 0 ? (
                      <span className="tag right">right</span>
                    ) : (
                      <span className="tag">—</span>
                    )}
                  </td>
                  <td>
                    <button className="btn danger small" onClick={() => remove(q.id)}>
                      delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function typeOptions(current: string) {
  const types = ALL_TYPES.includes(current) ? ALL_TYPES : [current, ...ALL_TYPES];
  return types.map((t) => (
    <option key={t} value={t}>
      {t}
    </option>
  ));
}
