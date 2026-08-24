# Classroom corpus source and licensing review — 2026-08-24

## Objective

Scale the classroom corpus from 30 original demonstration clues to 500, 3,000, and
eventually 10,000 high-quality records without importing publisher puzzle content or
assuming that a downloadable vocabulary list is commercially reusable.

The classroom corpus must contain original clue wording, hints, signals, and
explanations. External sources may supply lexical concepts or factual verification only
when their license and attribution requirements are recorded per batch.

## Source decisions

### Approved lexical seed: Princeton WordNet 3.0

Status: **Approved with license notice preservation.**

Princeton states that WordNet may be used in commercial applications. Its license
permits use, copying, modification, and distribution for any purpose without a fee or
royalty, provided the required copyright notice, license statements, and disclaimer
appear on all copies and modifications. The Princeton name may not be used in
advertising.

Use boundary:

- Use synsets, parts of speech, and semantic relationships to propose answer concepts.
- Write every student-facing clue, hint, definition, signal, and explanation originally.
- Preserve the WordNet 3.0 license and attribution in internal source manifests and any
  distributed derivative data that contains WordNet material.
- Do not imply Princeton endorsement.

Official license:
https://wordnet.princeton.edu/license-and-commercial-use

### Licensed or reference source: OpenStax books

Status: **Per-book review required; blanket import rejected.**

Current OpenStax help documentation describes OpenStax textbooks generally as
CC BY-NC-SA and prohibits commercial use without permission. Some individual books or
collections still state CC BY 4.0. Therefore the catalog cannot be treated as one
commercially reusable source.

Use boundary:

- Exclude any book labeled CC BY-NC-SA from the commercial classroom corpus unless
  separate written permission is obtained.
- CC BY-NC-SA or otherwise restricted books may still be consulted internally to identify
  common curriculum concepts and verify facts, provided no protected definition wording,
  glossary structure, or substantial selection is copied into the public corpus.
- Allow a concept seed only when the exact book/version page explicitly states CC BY
  4.0 or another compatible commercial license.
- Record book title, edition, section URL, license URL, attribution text, retrieval date,
  and whether wording was quoted or only used for factual verification.
- Prefer original definitions even for approved books; never copy whole glossaries into
  public output.

Official licensing information:
https://help.openstax.org/s/article/Licensing-information-of-OpenStax-textbooks

Example of an individually stated CC BY 4.0 resource:
https://assets.openstax.org/oscms-prodcms/media/documents/Introduction_to_Intellectual_Property_2PYaEdp.pdf

### Reference-only until clarified: New General Service List sources

Status: **May inform internal prioritization; do not mirror or redistribute the list.**

Search results contain unrelated organizations using the NGSL abbreviation and third-
party mirrors. The old newgeneralservicelist.org domain is reported by the project
author as no longer affiliated with the vocabulary project. No authoritative commercial
reuse license was confirmed in this review.

Use boundary:

- Use published frequency tiers or individual commonly known words as a reference signal
  for which concepts deserve original classroom clues.
- Do not scrape an obsolete domain, copy definitions/examples, or reproduce the list's
  ordered selection as a substitute database.
- Student-facing wording remains independently written and materially reviewed.
- Upgrade the source from reference-only if the official project publishes a clear
  license or grants written permission.

Official-site warning from the project author:
https://www.linkedin.com/posts/charliebrowne_note-regarding-the-official-home-of-the-new-activity-7481597303984672768-G5PA

### Analysis/reference only: publisher crossword data and unclear clue archives

Status: **May inform frequency and ambiguity analysis; public wording remains original.**

- Full publisher or third-party archives may be used privately to measure answer
  frequency, clue ambiguity, length distributions, and curriculum gaps.
- They must not be mirrored as a public archive or copied verbatim into student-facing
  classroom records.
- Kaggle, GitHub, research-only, and large clue downloads can be reference inputs when
  provenance is recorded; the public clue, hint, definition, signal, and explanation must
  be newly written and reviewed.
- The private official-source database remains analysis-only but may influence which
  answer concepts receive original classroom variants first.

## Required future batch metadata

Every scalable classroom batch must record:

- `batchId`
- `conceptId`
- `variantGroupId`
- `answer`
- `subject`
- `skill`
- `gradeBands`
- `difficulty`
- `partOfSpeech`
- `clue`
- `hint`
- `definition`
- `signal`
- `explanation`
- `sourceKind`
- `sourceUrl`
- `sourceLicense`
- `requiredAttribution`
- `reviewStatus`
- `reviewedAt`
- `contentVersion`

## Production sequence

1. Select rights-cleared answer concepts.
2. Assign subject, skill, grade band, difficulty, and concept ID.
3. Write two or more original clue variants for high-value concepts.
4. Generate hint, definition, signal, and explanation as separate reviewed fields.
5. Run exact duplicate, near-duplicate, answer-leak, length, profanity/sensitive-content,
   factual consistency, and schema checks.
6. Materially review the batch and record provenance/license metadata.
7. Hold back a blind paraphrase set that is not copied into the production corpus.
8. Measure Top-1 and Top-3 retrieval by subject, grade band, difficulty, and skill.
9. Compile only passing batches into the browser-delivered classroom asset.

## Scale gates

- 500 records: controlled teacher pilot, with at least 250 unique concepts.
- 3,000 records: self-directed classroom beta, with at least 1,000 unique concepts.
- 10,000 records: strong multi-subject target, with at least 3,000 unique concepts and
  stratified blind retrieval evidence.

Record count alone never passes a gate. License coverage, metadata completeness,
variant diversity, factual review, and blind retrieval performance are mandatory.
