import test from "node:test";
import assert from "node:assert/strict";
import { planAnswerProfileGaps } from "../scripts/plan-answer-profile-gaps.mjs";

function clue(answer, date, popularity, clueType = "definition") {
  return { answer, clue: `${answer} clue`, definition: `${answer} definition is long enough for a reviewed profile.`, explanation: `${answer} explanation is long enough to document why this exact answer fits the clue.`, partOfSpeech: "noun", clueType, signal: "A reviewed signal.", hint: "A reviewed hint that does not reveal the answer.", date, sourceDate: date, reviewedAt: date, popularity };
}

test("plans every current missing answer before historical backfill", () => {
  const result = planAnswerProfileGaps({
    date: "2026-08-28",
    target: 3,
    answers: [{ answer: "KNOWN" }],
    clues: [clue("KNOWN", "2026-08-28", 100), clue("TODAYA", "2026-08-28", 90), clue("TODAYB", "2026-08-28", 80), clue("OLDER", "2026-08-20", 100, "wordplay"), clue("NAME", "2026-08-27", 100, "proper-noun")]
  });
  assert.equal(result.currentMissing, 2);
  assert.equal(result.historicalBackfill, 1);
  assert.deepEqual(result.candidates.map((item) => item.answer), ["TODAYA", "TODAYB", "OLDER"]);
  assert.deepEqual(result.candidates.map((item) => item.lane), ["current", "current", "historical-backfill"]);
});

test("keeps all current answers even when they exceed the backfill target", () => {
  const result = planAnswerProfileGaps({
    date: "2026-08-28",
    target: 1,
    answers: [],
    clues: [clue("ONE", "2026-08-28", 90), clue("TWO", "2026-08-28", 80), clue("OLD", "2026-08-20", 100)]
  });
  assert.equal(result.selectedCount, 2);
  assert.equal(result.historicalBackfill, 0);
  assert.deepEqual(result.candidates.map((item) => item.answer), ["ONE", "TWO"]);
});

test("current-only mode never consumes a historical backfill slot", () => {
  const result = planAnswerProfileGaps({
    date: "2026-08-28",
    target: 25,
    currentOnly: true,
    answers: [],
    clues: [clue("TODAY", "2026-08-28", 80), clue("OLDER", "2026-08-20", 100)]
  });
  assert.equal(result.currentMissing, 1);
  assert.equal(result.historicalBackfill, 0);
  assert.deepEqual(result.candidates.map((item) => item.answer), ["TODAY"]);
});
