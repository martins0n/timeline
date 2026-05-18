---
name: wiki-compare
description: Build or expand cross-language Wikipedia comparison entries (EN/RU/HY/AZ) for `data/wiki-compare.json`. Use when the user asks to add a new article to the wiki-compare page, expand divergences in an existing article, audit claims for accuracy, or fix language-mixing issues in claim text.
argument-hint: <article-id> [start | expand | audit | add | structure]
allowed-tools: Read, Edit, Write, Bash, Grep, WebFetch
---

# Wiki-Compare

Builds the data behind `wiki-compare.html` — the page that shows the EN Wikipedia article inline with marks where the RU/HY/AZ versions diverge. Each divergence has: a `section_id`, an exact `marker_text` to highlight in EN, and four `claims` (one per language) anchored to specific Wikipedia section URLs.

The helper lives next to this file: `wiki_compare.py`. All paths below are relative to project root. The data lands in `data/wiki-compare.json`.

## Concepts

- **Article** — a Wikipedia topic with 4 language versions (en/ru/hy/az). Each becomes one entry in `data/wiki-compare.json#articles[]` with full EN body parsed into sections.
- **Section** — a heading-bounded block of the EN article body. The page renders each section's paragraphs in order; divergences attach to a specific `section_id`.
- **Divergence** — a single point of disagreement between languages. Has one of three shapes:
  - **Inline** — `section_id` + `marker_text` (exact EN substring). Highlights that phrase; click opens a panel showing all four claims. Used for phrase-level disagreements ("Turkey sent mercenaries", "occupied seven districts").
  - **Section-level** — `section_id` set, `marker_text` absent. Renders as a card at the end of the section. Used when the topic is the whole section rather than one phrase ("Risk of genocide section exists in EN but not AZ").
  - **Article-level** — `section_id: null`. Renders in the sidebar at top. Used for structural framings ("article-structure", "article-title", "article-depth").
- **omitted_in** — array of language codes whose body genuinely doesn't mention this topic at all (not "doesn't go into detail"). **Verify before setting** — see Step 4. Past errors here have been the most common quality problem.
- **Run dir** — `/tmp/wiki-compare/<article-id>/` with `context.json`. Holds the fetched language bodies + parsed sections. Ephemeral; the committed artifact is `data/wiki-compare.json`.

## When to use which workflow

- **`start`** — first time touching a Wikipedia topic. Fetches all 4 language versions + section trees, parses EN into sections.
- **`add`** — after `start`, insert the article skeleton into `data/wiki-compare.json` so the page renders the EN body.
- **`expand`** — add more divergences to an existing article. Most common workflow.
- **`audit`** — check existing data for coverage gaps, narration issues, broken markers.
- **`structure`** — generate the auto "article-structure" sidebar divergence.

---

## Workflow A — Add a brand-new article

### Step 1 — Fetch all 4 language versions

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py start <article-id> "<EN_Wikipedia_title>"
```

- `<article-id>` is the short kebab-case id (e.g., `khojaly`, `sumgait`, `2020-war`).
- `<EN_Wikipedia_title>` is the exact EN page title with spaces or underscores ("Khojaly massacre" or "Khojaly_massacre").
- The helper auto-discovers RU/HY/AZ titles via Wikipedia's `langlinks` API. If a language has no langlink, pass `--ru-title "..."` / `--hy-title "..."` / `--az-title "..."` explicitly.

Writes `/tmp/wiki-compare/<article-id>/context.json` with: titles, full plain-text bodies, raw section trees, parsed EN sections. Output reports the EN section ids you can target.

### Step 2 — Insert the article skeleton

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py add-article <article-id> \
  --topic-en "Khojaly — 25–26 February 1992" \
  --topic-ru "Ходжалы — 25–26 февраля 1992" \
  --summary "One-paragraph English summary of what the comparison covers" \
  --summary-ru "Russian translation of the summary"
```

This adds the article's EN body (as parsed sections) to `data/wiki-compare.json#articles[]`. At this point the wiki-compare page can render the article, but with zero divergence marks.

### Step 3 — Add the article-structure sidebar divergence

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py structure <article-id>
```

Prints the auto-generated divergence JSON (top-level sections + counts per language). Save to a file and merge:

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py structure <article-id> > /tmp/structure.json
echo "[$(cat /tmp/structure.json)]" > /tmp/structure-list.json
python3 .claude/skills/wiki-compare/wiki_compare.py merge <article-id> /tmp/structure-list.json
```

### Step 4 — Add divergences (see Workflow B)

---

## Workflow B — Add or expand divergences

This is the main loop. Use it when adding the first batch for a new article OR adding more to an existing one.

### Step 1 — Know what's already there

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py audit <article-id>
```

Reports per-section coverage. Look at sections with 0 or 1 divergences — those are the targets. Also check for narration / marker issues in the existing data.

### Step 2 — Read the article bodies

The run dir's `context.json` has all four bodies as plain text. Read it with the `Read` tool to plan divergences. Look for:

- **Terminology differences** — different names for the same event, place, or operation (Stepanakert/Xankəndi, Operation Ring/Çaykənd əməliyyatı, occupation/liberation).
- **Numbers that disagree** — casualty counts, refugee figures, troop strengths, weapons transferred.
- **Attribution differences** — who started a battle, who fired first, which side perpetrated an atrocity.
- **Selective naming** — incidents named in some versions and not others (Maraga in HY only; Karintak in AZ only; Iranian C-130 in RU only).
- **Section-structure differences** — sections one version dedicates space to and another omits (HY has «Films about the Liberation War»; AZ has «Soyqırımın tanınması»).

### Step 3 — Pick exact EN phrases (marker_text)

For inline divergences, choose a phrase from the EN article body that:

1. Is an exact substring of one specific EN section (verify with `grep` below).
2. Is short enough (≤ 100 chars) to highlight cleanly.
3. Is unique enough that there's no ambiguity which point it anchors.

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py sections <article-id> | grep <topic>
```

Or read `/tmp/wiki-compare/<article-id>/context.json` and search the relevant section's paragraphs.

### Step 4 — Verify omissions BEFORE claiming them

**The #1 past quality issue.** If you plan to mark `omitted_in: ['az']`, first prove that AZ really omits the topic:

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py grep <article-id> az "term1" "term2" "term3"
```

Use multiple terms — original-script spellings, transliterations, names, key numbers. If the term appears anywhere in the body, the AZ version is **not** omitting it — remove the omission flag and write a real claim about what AZ actually says.

Common variants to grep for:

- Names: Latin + native script (e.g. "Aliyev" / "Əliyev" / "Алиев" / "Ալիև").
- Place names: Stepanakert / Степанакерт / Ստեփանակերտ / Xankəndi.
- Events: Sumgait / Sumqayıt / Սումգայիթ / Сумгаит.
- Numerals in both Arabic and original-script numerals if relevant.

### Step 5 — Write the divergence file

Output a JSON array to `/tmp/wiki-compare/<article-id>/draft.json`:

```json
[
  {
    "id": "kebab-case-unique-id",
    "section_id": "lead",
    "marker_text": "exact substring from EN section",
    "severity": "factual",
    "topic": {
      "en": "Short English title ≤ 80 chars",
      "ru": "Russian translation"
    },
    "claims": {
      "en": {
        "text_en": "English narration. 1–2 sentences, ≤ 300 chars. Quotes from EN Wikipedia stay verbatim.",
        "text_ru": "Русский нарратив. Прямые цитаты EN Википедии остаются в оригинале внутри «…».",
        "source": "https://en.wikipedia.org/wiki/<TITLE>#Section_Anchor"
      },
      "ru": {
        "text_en": "English narration describing what RU Wikipedia says; Russian quotes go inside «…».",
        "text_ru": "Русский нарратив. Может цитировать оригинальный текст RU Википедии.",
        "source": "https://ru.wikipedia.org/wiki/<TITLE>#Anchor"
      },
      "hy": {
        "text_en": "English narration describing what HY Wikipedia says. Armenian quotes go inside «…».",
        "text_ru": "Русский нарратив. Армянские цитаты в «…». Чистый армянский текст без обрамления не пройдёт валидацию.",
        "source": "https://hy.wikipedia.org/wiki/<TITLE>#Anchor"
      },
      "az": {
        "text_en": "English narration. AZ-Latin quotes in «…».",
        "text_ru": "Русский нарратив. AZ-Latin цитаты в «…».",
        "source": "https://az.wikipedia.org/wiki/<TITLE>#Anchor"
      }
    },
    "omitted_in": ["hy"]
  }
]
```

**Hard rules:**

- `marker_text` is verified by the validator — must be in the named EN section.
- Every claim must carry BOTH `text_en` AND `text_ru`. The page picks `text_<UI_LANG>` so wiki-compare.html shows English and wiki-compare-ru.html shows Russian. Original-language quotes (Armenian, AZ-Latin, etc.) stay inside `«…»` verbatim — only the narration is translated.
- `claims.hy.text_*` and `claims.az.text_*` must contain ≥ 35% Latin/Cyrillic characters (narration), not be 100% original-script.
- `severity`: `factual` if numbers/specific facts disagree, `framing` if it's terminology/interpretation.
- `omitted_in` only if you've actually grep'd the body and confirmed absence.
- Source URLs: prefer section-anchored URLs (`#Section_Anchor`). Anchors come from the section tree in `context.json#sections_raw[lang][n].anchor`. URL-encode anchors with non-ASCII characters when constructing the URL.

### Step 6 — Validate

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py validate <article-id> /tmp/wiki-compare/<article-id>/draft.json
```

Reports per-divergence issues. Fix everything before merging unless the issue is a known false positive (then use `--allow-issues`).

The validator checks:

- `marker_text` is a substring of the named EN section (or finds where it actually lives).
- Each language has a `claims` entry with `text` and `source`.
- HY/AZ claim text has narration (≥ 35% Latin/Cyrillic).
- `omitted_in` claims don't contradict the body — if `marker_text` contains a name that DOES appear in the omitted-lang's body, you'll get a warning.

### Step 7 — Merge

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py merge <article-id> /tmp/wiki-compare/<article-id>/draft.json
```

Appends to `data/wiki-compare.json#articles[<id>].divergences`. Deduplicates by `id` and by `(section_id, marker_text)`. Re-runs validation first; use `--skip-validate` to override.

### Step 8 — Re-audit

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py audit <article-id>
```

Confirm coverage targets met (≥ 2 per content section is a reasonable bar) and no new validation regressions.

### Step 9 — Commit

```bash
git add data/wiki-compare.json
git commit -m "$(cat <<'EOF'
wiki-compare: <article-id> +<N> divergences

<One paragraph: what topics the new divergences cover, any
notable cross-language pattern you surfaced.>
EOF
)"
```

---

## Workflow C — Audit & fix existing data

```bash
python3 .claude/skills/wiki-compare/wiki_compare.py audit <article-id>
```

Common fixes:

- **Section under-covered** (< 2 divergences) — go to Workflow B and add more for that `section_id`.
- **Narration issue** (HY/AZ claim is mostly original-script with no English/Russian framing) — edit the claim text directly: wrap original-script text in `«…»` quotes and write a Russian or English sentence around it. The validator will pass once narration ≥ 35%.
- **Broken marker** (marker_text isn't in the section anymore) — either the EN article changed, or the marker was wrong. Re-run `start` to refresh the body, then either update `section_id` or pick a new `marker_text`.

---

## Gotchas

- **Don't trust "AZ omits X" without grepping.** This is the most common past error. Always run `grep <article-id> az "Term"` for several variants before flagging an omission.
- **Wikipedia rate limits.** The `start` subcommand sleeps between requests. If you hit `429 Too Many Requests`, wait 30s and retry.
- **Section anchors are language-specific.** The same topic has different anchors in each language. Use `context.json#sections_raw[lang]` to look up the real anchor; don't reuse the EN anchor for other languages.
- **Plain-text extracts lose tables and infoboxes.** Casualty figures often live in the infobox, not the body. If `grep` doesn't find a number, it might still be in the infobox — fetch the live URL with WebFetch and look for the numeric table.
- **Run dir is ephemeral.** `/tmp/wiki-compare/...` gets cleaned on reboot. Re-run `start` if needed; the data file is what's committed.
- **Don't fabricate.** If you can't confirm what a language says about a topic, write "Не упоминается в теле статьи." with `omitted_in` set, AFTER actually grepping. Better to skip a divergence than guess.
- **One article at a time.** The tools work per-article. To compare ten conflicts, run the workflow ten times.
- **Quote stewardship.** When quoting AZ-Latin (`«Çaykənd əməliyyatı»`) or Armenian (`«Արցախյան ազատամարտ»`) inside a claim, keep the quote short and parenthetically gloss it in English or Russian. The page renders narrow cards; long unparseable quotes hurt readability.

## Quick recipe — adding a new article end-to-end

```bash
ART=khojaly
# 1. Fetch
python3 .claude/skills/wiki-compare/wiki_compare.py start $ART "Khojaly massacre"
# 2. Add skeleton
python3 .claude/skills/wiki-compare/wiki_compare.py add-article $ART \
  --topic-en "Khojaly — 25–26 February 1992" \
  --topic-ru "Ходжалы — 25–26 февраля 1992" \
  --summary "Cross-language Wikipedia comparison of the Khojaly massacre."
# 3. Structure card
python3 .claude/skills/wiki-compare/wiki_compare.py structure $ART > /tmp/wiki-compare/$ART/struct.json
echo "[$(cat /tmp/wiki-compare/$ART/struct.json)]" > /tmp/wiki-compare/$ART/struct-list.json
python3 .claude/skills/wiki-compare/wiki_compare.py merge $ART /tmp/wiki-compare/$ART/struct-list.json
# 4. Read the bodies, draft divergences, write them to /tmp/wiki-compare/$ART/draft.json
# 5. Validate + merge
python3 .claude/skills/wiki-compare/wiki_compare.py validate $ART /tmp/wiki-compare/$ART/draft.json
python3 .claude/skills/wiki-compare/wiki_compare.py merge $ART /tmp/wiki-compare/$ART/draft.json
# 6. Audit and iterate
python3 .claude/skills/wiki-compare/wiki_compare.py audit $ART
```
