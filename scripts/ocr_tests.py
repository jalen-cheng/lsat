#!/usr/bin/env python3
"""
OCR + parse real LSAT PrepTest booklets (scanned-image PDFs) into structured
questions, paired with the correct answers from the Kaplan "Explained" PDFs.

For each test N:  reads  "<N>.pdf"  (scanned test booklet, image-only)
                  and    "<N>A.pdf" (Kaplan explanations, digital text → answers)

  * Section types come from the booklet's contents page
    (e.g. "Logical Reasoning ... SECTION I").
  * Analytical Reasoning (logic games) sections are SKIPPED — no longer on the
    modern LSAT.
  * Logical Reasoning + Reading Comprehension sections are OCR'd (two columns
    handled separately) and parsed into stem + (A)-(E) choices.
  * Correct-answer letters come from the Kaplan text ("N. (X)" per section).

Output: scripts/out/<N>.json  — a list of question objects. Classification and
DB insertion happen in the TypeScript importer (scripts/import-pdf.ts), which
reuses the app's classifier.

OCR text is cached under scripts/ocr_cache/ so re-parsing never re-OCRs.

Usage:
    python3 scripts/ocr_tests.py 7            # one test
    python3 scripts/ocr_tests.py 7 9 10       # several
    python3 scripts/ocr_tests.py --all        # every test with a booklet+key
"""
import sys, os, re, io, json, glob
import fitz  # pymupdf
import pytesseract
from pytesseract import Output
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TESTS_DIR = os.path.join(ROOT, "Tests and Answers")
CACHE_DIR = os.path.join(HERE, "ocr_cache")
OUT_DIR = os.path.join(HERE, "out")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}

# ---------------------------------------------------------------- OCR helpers
def render(page, dpi):
    return Image.open(io.BytesIO(page.get_pixmap(dpi=dpi).tobytes("png")))

def ocr(img, psm=6):
    return pytesseract.image_to_string(img, config=f"--psm {psm}")

def directions_cut_frac(page):
    """Find the y (as a fraction of height) just below the directions block,
    located by the end of '...answer sheet.' near the top of a section's first
    page. Returns 0 if not found."""
    img = render(page, 150)
    H = img.height
    try:
        data = pytesseract.image_to_data(img, output_type=Output.DICT)
    except Exception:
        return 0.0
    best = 0.0
    for i, w in enumerate(data["text"]):
        if w.strip().lower().strip(".") == "sheet" and data["top"][i] < H * 0.40:
            best = max(best, (data["top"][i] + data["height"][i]) / H + 0.006)
    return best

def ocr_page_columns(page, top_frac=0.03):
    """OCR a two-column page (left column then right), skipping the top band
    (running header, or directions on a section's first page)."""
    img = render(page, 300)
    W, H = img.size
    top = int(H * top_frac)
    left = img.crop((0, top, int(W * 0.50), H))
    right = img.crop((int(W * 0.50), top, W, H))
    return ocr(left) + "\n" + ocr(right)

def cached_page_text(test, pidx, page, top_frac=0.03):
    fp = os.path.join(CACHE_DIR, f"{test}_p{pidx}.txt")
    if os.path.exists(fp):
        return open(fp, encoding="utf-8").read()
    txt = ocr_page_columns(page, top_frac)
    open(fp, "w", encoding="utf-8").write(txt)
    return txt

# ---------------------------------------------------------------- structure
def section_types_from_contents(doc):
    """Parse the 'The PrepTest' contents page → {section_num: type}."""
    types = {}
    for i in range(min(8, len(doc))):
        txt = ocr(render(doc[i], 200), psm=4)
        if "PrepTest" not in txt and "Logical Reasoning" not in txt:
            continue
        for m in re.finditer(
            r"(Logical Reasoning|Analytical Reasoning|Reading Comprehension)\s*[.\s]*SECTION\s+([IVX]+)",
            txt,
        ):
            kind = m.group(1).split()[0].upper()  # LOGICAL / ANALYTICAL / READING
            types[ROMAN.get(m.group(2).upper(), 0)] = kind
        if types:
            return types
    return types

def detect_type(low):
    """Section type from the directions wording (reliable per section).
    NOTE: LR directions say 'brief statements or passages', so LR must be tested
    BEFORE the RC 'passage' check."""
    if "set of conditions" in low or "following conditions" in low:
        return "ANALYTICAL"
    if "brief statement" in low or "reasoning contained" in low or "brief passages" in low:
        return "LOGICAL"
    if "each passage" in low or "passage in this section" in low or \
       "single passage" in low or "followed by a group" in low or "passage" in low:
        return "READING"
    return "?"

def cached_header(test, pidx, page):
    fp = os.path.join(CACHE_DIR, f"{test}_h{pidx}.txt")
    if os.path.exists(fp):
        return open(fp, encoding="utf-8").read()
    band = render(page, 200)
    W, H = band.size
    txt = ocr(band.crop((0, 0, W, int(H * 0.34))))
    open(fp, "w", encoding="utf-8").write(txt)
    return txt

def find_sections(doc, contents, test):
    """Detect section-start pages by their header ('Time—35 minutes', 'N
    Questions', 'Directions:'), number them in order, and type each from its
    directions. Falls back to the contents map by ordinal when directions are
    garbled. Returns [ {num, start, end, type, nq} ]."""
    raw = []
    for i in range(len(doc)):
        low = re.sub(r"\s+", " ", cached_header(test, i, doc[i]).lower())
        if "minutes" not in low or "question" not in low:
            continue
        # Exclude only the writing-sample / general-directions pages — match the
        # exact header phrase, NOT bare "writing"/"essay" which appear in passages.
        if "writing sample" in low or "general directions" in low:
            continue
        nqm = re.search(r"(\d{1,2})\s+questions", low)
        nq = int(nqm.group(1)) if nqm else None
        # Drop spurious detections (a stray page that isn't a real section start):
        # real LSAT sections have ~22-28 questions.
        if nq is not None and nq < 15:
            continue
        raw.append((i, detect_type(low), nq))
    sections = []
    for idx, (p, t, nq) in enumerate(raw):
        end = raw[idx + 1][0] if idx + 1 < len(raw) else len(doc)
        num = idx + 1
        if t == "?":
            t = contents.get(num, "?")
        sections.append({"num": num, "start": p, "end": end, "type": t, "nq": nq})
    return sections

# ---------------------------------------------------------------- line parsing
def norm(s):
    return re.sub(r"\s+", " ", s).strip()

LINE_MARK = re.compile(r"\((?:5|10|15|20|25|30|35|40|45|50|55|60|65|70|75|80)\)")

def has_marker(text):
    return len(LINE_MARK.findall(text)) >= 1

def strip_markers(text):
    return norm(LINE_MARK.sub(" ", text))

SENT_BOUNDARY = re.compile(r'[.?!:]["”’]?\s+(?=[A-Z“"])')

def split_lr_stem(text):
    """For LR, separate the stimulus from the trailing question stem (the final
    sentence, e.g. 'Which one of the following ...?'). Improves both display and
    classification (which then runs on the question, not the whole stimulus)."""
    bounds = list(SENT_BOUNDARY.finditer(text))
    if not bounds:
        return "", text
    cut = bounds[-1].end()
    stimulus, stem = text[:cut].strip(), text[cut:].strip()
    # if the last sentence is too short to be the question, back up one
    if len(stem) < 18 and len(bounds) >= 2:
        cut = bounds[-2].end()
        stimulus, stem = text[:cut].strip(), text[cut:].strip()
    return stimulus, stem

def is_noise(s):
    if re.fullmatch(r"[-–—\s\d|.©_>«»~]+", s):  # page numbers, rule/scan artifacts
        return True
    return bool(re.search(
        r"GO ON TO THE NEXT|^STOP\b|This is the end of|^SECTION\b|Time\s*[—-]|"
        r"^\d+\s*Questions?$|Directions:|answer sheet|blacken the|best answer; that is|"
        r"reasoning contained in brief|Each passage in this section|"
        r"more than one of the cho|the response that most|you are to choose|"
        r"in this section is based|corresponding space|The PrepTest|©\s*KAPLAN|"
        r"single passage or a pair",
        s, re.I))

QLINE = re.compile(r"^(\d{1,2})[.)]\s+(\S.*)$")
# Closing paren is sometimes OCR'd as ] } or y on lower-quality scans ("(Cy").
# Only accept the garbled closer immediately after the letter to stay safe.
CLINE = re.compile(r"^\(\s*([A-E])[\)\]\}y]\s*(.*)$")

def tag_lines(text):
    items = []
    for raw in text.split("\n"):
        s = raw.strip()
        if not s or is_noise(s):
            continue
        mq = QLINE.match(s)
        mc = CLINE.match(s)
        if mc:
            items.append(("C", mc.group(1), mc.group(2)))
        elif mq and 1 <= int(mq.group(1)) <= 40:
            items.append(("Q", int(mq.group(1)), mq.group(2)))
        else:
            # drop OCR decoration garbage (scanned gutter ornaments, the big
            # repeated section digits): prose with no real word survives nowhere.
            if not re.search(r"[A-Za-z]{3,}", s):
                continue
            items.append(("P", s, None))
    return items

def parse_section(text, kind):
    """Line-based parse → [ {n, stem, choices, passage} ].
    Passage (RC only) = prose that appears after a question's choices and before
    the next question number; it carries forward to the questions that follow."""
    items = tag_lines(text)
    out, cur, buf, passage = [], None, [], ""

    def flush_to_choice():
        """Buffered prose that isn't a passage = a wrapped answer choice; append
        it to the most recent choice. Only line-marked prose is ever a passage."""
        nonlocal passage, buf
        txt = norm(" ".join(buf))
        buf = []
        if not txt:
            return
        if kind == "RC" and has_marker(txt):
            passage = strip_markers(txt)          # a genuine new passage block
        elif cur and cur["choices"]:
            cur["choices"][-1]["text"] = norm(cur["choices"][-1]["text"] + " " + txt)

    for tag, a, b in items:
        if tag == "Q":
            flush_to_choice()
            if cur:
                out.append(cur)
            cur = {"n": a, "stem": b, "choices": [], "passage": passage}
        elif tag == "C":
            if cur is None:
                continue
            if buf:
                if not cur["choices"]:            # prose between stem and (A) = stem
                    cur["stem"] = norm(cur["stem"] + " " + " ".join(buf)); buf = []
                else:                             # wrapped continuation of prev choice
                    flush_to_choice()
            cur["choices"].append({"letter": a, "text": b})
        else:  # prose
            if cur and not cur["choices"]:
                cur["stem"] = norm(cur["stem"] + " " + a)
            else:
                buf.append(a)
    flush_to_choice()
    if cur:
        out.append(cur)

    # de-dupe choices to the first A-E run, normalize
    cleaned = []
    for q in out:
        seen, choices = set(), []
        for c in q["choices"]:
            if c["letter"] in seen:
                continue
            seen.add(c["letter"])
            choices.append({"letter": c["letter"], "text": norm(c["text"])})
        if len(choices) >= 4:
            cleaned.append({"n": q["n"], "stem": norm(q["stem"]),
                            "choices": choices, "passage": q["passage"]})
    return cleaned

# ---------------------------------------------------------------- answers (Kaplan)
def parse_answer_key(path):
    """Return {section_num: {qnum: letter}} from a Kaplan explanations PDF."""
    from pypdf import PdfReader
    r = PdfReader(path)
    answers, cur = {}, None
    # Anchor on the section header so logic-games explanations (which restate
    # question numbers) don't corrupt segmentation. Tolerate all three Kaplan
    # layouts: roman running header "...Explained: Section IV"; arabic chapter
    # header "SECTION 1 ..."; and the spaced-out extraction "SECTIO N 1 ...".
    # "Explained" is required for the roman form so prose cross-references
    # ("...from Section II?") don't flip the current section.
    HDR_ROMAN = re.compile(r"Explained:?\s*Section\s+([IVX]+)\b", re.I)
    HDR_CAPS = re.compile(r"(?m)^\s*S\s*E\s*C\s*T\s*I\s*O\s*N\s+(\d+|[IVX]+)\b")
    # Answer line "N. (X)" — tolerant of a space before the period and of the
    # spaced format where two-digit numbers split ("1 1 . (E)" == "11. (E)").
    ANS = re.compile(r"(?m)^\s*(\d(?:\s*\d)?)\s*[.)]\s*\(\s*([A-E])\s*\)")

    def secnum(tok):
        tok = re.sub(r"\s", "", tok).upper()
        return ROMAN.get(tok, int(tok) if tok.isdigit() else None)

    for p in r.pages:
        t = p.extract_text() or ""
        hm = HDR_ROMAN.search(t) or HDR_CAPS.search(t)
        if hm:
            s = secnum(hm.group(1))
            if s:
                cur = s
                answers.setdefault(cur, {})
        for m in ANS.finditer(t):
            if cur is None:
                cur = 1
                answers.setdefault(1, {})
            answers[cur].setdefault(int(re.sub(r"\s", "", m.group(1))), m.group(2))
    return answers

# ---------------------------------------------------------------- per test
def process_test(num):
    booklet = os.path.join(TESTS_DIR, f"{num}.pdf")
    key = os.path.join(TESTS_DIR, f"{num}A.pdf")
    if not os.path.exists(booklet) or not os.path.exists(key):
        print(f"  test {num}: missing booklet or key, skipping")
        return None

    doc = fitz.open(booklet)
    contents = section_types_from_contents(doc)
    sections = find_sections(doc, contents, num)
    answers = parse_answer_key(key)

    print(f"  test {num}: " + "  ".join(
        f"S{s['num']}={s['type'][:2]}({s['start']}-{s['end']},{s['nq']}q)" for s in sections))

    out = []
    for s in sections:
        sec, start, end, kind = s["num"], s["start"], s["end"], s["type"]
        if kind == "ANALYTICAL":
            continue  # skip logic games
        if kind not in ("LOGICAL", "READING") and sec not in answers:
            continue  # unknown/experimental with no key → skip
        st = "RC" if kind == "READING" else "LR"

        pages = []
        for p in range(start, end):
            tf = directions_cut_frac(doc[p]) if p == start else 0.03
            pages.append(cached_page_text(num, p, doc[p], tf))
        qs = parse_section("\n".join(pages), st)
        keymap = answers.get(sec, {})

        for q in qs:
            if st == "LR":
                stimulus, stem = split_lr_stem(q["stem"])
            else:
                stimulus, stem = q["passage"], q["stem"]
            out.append({
                "preptest": num if isinstance(num, int) else None,
                "book": None, "section": sec, "section_type": st,
                "qnum": q["n"], "stimulus": stimulus, "stem": stem,
                "choices": q["choices"], "correct": keymap.get(q["n"]),
            })
    return out

# ---------------------------------------------------------------- main
def all_test_numbers():
    nums = []
    for f in glob.glob(os.path.join(TESTS_DIR, "*.pdf")):
        b = os.path.basename(f)
        m = re.fullmatch(r"(\d+)\.pdf", b)
        if m and os.path.exists(os.path.join(TESTS_DIR, f"{m.group(1)}A.pdf")):
            nums.append(int(m.group(1)))
    return sorted(set(nums))

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return
    nums = all_test_numbers() if args[0] == "--all" else [int(a) for a in args]
    print(f"processing {len(nums)} test(s): {nums}")
    for num in nums:
        try:
            result = process_test(num)
        except Exception as e:
            print(f"  test {num}: ERROR {type(e).__name__}: {e}")
            continue
        if result is None:
            continue
        lr = sum(1 for q in result if q["section_type"] == "LR")
        rc = sum(1 for q in result if q["section_type"] == "RC")
        noans = sum(1 for q in result if not q["correct"])
        json.dump(result, open(os.path.join(OUT_DIR, f"{num}.json"), "w"), ensure_ascii=False, indent=1)
        print(f"  test {num}: LR={lr} RC={rc} missing_answer={noans} -> out/{num}.json", flush=True)

if __name__ == "__main__":
    main()
