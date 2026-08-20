import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { validateContent } from "./validate-content.mjs";

const inputPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!inputPath) {
  console.error("Usage: npm run content:publish -- ops/intake/YYYY-MM-DD-source.json [--dry-run]");
  process.exit(1);
}

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.resolve(root, relativePath), "utf8"));
const [currentClues, answers, clueTypes, publications, config, input] = await Promise.all([
  readJson("data/clues.json"),
  readJson("data/answers.json"),
  readJson("data/clue-types.json"),
  readJson("data/publications.json"),
  readJson("site.config.json"),
  readJson(inputPath)
]);

const incoming = Array.isArray(input) ? input : input.clues;
if (!Array.isArray(incoming) || incoming.length === 0) throw new Error("The intake file must contain a non-empty clues array");

const existingSlugs = new Set(currentClues.map((clue) => clue.slug));
const existingPairs = new Set(currentClues.map(pairKey));
for (const clue of incoming) {
  if (existingSlugs.has(clue.slug)) throw new Error(`Duplicate slug: ${clue.slug}`);
  if (existingPairs.has(pairKey(clue))) throw new Error(`Duplicate clue publication/date pairing: ${pairKey(clue)}`);
  existingSlugs.add(clue.slug);
  existingPairs.add(pairKey(clue));
}

// Preserve editorial history order in the source file. Page builders apply the
// presentation sort they need, while stable source ordering keeps daily diffs
// small and reviewable.
const mergedClues = [...currentClues, ...incoming];
const latestReview = mergedClues.map((clue) => clue.reviewedAt).sort().reverse()[0];
const nextConfig = { ...config, contentUpdatedAt: latestReview };
const result = validateContent({ clues: mergedClues, answers, clueTypes, publications, config: nextConfig });
if (result.errors.length) throw new Error(result.errors.join("\n"));
for (const warning of result.warnings) console.warn(`warning: ${warning}`);

const answerByValue = new Map(answers.map((answer) => [answer.answer, answer]));
const publicationHubByName = new Map(publications.map((publication) => [publication.name, publication.route]));
const publishRecord = {
  publishedAt: new Date().toISOString(),
  input: inputPath,
  urls: incoming.map((clue) => `/explainers/${clue.slug}/`),
  answerUrls: [...new Set(incoming
    .map((clue) => answerByValue.get(clue.answer))
    .filter(Boolean)
    .map((answer) => `/crosswordese/${answer.slug}/`))],
  clinicUrls: [...new Set(incoming.map((clue) => `/daily-clue-clinic/${clue.date}/`))],
  hubUrls: [...new Set([
    "/",
    "/crosswordese/",
    "/daily-clue-clinic/",
    ...incoming.map((clue) => publicationHubByName.get(clue.publication)).filter(Boolean)
  ])]
};

if (dryRun) {
  console.log(JSON.stringify({ newClues: incoming.length, ...publishRecord }, null, 2));
  process.exit(0);
}

await writeFile(path.join(root, "data/clues.json"), `${JSON.stringify(mergedClues, null, 2)}\n`);
await writeFile(path.join(root, "site.config.json"), `${JSON.stringify(nextConfig, null, 2)}\n`);
await writeFile(path.join(root, "ops/latest-publish.json"), `${JSON.stringify(publishRecord, null, 2)}\n`);
await runNode("scripts/build.mjs");
await runNode("scripts/check-build.mjs");
console.log(`Published ${incoming.length} reviewed clues. Deploy dist/, then submit ops/latest-publish.json.`);

function pairKey(clue) {
  return [clue.clue.toLowerCase().trim(), clue.answer, clue.publication ?? "", clue.sourceDate ?? ""].join("|");
}

function runNode(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with code ${code}`)));
  });
}
