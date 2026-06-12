"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stat = {
  qtype: string;
  total: number;
  missed: number;
  realAccuracy: number | null;
  drillTotal: number;
  drillAccuracy: number | null;
};

function accColor(acc: number | null): string {
  if (acc === null) return "#9aa7b4";
  if (acc >= 0.8) return "#2e7d32";
  if (acc >= 0.6) return "#c9a227";
  return "#c0392b";
}

export default function Home() {
  const [stats, setStats] = useState<Stat[] | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setStats(d.stats));
  }, []);

  if (!stats) return <p className="muted">Loading…</p>;

  const withData = stats.filter((s) => s.total > 0);
  const empty = stats.filter((s) => s.total === 0);

  return (
    <div>
      <h1 className="page-title">Drill by question type</h1>
      <p className="page-sub">
        Ranked weakest first, by your real-test accuracy. Click Start to pull 10
        random banked questions of that type, ordered easiest → hardest.
      </p>

      {withData.length === 0 && (
        <div className="panel">
          <p style={{ margin: 0 }}>
            Your bank is empty. Head to{" "}
            <Link href="/manage">Manage wrong questions</Link>, pick a PrepTest,
            and paste the questions you missed (Ctrl+A on a LawHub review page).
          </p>
        </div>
      )}

      <div className="type-list">
        {withData.map((s) => (
          <TypeRow key={s.qtype} s={s} />
        ))}
      </div>

      {empty.length > 0 && (
        <>
          <p className="legend">No questions banked yet for:</p>
          <div className="row">
            {empty.map((s) => (
              <span key={s.qtype} className="tag">
                {s.qtype}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TypeRow({ s }: { s: Stat }) {
  const acc = s.realAccuracy;
  const pct = acc === null ? 0 : Math.round(acc * 100);
  return (
    <div className="type-row">
      <div>
        <div className="type-name">{s.qtype}</div>
        <div className="type-meta">
          {s.missed} missed of {s.total} banked
          {s.drillTotal > 0 &&
            ` · drilled ${s.drillTotal}× (${Math.round((s.drillAccuracy ?? 0) * 100)}% in-app)`}
        </div>
      </div>
      <div>
        <div className="bar">
          <span
            style={{ width: `${pct}%`, background: accColor(acc) }}
          />
        </div>
      </div>
      <div className="acc-num" style={{ color: accColor(acc) }}>
        {acc === null ? "—" : `${pct}%`}
      </div>
      <Link
        className="btn"
        href={`/drill/${encodeURIComponent(s.qtype)}`}
        style={{ justifySelf: "end" }}
      >
        Start →
      </Link>
    </div>
  );
}
