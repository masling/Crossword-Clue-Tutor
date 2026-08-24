import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateContent } from "./validate-content.mjs";
import { summarizeClassroomCorpus } from "./classroom-corpus-report.mjs";
import { normalizeClue } from "../src/solver.mjs";

const inputPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!inputPath) {
  console.error("Usage: npm run classroom:publish -- ops/classroom-intake/BATCH.json [--dry-run]");
  process.exit(1);
}

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.resolve(root, relativePath), "utf8"));
const [currentClassroomClues, clues, answers, clueTypes, publications, clueHubs, config, input] = await Promise.all([
  readJson("data/classroom-clues.json"),
  readJson("data/clues.json"),
  readJson("data/answers.json"),
  readJson("data/clue-types.json"),
  readJson("data/publications.json"),
  readJson("data/clue-hubs.json"),
  readJson("site.config.json"),
  readJson(inputPath)
]);

const incoming = input.clues;
if (!input.batchId || !input.sourceManifest || !Array.isArray(incoming) || incoming.length === 0) {
  throw new Error("Classroom intake requires batchId, sourceManifest, and a non-empty clues array");
}

const slugs = new Set(currentClassroomClues.map((item) => item.slug));
const pairs = new Set(currentClassroomClues.map(pairKey));
const conceptVariants = new Set(currentClassroomClues.map((item) => `${item.conceptId}|${item.variantGroupId}`));
for (const item of incoming) {
  if (slugs.has(item.slug)) throw new Error(`Duplicate classroom slug: ${item.slug}`);
  if (pairs.has(pairKey(item))) throw new Error(`Duplicate classroom clue-answer pair: ${item.clue} / ${item.answer}`);
  const conceptVariant = `${item.conceptId}|${item.variantGroupId}`;
  if (conceptVariants.has(conceptVariant)) throw new Error(`Duplicate concept variant: ${conceptVariant}`);
  slugs.add(item.slug);
  pairs.add(pairKey(item));
  conceptVariants.add(conceptVariant);
}

const merged = [...currentClassroomClues, ...incoming];
const validation = validateContent({ clues, answers, clueTypes, publications, clueHubs, classroomClues: merged, config });
if (validation.errors.length) throw new Error(validation.errors.join("\n"));
for (const warning of validation.warnings) console.warn(`warning: ${warning}`);

const report = summarizeClassroomCorpus(merged);
if (!report.quality.noCriticalIssues) throw new Error(`Classroom corpus quality gate failed: ${JSON.stringify(report.quality)}`);
if (report.scalableMetadata.completeRecords !== merged.length) throw new Error("Classroom corpus contains incomplete scalable metadata");
const publishRecord = {
  batchId: input.batchId,
  publishedAt: new Date().toISOString(),
  input: inputPath,
  addedRecords: incoming.length,
  totalRecords: merged.length,
  uniqueConcepts: report.uniqueConcepts,
  metadataCompleteRecords: report.scalableMetadata.completeRecords,
  quality: report.quality,
  gates: report.gates
};

if (dryRun) {
  console.log(JSON.stringify(publishRecord, null, 2));
  process.exit(0);
}

await writeFile(path.join(root, "data/classroom-clues.json"), `${JSON.stringify(merged, null, 2)}\n`);
await writeFile(path.join(root, "ops/latest-classroom-publish.json"), `${JSON.stringify(publishRecord, null, 2)}\n`);
await runNode("scripts/build.mjs");
await runNode("scripts/check-build.mjs");
console.log(`Published ${incoming.length} classroom clues; total ${merged.length}.`);

function pairKey(item) {
  return `${normalizeClue(item.clue)}|${item.answer}`;
}

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}
