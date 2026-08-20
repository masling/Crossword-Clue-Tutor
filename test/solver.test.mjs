import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clueHubCandidates, normalizeClue, normalizePattern, patternToRegExp, scoreClueMatch, solveClues } from "../src/solver.mjs";

const clues = [
  { answer: "SPEC", clue: "Contractor's detail, for short", definition: "A specification", tags: ["work"], popularity: 10 },
  { answer: "SEAR", clue: "Burn slightly", definition: "Scorch", tags: ["heat"], popularity: 7 },
  { answer: "SAFE", clue: "Out of danger", definition: "Protected", tags: ["common"], popularity: 5 }
];

test("normalizes separators and removes unsupported characters", () => {
  assert.equal(normalizePattern("s-e. c!"), "S?E?C");
});

test("normalizes punctuation and curly apostrophes in clues", () => {
  assert.equal(normalizeClue("  Contractor’s detail—for short! "), "contractor's detail for short");
});

test("supports single-letter and multi-letter wildcards", () => {
  assert.equal(patternToRegExp("S?E?").test("SPEC"), true);
  assert.equal(patternToRegExp("S*").test("SAFE"), true);
  assert.equal(patternToRegExp("S?A?").test("SEAR"), true);
});

test("combines a letter pattern with clue keywords", () => {
  const results = solveClues(clues, { pattern: "S?E?", clue: "contractor" });
  assert.deepEqual(results.map((item) => item.answer), ["SPEC"]);
});

test("ranks an exact clue ahead of supporting-text matches", () => {
  assert.ok(scoreClueMatch(clues[0], "Contractor's detail, for short") > scoreClueMatch(clues[0], "work"));
});

test("filters by answer length when no pattern is supplied", () => {
  const results = solveClues(clues, { length: 4, clue: "danger" });
  assert.deepEqual(results.map((item) => item.answer), ["SAFE"]);
});

test("returns popular matches first", () => {
  const results = solveClues(clues, { pattern: "S???" });
  assert.deepEqual(results.map((item) => item.answer), ["SPEC", "SEAR", "SAFE"]);
});

test("turns a multi-answer clue hub into solver candidates", () => {
  const candidates = clueHubCandidates([{
    slug: "sharp",
    clue: "Sharp",
    reviewedAt: "2026-08-20",
    preferredAnswers: ["KEEN", "ACUTE"],
    answers: [
      { answer: "ACID", sense: "Sharp or biting in taste or tone." },
      { answer: "KEEN", sense: "Sharp-edged or mentally perceptive." },
      { answer: "ACUTE", sense: "Sharp in angle, pain, or perception." }
    ]
  }]);

  assert.equal(candidates.length, 3);
  assert.equal(candidates[1].hubSlug, "sharp");
  assert.equal(candidates[1].sourceKind, "clue-hub");
  assert.equal(candidates[1].hint.toUpperCase().includes("KEEN"), false);
});

test("uses length, crossings, and preferred order for hub candidates", () => {
  const candidates = clueHubCandidates([{
    slug: "sharp",
    clue: "Sharp",
    reviewedAt: "2026-08-20",
    preferredAnswers: ["KEEN", "ACUTE", "ACID"],
    answers: [
      { answer: "ACID", sense: "Sharp or biting in taste or tone." },
      { answer: "KEEN", sense: "Sharp-edged or mentally perceptive." },
      { answer: "ACUTE", sense: "Sharp in angle, pain, or perception." }
    ]
  }]);

  const fourLetters = solveClues(candidates, { clue: "sharp", length: 4 });
  assert.deepEqual(fourLetters.map((item) => item.answer), ["KEEN", "ACID"]);
  assert.deepEqual(solveClues(candidates, { clue: "sharp", pattern: "K?E?" }).map((item) => item.answer), ["KEEN"]);
});

test("serves demand-backed clue hubs through the live solver data", async () => {
  const hubs = JSON.parse(await readFile(new URL("../data/clue-hubs.json", import.meta.url), "utf8"));
  const candidates = clueHubCandidates(hubs);

  assert.equal(solveClues(candidates, { clue: "nipping", length: 6 })[0].answer, "BITING");
  assert.equal(solveClues(candidates, { clue: "nipping off", pattern: "S???????" })[0].answer, "SNIPPING");
  assert.equal(solveClues(candidates, { clue: "congenital", length: 6 })[0].answer, "INBORN");
  assert.equal(solveClues(candidates, { clue: "congenital trait", pattern: "I???????" })[0].answer, "INHERENT");
  assert.equal(solveClues(candidates, { clue: "inflated", length: 7 })[0].answer, "SWOLLEN");
  assert.equal(solveClues(candidates, { clue: "inflated prices", pattern: "H???" })[0].answer, "HIGH");
  assert.equal(solveClues(candidates, { clue: "inflated language", length: 6 })[0].answer, "TURGID");
  assert.equal(solveClues(candidates, { clue: "noble", length: 5 })[0].answer, "GRAND");
  assert.equal(solveClues(candidates, { clue: "noble person", pattern: "L???" })[0].answer, "LORD");
  assert.equal(solveClues(candidates, { clue: "noble gas", pattern: "?E??" })[0].answer, "NEON");
  assert.equal(solveClues(candidates, { clue: "cajole", length: 4 })[0].answer, "COAX");
  assert.equal(solveClues(candidates, { clue: "cajole with flattery", length: 7 })[0].answer, "WHEEDLE");
  assert.equal(solveClues(candidates, { clue: "cajole deceptively", pattern: "I???????" })[0].answer, "INVEIGLE");
  assert.equal(solveClues(candidates, { clue: "path", length: 5 })[0].answer, "ROUTE");
  assert.equal(solveClues(candidates, { clue: "path through woods", pattern: "T????" })[0].answer, "TRAIL");
  assert.equal(solveClues(candidates, { clue: "flight path", pattern: "O????" })[0].answer, "ORBIT");
  assert.equal(solveClues(candidates, { clue: "wealth", length: 6 })[0].answer, "RICHES");
  assert.equal(solveClues(candidates, { clue: "wealth", pattern: "M????" })[0].answer, "MONEY");
  assert.equal(solveClues(candidates, { clue: "wealth of information", pattern: "R????????" })[0].answer, "RESOURCES");
});
