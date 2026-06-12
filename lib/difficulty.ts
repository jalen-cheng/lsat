// LawHub's review dump does NOT expose per-question difficulty, so when it's
// unknown we approximate from the question's position in its section. On modern
// LSAT Logical Reasoning sections difficulty roughly rises into the late-middle
// and eases slightly at the very end; this gives a 1 (easy) – 5 (hard) proxy.
//
// This is ONLY a fallback for ordering drills. Any value you set by hand in the
// UI overrides it. Treat estimated difficulty as a rough sort key, not truth.

export function estimateDifficulty(
  position: number | null,
  total: number | null,
): number {
  if (!position || !total || total <= 1) return 3;
  const frac = (position - 1) / (total - 1); // 0..1 through the section
  // Peak hardness around 70% of the way through.
  const peak = 0.7;
  const dist = Math.abs(frac - peak);
  const score = 1 - dist / Math.max(peak, 1 - peak); // 1 at peak, →0 at the ends
  return Math.min(5, Math.max(1, Math.round(1 + score * 4)));
}
