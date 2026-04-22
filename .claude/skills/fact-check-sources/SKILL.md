---
name: fact-check-sources
description: Verify quote sources in the timeline against live URLs, EPUBs, and YouTube transcripts, propose edits to `(?)` flags, and archive confirmed sources. Use when the user asks to recheck sources for a milestone or the whole timeline.
argument-hint: <milestone-id | all | unverified>
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, WebFetch
---

# Fact-Check Sources

A source is verified when the quote text (or a clear fuzzy match) appears at the cited URL, EPUB chapter, or YouTube transcript. The skill resolves a scope, fetches each source along an escalation ladder, classifies verdicts, proposes edits to both EN and RU JSON files in lockstep, and — on user confirmation — applies them and refreshes the Wayback index.

The helper lives next to this file: `fact_check.py`. All paths below are relative to the project root unless noted.

## Step 1 — Resolve scope

Parse `$ARGUMENTS`. Valid scopes: a milestone id, `all`, `unverified`. If empty or anything else, ask the user to pick one of those three.

```bash
python3 .claude/skills/fact-check-sources/fact_check.py resolve "$ARGUMENTS"
```

The helper prints a JSON summary including `run_dir` and the path to `queue.json`. Remember `run_dir` — every later step references it. The queue contains paired EN/RU quotes classified by kind: `http`, `youtube`, `book`, `empty`.

## Step 2 — Verify HTTP and YouTube sources

For each item in `queue.json["quotes"]` with `kind == "http"` or `kind == "youtube"`:

1. **Primary: WebFetch the `source_clean` URL.** Use a prompt like:

   > The quote is: "«QUOTE TEXT»". Does this exact text (or a clear paraphrase, or a translation in any language) appear on this page? The quote may have been translated from the speaker's original Armenian / Azerbaijani / Russian — accept a matching passage in any language. Reply with: MATCH (short verbatim snippet from the page as evidence, in whatever language the page uses; tag the language) / NO_MATCH / BLOCKED / NOT_FOUND.

2. Fire WebFetch calls **6–8 in parallel** per message to finish the batch quickly without hitting rate limits.

3. Record each result with the helper:

   ```bash
   python3 .claude/skills/fact-check-sources/fact_check.py record-finding \
     --queue "<run_dir>/queue.json" \
     --milestone-id MID --quote-index N \
     --method webfetch --match true --score 0.95 \
     --snippet "short verbatim snippet from page"
   ```

   For a non-match: `--match false --status nomatch|blocked|404`. The `status` values trigger different downstream classifications — use them faithfully.

4. **For `kind == "youtube"`**, additionally pull the transcript:

   ```bash
   TRANSCRIPT=$(python3 .claude/skills/fact-check-sources/fact_check.py yt-transcript --video "$URL")
   ```

   Then check the transcript's language (VTT files get a `.en.vtt` / `.ru.vtt` / `.hy.vtt` / `.az.vtt` suffix in the cache — the header written by the helper preserves the source filename). Two paths:

   - **Same language as the quote** (EN quote, `.en.vtt` transcript): use the local matcher.
     ```bash
     python3 .claude/skills/fact-check-sources/fact_check.py match \
       --needle-file /tmp/needle.txt --haystack-file "$TRANSCRIPT" --threshold 0.65
     ```
   - **Cross-language** (EN quote, `.hy`/`.az`/`.ru` transcript only): **do NOT run the local matcher** — it can't bridge scripts. Read the transcript yourself (`Read` tool on `$TRANSCRIPT`) and judge semantically whether the speaker says something equivalent to the English quote. Record the finding with an evidence snippet in the source language.

   Record the finding with `--method yt-transcript:<video_id>`. Transcripts are noisy — the 0.65 threshold is already baked into the `match` command above.

## Step 3 — Escalate failures

For each item whose WebFetch returned blocked/404/nomatch, walk this ladder until something succeeds or every rung fails:

### 3a — Wayback snapshot

Look up `data/sources-archive.json` for the `wayback_url`, then WebFetch it. Record with `--method wayback`.

### 3b — User's real Chrome (macOS)

**Only on darwin**, and only if WebFetch + Wayback both failed. This uses the user's real Chrome session (cookies, fingerprint) and gets through bot-challenges that block headless traffic.

Prerequisite, one-time: Chrome → View → Developer → **Allow JavaScript from Apple Events**. If it fails with "JavaScript is blocked", print that hint once and fall through to 3c.

```bash
URL='<URL>'
HTMLFILE=$(mktemp)
osascript <<AS > "$HTMLFILE" 2>/dev/null
tell application "Google Chrome"
  activate
  set newTab to make new tab at end of tabs of window 1 with properties {URL:"$URL"}
  repeat 30 times
    delay 0.5
    if (loading of newTab) is false then exit repeat
  end repeat
  delay 1.0
  set pageHTML to execute newTab javascript "document.documentElement.outerHTML"
  close newTab
  return pageHTML
end tell
AS
# Then match locally (strip HTML first):
python3 .claude/skills/fact-check-sources/fact_check.py match \
  --needle-file /tmp/needle.txt --haystack-file "$HTMLFILE" --haystack-is-html
```

Record with `--method chrome` and the JSON match result.

**Cross-language pages (armenpress.am, president.az, kremlin.ru, etc.)**: the English quote in the JSON is a translation of an Armenian / Azerbaijani / Russian original. The local `match` command cannot bridge scripts — there's zero character overlap between an English needle and an Armenian haystack. When the Chrome dump is in AM/AZ/RU and the quote is EN:

1. **Skip** `fact_check.py match`.
2. Strip the HTML yourself (the Read tool on `$HTMLFILE` is fine; or use `python3 -c "from sys import stdin; from fact_check import html_to_text; print(html_to_text(stdin.read()))" < "$HTMLFILE"`).
3. Read the extracted text and judge semantically — does this foreign-language passage say what the English quote claims? Look for names, dates, verbs, and specific facts; a loose translation still has anchor points.
4. Record the finding manually with `--method chrome-semantic-hy` / `chrome-semantic-az` / `chrome-semantic-ru`, `--match true|false`, and an evidence snippet **in the source language** (≤240 chars) so reviewers can verify.

Same applies for EN-quote-against-AM/AZ pages via WebFetch; but WebFetch's LLM usually handles cross-language matching without help, so this semantic path is mainly for Chrome/headless dumps.

### 3c — Headless chromium (final fallback)

Only if Chrome-via-osascript is unavailable:

```bash
chromium --headless --dump-dom "$URL" > "$HTMLFILE"
```

Then match the same way — including the cross-language caveat above. Record with `--method headless-chromium` (or `headless-chromium-semantic-<lang>` for the semantic path).

### 3d — YouTube transcripts from attached videos

If the quote still isn't verified AND the parent milestone has entries in its `videos` array, try each attached video's transcript. A speaker's recorded statement on the milestone's own video is strong corroborating evidence.

```bash
for VID in <videos from queue item>; do
  TRANSCRIPT=$(python3 .claude/skills/fact-check-sources/fact_check.py yt-transcript --video "$VID" --lang en,ru,hy,az)
  # Same two paths as step 2.4:
  #  - same-language transcript → fact_check.py match --threshold 0.65
  #  - cross-language transcript → read it, judge semantically, record manually
done
```

The helper's `yt-transcript` call above uses `--lang en,ru,hy,az` to pull Armenian and Azerbaijani captions when available (auto-generated or uploaded). Record with `--method yt-transcript:<id>` (same-language) or `yt-transcript-semantic-<lang>:<id>` (cross-language) per attempt.

## Step 4 — Verify book sources

```bash
python3 .claude/skills/fact-check-sources/fact_check.py grep-epub --queue "<run_dir>/queue.json"
```

This scans every `*.epub` in `external-data/` and fuzzy-matches each `kind == "book"` quote against chapter text. Findings are appended to `<run_dir>/findings.json` automatically.

## Step 5 — Classify & render

```bash
python3 .claude/skills/fact-check-sources/fact_check.py classify \
  --queue    "<run_dir>/queue.json" \
  --findings "<run_dir>/findings.json" \
  --verdicts-out "<run_dir>/verdicts.json" \
  --edits-out    "<run_dir>/edits.json"

python3 .claude/skills/fact-check-sources/fact_check.py render \
  --verdicts   "<run_dir>/verdicts.json" \
  --report-out "<run_dir>/report.md"
```

Status meanings the helper emits:

| Status | What it means | Edit produced |
|---|---|---|
| `verified` | URL live + quote found, wasn't marked `(?)` | none |
| `book-verified` | Quote found in EPUB, wasn't marked `(?)` | none |
| `needs-unmark` | Match found AND was previously `(?)` | `set_unverified flag=false` |
| `needs-mark` | URL reachable but quote not found; wasn't `(?)` | `set_unverified flag=true` |
| `broken-url` | URL returns 404/gone; wasn't `(?)` | `set_unverified flag=true` |
| `book-not-found` | Quote not in any EPUB; wasn't `(?)` | `set_unverified flag=true` |
| `manual-review` | Empty source, all-blocked, missing RU sibling, or anything ambiguous | none (human decides) |

The helper is conservative: edits only flip the `(?)` suffix. `replace_source` and `replace_quote` edits are supported by `apply` but never auto-emitted — if a quote looks fabricated, propose a replacement to the user in Step 6 as a free-form suggestion rather than an auto-generated edit.

## Step 6 — Present & confirm (do NOT auto-apply)

Read `<run_dir>/report.md` and summarize it for the user:

- Counts per status
- The full list of `manual-review` entries (these need human attention)
- Any `book-not-found` or `broken-url` items that look like fabricated quotes — suggest replacements or ask the user to investigate
- The total number of mechanical edits ready to apply

Then stop and ask: **"Apply the N mechanical `(?)` edits? These touch both `data/milestones.json` and `data/milestones-ru.json` in lockstep."** Wait for explicit confirmation.

If the user wants manual replacements beyond the mechanical edits, offer to draft them one at a time — each as an Edit on both JSON files — rather than mass-producing.

## Step 7 — Apply, archive, commit (on confirm)

```bash
python3 .claude/skills/fact-check-sources/fact_check.py apply --edits "<run_dir>/edits.json"
python3 archive_sources.py
git add data/milestones.json data/milestones-ru.json data/sources-archive.json
git commit -m "$(cat <<'EOF'
fact-check: <N> verified, <M> marked (?), <K> replaced

<One-paragraph summary of what changed and why. Mention the run_dir
for traceability.>
EOF
)"
```

Leave the report at `<run_dir>/report.md` untouched — it lives under `/tmp/` and is the audit trail for this run.

## Gotchas

- **EN-only verification**: URLs serve English text; RU quotes are translations of the same source. Verify the EN quote against the page; the RU sibling is treated as verified-by-association. Never substring-match RU text against an EN page — you'll get false negatives.
- **Cross-language sources (AM / AZ / RU pages)**: the English quote in the JSON is often a translation of the speaker's original Armenian, Azerbaijani, or Russian statement. `WebFetch` (an LLM) handles cross-language equivalence automatically — just ask it to return a MATCH with a verbatim snippet and accept a foreign-script snippet as evidence. But **`fact_check.py match` is character-based and cannot bridge scripts** — skip it for Chrome DOM dumps and non-English transcripts; read the extracted text yourself and judge semantically. See steps 2.4, 3b, 3c, 3d.
- **Missing RU sibling**: if a milestone has more EN quotes than RU quotes, the helper marks those entries `manual-review` with a note rather than emitting an unbalanced edit. Fix the RU file by hand, or replace the EN entry.
- **Standalone `(?)`**: 15 quotes currently have `source == "(?)"` — no URL to check. These always land as `manual-review` and need a human to supply a source.
- **Conservative edits only**: the helper won't propose `replace_source` or `replace_quote` on its own. Fabricated quotes are flagged; the user (or Claude in this session) must draft the replacement.
- **Run-dir is ephemeral**: `/tmp/timeline-fact-check/<ts>/` gets cleaned by macOS on reboot. Commit the data file changes; do not commit the report.
