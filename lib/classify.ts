// Heuristic LSAT question-type classifier driven off the question stem (and, for
// a few rules, the stimulus). This is keyword/regex based — fast and offline —
// and is meant to be a strong first guess that you can override in the UI.
//
// Ordering matters: more specific rules must come before more general ones
// (e.g. "sufficient assumption" phrasing before generic "assumption").

export type QType = string;

type Rule = { type: QType; test: (stem: string, stimulus: string) => boolean };

const has = (s: string, ...subs: string[]) => subs.some((x) => s.includes(x));
const re = (pattern: RegExp) => (s: string) => pattern.test(s);

// "parallel reasoning" stems phrased as similarity-of-reasoning questions.
const isSimilarity = (s: string) =>
  has(
    s,
    "most similar",
    "similar to which",
    "similar in reasoning",
    "similar in form",
    "similar in structure",
    "similar reasoning",
    "is most similar",
    "arguments is similar",
    "is a similar argument",
    "a similar flawed",
    "similar flawed",
    "most closely matches",
    "closely matches",
    "closely resembles",
    "resembles the",
    "same pattern",
    "matches this",
    "matches the",
    "best matches this",
    "most like which",
    "is most like",
    "form is most like",
    "structurally identical",
    "similar in structure",
    "pattern of reasoning",
    "reasoning is most similar",
    "reasoning is similar",
    "reasoning most similar",
    "uses reasoning most similar",
    "uses similar reasoning",
    "employs similar reasoning",
    "exhibits reasoning",
    "exhibits a pattern",
    "exhibits similar",
    "reasoning pattern",
    "best reflects a similar pattern",
    "shows the same",
    "form matches",
    "matches which",
    "best expresses the form",
  );

// Canonical type list — also used to seed the drill home page so empty
// categories still show up.
export const ALL_TYPES: QType[] = [
  "Necessary Assumption",
  "Sufficient Assumption",
  "Strengthen",
  "Weaken",
  "Flaw",
  "Inference (Must Be True)",
  "Most Strongly Supported",
  "Principle (Identify)",
  "Principle (Apply)",
  "Method of Reasoning",
  "Role in Argument",
  "Main Conclusion",
  "Parallel Reasoning",
  "Parallel Flaw",
  "Point at Issue",
  "Resolve/Explain Paradox",
  "Evaluate the Argument",
  // Reading Comprehension sub-types
  "RC Main Point/Purpose",
  "RC Author's Attitude",
  "RC Inference",
  "RC Detail",
  "RC Function",
  "RC Strengthen/Weaken",
  "RC Meaning in Context",
  "Reading Comp",
  "Other",
];

// Reading-comp sub-classifier. Used when we already know a question belongs to a
// passage; returns a finer-grained RC type so RC is drillable by skill, not one
// 200-question lump. Falls back to "RC Inference", the modal RC type.
export function classifyRC(stem: string): QType {
  const s = (stem || "").toLowerCase();
  if (has(s, "primary purpose", "main point", "main idea", "primarily concerned", "central thesis", "best title", "best describes the passage", "organization of the passage"))
    return "RC Main Point/Purpose";
  if (has(s, "attitude", "tone", "author would most likely", "author's view", "author regards", "author's stance"))
    return "RC Author's Attitude";
  if (has(s, "in order to", "serves to", "function of", "purpose of the", "why the author", "author mentions", "reference to", "the author refers"))
    return "RC Function";
  if (has(s, "most nearly means", "as used in", "the word", "the phrase", "in context"))
    return "RC Meaning in Context";
  if (has(s, "strengthen", "weaken", "support for", "undermine", "most analogous", "most similar to"))
    return "RC Strengthen/Weaken";
  if (has(s, "according to the passage", "passage states", "passage indicates", "passage mentions", "the author states", "explicitly"))
    return "RC Detail";
  if (has(s, "infer", "suggests", "implies", "most likely", "would agree", "can be concluded", "the passage suggests"))
    return "RC Inference";
  return "RC Inference";
}

const RULES: Rule[] = [
  // --- Parallel (check before Flaw / Method) ---
  // Signature is "most similar to which one of the following" — the word
  // "parallel" rarely appears in stems.
  {
    type: "Parallel Flaw",
    test: (s) =>
      (isSimilarity(s) || has(s, "parallel")) &&
      has(s, "flaw", "flawed", "questionable", "vulnerable", "error in reasoning"),
  },
  {
    type: "Parallel Reasoning",
    test: (s) =>
      isSimilarity(s) ||
      (has(s, "parallel") && has(s, "reasoning", "pattern", "argument", "method")),
  },

  // --- Assumption family (sufficient before necessary/generic) ---
  {
    type: "Sufficient Assumption",
    test: (s) =>
      (has(s, "assumption", "assumed") &&
        has(
          s,
          "enables the conclusion",
          "conclusion to be properly drawn",
          "conclusion follows logically",
          "if assumed",
          "allows the conclusion",
          "sufficient to",
        )) ||
      re(/which one of the following.*assumed.*conclusion.*follows/)(s),
  },
  {
    type: "Necessary Assumption",
    test: (s) =>
      has(
        s,
        "assumption required",
        "required by the argument",
        "depends on the assumption",
        "depends on assuming",
        "relies on the assumption",
        "assumption on which the argument depends",
        "required assumption",
        "assumes which one",
        "is an assumption",
        "an assumption underlying",
        "assumption in the",
        "assumption in",
        "an assumption of the",
        "hidden assumption",
        "argument assumes",
      ) || (has(s, "assumption") && has(s, "required", "depends", "relies", "underlying")),
  },

  // --- Strengthen / Weaken ---
  {
    type: "Weaken",
    test: (s) =>
      has(
        s,
        "weaken",
        "calls into question",
        "call the",
        "into question",
        "casts doubt",
        "cast the most doubt",
        "cast doubt",
        "challenge",
        "undermine",
        "most damaging to",
        "argument against",
        "counts against",
      ),
  },
  {
    type: "Strengthen",
    test: (s) =>
      has(
        s,
        "strengthen",
        "most strengthens",
        "supports the argument",
        "support for the argument",
        "most justifies",
        "most helps to justify",
        "if true, most supports the",
      ),
  },

  // --- Evaluate ---
  {
    type: "Evaluate the Argument",
    test: (s) =>
      has(
        s,
        "would be most useful to evaluate",
        "most useful to know in evaluating",
        "most relevant to evaluating",
        "most helpful to know",
        "useful in evaluating",
      ),
  },

  // --- Flaw ---
  {
    type: "Flaw",
    test: (s) =>
      has(
        s,
        "vulnerable to criticism",
        "vulnerable to the criticism",
        "reasoning is flawed",
        "flaw in the",
        "questionable because",
        "error in reasoning",
        "criticized on the grounds",
        "reasoning is most vulnerable",
        "fails to consider",
        "is flawed because",
        "flawed because",
        "flawed in that",
        "most vulnerable",
        "a flaw in",
        "flaw in this",
        "describes a flaw",
        "describes the error",
        "identifies the flaw",
        "indicates a flaw",
        "best identifies the flaw",
        "commits which",
        "exemplifies which error",
        "which error",
        "what error does",
        "error in this reasoning",
        "error in the",
        "error is committed",
        "is the error",
        "characterizes a weakness",
        "weakness in the",
        "flaws is present",
        "flaw is present",
      ),
  },

  // --- Method / Role / Main point / Point at issue ---
  {
    type: "Role in Argument",
    test: (s) =>
      has(
        s,
        "plays which",
        "role played",
        "figures in the argument",
        "the statement that",
        "boldface",
        "function of the claim",
        "the assertion that",
      ) && has(s, "role", "function", "plays"),
  },
  {
    type: "Method of Reasoning",
    test: (s) =>
      has(
        s,
        "method of reasoning",
        "argumentative technique",
        "technique of reasoning",
        "proceeds by",
        "responds to",
        "argument proceeds",
        "does which one of the following",
        "counters the",
      ),
  },
  {
    type: "Main Conclusion",
    test: (s) =>
      has(
        s,
        "main conclusion",
        "main point of the argument",
        "main point of the",
        "overall conclusion",
        "conclusion of the argument is",
        "conclusion of the",
        "expresses the conclusion",
        "states the conclusion",
        "best expresses the conclusion",
        "conclusion is that",
        "which one of the following most accurately expresses the main",
      ) ||
      // "is the critic's conclusion" / "the sociologist's conclusion"
      re(/(is|states|expresses).{0,30}\bconclusion\b/)(s),
  },
  {
    type: "Point at Issue",
    test: (s) =>
      has(
        s,
        "point at issue",
        "disagree",
        "at issue between",
        "in disagreement",
        "committed to disagreeing",
        "agree that",
      ),
  },

  // --- Paradox ---
  {
    type: "Resolve/Explain Paradox",
    test: (s) =>
      has(
        s,
        "resolve the",
        "explain the",
        "discrepancy",
        "paradox",
        "apparent conflict",
        "most helps to explain",
        "reconcile",
        "puzzling",
      ),
  },

  // --- Principle ---
  {
    type: "Principle (Apply)",
    test: (s) =>
      has(s, "principle") &&
      has(s, "conforms", "judged by", "application of the principle", "illustrates", "if applied"),
  },
  {
    type: "Principle (Identify)",
    test: (s) => has(s, "principle", "proposition", "generalization"),
  },

  // --- Inference family ---
  {
    type: "Most Strongly Supported",
    test: (s) =>
      has(
        s,
        "most strongly supported",
        "statements above, if true, most strongly support",
        "provide the most support for",
        "most support for which",
        "argument suggests that",
        "statements suggest that",
      ),
  },
  {
    type: "Inference (Must Be True)",
    test: (s) =>
      has(
        s,
        "must be true",
        "must also be true",
        "properly inferred",
        "follows logically",
        "can be properly concluded",
        "logically follows",
        "if the statements above are true",
        "validly concluded",
        "logically concluded",
        "can be concluded",
        "can be validly",
      ),
  },
];

// Stems that come from a Reading Comprehension passage tend to reference "the
// passage" / "the author". Used as a fallback signal.
function looksLikeRC(stem: string, stimulus: string): boolean {
  if (has(stem, "the passage", "the author", "passage as a whole", "both passages")) return true;
  // Long stimulus with no obvious argument indicator → likely an RC passage.
  return stimulus.length > 900;
}

export function classify(stem: string, stimulus = ""): QType {
  const s = (stem || "").toLowerCase();
  const ctx = (stimulus || "").toLowerCase();
  for (const rule of RULES) {
    if (rule.test(s, ctx)) return rule.type;
  }
  if (looksLikeRC(s, ctx)) return "Reading Comp";
  return "Other";
}
