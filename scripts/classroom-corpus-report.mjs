import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeClue, solveClues } from "../src/solver.mjs";

const scalableMetadataFields = [
  "conceptId", "variantGroupId", "subject", "sourceUrl", "sourceLicense",
  "requiredAttribution", "reviewStatus", "contentVersion"
];

function counts(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

export function evaluateBlindBenchmark(records, benchmarkCases = []) {
  if (!benchmarkCases.length) return { status: "not_measured", cases: 0, top1Rate: null, top3Rate: null, failures: [], bySkill: {} };
  const results = benchmarkCases.map((item) => {
    const matches = solveClues(records, { clue: item.clue, length: item.length, skill: item.skill }).slice(0, 10);
    const index = matches.findIndex((match) => match.answer === item.expectedAnswer);
    return { ...item, rank: index === -1 ? null : index + 1, candidates: matches.slice(0, 3).map((match) => match.answer) };
  });
  const top1 = results.filter((item) => item.rank === 1).length;
  const top3 = results.filter((item) => item.rank !== null && item.rank <= 3).length;
  const skills = [...new Set(results.map((item) => item.skill))].sort();
  const bySkill = Object.fromEntries(skills.map((skill) => {
    const items = results.filter((item) => item.skill === skill);
    return [skill, {
      cases: items.length,
      top1Rate: items.filter((item) => item.rank === 1).length / items.length,
      top3Rate: items.filter((item) => item.rank !== null && item.rank <= 3).length / items.length
    }];
  }));
  return {
    status: "measured",
    cases: results.length,
    top1Rate: top1 / results.length,
    top3Rate: top3 / results.length,
    nonTop1: results.filter((item) => item.rank !== 1),
    failures: results.filter((item) => item.rank === null || item.rank > 3),
    bySkill
  };
}

export function summarizeClassroomCorpus(records, { benchmarkCases = [] } = {}) {
  const concepts = new Map();
  const pairKeys = new Map();
  const duplicatePairs = [];
  const hintLeaks = [];
  const clueLeaks = [];
  const metadataGaps = [];
  const templateGroups = new Map();

  for (const record of records) {
    if (!concepts.has(record.answer)) concepts.set(record.answer, []);
    concepts.get(record.answer).push(record);

    const pairKey = `${normalizeClue(record.clue)}|${record.answer}`;
    if (pairKeys.has(pairKey)) duplicatePairs.push([pairKeys.get(pairKey), record.slug]);
    else pairKeys.set(pairKey, record.slug);

    if ((record.hint ?? "").toUpperCase().includes(record.answer ?? "__NO_ANSWER__")) hintLeaks.push(record.slug);
    const clueWords = (record.clue ?? "").toUpperCase().replace(/[^A-Z]+/g, " ").trim().split(/\s+/);
    if (clueWords.includes(record.answer ?? "__NO_ANSWER__")) clueLeaks.push(record.slug);
    for (const field of ["clue", "definition", "signal", "explanation"]) {
      const answer = (record.answer ?? "").toLowerCase();
      const skeleton = normalizeClue(record[field] ?? "").split(" ").filter((token) => token !== answer).join(" ");
      if (!skeleton) continue;
      const key = `${field}|${skeleton}`;
      if (!templateGroups.has(key)) templateGroups.set(key, []);
      templateGroups.get(key).push(record.slug);
    }
    const missing = scalableMetadataFields.filter((field) => record[field] === undefined || record[field] === "");
    if (missing.length) metadataGaps.push({ slug: record.slug, missing });
  }

  const uniqueConcepts = concepts.size;
  const conceptsWithMultipleVariants = [...concepts.values()].filter((items) => items.length >= 2).length;
  const skills = counts(records.map((record) => record.skill));
  const difficulties = counts(records.map((record) => record.difficulty));
  const gradeBands = counts(records.flatMap((record) => record.gradeBands ?? []));
  const completeMetadataRecords = records.length - metadataGaps.length;
  const templateDuplicates = [...templateGroups.entries()].filter(([, slugs]) => slugs.length >= 3).map(([template, slugs]) => ({ template, slugs }));
  const noCriticalIssues = duplicatePairs.length === 0 && hintLeaks.length === 0 && clueLeaks.length === 0 && templateDuplicates.length === 0;

  const blindBenchmark = evaluateBlindBenchmark(records, benchmarkCases);
  const gates = {
    directoryReviewDemo: {
      recordTarget: 30,
      passed: records.length >= 30 && Object.keys(skills).length >= 6 && (difficulties.advanced ?? 0) >= 5 && noCriticalIssues
    },
    controlledTeacherPilot: {
      recordTarget: 500,
      conceptTarget: 250,
      benchmarkCaseTarget: 250,
      passed: records.length >= 500 && uniqueConcepts >= 250 && completeMetadataRecords === records.length && noCriticalIssues && blindBenchmark.cases >= 250 && blindBenchmark.top3Rate >= 0.85
    },
    selfDirectedClassroomBeta: {
      recordTarget: 3000,
      conceptTarget: 1000,
      benchmarkCaseTarget: 1000,
      passed: records.length >= 3000 && uniqueConcepts >= 1000 && conceptsWithMultipleVariants >= 500 && completeMetadataRecords === records.length && noCriticalIssues && blindBenchmark.cases >= 1000 && blindBenchmark.top3Rate >= 0.85
    },
    strongMultiSubjectProduct: {
      recordTarget: 10000,
      conceptTarget: 3000,
      benchmarkCaseTarget: 2000,
      passed: records.length >= 10000 && uniqueConcepts >= 3000 && conceptsWithMultipleVariants >= 2000 && completeMetadataRecords === records.length && noCriticalIssues && blindBenchmark.cases >= 2000 && blindBenchmark.top3Rate >= 0.9
    }
  };

  return {
    records: records.length,
    uniqueConcepts,
    conceptsWithMultipleVariants,
    skills,
    difficulties,
    gradeBands,
    sourceKinds: counts(records.map((record) => record.sourceKind ?? "unknown")),
    scalableMetadata: {
      requiredFields: scalableMetadataFields,
      completeRecords: completeMetadataRecords,
      recordsWithGaps: metadataGaps.length,
      representativeGaps: metadataGaps.slice(0, 5)
    },
    quality: { duplicatePairs, hintLeaks, clueLeaks, templateDuplicates, noCriticalIssues },
    blindBenchmark,
    gates
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const records = JSON.parse(await readFile(path.resolve("data/classroom-clues.json"), "utf8"));
  let benchmarkCases = [];
  for (const filename of ["classroom-blind-benchmark.json", "classroom-blind-benchmark-digital-media.json"]) {
    try { benchmarkCases.push(...JSON.parse(await readFile(path.resolve("test/fixtures", filename), "utf8"))); } catch { /* unavailable benchmark shards are omitted */ }
  }
  console.log(JSON.stringify(summarizeClassroomCorpus(records, { benchmarkCases }), null, 2));
}
