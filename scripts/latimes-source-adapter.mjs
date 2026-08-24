import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseLatimesPicker } from "./latimes-source-adapter-lib.mjs";

const PICKER_URL = "https://lat.amuselabs.com/lat/date-picker?style=1&embed=1&set=latimes&src=https%3A%2F%2Fwww.latimes.com%2Fgames%2Fdaily-crossword&preroll=none";
const outputIndex = process.argv.indexOf("--output");
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : null;
const response = await fetch(PICKER_URL, {
  headers: { accept: "text/html", "user-agent": "Mozilla/5.0 CrosswordClueTutorSourceAdapter/1.0" },
  signal: AbortSignal.timeout(20_000)
});
if (!response.ok) throw new Error(`LA Times official picker returned HTTP ${response.status}.`);
const metadata = parseLatimesPicker(await response.text());
if (!metadata) throw new Error("LA Times official picker metadata did not match the expected structure.");

const result = {
  adapter: "latimes-official-metadata-v1",
  checkedAt: new Date().toISOString(),
  publication: "LA Times Crossword",
  ...metadata,
  sourceUrl: "https://www.latimes.com/games/daily-crossword",
  pickerUrl: PICKER_URL,
  clueContentCollected: false,
  answersCollected: false,
  boundary: "Reads only the official date-picker metadata. It does not request the puzzle payload, solution, Reveal controls, or a logged-in archive."
};
const json = `${JSON.stringify(result, null, 2)}\n`;
if (output) {
  const target = path.resolve(output);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, json);
  console.error(`LA Times metadata adapter wrote ${result.sourceDate} ${result.sourceId} to ${target}`);
} else {
  process.stdout.write(json);
}
