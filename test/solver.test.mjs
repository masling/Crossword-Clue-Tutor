import test from "node:test";
import assert from "node:assert/strict";
import { normalizeClue, normalizePattern, patternToRegExp, scoreClueMatch, solveClues } from "../src/solver.mjs";

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
