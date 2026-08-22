import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectIndexNowUrls } from "./indexnow-urls.mjs";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
const site = new URL(config.siteUrl);
if (site.hostname.endsWith(".example") && !dryRun) throw new Error("Replace the .example siteUrl before submitting URLs");

const previousSitemapPath = argumentValue("--previous-sitemap") ?? process.env.INDEXNOW_PREVIOUS_SITEMAP;
const includeRecords = process.argv.includes("--include-records") || process.env.INDEXNOW_INCLUDE_RECORDS === "1";
const [currentSitemap, previousSitemap, publishRecord, manualRecord] = await Promise.all([
  readFile(path.join(root, "dist/sitemap.xml"), "utf8"),
  readOptional(previousSitemapPath),
  readJsonOptional(path.join(root, "ops/latest-publish.json")),
  readJsonOptional(path.join(root, "ops/indexnow-manual.json"))
]);

const key = process.env.INDEXNOW_KEY ?? config.indexNowKey;
if (!key && !dryRun) throw new Error("Set indexNowKey in site.config.json or INDEXNOW_KEY in the environment before submission");
const urlList = collectIndexNowUrls({ siteUrl: site.href, currentSitemap, previousSitemap, includeRecords, publishRecord, manualRecord });
if (urlList.length === 0) {
  console.log("IndexNow: no new or explicitly updated URLs to submit.");
  process.exit(0);
}
const payload = {
  host: site.hostname,
  key: key ?? "DRY_RUN_KEY",
  keyLocation: new URL(`/${key ?? "DRY_RUN_KEY"}.txt`, site).href,
  urlList
};

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const keyResponse = await fetch(payload.keyLocation);
if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) {
  throw new Error(`IndexNow key file is not live at ${payload.keyLocation}`);
}
const response = await fetch("https://api.indexnow.org/IndexNow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload)
});
if (!response.ok) throw new Error(`IndexNow returned HTTP ${response.status}: ${await response.text()}`);

let history = [];
try { history = JSON.parse(await readFile(path.join(root, "ops/submission-log.json"), "utf8")); } catch {}
history.push({ submittedAt: new Date().toISOString(), engine: "IndexNow", urls: urlList, status: response.status });
await writeFile(path.join(root, "ops/submission-log.json"), `${JSON.stringify(history, null, 2)}\n`);
console.log(`IndexNow accepted ${urlList.length} URLs with HTTP ${response.status}.`);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function readOptional(file) {
  if (!file) return "";
  try { return await readFile(file, "utf8"); } catch { return ""; }
}

async function readJsonOptional(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return {}; }
}
