# Crossword Clue Tutor

A validation MVP for a spoiler-aware crossword clue assistant. It combines:

- clue + pattern matching;
- progressive hints before answer reveal;
- a verified `Explain my answer` flow;
- indexable crosswordese meaning pages;
- reviewed clue explainers and clue-type guides;
- a daily teaching set made from reviewed examples and selected clue references,
  never a reproduced complete publisher puzzle.

## Run locally

```bash
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`.

The project has no runtime dependencies. Node.js 22 or newer is required for
the bundled Cloudflare deployment tooling.

## Content workflow

1. Add or update reviewed examples in `data/clues.json`.
2. Add answer entities in `data/answers.json`; one entity handles the `meaning`, `define`, `definition`, and `[answer] crossword` query family.
3. Run `npm run validate`.
4. Run `npm run build` to regenerate `dist/`, `sitemap.xml`, and `robots.txt`.

Fresh reviewed batches can be validated and published with:

```bash
npm run content:publish -- ops/intake/YYYY-MM-DD-source.json --dry-run
npm run content:publish -- ops/intake/YYYY-MM-DD-source.json
```

Deploy the production build to the existing Cloudflare Pages project, then
notify participating search engines through IndexNow:

```bash
npm run deploy
npm run indexnow:submit
```

Configure the final HTTPS domain before the production build:

```bash
npm run production:configure -- https://your-domain.com
```

Google discovery uses the generated sitemap and Atom feed plus limited URL Inspection requests; Google’s Indexing API is not used because ordinary crossword pages are not eligible.

Private tool queries run in the browser and do not create URLs or indexable pages. Only reviewed data files generate pages included in the sitemap.

## Production

The canonical production site is <https://crosswordcluetutor.com>. It is hosted
by the `crossword-clue-tutor` Cloudflare Pages project. Cloudflare Web Analytics
uses automatic JavaScript injection, Pageview provides a second pageview
measurement, and Google Search Console is verified with the apex-domain TXT
record. Do not remove that verification record.

The Pages project uses Direct Upload through GitHub Actions. Every push to
`main` runs the editorial and build checks, then deploys that exact verified
artifact to production and submits the recorded changed URLs to IndexNow. The
scoped Cloudflare credentials live only in GitHub Actions Secrets. `npm run
deploy` and `npm run indexnow:submit` remain manual fallbacks.

See [the opportunity research](research/2026-08-18-crossword-opportunity.md) for the market, keyword, sourcing, legal-risk, and validation rationale.
