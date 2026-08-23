import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const dbArg = process.argv.indexOf("--db");
const dbPath = path.resolve(dbArg >= 0 ? process.argv[dbArg + 1] : ".local/source-intelligence.sqlite");
const queries = {
  totals: "SELECT COUNT(*) AS puzzles, COALESCE(SUM(official_clue_count),0) AS clues_observed, COALESCE(SUM(selected_candidate_count),0) AS candidates_selected FROM source_puzzles;",
  publications: "SELECT publication, COUNT(*) AS puzzle_dates, SUM(official_clue_count) AS clues_observed, MAX(source_date) AS latest_source_date FROM source_puzzles GROUP BY publication ORDER BY publication;",
  repeatedClues: "SELECT clue_text, COUNT(*) AS appearances, MIN(source_date) AS first_seen, MAX(source_date) AS last_seen FROM source_clues GROUP BY lower(clue_text) HAVING COUNT(*) > 1 ORDER BY appearances DESC, clue_text LIMIT 20;",
  selectedReasons: "SELECT selection_reasons_json AS reasons, COUNT(*) AS candidates FROM source_clues WHERE selected_candidate=1 GROUP BY selection_reasons_json ORDER BY candidates DESC LIMIT 20;"
};

const report = { database: dbPath, generatedAt: new Date().toISOString() };
for (const [name, query] of Object.entries(queries)) report[name] = await querySqlite(dbPath, query);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function querySqlite(database, query) {
  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", ["-json", database, query], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`sqlite3 exited with ${code}: ${stderr.trim()}`));
      try { resolve(stdout.trim() ? JSON.parse(stdout) : []); } catch (error) { reject(error); }
    });
  });
}
