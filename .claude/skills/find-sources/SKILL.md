---
name: find-sources
description: Find a real quote + verified source URL for a given speaker at a given milestone (or any empty (?) slot). Inverse of fact-check-sources. Use when the user asks to add or complete a quote from a known speaker at a known event.
argument-hint: <milestone-id> [speaker name] [goal...]
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, WebFetch, WebSearch
---

# Find Sources

Given a speaker and a milestone, find a **real, verifiable quote** the speaker actually said at that event (or in the immediate aftermath), plus a live URL where the text appears. Proofs in any language are acceptable — translate to EN/RU at the end. Never fabricate.

The helper lives next to this file: `find_sources.py`. All paths below are relative to the project root. This skill is the write-side twin of `fact-check-sources`: its output lands as an `edits.json` consumed by `fact_check.py apply`, so **every edit touches both `data/milestones.json` and `data/milestones-ru.json` in lockstep**.

## Step 1 — Parse arguments & load context

Parse `$ARGUMENTS`. First token is the milestone id (required). Remaining tokens form an optional speaker name and/or free-form goal. If no milestone is provided, ask the user for one.

```bash
python3 .claude/skills/find-sources/find_sources.py start \
  --milestone "<MID>" \
  --speaker   "<SPEAKER or omit>" \
  --goal      "<free-form optional hint>"
```

The helper prints a JSON summary with `run_dir` — **remember it** for every later call. It also writes `context.json` with: milestone name, date(s), EN + RU summary, attached videos, **existing quotes** (including any empty `(?)` slots to fill), matching-speaker quotes already present, and neighboring milestones for date triangulation.

Read `context.json` yourself (`Read` tool). Decide:

- **Empty slot to fill?** If an existing quote has `is_empty_slot: true` and the user's speaker matches its `attribution`, the goal is to replace that specific `quote_index`. This is the usual case when the user invokes this skill after fact-check flagged a standalone `(?)`.
- **New quote to add?** If no matching slot exists, you'll append a brand-new entry.
- **Speaker already well-covered here?** If `matching_speaker_quotes` already has 2–3 entries for this speaker at this milestone, tell the user — adding more may be redundant.

## Step 2 — Search the web

Use `WebSearch` to find primary sources. Typical query patterns (adapt to the speaker/event):

- `"<speaker last name>" "<milestone keyword>" <YYYY>` — English press coverage
- `"<speaker name in Cyrillic>" <event> <YYYY>` — Russian / Armenian / Azerbaijani press
- `site:kremlin.ru <speaker> <date>` — presidential transcripts for RU officials
- `site:president.az <date>` / `site:armenpress.am <date>` — official gov archives
- `<speaker> speech transcript <event>` — look for full transcripts, not paraphrases

**Source quality hierarchy** (from CLAUDE.md — respect it):

1. Direct government / institutional URL (kremlin.ru, president.az, gov.am, un.org, osce.org)
2. Major news archives (BBC, Reuters, RFE/RL, TASS, Interfax, Associated Press)
3. Secondary reputable coverage (EVN Report, JAM-news, Caucasian Knot, Eurasianet)
4. Wayback Machine snapshots of any of the above
5. Book references — generally avoid; this skill produces URL-backed quotes

Run 4–8 `WebSearch` calls **in parallel** per message. Collect candidate URLs. Don't record anything yet.

## Step 3 — Fetch & extract candidate quotes

For the most promising 4–6 URLs, fire `WebFetch` calls **in parallel**. Prompt pattern:

> I'm looking for a verbatim quote by «SPEAKER» at/about «EVENT» (around «DATE»). If this page contains a direct quote attributed to this speaker about this event, return the **verbatim quoted text (in the original language of the page)** plus a short surrounding context sentence. Accept quotes in any language (English, Russian, Armenian, Azerbaijani). If no direct quote is present, reply NONE.

**Cross-language is fine.** If a Russian-language page has Putin saying something verbatim in Russian, capture the Russian. We translate at the edit step. Do **not** invent an English version just because the user's JSON stores English text.

If WebFetch returns blocked/empty for a promising URL, walk the same escalation ladder as fact-check: Wayback snapshot → user's real Chrome (osascript, macOS) → headless chromium. See `fact-check-sources/SKILL.md` step 3 for the exact commands; they apply verbatim here.

## Step 4 — Verify the final URL contains the quote

Before recording a candidate, re-verify: fetch the URL **fresh** and confirm the exact quote text still appears on the live page. This protects against LLM paraphrasing at the extraction step. Use the matcher where it applies:

```bash
python3 .claude/skills/fact-check-sources/fact_check.py match \
  --needle-file /tmp/needle.txt \
  --haystack-file /tmp/page.html --haystack-is-html
```

**For cross-language pages**, the character-based `match` subcommand **cannot** bridge scripts (Armenian vs English has zero overlap). In that case, `Read` the extracted text yourself and judge semantically: do names, numbers, dates, and specific claims line up with the candidate quote? Record `method: "chrome-semantic-hy"` / `"webfetch-semantic-ru"` etc.

If no candidate survives verification, stop. Report to the user what you looked at and why each failed — **do not invent one**. Offer to look harder with different search terms.

## Step 5 — Record candidates

For each candidate that passed Step 4:

```bash
python3 .claude/skills/find-sources/find_sources.py record-candidate \
  --run "<run_dir>" \
  --source      "https://verified.example.com/article" \
  --text        "EN text of the quote (translate from source if needed)" \
  --text-ru     "RU text of the quote (translate if needed)" \
  --attribution "Speaker Name (title/role)" \
  --context     "When/where it was said, one neutral sentence" \
  --context-ru  "Russian context line" \
  --method      "webfetch | webfetch-semantic-ru | chrome | yt-transcript:<id>" \
  --evidence    "short verbatim snippet from the verified page (<=240 chars)" \
  --score       0.95
```

**Translation rules:**

- If the original page is in Russian, `--text-ru` is the verbatim Russian and `--text` is your English translation. Preserve any journalistic markers (`«…»`, ellipses) — don't paraphrase the speaker.
- If the original is in Armenian or Azerbaijani, translate to both EN and RU. Keep the foreign-language evidence snippet in `--evidence` for audit.
- If the original is in English, translate to RU for `--text-ru`. Formal/official RU register.
- Attribution stays the same across EN/RU (e.g., `"Vladimir Putin, President of Russia"` / `"Владимир Путин, Президент России"`).

## Step 6 — Draft the edit (do NOT auto-apply)

For each candidate you want to land in the JSON:

```bash
# Fill an existing empty (?) slot:
python3 .claude/skills/find-sources/find_sources.py draft-edit \
  --run "<run_dir>" --candidate N --milestone "<MID>" \
  --replace-quote-index IDX

# OR append a new quote:
python3 .claude/skills/find-sources/find_sources.py draft-edit \
  --run "<run_dir>" --candidate N --milestone "<MID>" --add
```

This writes `<run_dir>/edits.json` in the format `fact_check.py apply` expects. `--replace-quote-index` emits a paired `replace_source` + `replace_quote` (so both the URL and the stored text get overwritten in lockstep). `--add` emits a single `add_quote` that appends to both EN and RU files.

Show the drafted edits to the user and ask: **"Apply these N edits? They touch both `data/milestones.json` and `data/milestones-ru.json`."** Wait for explicit confirmation.

## Step 7 — Apply, archive, commit (on confirm)

```bash
python3 .claude/skills/fact-check-sources/fact_check.py apply --edits "<run_dir>/edits.json"
python3 archive_sources.py
git add data/milestones.json data/milestones-ru.json data/sources-archive.json
git commit -m "$(cat <<'EOF'
find-sources: <speaker> at <milestone> — <added|filled> 1 quote

<One-paragraph explanation: what the quote is, where it comes from,
what language the source is in, and why it was selected. Include the
run_dir for traceability.>
EOF
)"
```

## Gotchas

- **Never fabricate**. If no verifiable quote exists, say so. A missing slot is better than a made-up one — fact-check-sources will just flag it again.
- **Paraphrase ≠ quote**. News articles often summarize a speaker's remarks. Only accept text that the source presents as a **direct quotation** (quoted, indented, or labeled as transcript).
- **Date sanity**. The quote's date should fall within ±30 days of the milestone, unless the context is "reflecting back on this event later". Check `neighbors` in `context.json` to avoid cross-contaminating with an adjacent milestone.
- **Cross-language proofs are fine**. An Armenian-language president.am page is perfectly valid evidence for an English quote stored in the JSON — as long as you can semantically verify the match and keep a foreign-language snippet in `--evidence`.
- **RU translations are mandatory**. The JSON schema requires paired EN/RU entries. If you can't produce a faithful Russian translation, flag the candidate as needing manual review and ask the user rather than guessing.
- **Run-dir is ephemeral**. `/tmp/timeline-find-sources/<ts>/` gets cleaned on reboot. Commit the data-file changes; the run dir is audit-only.
- **Speaker already well-covered**. Major actors (presidents, PMs) target 10–20 quotes across the full timeline — per milestone, 2–3 is usually enough. Mention this to the user if you're about to add a fourth or fifth quote for the same speaker at the same event.
