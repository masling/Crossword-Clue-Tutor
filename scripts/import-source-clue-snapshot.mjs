import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { selectUsaTodayCandidates as selectCandidates } from "./usatoday-source-adapter-lib.mjs";
import { validateSourceClueSnapshot } from "./source-clue-snapshot-lib.mjs";

const options = parseArgs(process.argv.slice(2));
if (!options.input) throw new Error("Usage: npm run source:import -- --input <snapshot.json> [--output <summary.json>] [--limit 6]");

const inputPath = path.resolve(options.input);
const snapshot = validateSourceClueSnapshot(JSON.parse(await readFile(inputPath, "utf8")));
const selectedCandidates = selectCandidates(snapshot.clues, options.limit);
const dbPath = path.resolve(options.db);
await persistSnapshot({ dbPath, snapshot, selectedCandidates });

const result = {
  adapter: "public-browser-clue-snapshot-v1",
  checkedAt: snapshot.capturedAt,
  publication: snapshot.publication,
  sourceDate: snapshot.sourceDate,
  sourceId: snapshot.sourceId,
  title: snapshot.title,
  creator: snapshot.creator,
  editor: snapshot.editor,
  sourceUrl: snapshot.sourceUrl,
  accessMode: snapshot.captureMode,
  totalPublicCluesObserved: snapshot.clues.length,
  candidateClues: selectedCandidates,
  answersCollected: false,
  localDatabase: dbPath,
  boundary: "The complete public clue list stays in the ignored local SQLite database. Model-facing output is capped at 10 candidates, and snapshots containing answer or solution fields are rejected."
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (options.output) {
  const target = path.resolve(options.output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, json);
  console.error(`Imported ${snapshot.clues.length} ${snapshot.publication} clues and wrote ${selectedCandidates.length} candidates to ${target}`);
} else {
  process.stdout.write(json);
}

async function persistSnapshot({ dbPath, snapshot, selectedCandidates }) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const selected = new Map(selectedCandidates.map((clue) => [`${clue.direction}|${clue.number}`, clue]));
  const statements = [
    "PRAGMA journal_mode=WAL;",
    "PRAGMA foreign_keys=ON;",
    `CREATE TABLE IF NOT EXISTS source_puzzles (
      publication TEXT NOT NULL, source_date TEXT NOT NULL, source_id TEXT NOT NULL,
      title TEXT NOT NULL, creator TEXT, editor TEXT, source_url TEXT NOT NULL,
      official_clue_count INTEGER NOT NULL, selected_candidate_count INTEGER NOT NULL,
      adapter_version TEXT NOT NULL, fetched_at TEXT NOT NULL,
      PRIMARY KEY (publication, source_date)
    );`,
    `CREATE TABLE IF NOT EXISTS source_clues (
      publication TEXT NOT NULL, source_date TEXT NOT NULL, source_id TEXT NOT NULL,
      clue_number TEXT NOT NULL, direction TEXT NOT NULL CHECK (direction IN ('Across', 'Down')),
      clue_text TEXT NOT NULL, selection_score INTEGER NOT NULL DEFAULT 0,
      selection_reasons_json TEXT NOT NULL DEFAULT '[]', selected_candidate INTEGER NOT NULL DEFAULT 0 CHECK (selected_candidate IN (0, 1)),
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (publication, source_date, direction, clue_number),
      FOREIGN KEY (publication, source_date) REFERENCES source_puzzles(publication, source_date) ON DELETE CASCADE
    );`,
    "CREATE INDEX IF NOT EXISTS source_clues_text_idx ON source_clues(clue_text);",
    "CREATE INDEX IF NOT EXISTS source_clues_selected_idx ON source_clues(selected_candidate, source_date);",
    "BEGIN IMMEDIATE;",
    `INSERT INTO source_puzzles (
      publication, source_date, source_id, title, creator, editor, source_url,
      official_clue_count, selected_candidate_count, adapter_version, fetched_at
    ) VALUES (
      ${sql(snapshot.publication)}, ${sql(snapshot.sourceDate)}, ${sql(snapshot.sourceId)}, ${sql(snapshot.title)},
      ${sql(snapshot.creator)}, ${sql(snapshot.editor)}, ${sql(snapshot.sourceUrl)},
      ${snapshot.clues.length}, ${selectedCandidates.length}, 'public-browser-clue-snapshot-v1', ${sql(snapshot.capturedAt)}
    ) ON CONFLICT(publication, source_date) DO UPDATE SET
      source_id=excluded.source_id, title=excluded.title, creator=excluded.creator,
      editor=excluded.editor, source_url=excluded.source_url,
      official_clue_count=excluded.official_clue_count,
      selected_candidate_count=excluded.selected_candidate_count,
      adapter_version=excluded.adapter_version, fetched_at=excluded.fetched_at;`,
    `DELETE FROM source_clues WHERE publication=${sql(snapshot.publication)} AND source_date=${sql(snapshot.sourceDate)};`,
    ...snapshot.clues.map((clue) => {
      const ranked = selected.get(`${clue.direction}|${clue.number}`);
      return `INSERT INTO source_clues (
        publication, source_date, source_id, clue_number, direction, clue_text,
        selection_score, selection_reasons_json, selected_candidate, fetched_at
      ) VALUES (
        ${sql(snapshot.publication)}, ${sql(snapshot.sourceDate)}, ${sql(snapshot.sourceId)}, ${sql(clue.number)},
        ${sql(clue.direction)}, ${sql(clue.clue)}, ${ranked?.score ?? 0},
        ${sql(JSON.stringify(ranked?.reasons ?? []))}, ${ranked ? 1 : 0}, ${sql(snapshot.capturedAt)}
      );`;
    }),
    "COMMIT;"
  ];
  await runSqlite(dbPath, `${statements.join("\n")}\n`);
}

function runSqlite(dbPath, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", ["-batch", dbPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`sqlite3 exited with ${code}: ${stderr.trim()}`)));
    child.stdin.end(input);
  });
}

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function parseArgs(args) {
  const read = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : fallback;
  };
  return {
    input: read("--input"),
    output: read("--output"),
    db: read("--db", ".local/source-intelligence.sqlite"),
    limit: Math.max(1, Math.min(10, Number(read("--limit", "6")) || 6))
  };
}
