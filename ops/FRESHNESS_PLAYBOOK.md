# Fresh crossword clue publishing playbook

## Goal

Discover, review, publish, deploy, and submit high-intent clue pages on the same day a new puzzle appears. The target is useful single-clue explanations, not complete puzzle mirrors.

## Daily operating loop

1. Check official puzzle releases and visible daily discussion/search activity for
   NYT Mini, The New York Times Crossword, LA Times Crossword, and USA TODAY Crossword.
2. Capture candidate clue-answer pairs with publication, date, and clue number.
3. Apply the demand gate before writing: require a high-volume publication/query family
   plus either a rising 2–3 day Google Trends root, a Bing newly discovered query, or
   actual Search Console impressions. Do not publish solely because a clue is interesting.
4. Write an original hint, clue signal, definition, and explanation.
5. Run a dry review: `npm run content:publish -- ops/intake/<file>.json --dry-run`.
6. Publish the reviewed batch: `npm run content:publish -- ops/intake/<file>.json`.
7. Deploy the newly built `dist/` directory.
8. Notify IndexNow: `INDEXNOW_KEY=... npm run indexnow:submit`.
9. In Google Search Console, submit the sitemap once and request URL Inspection indexing only for the top few new pages. Do not use Google’s Indexing API for crossword pages; it is restricted to job-posting and livestream pages.
10. Record discovery, publish, deploy, submission, indexing, and traffic timestamps.

The publishing command records new explainer URLs, matching answer-meaning pages,
the daily clinic, and changed hub pages. IndexNow submits that complete update set
after the production deployment is reachable.

On `main`, steps 7–8 run automatically in GitHub Actions after all verification
checks pass. The commands above remain the local recovery path.

## Singapore launch window

- 12:15 SGT: check the newly available U.S. puzzle dates and discussion signals.
- 12:15–13:30 SGT: select only high-confusion clues, write original teaching copy,
  validate, deploy, and submit updated URLs.
- 21:00 SGT: record bot-filtered visits, search discovery, and any query impressions.

Publisher release times can change, so freshness is measured from confirmed public
availability rather than from a hard-coded date assumption. Free play does not grant
republication rights: never mirror a full grid or answer list, and never bypass a
publisher login or subscription boundary.

## Demand gate and candidate score

No search signal means no page. Explanation quality is a pass/fail publishing
requirement, not a reason to select a candidate.

Score each candidate from 0–3 on:

- Base demand: the publication/query family has measurable Bing impressions.
- Near-term momentum: the related entity/root is above its recent Google Trends average
  or appears in rising/newly discovered queries during the latest 2–3 days.
- Search language: the clue can be pasted verbatim into a search engine.
- Freshness: the clue appeared on the latest publicly verifiable puzzle date.
- Competition gap: current results are thin, incorrect, slow, or answer-only.

Publish the highest total first. Avoid creating separate pages for punctuation-only clue variants.

## Required intake fields

Every fresh clue requires:

- `slug`, `clue`, `answer`
- `publication`, `sourceDate`, `clueNumber`
- `date`, `reviewedAt`, `popularity`
- `definition`, `explanation`, `partOfSpeech`
- `clueType`, `signal`, `hint`, `tags`

The hint must not contain the answer. The explanation must state why this exact answer fits this exact clue.

## Search submission boundary

- Google: sitemap, Atom feed, internal links, and limited URL Inspection requests.
- Bing and participating engines: IndexNow after the deployed key file is reachable.
- Submission only announces URLs; it does not guarantee crawling, indexing, or ranking.

## Daily target during launch

- 5–10 reviewed fresh clue pages.
- 1 answer-meaning page when a new answer has durable evergreen value.
- All pages deployed within 60 minutes of review completion.
- Top five pages checked in Search Console within 24 hours.
