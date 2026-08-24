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
- No student account is required; classroom pages omit GA4 and retain only cookie-free Pageview measurement.

## Fixed critical gap

Before this readiness pass, all five printable worksheet clues were absent from the Solver candidate data. A teacher or reviewer following the published worksheet into the classroom Solver would receive no intended match for all five examples.

This is now a permanent acceptance test: every worksheet clue must rank its intended classroom answer first.

## What this is sufficient for

- A TeachersFirst reviewer to test the guide, worksheet, and classroom Solver as one coherent activity.
- A teacher to run one or several 20-minute, teacher-directed vocabulary sessions.
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

### Gate B — recurring teacher beta

- At least 150 original classroom clues: 25 per skill group.
- At least three ready-to-print practice sets per skill group.
- At least 90% top-3 accuracy on a blind benchmark of 100 teacher-written clues that are explicitly represented in the reviewed library.
- Less than 2% confirmed incorrect-answer reports on reviewed classroom content.
- At least five teachers complete two sessions and provide structured feedback.

### Gate C — strong self-directed student product

- At least 500 original classroom clues across 12 or more skill/topic packs.
- At least 200 unique curriculum-relevant answer concepts.
- Separate grade-band and difficulty progression validated by educators.
- At least 90% task completion for a selected practice set and measurable second-session return behavior.
- Progress storage, deletion, recovery, and student privacy model explicitly designed and tested.
- Pricing is considered only after these experience and data gates, not before them.

## First-version non-goals

- No automated publication of generated classroom clues.
- No claim of unlimited arbitrary-clue coverage.
- No student accounts, grades, leaderboards, or public profiles.
- No full commercial puzzle grids or answer keys.
- No pricing experiment during the initial quality and directory-review window.

## Next data iteration

Expand from 30 to 150 original classroom clues by adding 20 materially reviewed clues to each of the six existing skills. Every batch must ship with exact-solve tests, difficulty distribution checks, and at least one printable practice set before its count is used in product copy.
