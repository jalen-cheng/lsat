// Old → August-2024-format ("new") PrepTest number conversion, per LSAC's
// official mapping.
//
// A new PrepTest (101+) is assembled from the 3 scored (non-logic-games)
// sections of ONE old test plus 1 experimental section borrowed from another.
// This table maps each old test to the NEW test whose *scored* content it
// supplies (the "3-section" source) — e.g. old PT 33 → new PT 109.
//
// Why PT-level and not section-level: the source PDFs are Kaplan "Released Test"
// books whose section order does NOT match LSAC's canonical numbering (e.g. the
// logic-games section appears last here but is section 1 in LSAC's numbering),
// so the table's per-section references (“PT33 S2”) can't be aligned to our
// detected section numbers. PT-level mapping is order-independent and therefore
// reliable: all of an old test's non-games sections move to the same new test.
export const OLD_TO_NEW_PT: Record<number, number> = {
  24: 101, 25: 102, 26: 103, 27: 104, 28: 106, 29: 107,
  33: 109, 34: 110, 35: 111, 36: 112, 37: 113, 38: 114, 39: 115,
  43: 116, 44: 117, 45: 118, 46: 119, 47: 120, 48: 121, 49: 122,
  53: 124, 54: 125, 55: 126, 56: 127,
};

// Old tests that contribute ONLY experimental sections in the August format.
// Their three sections scatter across three different new tests, and because of
// the section-order mismatch above we can't reliably say which is which — so we
// leave them labeled with their original PrepTest number (the questions are
// still real and drillable; experimental sections don't affect scoring anyway).
export const EXPERIMENTAL_ONLY = new Set([19, 20, 22, 30, 31, 32, 40, 41, 42, 50, 51, 52]);

// Old tests that predate the August-format conversion entirely (not reused).
export const NOT_CONVERTED = new Set([7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 21, 23]);

export function toNewPt(oldPt: number): number {
  return OLD_TO_NEW_PT[oldPt] ?? oldPt;
}
