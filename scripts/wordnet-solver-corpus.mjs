import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import wordnetDb from "wordnet-db";

const POS_BY_NUMBER = new Map([
  ["1", "noun"],
  ["2", "verb"],
  ["3", "adjective"],
  ["4", "adverb"],
  ["5", "adjective"]
]);

const DATA_FILE_BY_POS = new Map([
  ["noun", "data.noun"],
  ["verb", "data.verb"],
  ["adjective", "data.adj"],
  ["adverb", "data.adv"]
]);

const BLOCKED_ADULT_TERMS = new RegExp(
  String.raw`\b(?:anal|anus|bestiality|brothel|coitus|condom|copulat\w*|cunnilingus|erection|erotic\w*|fellatio|fetish\w*|fornicat\w*|genital\w*|incest\w*|masturbat\w*|nude|nudity|orgasm\w*|penis|porn\w*|prostitut\w*|rape|rapist|semen|sex|sexual\w*|sodomy|sperm|vagina\w*|vulva\w*)\b`,
  "i"
);

export async function buildWordNetSolverCorpus({ reviewedCount = 0, minimumCount = reviewedCount * 100, targetCount = Number.POSITIVE_INFINITY } = {}) {
  const synsets = await loadSynsets(wordnetDb.path);
  const senseLines = (await readFile(path.join(wordnetDb.path, "index.sense"), "utf8")).split(/\r?\n/);
  const candidatesByAnswer = new Map();

  for (const line of senseLines) {
    if (!line || /^\s/.test(line)) continue;
    const [senseKey, offset, senseNumberValue, tagCountValue] = line.trim().split(/\s+/);
    const delimiter = senseKey?.indexOf("%");
    if (!delimiter || delimiter < 1) continue;
    const pos = POS_BY_NUMBER.get(senseKey[delimiter + 1]);
    if (!pos) continue;

    const phrase = senseKey.slice(0, delimiter).replaceAll("_", " ").replaceAll("-", " ").trim();
    const answer = phrase.replace(/[^a-z]/gi, "").toUpperCase();
    if (!/^[A-Z]+$/.test(answer) || answer.length < 2 || answer.length > 20) continue;

    const synset = synsets.get(`${pos}:${offset}`);
    if (!synset?.definition || isAdultSense(`${phrase} ${synset.definition}`)) continue;
    const synonyms = synset.words
      .map((word) => word.replaceAll("_", " ").replaceAll("-", " "))
      .filter((word) => normalizeAnswer(word) !== answer && !isAdultSense(word))
      .slice(0, 5);
    const tagCount = Math.max(0, Number(tagCountValue) || 0);
    const senseNumber = Math.max(1, Number(senseNumberValue) || 1);
    const candidate = {
      answer,
      definition: cleanDefinition(synset.definition),
      partOfSpeech: pos,
      synonyms,
      searchTerms: searchTokens([synset.definition, ...synonyms]),
      tagCount,
      senseNumber,
      sourceKind: "wordnet"
    };

    const existing = candidatesByAnswer.get(answer);
    if (!existing) candidatesByAnswer.set(answer, candidate);
    else {
      const preferred = candidateRank(candidate) > candidateRank(existing) ? candidate : existing;
      preferred.searchTerms = [...new Set([...existing.searchTerms, ...candidate.searchTerms])].slice(0, 24);
      candidatesByAnswer.set(answer, preferred);
    }
  }

  const allCandidates = [...candidatesByAnswer.values()]
    .sort((a, b) => candidateRank(b) - candidateRank(a) || a.answer.localeCompare(b.answer));
  if (allCandidates.length < minimumCount) {
    throw new Error(`WordNet yielded ${allCandidates.length} eligible candidates; ${minimumCount} required.`);
  }

  const candidates = allCandidates.slice(0, Math.min(targetCount, allCandidates.length)).map((item, index) => ({
    answer: item.answer,
    definition: item.definition,
    partOfSpeech: item.partOfSpeech,
    synonyms: item.synonyms,
    searchTerms: item.searchTerms,
    popularity: Math.max(1, 40 - Math.floor(index / 1_000)),
    sourceKind: item.sourceKind
  }));

  return {
    schemaVersion: 1,
    source: "Princeton WordNet 3.1",
    licensePath: "/licenses/wordnet-license.txt",
    reviewedBaseline: reviewedCount,
    minimumRequired: minimumCount,
    count: candidates.length,
    generatedAt: new Date().toISOString(),
    candidates
  };
}

async function loadSynsets(dictionaryPath) {
  const synsets = new Map();
  for (const [pos, filename] of DATA_FILE_BY_POS) {
    const lines = (await readFile(path.join(dictionaryPath, filename), "utf8")).split(/\r?\n/);
    for (const line of lines) {
      if (!/^\d{8}\s/.test(line)) continue;
      const separator = line.indexOf(" | ");
      if (separator < 0) continue;
      const fields = line.slice(0, separator).trim().split(/\s+/);
      const wordCount = Number.parseInt(fields[3], 16);
      if (!Number.isFinite(wordCount) || wordCount < 1) continue;
      const words = [];
      let cursor = 4;
      for (let index = 0; index < wordCount; index += 1) {
        words.push(fields[cursor]);
        cursor += 2;
      }
      synsets.set(`${pos}:${fields[0]}`, {
        words,
        definition: line.slice(separator + 3).trim()
      });
    }
  }
  return synsets;
}

function candidateRank(candidate) {
  const tagWeight = Math.min(candidate.tagCount, 1_000) * 1_000;
  const senseWeight = Math.max(0, 100 - candidate.senseNumber * 4);
  const lengthWeight = Math.max(0, 20 - Math.abs(candidate.answer.length - 6));
  const definitionWeight = Math.min(candidate.definition.length, 240) / 20;
  return tagWeight + senseWeight + lengthWeight + definitionWeight;
}

function normalizeAnswer(value) {
  return String(value).replace(/[^a-z]/gi, "").toUpperCase();
}

function cleanDefinition(value) {
  return String(value)
    .replace(/\s*;\s*"[^"]*"\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function isAdultSense(value) {
  return BLOCKED_ADULT_TERMS.test(String(value));
}

function searchTokens(values) {
  const stopWords = new Set(["about", "after", "again", "also", "among", "and", "are", "because", "being", "between", "from", "have", "into", "made", "more", "most", "not", "one", "other", "over", "some", "such", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "through", "used", "using", "very", "when", "where", "which", "with"]);
  return [...new Set(values.flatMap((value) => String(value).toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((word) => !stopWords.has(word)))].slice(0, 24);
}

async function writeCorpus(output, corpus) {
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(corpus)}\n`);
}

async function writeSqlite(database, corpus) {
  await mkdir(path.dirname(database), { recursive: true });
  const importedAt = new Date().toISOString();
  const statements = [
    "PRAGMA journal_mode=WAL;",
    "CREATE TABLE IF NOT EXISTS solver_lexicon_v2 (answer TEXT PRIMARY KEY, definition TEXT NOT NULL, part_of_speech TEXT NOT NULL, synonyms_json TEXT NOT NULL, search_terms_json TEXT NOT NULL, popularity INTEGER NOT NULL, source TEXT NOT NULL, imported_at TEXT NOT NULL);",
    "BEGIN;",
    "DELETE FROM solver_lexicon_v2 WHERE source='Princeton WordNet 3.1';",
    ...corpus.candidates.map((item) => `INSERT OR REPLACE INTO solver_lexicon_v2 (answer, definition, part_of_speech, synonyms_json, search_terms_json, popularity, source, imported_at) VALUES (${sql(item.answer)}, ${sql(item.definition)}, ${sql(item.partOfSpeech)}, ${sql(JSON.stringify(item.synonyms))}, ${sql(JSON.stringify(item.searchTerms))}, ${item.popularity}, ${sql(corpus.source)}, ${sql(importedAt)});`),
    "COMMIT;"
  ];
  await runSqlite(database, `${statements.join("\n")}\n`);
}

function runSqlite(database, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", ["-batch", database], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`sqlite3 exited with ${code}: ${stderr.trim()}`)));
    child.stdin.end(input);
  });
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(args) {
  const read = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  const target = read("--target", "all");
  return {
    output: path.resolve(read("--output", ".local/solver-lexicon.json")),
    database: path.resolve(read("--db", ".local/source-intelligence.sqlite")),
    reviewedCount: Number(read("--reviewed", "0")),
    minimumCount: Number(read("--minimum", "0")),
    targetCount: target === "all" ? Number.POSITIVE_INFINITY : Number(target),
    noDb: args.includes("--no-db")
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const minimumCount = Math.max(options.minimumCount, options.reviewedCount * 100);
  const corpus = await buildWordNetSolverCorpus({
    reviewedCount: options.reviewedCount,
    minimumCount,
    targetCount: Number.isFinite(options.targetCount) ? Math.max(options.targetCount, minimumCount) : Number.POSITIVE_INFINITY
  });
  await writeCorpus(options.output, corpus);
  if (!options.noDb) await writeSqlite(options.database, corpus);
  process.stdout.write(`${JSON.stringify({ output: options.output, database: options.noDb ? null : options.database, count: corpus.count, minimumRequired: corpus.minimumRequired, source: corpus.source }, null, 2)}\n`);
}
