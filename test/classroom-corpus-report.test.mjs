import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summarizeClassroomCorpus } from "../scripts/classroom-corpus-report.mjs";

test("reports the current classroom corpus honestly as a demonstration, not broad coverage", async () => {
  const records = JSON.parse(await readFile(new URL("../data/classroom-clues.json", import.meta.url), "utf8"));
  const report = summarizeClassroomCorpus(records);

  assert.equal(report.records, 30);
  assert.equal(report.uniqueConcepts, 30);
  assert.equal(report.conceptsWithMultipleVariants, 0);
  assert.equal(Object.keys(report.skills).length, 6);
  assert.equal(report.quality.noCriticalIssues, true);
  assert.equal(report.gates.directoryReviewDemo.passed, true);
  assert.equal(report.scalableMetadata.completeRecords, 30);
  assert.equal(report.scalableMetadata.recordsWithGaps, 0);
  assert.equal(report.gates.controlledTeacherPilot.passed, false);
  assert.equal(report.gates.selfDirectedClassroomBeta.passed, false);
  assert.equal(report.gates.strongMultiSubjectProduct.passed, false);
  assert.equal(report.blindBenchmark.status, "not_measured");
});

test("blocks scale gates when duplicates, answer leaks, or metadata gaps remain", () => {
  const base = {
    slug: "one",
    clue: "Example clue",
    answer: "ANSWER",
    hint: "This hint says ANSWER",
    skill: "academic-language",
    difficulty: "advanced",
    gradeBands: ["6-8", "9-12"],
    sourceKind: "reference-informed-original"
  };
  const report = summarizeClassroomCorpus([base, { ...base, slug: "two" }]);
  assert.equal(report.quality.noCriticalIssues, false);
  assert.equal(report.quality.duplicatePairs.length, 1);
  assert.equal(report.quality.hintLeaks.length, 2);
  assert.equal(report.scalableMetadata.recordsWithGaps, 2);
});
