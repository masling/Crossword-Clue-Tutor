# Student product readiness — 2026-08-24

## Decision

Pricing is deferred. The immediate objective is to make the classroom experience and reviewed data demonstrably useful enough for an educator directory review and a small teacher-directed beta.

The product has two different readiness levels:

1. **Teacher-directed classroom beta:** can be useful with a bounded, visible set of reviewed clues and a clear lesson routine.
2. **Long-term self-directed student product:** requires far more curriculum-balanced data, blind evaluation, progress design, and repeated-use content.

These levels must not be described as if they are the same.

## Current beta evidence

- 30 original classroom clues written for Grades 6–12.
- Six balanced skill packs with five clues each:
  - Context and meaning
  - Word structure and morphology
  - Academic language
  - Science vocabulary
  - Language arts
  - Precision and revision
- Introductory, intermediate, and advanced difficulty labels.
- Every classroom clue includes answer length, part of speech, hint, definition, clue signal, explanation, grade bands, skill, difficulty, and original-content provenance.
- The five printable worksheet clues resolve to the intended reviewed answer in the classroom Solver.
- The classroom picker makes all 30 clues directly testable without guessing what the database contains.
- Six printable skill packs turn the complete classroom library into ready-to-use student sheets with separate teacher keys.
- No student account is required; classroom pages omit GA4 and retain only cookie-free Pageview measurement.

## Fixed critical gap

Before this readiness pass, all five printable worksheet clues were absent from the Solver candidate data. A teacher or reviewer following the published worksheet into the classroom Solver would receive no intended match for all five examples.

This is now a permanent acceptance test: every worksheet clue must rank its intended classroom answer first.

## What this is sufficient for

- A TeachersFirst reviewer to test the guide, worksheet, and classroom Solver as one coherent activity.
- A teacher to run one or several 20-minute, teacher-directed vocabulary sessions.
- A teacher to print six distinct skill-focused sessions without assembling materials manually.
- Demonstrating hint-before-answer reasoning, grammar signals, answer length, crossings, and written explanation.
- A small beta that gathers feedback about clarity, usefulness, and which skill packs teachers want next.

## What this is not yet sufficient for

- Claiming that arbitrary teacher-written clues will usually be answered.
- A semester-long independent student practice product.
- Personalized grade-level progression or mastery reporting.
- Standards-specific assignments across many subjects.
- Charging for access based on database breadth.

The UI must continue to state that the Solver uses a bounded reviewed library and does not invent an answer when no reviewed fit exists.

## Readiness gates

### Gate A — directory-review beta

- At least 30 original classroom clues.
- Six skill groups with at least five clues each.
- At least five advanced examples.
- 100% of first-party worksheet examples return the intended answer at rank 1.
- No student login requirement.
- Visible classroom use instructions, privacy boundary, teacher key, and missing-answer fallback.
- One printable student sheet and separate teacher key for every current skill group.

### Gate B — controlled teacher pilot

- At least 500 original classroom clues across the initial six skills and additional subject packs.
- At least 250 unique answer concepts and two independently worded clues for important concepts.
- At least three ready-to-print practice sets per skill group.
- At least 85% top-3 accuracy on a blind benchmark of 250 teacher-written clues that are explicitly represented in the reviewed library.
- Less than 2% confirmed incorrect-answer reports on reviewed classroom content.
- At least five teachers complete two sessions and provide structured feedback.

### Gate C — usable self-directed classroom beta

- At least 3,000 original classroom clues across 12 or more skill/topic packs.
- At least 1,000 unique curriculum-relevant answer concepts.
- Multiple original clue phrasings for high-value concepts so the product is not an exact-string demo.
- Separate grade-band and difficulty progression validated by educators.
- At least 85% top-3 accuracy on a blind benchmark of 1,000 in-library teacher/student clue phrasings.
- At least 90% task completion for selected practice sets and measurable second-session return behavior.
- Progress storage, deletion, recovery, and student privacy model explicitly designed and tested.

### Gate D — strong multi-subject student product

- At least 10,000 original classroom clues and 3,000 or more unique answer concepts.
- Grades 6–8 and 9–12 coverage across language arts, science, social studies, mathematics language, academic verbs, morphology, and general vocabulary.
- At least 90% top-3 accuracy on a blind, stratified benchmark with no test clues duplicated verbatim from training data.
- Educator review of grade appropriateness, ambiguity, factual accuracy, sensitive-content exclusions, and answer uniqueness.
- A scalable correction and versioning workflow with every published record carrying provenance and review status.

Pricing is considered only after these experience and data gates, not before them.

## First-version non-goals

- No automated publication of generated classroom clues.
- No claim of unlimited arbitrary-clue coverage.
- No student accounts, grades, leaderboards, or public profiles.
- No full commercial puzzle grids or answer keys.
- No pricing experiment during the initial quality and directory-review window.

## Next data iteration

Treat the current 30 records as a mode demonstration, not a coverage claim. Expand next from 30 to 500 original classroom clues through reviewed batches with explicit concept IDs, subject, grade band, difficulty, provenance, review status, and variant grouping. Every batch must ship with exact-solve tests, paraphrase benchmarks, difficulty distribution checks, and printable practice sets before its count is used in product copy. After the 500-record controlled pilot, scale toward 3,000 for a usable self-directed classroom beta and 10,000 for strong multi-subject coverage.
