import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";
import { parseUsaTodayArchiveCard } from "./usatoday-source-adapter-lib.mjs";

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

  const result = {
    adapter: "usatoday-official-metadata-v1",
    checkedAt: new Date().toISOString(),
    publication: "USA TODAY Crossword",
    ...archiveCard,
    archiveUrl: ARCHIVE_URL,
    puzzleUrl,
    accessMode: "fresh-browser-context-no-login",
    clueContentCollected: false,
    answersCollected: false,
    boundary: "This probe reads only the first official archive card. It does not open the puzzle, scan the full clue list, request the GraphQL clue arrays, read the hidden solution field, sign in, or use Reveal controls."
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json);
    console.error(`USA TODAY metadata adapter wrote ${result.sourceDate} ${result.title} to ${outputPath}`);
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
  return { output: read("--output"), headed: args.includes("--headed") };
}
