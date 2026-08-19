# Crossword Clue Tutor

A validation MVP for a spoiler-aware crossword clue assistant. It combines:

- clue + pattern matching;
- progressive hints before answer reveal;
- a verified `Explain my answer` flow;
- indexable crosswordese meaning pages;
- reviewed clue explainers and clue-type guides;
- a daily teaching set made from independent examples, not reproduced publisher puzzles.

## Run locally

```bash
npm test
npm run build
npm run dev
```

Open `http://127.0.0.1:4173`.

The project has no runtime dependencies. Node.js 20 or newer is required.

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

After deployment, notify participating search engines through IndexNow:

```bash
INDEXNOW_KEY=your_public_key npm run indexnow:submit
```

Google discovery uses the generated sitemap and Atom feed plus limited URL Inspection requests; Google’s Indexing API is not used because ordinary crossword pages are not eligible.

Private tool queries run in the browser and do not create URLs or indexable pages. Only reviewed data files generate pages included in the sitemap.

## Before deployment

Replace the reserved `.example` URL in `site.config.json` with the final HTTPS domain. The build intentionally warns until this is done.

See [the opportunity research](research/2026-08-18-crossword-opportunity.md) for the market, keyword, sourcing, legal-risk, and validation rationale.
