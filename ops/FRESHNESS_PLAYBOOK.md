# Fresh crossword clue publishing playbook

## Goal

Discover, review, publish, deploy, and submit high-intent clue pages on the same day a new puzzle appears. The target is useful single-clue explanations, not complete puzzle mirrors.

## Daily operating loop

1. Check official puzzle releases and visible daily discussion/search activity for
   NYT Mini, NYT Midi Crossword, The New York Times Crossword, LA Times Crossword,
   and USA TODAY Crossword.
   For USA TODAY, run `npm run source:usatoday -- --output .local/usatoday-latest.json`
   first. This deterministic adapter discovers the current unlocked puzzle from the
   official archive and clue API, persists the complete clue list only in the local
   ignored database, and emits a small ranked candidate set with date, title, creator,
   editor, and URL. Use public web research only if the adapter fails.
   For LA Times, run `npm run source:latimes -- --output .local/latimes-latest.json`
   to read the official AmuseLabs picker metadata before any public clue research.
2. Capture candidate clue-answer pairs with publication, date, and clue number.
3. Treat every newly verifiable publication/date as routine daily coverage. Same-day
   publishing does not wait for or depend on keyword and trend data.
4. Write an original hint, clue signal, definition, and explanation.
5. Run a dry review: `npm run content:publish -- ops/intake/<file>.json --dry-run`.
6. Publish the reviewed batch: `npm run content:publish -- ops/intake/<file>.json`.
7. Plan new answer profiles for the source date without historical filler: `npm run answer:gaps -- --date YYYY-MM-DD --current-only --output .local/answer-profile-current.json`.
8. Create and publish one reviewed answer intake for every current-date candidate. After all five sources are complete, run the planner again with `--target 25` and fill the remaining daily capacity from the historical-backfill lane. Dry-run each intake before publishing it.
9. Deploy the newly built `dist/` directory.
10. Notify IndexNow: `INDEXNOW_KEY=... npm run indexnow:submit`.
11. In Google Search Console, submit the sitemap once and request URL Inspection indexing only for the top few new pages. Do not use Google’s Indexing API for crossword pages; it is restricted to job-posting and livestream pages.
12. Record discovery, publish, deploy, submission, indexing, and traffic timestamps.

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

The USA TODAY adapter writes the complete public clue list only to the ignored local
SQLite database at `.local/source-intelligence.sqlite` for frequency and tool-design
analysis. Its public JSON output remains capped at 10 selected candidates. The GraphQL
query explicitly excludes the hidden `solution` field. Reveal Word requests an account,
so never request that field, sign in, or automate Reveal Puzzle. Verify answers only for
the small selected set before preparing an intake batch. Run `npm run source:stats` for
an aggregate report without printing the stored raw clue rows.

When a publisher exposes clue text only inside its public browser player, collect a
normalized DOM snapshot with publication, source date, source ID, title, creator,
editor, source URL, and Across/Down clue number and text. Do not collect Reveal data,
answers, filled cells, cookies, or account state. Import it with
`npm run source:import -- --input .local/source-snapshot.json --output .local/source-candidates.json`.
The importer rejects answer-bearing snapshots, stores the complete clue list only in
the ignored SQLite database, and emits a model-facing JSON file capped at ten ranked
candidates. This deterministic browser-to-database path is preferred to sending a full
clue list through a language model.

## Daily coverage rule

Every monitored source/date must receive selected clue coverage once exact clue-answer
pairs are publicly verifiable. Historical keyword volume is irrelevant to the same-day
decision because the exact queries do not exist before publication. Explanation quality
and the no-complete-puzzle boundary remain publishing requirements.

## Daily Definition & Meaning rule

After the reviewed clue batch is published, create one canonical Definition & Meaning
page for every unique current-date answer that does not already have an entry in
`data/answers.json`. Current-date answers are mandatory and are not capped at 25. When
the current batch produces fewer than 25 missing answers, fill the remaining daily
capacity from reviewed historical clues that still lack an answer page. If no verified
gaps remain, publish nothing rather than creating filler.

After each source batch, use `npm run answer:gaps -- --date YYYY-MM-DD --current-only`
so later source releases on the same day are never skipped. Once all five sources are
complete, subtract the number of current-answer profiles already published that local
day from 25. If the remainder is zero, record the daily backfill as complete with no
historical pages. Otherwise run `npm run answer:gaps -- --date YYYY-MM-DD --target
<remainder>` once for exactly that historical capacity. The output is a bounded
editorial plan, not publishable content.
The main agent must review or write the natural display term, pronunciation, definition,
crossword-specific use, alternate sense explanation, and clue patterns before running
`answer:publish`.

One answer maps to one canonical `/crosswordese/<slug>/` page that jointly covers
`[answer] definition`, `[answer] meaning`, `define [answer]`, and `[answer] crossword`.
Never create separate Definition and Meaning URLs. Proper names in the current batch
need an exact identity and source-backed description; historical pure-name candidates
are lower priority than words, phrases, abbreviations, foreign terms, and multi-sense
answers.

## Coverage-gap research

Use Bing Keyword Research, Google Trends, and Search Console only after routine daily
coverage to find:

- monitored publication dates that were missed;
- exact clue queries receiving impressions without a matching page;
- source hubs or clue families with meaningful demand but thin internal coverage;
- existing pages whose related entity, meaning, or clue variant deserves expansion.

Trend and search-volume work is a backfill and expansion loop, not the daily publishing
gate. Evidence-backed gap pages may be added after the current-date batch is complete.

Every local day after routine coverage, open the public Google Trends comparison for
`crossword` over the past one day, Worldwide:

`https://trends.google.com/trends/explore?date=now%201-d&q=crossword`

Review Related queries → Rising. Treat Breakout as a discovery signal, not absolute
search volume. Classify every candidate before publishing:

- load `opencli-host-execution`, run `opencli profile list` in the host layer, and
  dynamically resolve the currently connected profile marked `default`;
- use the installed `google-trends-ops` browser adapter with `google-trends related
  'crossword' --date 24h --type rising --page 0 --pageSize 25`; it opens one normal
  Trends page and passively structures only the responses that page loads itself;
- never hardcode a profile or use server-side `curl`, raw HTTP, shared automation
  egress, replayed/decomposed Trends requests, or undocumented/internal endpoints;
- when no profile is explicitly available, or the visible page is throttled/CAPTCHA-
  blocked, request an operator-exported Related queries → Rising CSV once and stop;

- publish exact crossword-clue queries only after the source date, publication, clue,
  and answer are publicly verified;
- use ambiguous roots such as `bichiya` only when the crossword query family and exact
  current clue are also visible;
- exclude Connections, generic dictionary, shopping, entertainment, and unrelated
  intent from Clue Tutor;
- if the public Trends page is throttled or presents a CAPTCHA, use an operator-exported
  CSV and do not bypass the restriction.

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

- Six reviewed fresh clue pages per monitored publication (30 total while five publications are active).
- Add a small number of separately verified Breakout gap pages after the routine 30 when the daily Trends pass identifies missing exact clue queries.
- If fewer than six exact pairs are reliably verifiable, publish the verified subset and keep the source/date pending until the gap is filled.
- Every missing unique current-date answer gets one Definition & Meaning page. If fewer than 25 are new, backfill reviewed historical gaps until the daily answer-page total reaches 25.
- All pages deployed within 60 minutes of review completion.
- Top five pages checked in Search Console within 24 hours.

For data-only intake updates, run the intake dry-run and the publisher's content/build/link checks. Run the full local test suite only when code, templates, adapters, or test-sensitive behavior changed; GitHub Actions remains the full-suite deployment gate.

## SEO review cadence during launch

- Review Pageview and Google Search Console evidence every 72 hours, measured from the last evidence-backed review.
- Request the values or export from the operator; automated runs do not open signed-in analytics dashboards.
- Do not refresh between review windows unless the operator supplies materially new evidence.
- Change page metadata only for a landing page with at least 20 impressions. At average position 8 or better with zero or weak clicks, review title and description for search intent; at positions 9–15, strengthen content coverage and internal authority first.
- Use entry pages, engagement time, bounce, and returning-visitor evidence to choose interaction and retention work; do not redesign the homepage from aggregate traffic alone.
