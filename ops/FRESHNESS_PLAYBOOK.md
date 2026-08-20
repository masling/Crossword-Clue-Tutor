# Fresh crossword clue publishing playbook

## Goal

Discover, review, publish, deploy, and submit high-intent clue pages on the same day a new puzzle appears. The target is useful single-clue explanations, not complete puzzle mirrors.

## Daily operating loop

1. Check official puzzle releases and visible daily discussion/search activity for
   NYT Mini, The New York Times Crossword, LA Times Crossword, and USA TODAY Crossword.
2. Capture candidate clue-answer pairs with publication, date, and clue number.
3. Treat every newly verifiable publication/date as routine daily coverage. Same-day
   publishing does not wait for or depend on keyword and trend data.
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

- 12:15 SGT: check NYT and LA Times dates after the U.S. midnight release window.
- 12:15–13:30 SGT: publish the routine current-date batch, write original copy,
  validate, deploy, and submit updated URLs.
- 18:15 SGT: recheck sources such as USA TODAY whose public clue pages appear later in
  the U.S. morning, and cover any monitored date still missing from the site.
- 21:00 SGT: record bot-filtered visits, search discovery, and any query impressions.

Publisher release times can change, so freshness is measured from confirmed public
availability rather than from a hard-coded date assumption. Free play does not grant
republication rights: never mirror a full grid or answer list, and never bypass a
publisher login or subscription boundary.

## Daily coverage rule

Every monitored source/date must receive selected clue coverage once exact clue-answer
pairs are publicly verifiable. Historical keyword volume is irrelevant to the same-day
decision because the exact queries do not exist before publication. Explanation quality
and the no-complete-puzzle boundary remain publishing requirements.

## Coverage-gap research

Use Bing Keyword Research, Google Trends, and Search Console only after routine daily
coverage to find:

- monitored publication dates that were missed;
- exact clue queries receiving impressions without a matching page;
- source hubs or clue families with meaningful demand but thin internal coverage;
- existing pages whose related entity, meaning, or clue variant deserves expansion.

Trend and search-volume work is a backfill and expansion loop, not the daily publishing
gate. Evidence-backed gap pages may be added after the current-date batch is complete.

## Tool-query consolidation rule

Treat broad tool and directory phrases differently from same-day clue queries:

- Measure roots such as `crossword solver`, `crossword puzzle answers`, `crossword
  dictionary`, `crossword clues and answers`, and answer-length phrases in Bing Keyword
  Research before expanding the information architecture.
- If an existing useful page already satisfies the intent, refine its title, heading,
  description, structured-data name, and internal anchor text instead of creating a
  competing URL.
- Create a new directory page only when the phrase has measurable demand and the page can
  expose at least five reviewed entries or a genuinely distinct tool action.
- No measurable signal means no new broad landing page. Keep useful existing pages, but
  record rejected expansions so the same zero-demand research is not repeated.
- Re-run build checks after changing an evergreen search target; every optimized page
  must retain canonical, social, breadcrumb, and collection/dictionary structured data.

## Gap candidate score

Score each candidate from 0–3 on:

- Source demand: the publication/query family has measurable Bing impressions.
- Near-term momentum: when available, the related entity/root is above its recent Google
  Trends average or appears in rising/newly discovered queries during the latest 2–3 days.
- Search language: the clue can be pasted verbatim into a search engine.
- Coverage gap: the date, query, or useful variant is absent or materially undercovered.
- Competition gap: current results are thin, incorrect, slow, or answer-only.

Publish the highest-scoring gaps after routine current-date coverage. Avoid creating
separate pages for punctuation-only clue variants.

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

## Cloudflare Web Analytics evidence query

Use the GraphQL Analytics API dataset `rumPageloadEventsAdaptiveGroups` for repeatable
traffic evidence. Filter with both:

- `siteTag: 9540d1c383b3452f99aa21ece1938246`
- `bot: 0`

Within this dataset, `count` is page-load count and `sum.visits` is visit count. Group a
second query by `dimensions.refererHost` to separate direct/self traffic from external
search referrals. The fixed historical window from `2026-08-19T01:20:00Z` through
`2026-08-19T13:23:00Z` reproduces the audited dashboard baseline exactly: 31 pageviews
and 25 visits, all direct or self-referred. This replay is the regression check for future
automation. Do not count a visit toward the acquisition goal unless its external search
referrer is present and the visit is outside the operator QA baseline.

For repeatable local execution, provide an Account Analytics Read token only through the
environment and run:

```sh
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npm run traffic:cloudflare
```

The command filters `bot: 0`, groups by referrer, subtracts both the legacy operator QA
baseline and visits whose entry path is `/qa/`, and reports verified search visits separately. It never
stores or prints the token. Use `TRAFFIC_DRY_RUN=1` to inspect the query without network
access or credentials.

Before any manual production test, generate and open a tagged entry URL:

```sh
npm run qa:url -- release-check-name
```

Pageview/Plausible records `utm_source=operator_qa`, `utm_medium=internal`, and
`utm_campaign=site_qa` in its Campaigns report. Cloudflare RUM separately counts the
noindex `/qa/` entry path. Always start operator browsing from that URL; do not visit a
production page directly when the visit is part of QA.

## Daily target during launch

- 5–10 reviewed fresh clue pages.
- 1 answer-meaning page when a new answer has durable evergreen value.
- All pages deployed within 60 minutes of review completion.
- Top five pages checked in Search Console within 24 hours.
