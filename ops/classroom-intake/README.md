# Classroom corpus intake

Use one reviewed JSON batch per subject/skill expansion. Reference sources may inform
concept selection, facts, difficulty, and frequency even when commercial reuse rights
are unclear, but student-facing clue, hint, definition, signal, and explanation fields
must be independently written rather than copied.

Required scale metadata:

- stable `batchId`, `conceptId`, and `variantGroupId`
- `subject`, `skill`, `gradeBands`, `difficulty`, and `partOfSpeech`
- original clue, hint, definition, signal, and explanation
- `sourceKind`, `sourceUrl`, `sourceLicense`, and `requiredAttribution`
- `reviewStatus`, `reviewedAt`, and `contentVersion`

Before compiling a batch:

1. Record source and license/reference status.
2. Confirm student-facing wording is original.
3. Check answer length, duplicate wording, answer leaks, and sensitive content.
4. Materially review factual claims and grade appropriateness.
5. Keep blind paraphrase evaluation cases outside production data.
6. Run `npm run classroom:report` and the full test suite.

See `template.json` for the batch shape and
`research/2026-08-24-classroom-corpus-sources.md` for source policy.
