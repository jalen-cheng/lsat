// Heuristic LSAT question-type classifier.
//
// The taxonomy and the detection keywords below come from two question-type
// guides: the LR types (21) are ordered roughly by frequency, and the RC types
// (19) follow the RC "cheat sheet" tag set. Each rule keys off the common
// question stems the guides list for that type. This is keyword/regex based —
// fast and offline — meant as a strong first guess you can override in the UI.
//
// Ordering matters: more specific rules come before more general ones (e.g.
// "flawed parallel" before "parallel" before "flaw"; "must be false" before
// "must be true"; "sufficient assumption" before "necessary assumption").

export type QType = string;

// ----------------------------- canonical types -----------------------------
export const LR_TYPES: QType[] = [
  "Flawed Reasoning",
  "Weaken",
  "Strengthen",
  "Complete the Argument",
  "Must Be True",
  "Most Strongly Supported",
  "Necessary Assumption",
  "Sufficient Assumption",
  "Principle (Justify)",
  "Principle (Application)",
  "Parallel Reasoning",
  "Flawed Parallel Reasoning",
  "Role in Argument",
  "Identify the Conclusion",
  "Method of Reasoning",
  "Point at Issue",
  "Paradox",
  "Misinterpretation",
  "Argument Evaluation",
  "Must Be False",
  "Agreement",
];

export const RC_TYPES: QType[] = [
  "RC Main Point",
  "RC Purpose of Passage",
  "RC Purpose of Paragraph",
  "RC Purpose in Context",
  "RC Meaning in Context",
  "RC Describe Organization",
  "RC Describe Approach",
  "RC Describe Relationship",
  "RC Stated",
  "RC Implied",
  "RC Author's Attitude",
  "RC Author's Perspective",
  "RC Other's Perspective",
  "RC Analogy",
  "RC Application",
  "RC Logical Continuation",
  "RC Principle/Generalization",
  "RC Weaken/Strengthen/Evaluate",
  "RC Except",
];

export const ALL_TYPES: QType[] = [...LR_TYPES, ...RC_TYPES, "Other"];

// ----------------------------- helpers -----------------------------
const has = (s: string, ...subs: string[]) => subs.some((x) => s.includes(x));
const re = (pattern: RegExp) => (s: string) => pattern.test(s);

// "Parallel" stems are phrased as similarity-of-reasoning questions; the literal
// word "parallel" is only sometimes present.
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
    "matches which",
    "form matches",
    "best matches this",
    "most like which",
    "is most like",
    "form is most like",
    "most closely parallel",
    "closely parallel",
    "most parallel",
    "parallel to",
    "parallels",
    "parallel to which",
    "is parallel",
    "matches the",
    "a similar error",
    "similar error",
    "structurally identical",
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
    "best expresses the form",
  );

const isFlawWord = (s: string) =>
  has(
    s,
    "flaw",
    "flawed",
    "vulnerable to criticism",
    "vulnerable to the criticism",
    "most vulnerable",
    "questionable",
    "error in reasoning",
    "error in the",
    "which error",
    "what error",
    "is the error",
    "error of reasoning",
    "commits",
    "errors",
    "misleading",
    "describes a flaw",
    "describes the error",
    "identifies the flaw",
    "indicates a flaw",
    "weakness in the",
    "criticized on the grounds",
    "fails to consider",
  );

// ----------------------------- LR rules -----------------------------
type Rule = { type: QType; test: (s: string) => boolean };

const LR_RULES: Rule[] = [
  // Misinterpretation — two speakers, one misreads the other.
  {
    type: "Misinterpretation",
    test: (s) =>
      has(s, "misinterpret", "misunderstand", "misconstrue", "interprets the word", "is misinterpreting") ||
      has(s, "interprets", "interpreted", "statement to imply", "statement to mean", "took the statement to"),
  },

  // Agreement vs Point at Issue — both involve two speakers.
  {
    type: "Agreement",
    test: (s) => has(s, "agree") && !has(s, "disagree") && has(s, "with each other", "both", "committed to"),
  },
  {
    type: "Point at Issue",
    test: (s) =>
      has(s, "disagree", "point at issue", "at issue between", "in disagreement", "committed to disagreeing", "issue between"),
  },

  // Parallel (must precede Flaw / Method).
  {
    type: "Flawed Parallel Reasoning",
    test: (s) => isSimilarity(s) && isFlawWord(s),
  },
  { type: "Parallel Reasoning", test: (s) => isSimilarity(s) },

  // Must Be False (before Must Be True).
  {
    type: "Must Be False",
    test: (s) => has(s, "cannot be true", "must be false", "cannot be true if", "least compatible", "could be true except", "could be true, except"),
  },

  // Sufficient Assumption (before Necessary).
  {
    type: "Sufficient Assumption",
    test: (s) =>
      has(
        s,
        "follows logically if",
        "conclusion ... follows logically if",
        "conclusion above follows logically if",
        "drawn above follows logically if",
        "properly drawn if",
        "can be properly drawn if",
        "follows logically if which one of the following is assumed",
        "if which one of the following is assumed",
        "assumption enables the conclusion",
        "enables the conclusion to be properly drawn",
        "allows the conclusion to be properly drawn",
      ) ||
      re(/conclusion.{0,40}(follows logically|properly drawn|properly inferred).{0,30}assum/)(s) ||
      re(/follows logically.{0,30}assumed/)(s) ||
      re(/(if assumed|enables|allows).{0,30}conclusion to be properly drawn/)(s) ||
      re(/conclusion to be (properly )?drawn.{0,20}if/)(s),
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
        "relies on assuming",
        "argument relies on assuming",
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
        "assumption the",
        "describes an assumption",
        "is assumed by",
        "assumed by the argument",
      ) || (has(s, "assumption") && has(s, "required", "depends", "relies", "underlying", "makes")),
  },

  // Principle (before Weaken/Strengthen, whose "justify" keywords overlap).
  // Application before Justify.
  {
    type: "Principle (Application)",
    test: (s) =>
      has(s, "principle") &&
      has(s, "justifies the reasoning in which", "most justifies the above application", "conforms", "illustrates", "if applied", "application", "most helps to justify the reasoning in which"),
  },
  {
    type: "Principle (Justify)",
    test: (s) =>
      (has(s, "principle") &&
        has(s, "if valid, most helps to justify", "most helps to justify the argument", "justify the argument", "if valid, most justifies the", "helps to justify the reasoning", "underlying", "underlies", "principle underlying")) ||
      has(s, "which one of the following principles") ||
      // catch-all: any other "principle" stem (e.g. "a principle underlying the
      // ecologist's reasoning") lands here rather than in Other.
      has(s, "principle"),
  },

  // Argument Evaluation (before Weaken/Strengthen — distinct "evaluate" stem).
  {
    type: "Argument Evaluation",
    test: (s) =>
      has(
        s,
        "useful to know in order to evaluate",
        "most useful to evaluate",
        "most useful to know in evaluating",
        "most relevant to evaluating",
        "most helpful to know in evaluating",
        "useful to know in evaluating",
        "in order to evaluate the argument",
        "important to an evaluation",
        "to an evaluation of",
        "most important to an evaluation",
        "relevant to investigate",
        "investigate in evaluating",
        "relevant to investigate in evaluating",
        "most important to know in evaluating",
        "important to know in evaluating",
        "evaluation of the logical force",
        "evaluate the logical force",
      ),
  },

  // Weaken / Strengthen.
  {
    type: "Weaken",
    test: (s) =>
      has(
        s,
        "weaken",
        "undermine",
        "casts doubt",
        "cast doubt",
        "cast the most doubt",
        "calls into question",
        "call the",
        "into question",
        "challenge",
        "most damaging to",
        "argument against",
        "counts against",
        "casts the most doubt",
        "argues most strongly against",
        "most seriously limits",
        "seriously limit",
        "limits the effectiveness",
        "strongest counter",
        "strongest objection",
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
        "most supports the",
        "supports the ... reasoning",
        "most justifies",
        "most helps to justify the",
        "if true, most supports",
        "additional support",
        "strongest support",
        "provides the strongest",
        "more persuasive if",
        "would be more persuasive",
        "most support for the",
        "provides the most support for the",
        "support for the proposal",
        "support for the recommendation",
        "support for the prediction",
        "support for the hypothesis",
      ) || re(/most (strongly )?supports.{0,20}(argument|conclusion|reasoning|proposal|recommendation|prediction)/)(s),
  },

  // Complete the Argument.
  {
    type: "Complete the Argument",
    test: (s) => has(s, "completes the argument", "logically completes", "logically concludes the argument", "logically concludes the", "complete the passage", "fills in the blank", "completes the explanation", "completes the passage"),
  },

  // Paradox.
  {
    type: "Paradox",
    test: (s) =>
      has(
        s,
        "resolve the apparent",
        "resolve the discrepancy",
        "resolve the apparent discrepancy",
        "explain the discrepancy",
        "helps to resolve",
        "discrepancy",
        "paradox",
        "paradoxical",
        "apparent conflict",
        "most helps to explain",
        "helps to account for",
        "contributes to an explanation",
        "contribute to an explanation",
        "reconcile",
        "puzzling",
        "does most to justify",
      ),
  },

  // Role / Method / Conclusion.
  {
    type: "Role in Argument",
    test: (s) =>
      has(s, "role played", "plays which", "plays in the argument", "figures in the argument", "function of the claim", "the claim that") &&
      has(s, "role", "function", "plays", "figures"),
  },
  {
    type: "Method of Reasoning",
    test: (s) =>
      !isFlawWord(s) &&
      has(
        s,
        "method of reasoning",
        "argumentative technique",
        "technique of reasoning",
        "proceeds by",
        "argument proceeds",
        "responds to",
        "counters the",
        "does which one of the following",
        "argument does which",
        "argumentative strateg",
        "adopts which",
        "employs which",
        "strategies in",
        "strategy in",
        "strategy is used",
        "strategies is used",
        "in criticizing",
        "fail to address",
        "respond to",
        "in responding to",
        "responding to",
        "by doing which",
        "argument by doing",
        "seeks to do which",
        "argument seeks to do",
        "used above to",
        "proceeds to",
        "develops the argument by",
      ),
  },
  {
    type: "Flawed Reasoning",
    test: (s) => isFlawWord(s),
  },
  {
    type: "Identify the Conclusion",
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
        "conclusion drawn in the argument",
        "conclusion is that",
        "expresses the main",
      ) || re(/(is|states|expresses).{0,30}\bconclusion\b/)(s),
  },

  // Inference family — MSS before MBT (MSS is the ~80% standard).
  {
    type: "Most Strongly Supported",
    test: (s) =>
      has(
        s,
        "most strongly supported by the information",
        "most strongly supported by the statements",
        "most strongly supported by",
        "most reasonably be concluded on the basis",
        "most reasonably be concluded",
        "provide the most support for",
        "most support for which",
        "argument suggests that",
        "statements suggest that",
        "support which one of the following",
        "most strongly support which",
        "best support which",
        "best supports which",
        "supports which one of the following",
        "support for which one of the following",
        "most evidence for the conclusion",
        "provides the most evidence",
        "support the following",
      ),
  },
  {
    type: "Must Be True",
    test: (s) =>
      has(
        s,
        "must be true",
        "must also be true",
        "properly inferred",
        "can be properly inferred",
        "follows logically from",
        "can be properly concluded",
        "logically follows",
        "validly concluded",
        "logically concluded",
        "logically inferred",
        "be inferred from",
        "commit him to",
        "commits him to",
        "commit her to",
        "commits her to",
        "can be validly",
        "if the statements above are true",
        "statements above are both true",
        "are both true",
        "statements above, if true",
      ),
  },
];

// ----------------------------- RC rules -----------------------------
const RC_RULES: Rule[] = [
  { type: "RC Except", test: (s) => /\bexcept\b/.test(s) },

  // Comparative-passage types.
  {
    type: "RC Describe Relationship",
    test: (s) =>
      has(s, "passage a", "passage b") &&
      has(s, "relate to", "relationship between", "relationship of", "how does the", "compared to"),
  },
  {
    type: "RC Describe Approach",
    test: (s) =>
      has(s, "passage a", "passage b", "both passages") &&
      has(s, "both advanced by", "are both", "approach", "both authors", "developed by"),
  },

  // Other RC question shapes.
  { type: "RC Analogy", test: (s) => has(s, "most analogous", "analogous to") },
  {
    type: "RC Application",
    test: (s) => has(s, "best illustrates", "best example", "most clearly exemplifies", "illustrates the concept", "best illustrates the"),
  },
  {
    type: "RC Logical Continuation",
    test: (s) =>
      has(s, "most logically concludes", "logically conclude the", "would most logically complete", "logically completes the passage", "most logically continue", "sentence would most logically"),
  },
  {
    type: "RC Weaken/Strengthen/Evaluate",
    test: (s) =>
      has(s, "weaken", "strengthen", "provide the most support for", "most support for", "most undermines", "if true, would", "most useful to evaluate", "calls into question"),
  },

  // Word/phrase-level (before passage/paragraph-level).
  {
    type: "RC Meaning in Context",
    test: (s) =>
      has(s, "intended meaning", "closely expresses the author", "expresses the author's intended", "most nearly means", "as used in", "the word", "the phrase", "meaning of the word", "in using the word", "in saying"),
  },
  {
    type: "RC Purpose in Context",
    test: (s) =>
      has(s, "serves primarily to", "serves to", "in order to", "primarily in order to", "author mentions", "author refers to", "reference to", "discussion of", "author's discussion of", "author introduces"),
  },

  // Structure.
  {
    type: "RC Purpose of Paragraph",
    test: (s) =>
      has(s, "function of the", "main function of the", "primary function of the", "purpose of the", "the third paragraph", "the second paragraph", "the first paragraph", "the final paragraph", "the last paragraph") &&
      has(s, "paragraph"),
  },
  {
    type: "RC Purpose of Passage",
    test: (s) => has(s, "primary purpose of the passage", "purpose of the passage", "primary purpose", "passage as a whole is to", "passage is primarily concerned"),
  },
  {
    type: "RC Describe Organization",
    test: (s) => has(s, "organization", "how the passage is organized", "structured", "organized"),
  },
  {
    type: "RC Main Point",
    test: (s) =>
      has(s, "main point of the passage", "main point", "main idea", "central idea", "central thesis", "primary purpose of the passage is to", "best states the main", "best title", "most accurately states the main"),
  },

  // Attitude / perspectives.
  {
    type: "RC Author's Attitude",
    test: (s) =>
      has(s, "author's attitude", "attitude toward", "attitude of the author", "author regards", "tone", "author's view of", "author would characterize", "author's stance"),
  },
  {
    type: "RC Author's Perspective",
    test: (s) =>
      has(s, "author") && has(s, "would most likely agree", "would be most likely to agree", "most likely to agree", "author would agree", "author of the passage would", "author would most likely"),
  },
  {
    type: "RC Other's Perspective",
    test: (s) =>
      has(s, "would most likely agree", "would be most likely to agree", "most likely agree", "believes that", "would agree", "would most likely", "according to") &&
      !has(s, "author") &&
      !has(s, "according to the passage"),
  },

  {
    type: "RC Principle/Generalization",
    test: (s) => has(s, "principle", "generalization", "proposition"),
  },

  // Stated vs Implied.
  {
    type: "RC Stated",
    test: (s) =>
      has(s, "according to the passage", "passage states", "passage indicates", "passage mentions", "passage notes", "the passage indicates", "passage explicitly", "explicitly mentioned", "the author states that", "stated in the passage"),
  },
  {
    type: "RC Implied",
    test: (s) =>
      has(s, "most strongly supported", "can be inferred", "inferred from the passage", "it can be inferred", "the passage suggests", "suggests that", "implies", "most reasonably be inferred", "passage implies"),
  },
];

// ----------------------------- public API -----------------------------
function looksLikeRC(stem: string, stimulus: string): boolean {
  return (
    has(stem, "the passage", "the author", "passage as a whole", "both passages", "passage a", "passage b", "this passage") ||
    /\bparagraph\b/.test(stem) ||
    stimulus.length > 900
  );
}

export function classifyLR(stem: string): QType {
  const s = (stem || "").toLowerCase();
  for (const rule of LR_RULES) if (rule.test(s)) return rule.type;
  return "Other";
}

export function classifyRC(stem: string): QType {
  const s = (stem || "").toLowerCase();
  for (const rule of RC_RULES) if (rule.test(s)) return rule.type;
  return "RC Implied"; // modal RC type — the safest fallback
}

// Auto entry point used by the paste flow, where a stem could be LR or RC.
export function classify(stem: string, stimulus = ""): QType {
  if (looksLikeRC(stem, stimulus)) return classifyRC(stem);
  const lr = classifyLR(stem);
  return lr;
}
