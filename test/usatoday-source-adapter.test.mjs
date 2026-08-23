import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUsaTodayClueList, parseUsaTodayArchiveCard, parseUsaTodayDate, scoreUsaTodayClue, selectUsaTodayCandidates } from "../scripts/usatoday-source-adapter-lib.mjs";

test("normalizes the official USA TODAY date label", () => {
  assert.equal(parseUsaTodayDate("Aug. 23, 2026"), "2026-08-23");
  assert.equal(parseUsaTodayDate("unknown"), null);
});

test("parses the bounded first official archive card", () => {
  assert.deepEqual(
    parseUsaTodayArchiveCard("Aug. 23\nDown the Drain\nZhouqin Burnikel\nAmanda Rafkin", new Date("2026-08-23T00:00:00Z")),
    { sourceDate: "2026-08-23", title: "Down the Drain", creator: "Zhouqin Burnikel", editor: "Amanda Rafkin" }
  );
});

test("ranks entity-led and quoted-title clues ahead of generic clues", () => {
  const entity = scoreUsaTodayClue({ clue: '"Overcompensating" actor DiMarco' });
  const generic = scoreUsaTodayClue({ clue: "Thus far" });
  assert.ok(entity.score > generic.score);
  assert.ok(entity.reasons.includes("entity-led"));
  assert.ok(entity.reasons.includes("quoted-title"));
});

test("returns only a compact bounded candidate set", () => {
  const clues = [
    { number: "1", direction: "Across", clue: "Total hotties" },
    { number: "40", direction: "Across", clue: '"Overcompensating" actor DiMarco' },
    { number: "33", direction: "Down", clue: '"Shark Tank" investor Greiner' },
    { number: "58", direction: "Across", clue: 'Vietnamese for "festival"' }
  ];
  const selected = selectUsaTodayCandidates(clues, 2);
  assert.equal(selected.length, 2);
  assert.deepEqual(new Set(selected.map((clue) => clue.number)), new Set(["40", "33"]));
});

test("normalizes official clue arrays without needing a solution field", () => {
  assert.deepEqual(normalizeUsaTodayClueList([
    { number: 40, clue: '"Overcompensating" actor DiMarco' },
    { number: 58, clue: 'Vietnamese for "festival"' }
  ], "Across"), [
    { number: "40", direction: "Across", clue: '"Overcompensating" actor DiMarco' },
    { number: "58", direction: "Across", clue: 'Vietnamese for "festival"' }
  ]);
  assert.deepEqual(normalizeUsaTodayClueList({ 33: '"Shark Tank" investor Greiner' }, "Down"), [
    { number: "33", direction: "Down", clue: '"Shark Tank" investor Greiner' }
  ]);
  assert.deepEqual(normalizeUsaTodayClueList("01|Total hotties\n40|\"Overcompensating\" actor DiMarco", "Across"), [
    { number: "01", direction: "Across", clue: "Total hotties" },
    { number: "40", direction: "Across", clue: '"Overcompensating" actor DiMarco' }
  ]);
});
