#!/usr/bin/env python3
"""Queue, ledger and detail guard for the copy-humanizer agent.

The agent rewrites the words in one file at a time with the humanizer skill.
This script picks the file, checks that the rewrite changed only words and
kept every detail, and records the file as done.

    python3 scripts/humanize_copy.py next           # print the next interface file to humanize
    python3 scripts/humanize_copy.py status         # counts: done, stale, remaining
    python3 scripts/humanize_copy.py next --docs    # next item in the docs sweep
    python3 scripts/humanize_copy.py status --docs
    python3 scripts/humanize_copy.py check FILE     # compare FILE with its HEAD version
    python3 scripts/humanize_copy.py record FILE    # mark FILE as humanized

Paths are relative to the repo root, e.g.
"src/lib/components/global/item-card.svelte".

The default sweep covers what a player sees in the app: the .svelte
components and routes, and the few .ts modules that hold on-screen wording
(UI_ORDER below), in the order that settles a control's name before the
files that refer to it. Other .svelte files under src/ follow, alphabetically,
when they hold any copy. The docs sweep (`--docs`) covers the Markdown a
developer reads: README.md, docs/ and the notes in scripts/.

For a .svelte or .ts file, `check` masks every piece of copy (string literals
that read as words, template text, and the values of attributes a reader
sees or hears), then requires the rest of the file (the code) to be unchanged,
ignoring only how whitespace is laid out, so a Prettier reflow passes.
<style> blocks and comments must be unchanged. It then compares the copy
itself: numbers, links, quotations, skill names and a few fixed names must
survive.

For a Markdown file, `check` locks frontmatter, headings, code, blockquotes
and table shape, and fails if links, inline code, numbers or quotations were
lost or added.

`check` exits 1 when the rewrite broke a hard rule. It also prints warnings
(capitalised words or emphasis that vanished) for the agent to review by
hand; warnings alone exit 0.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
LEDGER = ROOT / ".claude" / "humanized-copy.json"

# ------------------------------------------------------------- the queue ---

# Interface files in sweep order. The shell and navigation name the pages;
# the character screens name "supplies" and the account types; the browse
# page and item page use those names; the home page and FAQ describe all of
# it, so they go last and can use every final name.
UI_ORDER = [
    # Shell: page title and share text, header search, sidebar
    "src/routes/+layout.svelte",
    "src/lib/components/layout/site-header.svelte",
    "src/lib/components/layout/nav-menu/nav-menu.svelte",
    "src/lib/components/layout/nav-menu/nav-header.svelte",
    "src/lib/components/layout/nav-menu/nav-contents.svelte",
    "src/lib/components/layout/nav-menu/nav-footer.svelte",
    # Characters, account types, skill levels and supplies
    "src/lib/models/account-type.ts",
    "src/lib/components/global/account-type-select.svelte",
    "src/lib/components/global/character-switcher.svelte",
    "src/lib/components/dialogs/character-stats-dialog.svelte",
    "src/lib/components/global/skills-grid.svelte",
    "src/routes/my-character/+page.svelte",
    # Browsing: the items list, its cards and their buttons
    "src/lib/components/items/game-items-page.svelte",
    "src/lib/components/global/item-card.svelte",
    "src/lib/helpers/time-since.ts",
    "src/lib/components/global/favorite-button.svelte",
    "src/lib/components/global/hide-button.svelte",
    "src/lib/components/global/icon-badge.svelte",
    "src/routes/items/+page.svelte",
    "src/routes/items/[skill=skill]/+page.svelte",
    "src/routes/favorites/+page.svelte",
    "src/routes/hidden/+page.svelte",
    # The item page and its recipe card
    "src/routes/items/[id=integer]/+page.svelte",
    "src/lib/components/global/stat-tile.svelte",
    "src/lib/components/game-item-creation-card/game-item-creation-card.svelte",
    "src/lib/components/game-item-creation-card/game-item-creation-cost-table.svelte",
    "src/lib/components/game-item-creation-card/game-item-creation-profit.svelte",
    "src/lib/components/game-item-creation-card/game-item-creation-xp-tags.svelte",
    "src/lib/components/game-item-creation-card/game-item-tree.svelte",
    # Home page, which describes everything above
    "src/routes/+page.svelte",
    "src/lib/components/homepage/site-hero.svelte",
    "src/lib/components/global/site-faq.svelte",
]
# Never offered by `next`. The shadcn-svelte registry owns components/ui/
# (re-added by its CLI); the item upload dialog is a developer-only tool shown
# only when shouldShowDevControls() is true; nav-user is commented out of the
# sidebar and never rendered.
SKIP_PREFIXES = ("src/lib/components/ui/",)
SKIP_FILES = {
    "src/lib/components/dialogs/osrsbox-item-upload-dialog.svelte",
    "src/lib/components/layout/nav-menu/nav-user.svelte",
}
# The docs sweep, in order. Anything else matching comes last, alphabetically.
DOC_ORDER = ["README.md", "docs/ironman-feature-recommendations.md", "docs/ironman-ui-plan.md"]
DOC_GLOBS = ["README.md", "docs/*.md", "scripts/*.md"]

CODE_SUFFIXES = (".svelte", ".ts", ".js")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def ui_items() -> list[Path]:
    items = [ROOT / f for f in UI_ORDER if (ROOT / f).is_file()]
    listed = {rel(p) for p in items}
    extra = []
    for p in sorted(SRC.rglob("*.svelte")):
        r = rel(p)
        if r in listed or r in SKIP_FILES or r.startswith(SKIP_PREFIXES):
            continue
        # Only files that put any words on screen.
        if mask_code(p.read_text(encoding="utf-8"), True)[1]:
            extra.append(p)
    return items + extra


def doc_items() -> list[Path]:
    items = [ROOT / f for f in DOC_ORDER if (ROOT / f).is_file()]
    listed = {rel(p) for p in items}
    extra = sorted({p for g in DOC_GLOBS for p in ROOT.glob(g) if rel(p) not in listed})
    return items + extra


def load_ledger() -> dict:
    if LEDGER.exists():
        return json.loads(LEDGER.read_text(encoding="utf-8"))
    return {}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify(docs: bool = False) -> tuple[list[Path], list[Path], list[Path]]:
    """Split the sweep into (never done, changed since done, done and unchanged)."""
    ledger = load_ledger()
    new, stale, done = [], [], []
    for item in doc_items() if docs else ui_items():
        entry = ledger.get(rel(item))
        if entry is None:
            new.append(item)
        elif entry.get("sha256") != sha(item):
            stale.append(item)
        else:
            done.append(item)
    return new, stale, done


def cmd_next(docs: bool = False) -> int:
    new, stale, _ = classify(docs)
    queue = new + stale
    if not queue:
        print("ALL DONE")
        return 0
    print(rel(queue[0]))
    return 0


def cmd_status(docs: bool = False) -> int:
    new, stale, done = classify(docs)
    print(f"done: {len(done)}  never humanized: {len(new)}  changed since humanized: {len(stale)}")
    return 0


def cmd_record(path: Path) -> int:
    ledger = load_ledger()
    ledger[rel(path)] = {
        "humanized_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sha256": sha(path),
    }
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    # Four-space indent is what Prettier writes for this repo (.prettierrc), so
    # `bun run lint` stays clean without reformatting the ledger.
    LEDGER.write_text(json.dumps(dict(sorted(ledger.items())), indent=4, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print(f"recorded {rel(path)}")
    return 0


# -------------------------------------------------------- shared checks ---

URL_RE = re.compile(r"\]\([^)]+\)|https?://[^\s)'\"`<>]+")
NUMBER_RE = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")
QUOTE_RE = re.compile(r"\"([^\"\n]{3,})\"|“([^”\n]{3,})”")
# Capitalised words mid-sentence: likely item, skill, place or product names.
# Words that open a sentence are skipped because rewording moves them freely.
CAP_RE = re.compile(r"(?<=[\w,;:)\]] )[A-Z][A-Za-z0-9'’.-]*[A-Za-z0-9]\b")
# Names that must appear in the copy exactly as often after a rewrite as before.
# Skill names are added from the SkillNames enum at runtime.
FIXED_NAMES = ["Aris Maye", "Jaiden DeChon", "Hardcore Ironman", "Ultimate Ironman", "Group Ironman",
               "HCIM", "UIM", "GIM"]
SKILL_ENUM = SRC / "lib" / "constants" / "enums" / "skill-names.ts"


def fixed_names() -> list[str]:
    names = list(FIXED_NAMES)
    if SKILL_ENUM.is_file():
        names += re.findall(r"=\s*'([a-z]+)'", SKILL_ENUM.read_text(encoding="utf-8"))
    return names


def count_names(text: str) -> Counter:
    found: Counter = Counter()
    for name in fixed_names():
        # Case-insensitive for skills ("Smithing", "smithing"); a name like
        # "UIM" is matched as a whole word so it never hits inside another.
        flags = 0 if name.isupper() or " " in name else re.I
        n = len(re.findall(rf"(?<![\w-]){re.escape(name)}(?![\w-])", text, flags))
        if n:
            found[name.lower() if flags else name] = n
    return found


def show(counter: Counter) -> str:
    return ", ".join(f"{k!r}" + (f" x{v}" if v > 1 else "") for k, v in sorted(counter.items()))


def compare(before: dict[str, Counter], after: dict[str, Counter], new_text: str,
            hard: tuple[str, ...], soft: tuple[str, ...]) -> tuple[list[str], list[str]]:
    errors, warnings = [], []
    for kind in hard:
        lost, gained = before[kind] - after[kind], after[kind] - before[kind]
        if lost:
            errors.append(f"{kind} lost: {show(lost)}")
        if gained:
            errors.append(f"{kind} added: {show(gained)}")
    for kind in soft:
        lost = before[kind] - after[kind]
        # A word may survive in a new position (a sentence start, a new
        # case), so warn only when it is gone entirely. Review, not failure.
        lost = Counter({k: v for k, v in lost.items() if k.lower() not in new_text.lower()})
        if lost:
            warnings.append(f"{kind} no longer present: {show(lost)}")
    return errors, warnings


def report(errors: list[str], warnings: list[str], ok_hint: str = "") -> int:
    for w in warnings:
        print(f"WARNING {w}")
    for e in errors:
        print(f"ERROR {e}")
    if errors:
        return 1
    print("ok" + (" (review the warnings above)" if warnings else "") + ok_hint)
    return 0


# ------------------------------------------------------ Markdown (docs) ---

INLINE_CODE_RE = re.compile(r"(`+)(.+?)\1")
EMPHASIS_RE = re.compile(r"\*\*([^*\n]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])|(?<!\w)_([^_\n]+)_(?!\w)")


def split_markdown(text: str) -> tuple[str, list[str], str]:
    """Return (frontmatter, locked lines, editable prose).

    Locked lines must survive byte for byte and in order: headings (GitHub
    builds anchors from them), fenced code, blockquotes (in docs/ they quote
    the exact interface copy a plan fixed), HTML, and table separator rows.
    A table row's cell count is locked; its cell text is prose.
    """
    frontmatter = ""
    m = re.match(r"\A---\n.*?\n---\n", text, re.DOTALL)
    if m:
        frontmatter, text = m.group(0), text[m.end():]

    locked: list[str] = []
    prose: list[str] = []
    fence = ""
    for line in text.splitlines():
        stripped = line.strip()
        fm = re.match(r"^(`{3,}|~{3,})", stripped)
        if fence:
            locked.append(line)
            if fm and stripped.startswith(fence):
                fence = ""
            continue
        if fm:
            fence = fm.group(1)
            locked.append(line)
            continue
        if stripped.startswith(("#", ">", "<")) or re.match(r"^\|?\s*:?-{3,}", stripped):
            locked.append(line)
            continue
        if stripped.startswith("|"):
            # Prettier re-pads tables, so lock the shape, not the spacing.
            cells = re.split(r"(?<!\\)\|", stripped.strip("|"))
            locked.append(f"<table row: {len(cells)} cells>")
            prose.append(" ".join(c.strip() for c in cells))
            continue
        prose.append(line)
    return frontmatter, locked, "\n".join(prose)


def markdown_facts(prose: str) -> dict[str, Counter]:
    code = Counter(m.group(2).strip() for m in INLINE_CODE_RE.finditer(prose))
    bare = INLINE_CODE_RE.sub(" ", prose)
    links = Counter(URL_RE.findall(bare))
    bare = URL_RE.sub(" ", bare)
    return {
        "links": links,
        "inline code": code,
        "numbers": Counter(n.replace(",", "") for n in NUMBER_RE.findall(bare)),
        "quotes": Counter(a or b for a, b in QUOTE_RE.findall(bare)),
        "emphasis": Counter(a or b or c for a, b, c in EMPHASIS_RE.findall(bare)),
        "capitalised": Counter(CAP_RE.findall(bare)),
    }


def cmd_check_markdown(old: str, new: str) -> int:
    old_fm, old_locked, old_prose = split_markdown(old)
    new_fm, new_locked, new_prose = split_markdown(new)
    errors: list[str] = []
    if old_fm != new_fm:
        errors.append("frontmatter changed; it must stay byte for byte")
    if old_locked != new_locked:
        lost = [l for l in old_locked if l not in new_locked]
        added = [l for l in new_locked if l not in old_locked]
        detail = "".join(f"\n    - {l}" for l in lost[:10]) + "".join(f"\n    + {l}" for l in added[:10])
        errors.append("headings, code blocks, blockquotes, HTML or table shape changed "
                      "(only prose and table cell text may change):" + (detail or " order differs"))
    e, warnings = compare(markdown_facts(old_prose), markdown_facts(new_prose), new_prose,
                          hard=("links", "inline code", "numbers", "quotes"),
                          soft=("emphasis", "capitalised"))
    return report(errors + e, warnings, " (now run: bunx prettier --check \"<file>\")")


# ------------------------------------------------ code (.svelte and .ts) ---

# Comments come first so an apostrophe in a comment never opens a string.
STRING_RE = re.compile(r"//[^\n]*|/\*.*?\*/|'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)
# Single-word strings that are code, not copy: keyboard keys and the like.
CODE_WORDS = {"Enter", "Escape", "Tab", "Home", "End", "Space", "Backspace", "Delete",
              "PageUp", "PageDown", "Shift", "Control", "Alt", "Meta", "ArrowUp", "ArrowDown",
              "ArrowLeft", "ArrowRight", "GET", "POST", "PUT", "PATCH", "DELETE"}
# Attributes whose quoted value is never copy, however wordy it looks.
CODE_ATTRS = {"class", "style", "id", "for", "href", "src", "srcset", "type", "name", "value", "d", "viewbox",
              "fill", "stroke", "points", "transform", "role", "rel", "sizes", "media", "lang", "inputmode",
              "autocomplete", "method", "action", "target", "side", "align", "variant", "size", "xmlns",
              "property", "charset", "http-equiv", "key", "slot", "min", "max", "step", "pattern", "accept",
              "tabindex", "dir", "loading", "decoding", "form", "enctype"}
CODE_ATTR_PREFIXES = ("data-", "aria-hidden", "aria-controls", "aria-describedby", "aria-labelledby",
                      "aria-owns", "aria-current", "aria-expanded", "aria-live", "on", "bind:", "class:",
                      "style:", "use:", "transition:", "in:", "out:", "animate:", "let:")
COMPARISON_RE = re.compile(
    r"(?:===|!==|==|!=|\bcase)\s*(['\"`])((?:(?!\1)[^\\\n]|\\.)*)\1"
    r"|(['\"`])((?:(?!\3)[^\\\n]|\\.)*)\3\s*(?:===|!==|==|!=)")


def is_class_list(text: str) -> bool:
    """A Tailwind class string held in a variable ('flex-1 flex flex-col
    text-sm'): lowercase tokens, most of them with a -, :, / or [ in them."""
    tokens = text.split()
    if len(tokens) < 2 or not all(re.fullmatch(r"[a-z0-9!@:/_.\-\[\]()%#&>*=,]+", t) for t in tokens):
        return False
    return sum(bool(re.search(r"[-:/\[]", t)) for t in tokens) * 2 >= len(tokens)


def looks_like_copy(text: str, attr: bool = False) -> bool:
    """Words a person reads: a space or an ellipsis between letters, or one
    capitalised word. Ids, class names, keys and paths stay visible."""
    bare = text.strip()
    if not re.search(r"[A-Za-z]", text):
        return False
    if not attr and is_class_list(bare):
        return False
    if " " in bare or "…" in text or "(" in bare:
        return True
    return bool(re.fullmatch(r"[A-Z][a-z]+", bare)) and bare not in CODE_WORDS


def compared_literals(code: str) -> set[str]:
    """String values the code compares against (`item.title === 'Favorites'`).
    Such a string is an identifier as well as copy, so it stays visible: a
    rename has to change the comparison too, and the check sends that to a
    person instead of letting it through."""
    return {a or b for _, a, _, b in COMPARISON_RE.findall(code)}


def in_console_call(text: str, pos: int) -> bool:
    """True when pos sits inside the arguments of console.log/warn/error: a
    developer's message, not copy."""
    start = text.rfind("console.", max(0, pos - 400), pos)
    if start < 0:
        return False
    between = text[start:pos]
    return ";" not in between and between.count("(") > between.count(")")


def mask_strings(text: str, keep: set[str], copy: list[str], full: str | None = None,
                 offset: int = 0) -> str:
    """Mask the string literals that read as copy and collect their text."""
    full = text if full is None else full

    def one(m: re.Match) -> str:
        lit = m.group(0)
        if lit.startswith("/"):
            return lit
        body = lit[1:-1]
        words = re.sub(r"\$\{[^}]*\}", "", body) if lit[0] == "`" else body
        if body in keep or not looks_like_copy(words) or in_console_call(full, offset + m.start()):
            return lit
        copy.append(words)
        if lit[0] == "`":
            # Keep the ${...} expressions visible: they are code.
            return "`" + "§".join(re.findall(r"\$\{[^}]*\}", body)) + "§S§`"
        return "§S§"

    return STRING_RE.sub(one, text)


def skip_js_string(s: str, i: int) -> int:
    """Index just past the JS string literal that opens at s[i]."""
    q = s[i]
    i += 1
    while i < len(s):
        if s[i] == "\\":
            i += 2
            continue
        if q == "`" and s.startswith("${", i):
            i = match_brace(s, i + 1)
            continue
        if s[i] == q:
            return i + 1
        i += 1
    return i


def match_brace(s: str, i: int) -> int:
    """Index just past the } that closes the { at s[i], skipping strings."""
    depth = 0
    while i < len(s):
        c = s[i]
        if c in "'\"`":
            i = skip_js_string(s, i)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return i


def attr_is_text(name: str) -> bool:
    low = name.lower()
    return low not in CODE_ATTRS and not low.startswith(CODE_ATTR_PREFIXES)


class SvelteMasker:
    """Masks the markup part of a .svelte file (everything outside <script>
    and <style>). Text runs become §T§ followed by their {expressions} in
    order; copy attributes become "§A§"; strings inside expressions are
    masked like script strings."""

    def __init__(self, keep: set[str], copy: list[str]):
        self.keep, self.copy = keep, copy

    def expr(self, e: str) -> str:
        return mask_strings(e, self.keep, self.copy)

    def text_run(self, parts: list[tuple[str, str]]) -> str:
        words = "".join(v for k, v in parts if k == "t")
        if not re.search(r"[A-Za-z]", words):
            return "".join(v if k == "t" else self.expr(v) for k, v in parts)
        self.copy.append(words)
        return "§T§" + "".join(self.expr(v) for k, v in parts if k == "e")

    def attr_value(self, name: str, value: str) -> str:
        """A quoted attribute value, which may hold {expressions}."""
        pieces = []
        i, words, exprs = 0, "", []
        while i < len(value):
            if value[i] == "{":
                j = match_brace(value, i)
                exprs.append(self.expr(value[i:j]))
                pieces.append(("e", value[i:j]))
                i = j
            else:
                words += value[i]
                pieces.append(("t", value[i]))
                i += 1
        if attr_is_text(name) and looks_like_copy(words, attr=True):
            self.copy.append(words)
            return "§A§" + "".join(exprs)
        return "".join(v if k == "t" else self.expr(v) for k, v in pieces)

    def tag(self, t: str) -> str:
        m = re.match(r"</?[\w:.-]*", t)
        out = [m.group(0)]
        i = m.end()
        while i < len(t):
            c = t[i]
            if c.isspace():
                i += 1
                continue
            if c in "/>":
                out.append(c)
                i += 1
                continue
            if c == "{":  # {shorthand}, {...spread}, {@attach ...}
                j = match_brace(t, i)
                out.append(" " + self.expr(t[i:j]))
                i = j
                continue
            nm = re.match(r"[^\s=/>{]+", t[i:])
            if not nm:
                out.append(c)
                i += 1
                continue
            name = nm.group(0)
            i += len(name)
            if i < len(t) and t[i] == "=":
                i += 1
                if i < len(t) and t[i] in "\"'":
                    q = t[i]
                    j = i + 1
                    while j < len(t) and t[j] != q:
                        j = match_brace(t, j) if t[j] == "{" else j + 1
                    out.append(f" {name}={q}{self.attr_value(name, t[i + 1:j])}{q}")
                    i = j + 1
                elif i < len(t) and t[i] == "{":
                    j = match_brace(t, i)
                    out.append(f" {name}={self.expr(t[i:j])}")
                    i = j
                else:
                    uv = re.match(r"[^\s>]+", t[i:])
                    val = uv.group(0) if uv else ""
                    out.append(f" {name}={val}")
                    i += len(val)
            else:
                out.append(" " + name)
        return "".join(out)

    def scan_tag_end(self, s: str, i: int) -> int:
        q = ""
        while i < len(s):
            c = s[i]
            if q:
                if c == "{":
                    i = match_brace(s, i)
                    continue
                if c == q:
                    q = ""
            elif c in "\"'":
                q = c
            elif c == "{":
                i = match_brace(s, i)
                continue
            elif c == ">":
                return i + 1
            i += 1
        return i

    def mask(self, s: str) -> str:
        out: list[str] = []
        run: list[tuple[str, str]] = []

        def flush() -> None:
            if run:
                out.append(self.text_run(run))
                run.clear()

        i = 0
        while i < len(s):
            if s.startswith("<!--", i):
                flush()
                j = s.find("-->", i)
                j = len(s) if j < 0 else j + 3
                out.append(s[i:j])  # comments stay byte for byte
                i = j
            elif s[i] == "<" and re.match(r"</?[A-Za-z]", s[i:i + 3]):
                flush()
                j = self.scan_tag_end(s, i)
                out.append(self.tag(s[i:j]))
                i = j
            elif s[i] == "{":
                j = match_brace(s, i)
                run.append(("e", s[i:j]))
                i = j
            else:
                run.append(("t", s[i]))
                i += 1
        flush()
        return "".join(out)


BLOCK_RE = re.compile(r"^<(script|style)\b[^>]*>.*?^</\1>", re.S | re.M)


def mask_code(text: str, svelte: bool, keep: set[str] | None = None) -> tuple[str, list[str]]:
    """Blank out everything a copy edit may change, so what is left is code.
    Returns the masked text and the copy that was masked out."""
    keep = compared_literals(text) if keep is None else keep
    copy: list[str] = []
    if not svelte:
        return mask_strings(text, keep, copy), copy
    out, pos = [], 0
    markup = SvelteMasker(keep, copy)
    for m in BLOCK_RE.finditer(text):
        out.append(markup.mask(text[pos:m.start()]))
        block = m.group(0)
        out.append(mask_strings(block, keep, copy, text, m.start()) if m.group(1) == "script" else block)
        pos = m.end()
    out.append(markup.mask(text[pos:]))
    return "".join(out), copy


def normalise(masked: str) -> list[str]:
    """Token list of the masked code, blind to whitespace layout and to how
    a masked string was split across `+` for line length."""
    flat = re.sub(r"\s+", " ", masked)
    flat = re.sub(r"§S§(?: ?\+ ?§S§)+", "§S§", flat)
    flat = re.sub(r"§T§(?: ?§T§)+", "§T§", flat)
    return re.sub(r"([{}()<>;,])", r" \1 ", flat).split()


def copy_facts(copy: list[str]) -> dict[str, Counter]:
    text = "\n".join(copy)
    links = Counter(URL_RE.findall(text))
    bare = URL_RE.sub(" ", text)
    return {
        "links": links,
        "numbers": Counter(n.replace(",", "") for n in NUMBER_RE.findall(bare)),
        "quotes": Counter(a or b for a, b in QUOTE_RE.findall(bare)),
        "fixed names": count_names(bare),
        "capitalised": Counter(CAP_RE.findall(bare)),
    }


def cmd_check_code(path: Path, old: str, new: str) -> int:
    svelte = path.suffix == ".svelte"
    errors: list[str] = []
    if svelte:
        styles = lambda t: [re.sub(r"\s+", " ", b.group(0)) for b in BLOCK_RE.finditer(t) if b.group(1) == "style"]
        if styles(old) != styles(new):
            errors.append("<style> changed; only user-facing text may change")
    keep = compared_literals(old)
    old_masked, old_copy = mask_code(old, svelte, keep)
    new_masked, new_copy = mask_code(new, svelte, keep)
    a, b = normalise(old_masked), normalise(new_masked)
    if a != b:
        diff = []
        for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
            if tag == "equal":
                continue
            ctx = " ".join(a[max(0, i1 - 6):i1])
            diff.append(f"… {ctx} [-{' '.join(a[i1:i2])}-] [+{' '.join(b[j1:j2])}+]")
        errors.append("code changed outside copy (only user-facing text may change):"
                      + "".join(f"\n    {d}" for d in diff[:20]))
        hit = sorted(k for k in keep if looks_like_copy(k) and (old.count(k) != new.count(k)))
        if hit:
            errors.append("these strings are compared against in code (===, !==, case), so they are ids "
                          "as well as copy and stay as they are: " + ", ".join(repr(k) for k in hit))
    e, warnings = compare(copy_facts(old_copy), copy_facts(new_copy), "\n".join(new_copy),
                          hard=("links", "numbers", "quotes", "fixed names"), soft=("capitalised",))
    return report(errors + e, warnings,
                  " (now run: bunx prettier --write \"<file>\" && bunx eslint \"<file>\""
                  " && bun run check && bun test)")


def cmd_check(path: Path) -> int:
    try:
        old = subprocess.run(["git", "show", f"HEAD:{rel(path)}"], cwd=ROOT, check=True,
                             capture_output=True, text=True).stdout
    except subprocess.CalledProcessError:
        print(f"{rel(path)} is not in HEAD; commit it before humanizing.")
        return 1
    new = path.read_text(encoding="utf-8")
    if old == new:
        print("unchanged")
        return 0
    if path.suffix in CODE_SUFFIXES:
        return cmd_check_code(path, old, new)
    if path.suffix == ".md":
        return cmd_check_markdown(old, new)
    print(f"{rel(path)}: only .svelte, .ts, .js and .md files can be checked")
    return 2


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1] not in {"next", "status", "check", "record"}:
        print(__doc__)
        return 2
    cmd = argv[1]
    if cmd in ("next", "status"):
        docs = "--docs" in argv[2:]
        return cmd_next(docs) if cmd == "next" else cmd_status(docs)
    if len(argv) != 3:
        print(f"usage: {argv[0]} {cmd} FILE")
        return 2
    path = (ROOT / argv[2]).resolve()
    if not path.is_file():
        print(f"no such file: {argv[2]}")
        return 2
    return cmd_check(path) if cmd == "check" else cmd_record(path)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
