# Crossword Clue Tutor growth optimization plan

Date: 2026-08-28  
Planning horizon: 28 days  
Decision: preserve exact-current-clue acquisition, then optimize the full chain from impression to return use.

## Requirements summary

Crossword Clue Tutor already has a functioning acquisition wedge: exact daily clue pages. The current bottleneck is not basic indexability or product absence. It is the conversion chain:

`search impression -> click -> answer/task completion -> next clue/tool use -> return visit`

Current evidence:

- Last-seven-day GSC: 5,574 impressions, 24 clicks, 0.4% CTR, average position 8.6 (`ops/launch-state.json:534`).
- Several exact queries rank around positions 4–6 with zero clicks, while two pages at comparable positions reach 3.4% and 6.7% CTR (`ops/launch-state.json:542`).
- Last-seven-day Pageview: 94 visitors, 96 visits, 125 pageviews, 85% bounce, 40-second duration; Google supplied 47 visits, but operator-QA adjustment is not proven for this snapshot (`ops/launch-state.json:50`).
- The site already exposes quick answer, progressive reveal, explanation, same-puzzle links, solver continuation, saved clues and return paths on each explainer (`scripts/build.mjs:730`).
- The solver already records useful behavioral events in GA4, including reveal, solver submission, second solver submission, save, related-clue navigation and clinic completion (`src/app.js:461`).
- The private/runtime solver corpus already contains 139,207 licensed WordNet candidates; it is intentionally sharded and does not create thin public pages (`research/2026-08-26-hybrid-solver-delivery.md:24`).

Net Web Agent knowledge applied:

- Diagnose the broken stage rather than changing the whole site: indexed with impressions but no clicks means inspect title, snippet, brand and SERP; clicks without task completion means inspect the landing experience.
- Match page type to intent: exact-clue queries need an immediate exact-answer experience, not an article-first flow.
- A strong tool page combines landing promise, tool/action and result on one URL; Crossword Clue Tutor already has this foundation and should deepen it rather than add unrelated pages.
- Information gain must come from useful service and explanation, not more templated words: clue signal, answer meaning, ambiguity, crossings, and a next-clue workflow.
- Scale private candidate coverage aggressively, but index only pages with verified pairings, original explanation and measurable demand or navigation value.

## Objectives and decision metrics

### 14-day objectives

1. Raise non-branded organic CTR from 0.4% to at least 1.2%; stretch target 2.0%.
2. For treatment queries at average position 4–6, reach at least 2.5% CTR; positions 6–8 at least 1.5%; positions 8–10 at least 1.0%.
3. On search-entry explainer sessions, achieve at least one activation event in 25% of sessions. Activation is one of: answer reveal, solver submit, same-puzzle click, related-clue click, save clue, or clinic completion.
4. Reduce search-entry bounce below 75% and raise average duration above 60 seconds, using operator-QA-excluded evidence where available.

### 28-day objectives

1. Reach at least 2.0% aggregate non-branded organic CTR if average position remains 8.6 or improves.
2. Reach at least 15% continuation rate from an explainer to a second useful page or solver action.
3. Reach at least 8% second-solve rate among sessions that submit one solver query.
4. Continue the existing minimum traffic objective of 500 non-operator unique visitors, without treating unverified direct traffic as search success.

## Phase 0 — establish the experiment baseline

Files:

- `ops/launch-state.json`
- `ops/traffic-log.csv`
- `scripts/audit-production-seo.mjs`

Actions:

1. Freeze unrelated homepage and global-template redesigns for the first seven days.
2. Record the six initial treatment queries and their page URLs, baseline impressions, clicks, CTR, position, current title and current description.
3. Preserve two positive controls unchanged: `paper-and-pencil-game-missing-ps-nyt-mini` and `lost-star-daniel-kim-usa-today`.
4. Use the existing 72-hour SEO review cadence. Do not evaluate a changed page until it has either 100 new impressions or seven complete days of post-recrawl data.
5. Segment GSC by query/page and, when volume permits, device and country. Do not infer a title failure from aggregate site CTR alone.

Acceptance criteria:

- Every treatment and control URL has a timestamped baseline.
- No treatment page is changed more than once in one evaluation window.
- Operator-QA traffic remains excluded or explicitly labelled unadjusted.

## Phase 1 — focused SERP click experiment

Files:

- `scripts/build.mjs:749`
- `data/clues.json`
- `test/content.test.mjs`
- `scripts/audit-production-seo.mjs`

Initial treatment cohort:

- `Is canned`
- `Criminals' sphere`
- `Apex`
- `Animal that appears orange to human eyes, but as a camouflaged green to deer`
- `Sunny part of a breakfast order`
- `Like someone who unplugs completely`

Actions:

1. Add optional per-clue SEO title and description overrides rather than rewriting every existing page.
2. Use a consistent promise structure:
   - Short title: `[Exact clue] — [Source] Clue ([N] Letters)`.
   - Long title: a faithful shortened clue phrase, then source and length.
   - Description: `Need the [N]-letter answer to “[clue]”? Reveal the exact fill, then see its meaning and why it fits the [date] [source] puzzle.`
3. Remove the unknown brand suffix when it crowds out source or answer length. Keep the brand in structured data and on-page identity.
4. Lead with certainty (`exact fill`, answer length, source/date) rather than the process (`Get a hint first`). Do not place the answer itself in metadata.
5. Keep the answer content under `data-nosnippet`; the click should promise both solution and explanation without creating a zero-click answer box.
6. For long clues, test the rendered mobile title and description so source, length and value appear before truncation.
7. Request recrawl only for the changed cohort, once after deployment.

Acceptance criteria:

- Treatment titles are unique, faithful to the clue and no longer than the tested mobile display budget.
- Descriptions are page-specific and contain answer length, source/date and a concrete action promise.
- Positive controls remain unchanged.
- At the evaluation gate, treatment pages collectively reach at least 1.5% CTR or improve by at least 100% over baseline without a material position loss.
- If CTR does not improve, inspect the actual rendered Google title/snippet and SERP features before a second copy change.

## Phase 2 — turn search clicks into task completion

Files:

- `scripts/build.mjs:766`
- `src/app.js:461`
- `src/app.js:676`
- `src/style.css`

Actions:

1. Preserve the first-screen order: exact clue, source/date, answer length, `Show answer now`, hint path. Avoid adding editorial or promotional material above the answer action.
2. Make `Show answer now` reveal the answer and the first explanation sentence in one action; keep the full explanation available immediately below.
3. After reveal, show one primary continuation action based on context:
   - another selected clue from the same puzzle date, when available;
   - otherwise the embedded solver with clue/pattern input ready.
4. Keep save, recent clues, clinic and PWA secondary until the answer task is complete.
5. Add clear empty and fallback states to the solver: dictionary candidate, reviewed related candidate, or no verified fit. Never manufacture an answer.
6. Send the existing product events to Pageview/Plausible as custom events as well as GA4, so acquisition and engagement can be compared in one privacy-light source. Minimum events: `answer_reveal`, `solver_submit`, `second_solver_submit`, `same_puzzle_clue_click`, `related_clue_click`, `save_clue`, `daily_clinic_complete`.

Acceptance criteria:

- The answer action is visible without scrolling on common mobile widths.
- Search-entry sessions produce a 25% activation rate.
- At least 15% of activated explainer sessions continue to a second page or solver action.
- No regression in accessibility, structured data, analytics consent behavior or build checks.

## Phase 3 — build a reason to return

Files:

- `scripts/build.mjs:771`
- `src/app.js:230`
- `src/app.js:364`
- `src/manifest.webmanifest`

Actions:

1. Reframe Daily Clue Clinic as a daily five-minute solving routine, not an archive. The current date page should show progress and a clear next clue.
2. After a user solves or reveals two clues, offer one unobtrusive return mechanism: save today’s clinic, install the PWA, or subscribe to the Atom feed. Do not show all three at once.
3. On return, restore recent solve sessions and show the current publication/date before generic navigation.
4. Measure retention using GA4 returning-user/cohort evidence plus local repeat-action events; Pageview does not currently expose returning visitors and must not be used to invent that metric.
5. Do not introduce accounts or email capture solely for retention during this phase.

Acceptance criteria:

- At least 8% of first solver users perform a second solver submission in the same session.
- At least 5% of activated users save a clue, complete a clinic, install the PWA or use the feed path.
- A seven-day return baseline is available in GA4 before setting a return-rate improvement target.

## Phase 4 — expand useful coverage without multiplying thin pages

Files:

- `scripts/wordnet-solver-corpus.mjs:28`
- `research/2026-08-26-hybrid-solver-delivery.md:41`
- `data/answers.json`
- `data/clue-hubs.json`
- `.local/source-intelligence.sqlite`

Actions:

1. Keep all 139,207 WordNet candidates in sharded runtime use; do not convert them into indexable pages.
2. Maintain six reviewed pages for each of the five monitored daily sources on release. Same-day publishing remains independent of historic exact-query volume.
3. Use GSC and solver logs as the promotion gate from private data to public content:
   - exact query receives at least 20 impressions; or
   - solver candidate is requested repeatedly and lacks a reviewed explanation; or
   - answer/source/date page is needed to connect an existing high-impression cluster.
4. Fill immediate internal-authority gaps around demonstrated queries, including answer profiles for `UNDERWORLD` and `TIGER`, before generic dictionary expansion.
5. Create clue hubs only when multiple reviewed answers or repeated demand make comparison useful. Each indexed page must add an explanation, ambiguity resolution, source context or interactive task.
6. Keep full source data in the Git-ignored local database and model-facing candidate sets bounded.

Acceptance criteria:

- Solver candidate coverage remains at least 100 times the reviewed clue count.
- No WordNet-only candidate creates an indexable public page automatically.
- Every new indexed page has an inbound link, is reachable within three clicks and passes the existing build gate.
- Public expansion reports pages promoted by search/solver evidence separately from routine daily clue pages.

## Phase 5 — authority and distribution built around real assets

Files:

- `ops/outreach/manifest.json`
- `ops/TEACHER_PILOT.md`
- `research/2026-08-24-student-product-readiness.md`
- `data/classroom-clues.json`

Actions:

1. Continue one or two individually reviewed outreach actions per day only after current-date source coverage is complete.
2. Lead pitches with a concrete asset, not the generic homepage:
   - 500-record classroom vocabulary corpus and skill packs;
   - two-session teacher pilot kit;
   - ambiguity dataset and explanation method;
   - privacy-conscious browser-side solver.
3. Build a small embeddable solver or clue-pattern widget only after the activation metrics prove users complete the task. The embed must provide real value, attribution and an optional link; it must not be a forced reciprocal-link mechanism.
4. Follow up once after 7–10 days where the resource remains relevant; distinguish sent, replied, under review and live-link states.
5. Use external mentions to strengthen relevant source, educator and solver hubs rather than sending all links to the homepage.

Acceptance criteria:

- At least two relevant editorial/resource replies or live placements are produced in 28 days.
- At least five distinct educators complete two sessions before the teacher pilot is described as validated.
- No directory submission, email or direct visit is counted as a backlink until a live link is verified.

## Operating order

1. Daily source freshness remains the first operational priority.
2. Deploy the six-page CTR cohort and freeze it until the evaluation gate.
3. Add Pageview custom activation events and confirm the first-screen answer flow.
4. Review CTR and engagement together; do not optimize clicks that immediately bounce.
5. Promote only evidence-backed public pages from the private corpus.
6. Continue authority outreach using the classroom and explanation assets.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Google rewrites titles or descriptions | Record the rendered snippet, not just source metadata; wait for recrawl and sufficient impressions. |
| Daily query demand decays before evaluation | Use a cohort of multiple current and evergreen exact clues; compare by position band and query age. |
| More assertive copy creates high bounce | Evaluate CTR jointly with activation, second-page action and duration. |
| Public page expansion becomes thin or duplicative | Keep WordNet private/runtime; require verified pair, original information gain and an internal navigation purpose. |
| Multiple simultaneous changes destroy attribution | Freeze controls and change one layer per evaluation window. |
| New-site authority suppresses CTR despite good copy | Continue relevant asset-led outreach and improve topical clusters; do not endlessly rewrite snippets. |

## Verification steps

1. Before deployment: run content validation, tests, build, build check and production SEO audit for metadata/template changes.
2. After deployment: verify canonical, title, description, H1, structured data, `data-nosnippet`, mobile first screen and analytics events on treatment and control pages.
3. After recrawl plus the evaluation gate: use OpenCLI Search Console query/page reports and Pageview source/entry/custom-event reports; keep windows and QA exclusions explicit.
4. Record each decision as `keep`, `iterate once`, or `revert`. Do not leave an experiment without a terminal decision.
5. At day 28, compare outcomes against the 14-day and 28-day objectives and revise the operating allocation among acquisition, CTR, retention, coverage and authority.

