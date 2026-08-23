import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { normalizeUsaTodayClueList, parseUsaTodayArchiveCard, selectUsaTodayCandidates } from "./usatoday-source-adapter-lib.mjs";

const ARCHIVE_URL = "https://puzzles.usatoday.com/crosswords-archive/00";
const options = parseArgs(process.argv.slice(2));
const executablePath = await findChrome();
const browser = await chromium.launch({
  executablePath,
  headless: !options.headed,
  args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"]
});

try {
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  await page.goto(ARCHIVE_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

  const latest = page.locator('a[href*="/game/"]').filter({ hasText: /[A-Z][a-z]{2}\.\s+\d{1,2}/ }).first();
  await latest.waitFor({ state: "visible", timeout: 20_000 });
  const puzzleUrl = validatePuzzleUrl(await latest.getAttribute("href"));
  const archiveCardText = await latest.innerText();
  const archiveCard = parseUsaTodayArchiveCard(archiveCardText, new Date());
  if (!archiveCard) throw new Error(`The latest USA TODAY archive card did not match the expected date/title/creator/editor structure: ${JSON.stringify(archiveCardText)}`);
  const gameId = new URL(puzzleUrl).pathname.split("/").filter(Boolean).at(-1);
  const game = await fetchOfficialClueData(page, puzzleUrl, gameId);
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

  const result = {
    adapter: "usatoday-official-candidates-v1",
    checkedAt: new Date().toISOString(),
    publication: "USA TODAY Crossword",
    ...archiveCard,
    archiveUrl: ARCHIVE_URL,
    puzzleUrl,
    accessMode: "fresh-browser-context-no-login",
    totalPublicCluesObserved: publicClues.length,
    candidateClues: selectUsaTodayCandidates(publicClues, options.limit),
    answersCollected: false,
    boundary: "The official public clue arrays are processed transiently and never stored. Output is capped at 10 selected candidates. The GraphQL query explicitly excludes solution; the adapter never signs in or uses Reveal controls."
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json);
    console.error(`USA TODAY source adapter wrote ${result.candidateClues.length} official candidates for ${result.sourceDate} to ${outputPath}`);
  } else {
    process.stdout.write(json);
  }
} finally {
  await browser.close();
}

function validatePuzzleUrl(value) {
  const url = new URL(value, ARCHIVE_URL);
  if (url.hostname !== "puzzles.usatoday.com" || !/^\/game\/[0-9a-f-]+\/?$/i.test(url.pathname)) {
    throw new Error(`Refusing unsupported USA TODAY puzzle URL: ${url.href}`);
  }
  return url.href;
}

async function fetchOfficialClueData(page, puzzleUrl, gameId) {
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
  const response = await page.request.get(url.href, {
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-type": "games",
      "x-sitecode": "USAT",
      referer: puzzleUrl
    },
    timeout: 20_000
  });
  if (!response.ok()) throw new Error(`USA TODAY public clue query returned HTTP ${response.status()}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`USA TODAY public clue query failed: ${payload.errors.map((error) => error.message).join("; ")}`);
  const game = payload.data?.gameData;
  if (!game) throw new Error("USA TODAY public clue query returned no gameData.");
  if (Object.hasOwn(game, "solution")) throw new Error("Safety boundary failed: public clue query unexpectedly returned solution.");
  return game;
}

function describeShape(value) {
  if (Array.isArray(value)) return { type: "array", length: value.length, firstType: typeof value[0], firstKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]) : [] };
  if (value && typeof value === "object") return { type: "object", keys: Object.keys(value).slice(0, 8) };
  return { type: typeof value, length: typeof value === "string" ? value.length : null, preview: typeof value === "string" ? value.slice(0, 180) : null };
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error("Chrome/Chromium was not found. Set CHROME_PATH to its executable.");
}

function parseArgs(args) {
  const read = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const limit = Number(read("--limit") ?? 6);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("--limit must be an integer from 1 to 10.");
  return { output: read("--output"), limit, headed: args.includes("--headed") };
}
