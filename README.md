# Crossword Clue Tutor

**A hint-first crossword solver, answer explainer, and reviewed clue dictionary.**

[Use Crossword Clue Tutor](https://crosswordcluetutor.com) · [Editorial policy](https://crosswordcluetutor.com/editorial-policy/) · [Report an issue](https://crosswordcluetutor.com/feedback/)

Crossword Clue Tutor helps solvers get unstuck without immediately giving away the
fill. It combines crossing-pattern search, progressive hints, clear explanations, and
an editorially reviewed library of recurring clues and answer meanings.

The project is independent. It is not affiliated with a crossword publisher and does
not reproduce complete commercial grids or full answer lists.

## What the product includes

- **Pattern-aware solver** — combine clue text, answer length, and known letters.
- **Hints before spoilers** — reveal help progressively instead of jumping to the fill.
- **Explain my answer** — understand the definition, grammar, abbreviation, fact, or
  wordplay that makes an answer fit.
- **Crossword dictionary** — 100 reviewed meanings, pronunciations, and clue patterns
  drawn from the same editorial source as the live explanations.
- **Ambiguous clue guides** — compare possible answers by length and exact sense.
- **Selected daily coverage** — current explanations for a small set of useful clues
  from monitored publications, never a mirrored puzzle.
- **Return tools** — saved clues, a fresh-clue Atom feed, feedback, and a public contact
  route.
- **Classroom resources** — a reduced-analytics solver, printable original worksheet,
  and Grades 6–12 vocabulary routine with no student account.

## Editorial model

An indexed explanation must have:

1. a verifiable clue-answer relationship;
2. an original or materially reviewed hint, definition, signal, and explanation;
3. value beyond a bare answer;
4. an editorial review date and correction path.

Same-day clues are selected from publicly verifiable puzzle dates. Historical search
volume is used later to find coverage gaps; it is not used to block a new clue phrase
that did not exist before publication. Empty hubs, unreviewed tool output, complete
grids, and full publisher answer keys stay outside the sitemap.

## Architecture

| Area | Implementation |
| --- | --- |
| Site generation | Node.js static build in `scripts/build.mjs` |
| Solver | Browser-side matching with reviewed JSON assets |
| Feedback API | Cloudflare Pages Function with a bound D1 database |
| Hosting | Cloudflare Pages Direct Upload |
| CI/CD | GitHub Actions verifies one artifact, then deploys that artifact |
| Search discovery | Sitemap, Atom feed, internal links, and IndexNow with automatic sitemap-diff detection |
| Analytics | Cloudflare Web Analytics, cookie-free Pageview/Plausible Community Edition, and consent-delayed GA4 on standard pages; classroom pages omit GA4 |

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
npm ci
npm test
npm run build
npm run dev
```

Open <http://127.0.0.1:4173>.

The project has one runtime package, Nodemailer, for the guarded outreach sender.
Cloudflare deployment tooling is a development dependency.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run validate` | Validate reviewed editorial data |
| `npm run build` | Generate the complete static site in `dist/` |
| `npm run check` | Check SEO, internal links, structured data, and build invariants |
| `npm run content:publish -- <intake.json> --dry-run` | Preview a reviewed clue batch |
| `npm run content:publish -- <intake.json>` | Publish a reviewed clue batch locally |
| `npm run seo:audit-production` | Audit every production Sitemap URL |
| `npm run source:usatoday -- --output .local/usatoday-latest.json` | Read official current USA TODAY metadata and at most six ranked clue candidates without logging in or requesting solutions |
| `npm run source:latimes -- --output .local/latimes-latest.json` | Read the latest official LA Times date, puzzle ID, creator, editor, theme, and clue count without opening the puzzle payload |
| `npm run source:stats` | Summarize the ignored local source-intelligence database without printing raw clue rows |
| `npm run qa:url -- <run-name>` | Generate an analytics-tagged operator QA entry URL |
| `npm run email:check-dns` | Verify Cloudflare/Zoho mail authentication records |
| `npm run outreach:check` | Validate prepared outreach assets without sending |
| `node scripts/expand-reviewed-answer-profiles.mjs` | Idempotently add the approved reviewed-answer profile batch |

## Content model

The public build inputs are editorial content, not live database exports:

- `data/clues.json` — selected reviewed clue explanations;
- `data/answers.json` — answer meanings and clue patterns;
- `data/clue-hubs.json` — recurring clues with multiple possible answers;
- `data/clue-types.json` — clue-reading guides;
- `data/publications.json` — monitored publication configuration.

Fresh content enters through one intake file per publication and date:

```bash
npm run content:publish -- ops/intake/YYYY-MM-DD-source.json --dry-run
npm run content:publish -- ops/intake/YYYY-MM-DD-source.json
```

Adding a monitored publication does not create an empty public hub. A hub is generated
only after at least one selected clue has passed editorial validation.

## Private data boundary

The public repository contains source code, schema migrations, reviewed public content,
and aggregate operational evidence. It does **not** contain live D1 rows, feedback
submissions, mailbox data, credentials, raw analytics exports, or local database files.

- `migrations/` contains database schema only.
- Feedback rows remain in the bound production D1 database.
- Local D1 state, SQLite files, exports, and private working data belong under `.local/`
  or another ignored private-data directory.
- The static build never reads the feedback database or embeds its rows.
- Secrets are supplied through local environment variables or GitHub Actions Secrets.

See [Data boundaries](docs/DATA_BOUNDARIES.md) for the complete repository policy.

## Deployment

Every push to `main` runs `.github/workflows/ci.yml`:

1. install dependencies;
2. run tests and editorial validation;
3. build and check the static site;
4. upload the verified `dist/` artifact;
5. deploy that exact artifact to the `crossword-clue-tutor` Cloudflare Pages project;
6. submit changed URLs to IndexNow when a publish batch changed.

Cloudflare credentials exist only in GitHub Actions Secrets. The canonical production
site is [crosswordcluetutor.com](https://crosswordcluetutor.com).

## Contributing and corrections

Corrections and focused improvements are welcome. Please describe the affected clue,
answer, page, or code path and include evidence when a factual relationship is involved.
Do not submit complete publisher puzzles, scraped answer archives, private database
exports, credentials, or personal data.

For content corrections, use the [site feedback form](https://crosswordcluetutor.com/feedback/)
or email `hello@crosswordcluetutor.com`.

## Licensing

Source code is licensed under the [MIT License](LICENSE). Original editorial content,
reviewed datasets, research, operational materials, branding, and media are excluded
from the MIT grant and remain rights-reserved as described in
[CONTENT-LICENSE.md](CONTENT-LICENSE.md).

Permitted small excerpts of original editorial material must credit Crossword Clue
Tutor and include a visible standard **follow link** to the exact source page or to
[crosswordcluetutor.com](https://crosswordcluetutor.com). `nofollow`, `sponsored`,
JavaScript-only, redirect-masked, or robots-blocked links do not satisfy this condition.
Third-party clue excerpts and names remain the property of their respective owners.
