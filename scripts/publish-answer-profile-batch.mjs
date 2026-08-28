import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const batchPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!batchPath) throw new Error("Usage: npm run answer:publish -- <batch.json> [--dry-run]");

const [batch, answersRaw, clues] = await Promise.all([
  readJson(batchPath),
  readFile("data/answers.json", "utf8"),
  readJson("data/clues.json")
]);
const answers = JSON.parse(answersRaw);

if (batch.schemaVersion !== 1 || !Array.isArray(batch.profiles) || batch.profiles.length === 0) {
  throw new Error("Answer profile batch must use schemaVersion 1 and contain profiles");
}

const existingAnswers = new Set(answers.map((item) => item.answer));
const existingSlugs = new Set(answers.map((item) => item.slug));
const batchAnswers = new Set();
const batchSlugs = new Set();
const cluesByAnswer = new Map();
for (const clue of [...clues].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))) {
  if (!cluesByAnswer.has(clue.answer)) cluesByAnswer.set(clue.answer, clue);
}

const additions = batch.profiles.map((profile, index) => {
  const label = `profiles[${index}]`;
  if (!/^[A-Z]+$/.test(profile.answer ?? "")) throw new Error(`${label} answer must contain uppercase A-Z only`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.slug ?? "")) throw new Error(`${label} has an invalid slug`);
  if ((profile.pronunciation ?? "").trim().length < 2) throw new Error(`${label} needs a pronunciation`);
  if (existingAnswers.has(profile.answer) || batchAnswers.has(profile.answer)) throw new Error(`${label} duplicates answer ${profile.answer}`);
  if (existingSlugs.has(profile.slug) || batchSlugs.has(profile.slug)) throw new Error(`${label} duplicates slug ${profile.slug}`);
  const clue = cluesByAnswer.get(profile.answer);
  if (!clue) throw new Error(`${label} has no reviewed clue for ${profile.answer}`);
  batchAnswers.add(profile.answer);
  batchSlugs.add(profile.slug);
  return {
    slug: profile.slug,
    answer: profile.answer,
    ...(profile.displayTerm ? { displayTerm: String(profile.displayTerm).trim() } : {}),
    pronunciation: profile.pronunciation.trim(),
    partOfSpeech: clue.partOfSpeech,
    meaning: ensureLength(clue.definition, `${profile.answer} is the reviewed answer sense documented by Crossword Clue Tutor.`),
    crosswordUse: ensureLength(`${profile.answer} answers the reviewed clue “${clue.clue}.” ${clue.signal}`, `Its ${profile.answer.length}-letter form is confirmed by crossings.`),
    whyCommon: ensureLength(`${profile.answer} is useful to learn because this reviewed clue depends on ${humanize(clue.clueType)}, exact grammar, and a ${profile.answer.length}-letter grid entry.`, "Crossings still decide the final fill."),
    cluePatterns: [
      clue.clue,
      clue.hint,
      `${profile.answer.length}-letter ${humanize(clue.clueType)} answer confirmed by crossings`
    ],
    otherMeanings: ensureLength(`${clue.explanation} Other clues may use a different sense, so solvers should confirm the grammar, source context, answer length, and crossing letters.`, "Context decides the intended meaning."),
    related: Array.isArray(profile.related) ? profile.related : []
  };
});

const knownSlugs = new Set([...existingSlugs, ...batchSlugs]);
for (const profile of additions) {
  for (const related of profile.related) {
    if (!knownSlugs.has(related)) throw new Error(`${profile.answer} links to unknown related profile ${related}`);
  }
}

const result = {
  batch: path.basename(batchPath),
  reviewedAt: batch.reviewedAt,
  additions: additions.length,
  before: answers.length,
  after: answers.length + additions.length,
  answers: additions.map((item) => item.answer),
  dryRun
};

if (!dryRun) {
  const closingIndex = answersRaw.lastIndexOf("\n]");
  if (closingIndex < 0) throw new Error("data/answers.json has an unsupported closing format");
  const appended = additions
    .map((profile) => JSON.stringify(profile, null, 2).split("\n").map((line) => `  ${line}`).join("\n"))
    .join(",\n");
  const merged = `${answersRaw.slice(0, closingIndex).trimEnd()},\n${appended}\n]\n`;
  await writeFile("data/answers.json", merged);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function ensureLength(value, suffix) {
  const clean = String(value ?? "").trim();
  return clean.length >= 35 ? clean : `${clean} ${suffix}`.trim();
}

function humanize(value) {
  return String(value ?? "crossword clue").replaceAll("-", " ");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
