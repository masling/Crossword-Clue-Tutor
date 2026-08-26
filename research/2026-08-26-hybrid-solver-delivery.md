# Hybrid solver delivery — 2026-08-26

## Confirmed direction

Crossword Clue Tutor will not try to beat established clue databases by publishing
millions of thin answer pages. It will combine much broader private/runtime candidate
coverage with a smaller reviewed explanation layer.

The product promise is:

> Get the answer now. Understand the clue. Recognize the pattern next time.

## Core user scenarios

1. A search visitor lands on an exact clue page and wants the answer immediately.
2. A solver knows some crossing letters and wants a short ranked candidate list.
3. A learner wants hints first and a clear explanation after revealing the answer.
4. A solver has several stuck clues and wants to continue without returning to search.

## MVP scope

### Must ship

- Quick-answer and hint-first modes in the solver.
- Ranked evidence for every candidate: review status, pattern, length, and semantic fit.
- A hybrid fallback corpus that is at least 100 times the current reviewed clue count;
  the first full WordNet build contains 139,207 filtered candidates after the
  non-adult content boundary is applied.
- Local-only recent solve session history with one-click query restoration.
- Exact clue pages with a visible quick-answer action while preserving spoiler-light help.
- Clear labeling between reviewed clue-answer pairs and dictionary candidates.
- WordNet license attribution and an explicit three-tier data boundary.

### Not in this delivery

- Full-grid solving, image OCR, accounts, cloud history, community features, or a generic
  chat interface.
- Automatic publication of dictionary candidates or model-generated explanations.
- Public distribution of complete publisher grids or unreviewed historical clue dumps.

## Data tiers

| Tier | Purpose | Public page | Solver use | Storage |
| --- | --- | --- | --- | --- |
| Reviewed editorial pairs | Exact answers, hints, explanations | Yes | Yes | Git-reviewed JSON |
| Licensed lexical candidates | Pattern and semantic fallback | No | Yes | Generated at build; local DB copy |
| Source intelligence | Freshness, ranking, gap analysis | No | Internal only unless reviewed | Git-ignored SQLite |

The first licensed expansion uses Princeton WordNet 3.1. Its license permits use,
copying, modification, and distribution for any purpose without fee, provided the
required copyright and disclaimer remain with distributed copies.

## Acceptance criteria

- Generated lexical candidates are at least `reviewed_clues * 100` at build time.
- The browser never downloads the complete corpus: the first 20,000 candidates are
  sharded by length, and the extended layer is sharded by length plus first letter.
- The lexical corpus is generated from a declared dependency and is not committed as a
  large data file.
- Adult/sexual senses are excluded from the candidate export.
- Standard solver queries merge reviewed and lexical candidates without duplicate answers.
- Reviewed exact matches always rank ahead of lexical fallback candidates.
- Quick mode reveals the answer immediately; Tutor mode keeps the progressive hint flow.
- Candidate cards state why a result is present and whether it is reviewed.
- Recent solve history remains only in local storage and can restore a query.
- The full test, validation, build, and build-check suites pass.

## Product metrics

- Solver result rate and no-result rate.
- Reviewed versus dictionary-fallback result mix.
- Answer reveal rate by Quick/Tutor mode.
- Second solve submitted in the same browser session.
- Explanation-open rate, saved-clue rate, and seven-day return rate.
