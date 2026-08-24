import test from "node:test";
import assert from "node:assert/strict";
import { validateSourceClueSnapshot } from "../scripts/source-clue-snapshot-lib.mjs";

const valid = {
  publication: "LA Times Crossword",
  sourceDate: "2026-08-23",
  sourceId: "tca260823",
  title: "L. A. Times, Sun, Aug 23, 2026",
  sourceUrl: "https://www.latimes.com/games/daily-crossword",
  clues: [
    { direction: "Across", number: "1", clue: "Purple or green herb" },
    { direction: "Down", number: "1", clue: "One of the Great Lakes" }
  ]
};

test("validates a normalized public clue snapshot", () => {
  const result = validateSourceClueSnapshot(valid);
  assert.equal(result.clues.length, 2);
  assert.equal(result.captureMode, "public-browser-dom-no-login");
});

test("rejects answer-bearing snapshots", () => {
  assert.throws(() => validateSourceClueSnapshot({ ...valid, clues: [{ ...valid.clues[0], solution: "BASIL" }] }), /solution fields/);
});

test("rejects duplicate direction and number keys", () => {
  assert.throws(() => validateSourceClueSnapshot({ ...valid, clues: [valid.clues[0], valid.clues[0]] }), /Duplicate clue key/);
});
