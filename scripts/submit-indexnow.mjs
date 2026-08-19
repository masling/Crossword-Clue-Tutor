import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dryRun = process.argv.includes("--dry-run");
const config = JSON.parse(await readFile(path.join(root, "site.config.json"), "utf8"));
const publishRecord = JSON.parse(await readFile(path.join(root, "ops/latest-publish.json"), "utf8"));
const site = new URL(config.siteUrl);
if (site.hostname.endsWith(".example") && !dryRun) throw new Error("Replace the .example siteUrl before submitting URLs");

const key = process.env.INDEXNOW_KEY ?? config.indexNowKey;
if (!key && !dryRun) throw new Error("Set indexNowKey in site.config.json or INDEXNOW_KEY in the environment before submission");
const paths = [...new Set([...(publishRecord.urls ?? []), ...(publishRecord.clinicUrls ?? [])])];
const urlList = paths.map((route) => new URL(route, site).href);
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
