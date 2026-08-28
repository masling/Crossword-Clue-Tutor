import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export function planAnswerProfileGaps({ clues, answers, date, target = 25, currentOnly = false }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("date must use YYYY-MM-DD");
  if (!Number.isInteger(target) || target < 1 || target > 100) throw new Error("target must be an integer from 1 to 100");

  const existing = new Set(answers.map((item) => item.answer));
  const representativeByAnswer = new Map();
  for (const clue of [...clues].sort(compareRepresentativeClues)) {
    if (existing.has(clue.answer) || representativeByAnswer.has(clue.answer)) continue;
    representativeByAnswer.set(clue.answer, clue);
  }

  const missing = [...representativeByAnswer.values()];
  const current = missing
    .filter((clue) => clue.sourceDate === date || clue.date === date)
    .sort(compareRepresentativeClues);
  const currentAnswers = new Set(current.map((clue) => clue.answer));
  const historical = missing
    .filter((clue) => !currentAnswers.has(clue.answer))
    .sort(compareBackfillClues);
  const backfill = currentOnly ? [] : historical.slice(0, Math.max(0, target - current.length));
  const selected = [...current, ...backfill];

  return {
    schemaVersion: 1,
    date,
    target,
    policy: currentOnly
      ? "Include every missing unique answer from the current date and do not backfill. One answer maps to one canonical Definition & Meaning page."
      : "Include every missing unique answer from the current date first; when fewer than target, backfill reviewed historical answers. One answer maps to one canonical Definition & Meaning page.",
    currentOnly,
    currentMissing: current.length,
    historicalBackfill: backfill.length,
    selectedCount: selected.length,
    missingBeforePlan: missing.length,
    remainingAfterPlan: Math.max(0, missing.length - selected.length),
    candidates: selected.map((clue) => ({
      lane: currentAnswers.has(clue.answer) ? "current" : "historical-backfill",
      answer: clue.answer,
      clue: clue.clue,
      definition: clue.definition,
      explanation: clue.explanation,
      partOfSpeech: clue.partOfSpeech,
      clueType: clue.clueType,
      signal: clue.signal,
      hint: clue.hint,
      publication: clue.publication ?? null,
      sourceDate: clue.sourceDate ?? null,
      reviewedAt: clue.reviewedAt,
      popularity: clue.popularity ?? 0
    }))
  };
}

function compareRepresentativeClues(a, b) {
  return (b.popularity ?? 0) - (a.popularity ?? 0)
    || String(b.sourceDate ?? b.date ?? "").localeCompare(String(a.sourceDate ?? a.date ?? ""))
    || a.answer.localeCompare(b.answer);
}

function compareBackfillClues(a, b) {
  return backfillScore(b) - backfillScore(a)
    || String(b.sourceDate ?? b.date ?? "").localeCompare(String(a.sourceDate ?? a.date ?? ""))
    || a.answer.localeCompare(b.answer);
}

function backfillScore(clue) {
  const highLearningValue = new Set(["abbreviation", "direct-definition", "foreign-language", "idiom", "informal-definition", "onomatopoeia", "phrase-equivalence", "spoken-reaction", "wordplay"]);
  const properNamePenalty = /proper|current-reference|geography|literature/.test(clue.clueType ?? "") ? 20 : 0;
  const lengthBonus = clue.answer.length >= 3 && clue.answer.length <= 12 ? 12 : 0;
  const learningBonus = highLearningValue.has(clue.clueType) ? 15 : 0;
  return (clue.popularity ?? 0) + lengthBonus + learningBonus - properNamePenalty;
}

function parseArgs(argv) {
  const options = { target: 25, output: ".local/answer-profile-gaps.json", currentOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--date") options.date = argv[++index];
    else if (value === "--target") options.target = Number(argv[++index]);
    else if (value === "--output") options.output = argv[++index];
    else if (value === "--current-only") options.currentOnly = true;
    else throw new Error(`Unknown option ${value}`);
  }
  return options;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  const [clues, answers] = await Promise.all([readJson("data/clues.json"), readJson("data/answers.json")]);
  const result = planAnswerProfileGaps({ clues, answers, date: options.date, target: options.target, currentOnly: options.currentOnly });
  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: options.output, date: result.date, currentOnly: result.currentOnly, currentMissing: result.currentMissing, historicalBackfill: result.historicalBackfill, selectedCount: result.selectedCount, remainingAfterPlan: result.remainingAfterPlan }, null, 2)}\n`);
}
