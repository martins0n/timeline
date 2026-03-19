# AGENT.md

## Project Mission

A platform for documented conflict timelines backed by verifiable sources. No interpretation, no editorial opinion. Bilingual EN/RU.

The Armenia–Azerbaijan conflict is the first timeline, but the platform is designed to cover other conflicts.

## Content Rules — Milestones

- Every quote must have `attribution`, `context`, and a verifiable `source` (URL preferred).
- Unverified sources are marked with `(?)` — these are known gaps, not acceptable final state.
- **Source verification is mandatory.** When adding or modifying quotes, fetch the source URL and confirm the quote text actually appears on the linked page. Never trust a URL without checking. This is a hard rule.
- All data changes go to BOTH `data/milestones.json` and `data/milestones-ru.json` — quote counts must match per milestone.

## Content Rules — Actors

- Major actors (presidents, PMs) should have 10–20 quotes spanning their full activity window.
- Gaps in coverage must be filled with real, web-verified quotes — never fabricated.

## Milestone Data Schema

Each milestone in `data/milestones.json` / `data/milestones-ru.json`:

```json
{
  "id": "slug-id",
  "name": "Event Name",
  "type": "date | interval",
  "date": "YYYY-MM-DD",           // for type "date"
  "dateStart": "YYYY-MM-DD",      // for type "interval"
  "dateEnd": "YYYY-MM-DD",        // for type "interval"
  "dateLabel": "Human-readable date",
  "summary": "Neutral description of the event.",
  "quotes": [
    {
      "text": "Exact quote text.",
      "attribution": "Speaker or body",
      "context": "When/where it was said",
      "source": "URL or book reference with (?) if unverified"
    }
  ],
  "videos": [
    {
      "youtubeId": "...",
      "title": "Video title"
    }
  ]
}
```

## Source Quality Hierarchy

1. Direct government / institutional URL
2. Major news archive
3. Secondary source
4. Book reference — mark with `(?)` if quote text cannot be verified online

## Neutrality

The timeline presents all sides' perspectives through their own words. Balance matters. Do not editorialize, interpret, or frame events in a way that favors one side.
