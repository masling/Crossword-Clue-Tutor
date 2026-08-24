import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeClue } from "../src/solver.mjs";

const scalableMetadataFields = [
  "conceptId", "variantGroupId", "subject", "sourceUrl", "sourceLicense",
  "requiredAttribution", "reviewStatus", "contentVersion"
];

function counts(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

export function summarizeClassroomCorpus(records) {
  const concepts = new Map();
  const pairKeys = new Map();
  const duplicatePairs = [];
  const hintLeaks = [];
  const metadataGaps = [];

  for (const record of records) {
    if (!concepts.has(record.answer)) concepts.set(record.answer, []);
    concepts.get(record.answer).push(record);

    const pairKey = `${normalizeClue(record.clue)}|${record.answer}`;
    if (pairKeys.has(pairKey)) duplicatePairs.push([pairKeys.get(pairKey), record.slug]);
    else pairKeys.set(pairKey, record.slug);

    if ((record.hint ?? "").toUpperCase().includes(record.answer ?? "__NO_ANSWER__")) hintLeaks.push(record.slug);
    const missing = scalableMetadataFields.filter((field) => record[field] === undefined || record[field] === "");
    if (missing.length) metadataGaps.push({ slug: record.slug, missing });
  }

  const uniqueConcepts = concepts.size;
  const conceptsWithMultipleVariants = [...concepts.values()].filter((items) => items.length >= 2).length;
  const skills = counts(records.map((record) => record.skill));
  const difficulties = counts(records.map((record) => record.difficulty));
  const gradeBands = counts(records.flatMap((record) => record.gradeBands ?? []));
  const completeMetadataRecords = records.length - metadataGaps.length;
  const noCriticalIssues = duplicatePairs.length === 0 && hintLeaks.length === 0;

  const gates = {
    directoryReviewDemo: {
      recordTarget: 30,
      passed: records.length >= 30 && Object.keys(skills).length >= 6 && (difficulties.advanced ?? 0) >= 5 && noCriticalIssues
    },
    controlledTeacherPilot: {
      recordTarget: 500,
      conceptTarget: 250,
      passed: records.length >= 500 && uniqueConcepts >= 250 && completeMetadataRecords === records.length && noCriticalIssues
    },
    selfDirectedClassroomBeta: {
      recordTarget: 3000,
      conceptTarget: 1000,
      passed: records.length >= 3000 && uniqueConcepts >= 1000 && conceptsWithMultipleVariants >= 500 && completeMetadataRecords === records.length && noCriticalIssues
    },
    strongMultiSubjectProduct: {
      recordTarget: 10000,
      conceptTarget: 3000,
      passed: records.length >= 10000 && uniqueConcepts >= 3000 && conceptsWithMultipleVariants >= 2000 && completeMetadataRecords === records.length && noCriticalIssues
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
    quality: { duplicatePairs, hintLeaks, noCriticalIssues },
    blindBenchmark: { status: "not_measured", requirement: "Hold-out teacher/student paraphrases must not be copied into the production corpus." },
    gates
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const records = JSON.parse(await readFile(path.resolve("data/classroom-clues.json"), "utf8"));
  console.log(JSON.stringify(summarizeClassroomCorpus(records), null, 2));
}
