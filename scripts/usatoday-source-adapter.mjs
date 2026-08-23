import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { normalizeUsaTodayClueList, selectUsaTodayCandidates } from "./usatoday-source-adapter-lib.mjs";

const ARCHIVE_URL = "https://puzzles.usatoday.com/crosswords-archive/00";
const options = parseArgs(process.argv.slice(2));
const discovery = await discoverLatestPuzzle();
const game = await fetchOfficialClueData(discovery.sourceId, discovery.puzzleUrl);
const publicClues = [
  ...normalizeUsaTodayClueList(game.acrossClue, "Across"),
  ...normalizeUsaTodayClueList(game.downClue, "Down")
];
if (!publicClues.length) {
  throw new Error(`USA TODAY clue arrays had an unsupported shape: ${JSON.stringify({
    across: describeShape(game.acrossClue),
    down: describeShape(game.downClue)
  })}`);
}

const checkedAt = new Date().toISOString();
const selectedCandidates = selectUsaTodayCandidates(publicClues, options.limit);
const result = {
  adapter: "usatoday-official-candidates-v1",
  checkedAt,
  publication: "USA TODAY Crossword",
  sourceDate: discovery.sourceDate,
  title: game.title ?? discovery.title,
  creator: game.author ?? discovery.creator,
  editor: game.editor ?? discovery.editor,
  archiveUrl: ARCHIVE_URL,
  puzzleUrl: discovery.puzzleUrl,
  accessMode: "official-public-html-and-api-no-login",
  totalPublicCluesObserved: publicClues.length,
  candidateClues: selectedCandidates,
  answersCollected: false,
  localDatabase: options.noDb ? null : path.resolve(options.db),
  boundary: "The official public clue list is stored only in the ignored local SQLite database for analysis. Model-facing output is capped at 10 selected candidates. The GraphQL query explicitly excludes solution; the adapter never signs in or uses Reveal controls."
};

if (!options.noDb) {
  await persistSourceSnapshot({
    dbPath: path.resolve(options.db),
    result,
    sourceId: discovery.sourceId,
    publicClues,
    selectedCandidates
  });
}

const json = `${JSON.stringify(result, null, 2)}\n`;
if (options.output) {
  const outputPath = path.resolve(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json);
  console.error(`USA TODAY source adapter wrote ${selectedCandidates.length} official candidates for ${result.sourceDate} to ${outputPath}`);
} else {
  process.stdout.write(json);
}

async function discoverLatestPuzzle() {
  const response = await fetch(ARCHIVE_URL, {
    headers: { accept: "text/html", "user-agent": "Mozilla/5.0 CrosswordClueTutorSourceAdapter/1.0" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`USA TODAY archive returned HTTP ${response.status}.`);
  const html = await response.text();
  const nextDataText = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!nextDataText) throw new Error("USA TODAY archive did not expose __NEXT_DATA__ metadata.");
  const nextData = JSON.parse(nextDataText);
  const pageProps = nextData.props?.pageProps ?? {};
  const redux = pageProps.initialReduxState ?? {};
  const sourceId = pageProps.crosswordId ?? redux.menu?.crosswordId;
  const dimensions = pageProps.crosswordsDimensions ?? redux.menu?.crosswordsDimensions ?? {};
  const matchingGame = findObject(nextData, (value) => value?.__typename === "CrosswordData" && value.id === sourceId && value.title);
  const sourceDate = matchingGame?.date ?? dimensions.dimension124;
  const title = matchingGame?.title ?? dimensions.dimension122;
  const creator = matchingGame?.author ?? dimensions.dimension123;
  const editor = matchingGame?.editor ?? null;
  if (!sourceId || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate ?? "") || !title) {
    throw new Error(`USA TODAY archive metadata was incomplete: ${JSON.stringify({ sourceId, sourceDate, title, creator, editor })}`);
  }
  return {
    sourceId,
    sourceDate,
    title,
    creator,
    editor,
    puzzleUrl: `https://puzzles.usatoday.com/game/${sourceId}`
  };
}

async function fetchOfficialClueData(gameId, puzzleUrl) {
  const query = `query CrosswordsSingleGamePublicClues($id:String!){
    gameData(id:$id){
      __typename
      ... on CrosswordData {
        id date type title width author editor height copyright acrossClue downClue
      }
    }
  }`;
  const url = new URL("https://play.usatoday.com/api/query");
  url.searchParams.set("query", query);
  url.searchParams.set("variables", JSON.stringify({ id: gameId }));
  url.searchParams.set("operationName", "CrosswordsSingleGamePublicClues");
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-type": "games",
      "x-sitecode": "USAT",
      referer: puzzleUrl
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`USA TODAY public clue query returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`USA TODAY public clue query failed: ${payload.errors.map((error) => error.message).join("; ")}`);
  const game = payload.data?.gameData;
  if (!game) throw new Error("USA TODAY public clue query returned no gameData.");
  if (Object.hasOwn(game, "solution")) throw new Error("Safety boundary failed: public clue query unexpectedly returned solution.");
  return game;
}

function findObject(value, predicate) {
  if (!value || typeof value !== "object") return null;
  if (predicate(value)) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findObject(child, predicate);
    if (found) return found;
  }
  return null;
}

function describeShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, firstType: typeof value[0], firstKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]) : [] };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 8) };
  return { type: typeof value, length: typeof value === "string" ? value.length : null, preview: typeof value === "string" ? value.slice(0, 180) : null };
}

async function persistSourceSnapshot({ dbPath, result, sourceId, publicClues, selectedCandidates }) {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const selected = new Set(selectedCandidates.map((clue) => `${clue.direction}|${clue.number}`));
  const statements = [
    "PRAGMA journal_mode=WAL;",
    "PRAGMA foreign_keys=ON;",
    `CREATE TABLE IF NOT EXISTS source_puzzles (
      publication TEXT NOT NULL,
      source_date TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      creator TEXT,
      editor TEXT,
      source_url TEXT NOT NULL,
      official_clue_count INTEGER NOT NULL,
      selected_candidate_count INTEGER NOT NULL,
      adapter_version TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (publication, source_date)
    );`,
    `CREATE TABLE IF NOT EXISTS source_clues (
      publication TEXT NOT NULL,
      source_date TEXT NOT NULL,
      source_id TEXT NOT NULL,
      clue_number TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('Across', 'Down')),
      clue_text TEXT NOT NULL,
      selection_score INTEGER NOT NULL DEFAULT 0,
      selection_reasons_json TEXT NOT NULL DEFAULT '[]',
      selected_candidate INTEGER NOT NULL DEFAULT 0 CHECK (selected_candidate IN (0, 1)),
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
      ${sql(result.publication)}, ${sql(result.sourceDate)}, ${sql(sourceId)}, ${sql(result.title)},
      ${sql(result.creator)}, ${sql(result.editor)}, ${sql(result.puzzleUrl)},
      ${publicClues.length}, ${selectedCandidates.length}, ${sql(result.adapter)}, ${sql(result.checkedAt)}
    ) ON CONFLICT(publication, source_date) DO UPDATE SET
      source_id=excluded.source_id, title=excluded.title, creator=excluded.creator,
      editor=excluded.editor, source_url=excluded.source_url,
      official_clue_count=excluded.official_clue_count,
      selected_candidate_count=excluded.selected_candidate_count,
      adapter_version=excluded.adapter_version, fetched_at=excluded.fetched_at;`,
    `DELETE FROM source_clues WHERE publication=${sql(result.publication)} AND source_date=${sql(result.sourceDate)};`,
    ...publicClues.map((clue) => {
      const ranked = selectedCandidates.find((candidate) => candidate.direction === clue.direction && candidate.number === clue.number);
      return `INSERT INTO source_clues (
        publication, source_date, source_id, clue_number, direction, clue_text,
        selection_score, selection_reasons_json, selected_candidate, fetched_at
      ) VALUES (
        ${sql(result.publication)}, ${sql(result.sourceDate)}, ${sql(sourceId)}, ${sql(clue.number)},
        ${sql(clue.direction)}, ${sql(clue.clue)}, ${ranked?.score ?? 0},
        ${sql(JSON.stringify(ranked?.reasons ?? []))}, ${selected.has(`${clue.direction}|${clue.number}`) ? 1 : 0},
        ${sql(result.checkedAt)}
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
  const read = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const limit = Number(read("--limit") ?? 6);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("--limit must be an integer from 1 to 10.");
  return {
    output: read("--output"),
    limit,
    db: read("--db") ?? ".local/source-intelligence.sqlite",
    noDb: args.includes("--no-db")
  };
}
