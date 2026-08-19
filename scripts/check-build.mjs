import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const errors = [];
const htmlFiles = await walk(dist, (file) => file.endsWith(".html"));

if (htmlFiles.length < 10) errors.push(`expected a multi-page build, found only ${htmlFiles.length} HTML files`);

for (const file of htmlFiles) {
  const relative = path.relative(dist, file);
  const html = await readFile(file, "utf8");
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  if (h1Count !== 1) errors.push(`${relative}: expected one h1, found ${h1Count}`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title) errors.push(`${relative}: missing title`);
  else if (title.replace(/&(?:amp|quot|#039|lt|gt);/g, "x").length > 70) errors.push(`${relative}: title exceeds 70 characters`);
  if (!/<meta name="description" content="[^"]+">/.test(html)) errors.push(`${relative}: missing meta description`);
  if (!/<link rel="canonical" href="https:\/\/[^\"]+">/.test(html)) errors.push(`${relative}: missing absolute canonical`);
  const pageviewScripts = html.match(/<script defer data-domain="crosswordcluetutor\.com" src="https:\/\/app\.pageview\.app\/js\/script\.js"><\/script>/g) ?? [];
  if (pageviewScripts.length !== 1) errors.push(`${relative}: expected exactly one Pageview analytics script`);
  if (/crossword crossword clue/i.test(html)) errors.push(`${relative}: duplicated “crossword” in clue target`);
  if (/\bin the The\b/.test(html)) errors.push(`${relative}: duplicated article in publication context`);
  if (/<h1>“[“”]/.test(html)) errors.push(`${relative}: duplicated quotation marks in heading`);

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/#")) continue;
    const clean = href.split("#")[0].split("?")[0];
    const target = clean === "/"
      ? path.join(dist, "index.html")
      : clean.endsWith("/")
        ? path.join(dist, clean.slice(1), "index.html")
        : path.join(dist, clean.slice(1));
    try {
      await access(target);
    } catch {
      errors.push(`${relative}: broken internal link ${href}`);
    }
  }
}

for (const asset of ["assets/style.css", "assets/app.js", "assets/solver.mjs", "assets/clues.json", "assets/answers.json", "favicon.svg", "robots.txt", "sitemap.xml", "feed.xml"]) {
  try {
    await access(path.join(dist, asset));
  } catch {
    errors.push(`missing build asset: ${asset}`);
  }
}

const config = JSON.parse(await readFile(path.resolve("site.config.json"), "utf8"));
if (config.indexNowKey) {
  const keyFile = path.join(dist, `${config.indexNowKey}.txt`);
  try {
    const keyContents = (await readFile(keyFile, "utf8")).trim();
    if (keyContents !== config.indexNowKey) errors.push("IndexNow key file content does not match site.config.json");
  } catch {
    errors.push("missing IndexNow key file in dist");
  }
}

const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
if (sitemap.includes("404.html")) errors.push("sitemap must not include the 404 page");
if (!sitemap.includes("/crosswordese/spec/")) errors.push("sitemap is missing the SPEC answer entity");
if (!sitemap.includes("/explainers/contractors-detail-for-short/")) errors.push("sitemap is missing the reviewed SPEC explainer");
if (!sitemap.includes("<lastmod>")) errors.push("sitemap is missing lastmod metadata for fresh content");
if (!sitemap.includes("/explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/")) errors.push("sitemap is missing the current NYT Mini batch");
if (!sitemap.includes("/explainers/forfends-nyt-daily/")) errors.push("sitemap is missing the selected current NYT Daily batch");
if (!sitemap.includes("/explainers/private-sleeping-accommodations-nyt-daily/")) errors.push("sitemap is missing the latest NYT Daily batch");
if (!sitemap.includes("/nyt-mini-crossword-clues/")) errors.push("sitemap is missing the NYT Mini publication hub");
if (!sitemap.includes("/nyt-crossword-clues/")) errors.push("sitemap is missing the NYT daily publication hub");
const feed = await readFile(path.join(dist, "feed.xml"), "utf8");
if (!feed.includes("/explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/")) errors.push("feed is missing the current NYT Mini batch");
if (!feed.includes("/explainers/forfends-nyt-daily/")) errors.push("feed is missing the selected current NYT Daily batch");
if (!feed.includes("/explainers/private-sleeping-accommodations-nyt-daily/")) errors.push("feed is missing the latest NYT Daily batch");
const freshPage = await readFile(path.join(dist, "explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/index.html"), "utf8");
if (!freshPage.includes("NYT Mini crossword clue")) errors.push("fresh explainer does not target the publication long-tail query");
const latestDailyPage = await readFile(path.join(dist, "explainers/private-sleeping-accommodations-nyt-daily/index.html"), "utf8");
if (!latestDailyPage.includes("Private sleeping accommodations? The New York Times Crossword clue")) errors.push("latest daily explainer does not target the publication long-tail query");
if (!latestDailyPage.includes("Why COTS fits")) errors.push("latest daily explainer is missing its reviewed explanation");
const miniHub = await readFile(path.join(dist, "nyt-mini-crossword-clues/index.html"), "utf8");
if (!miniHub.includes("It’s in a pickle")) errors.push("NYT Mini hub is missing the latest selected clue");
const dailyHub = await readFile(path.join(dist, "nyt-crossword-clues/index.html"), "utf8");
if (!dailyHub.includes("Private sleeping accommodations?")) errors.push("NYT daily hub is missing the latest selected clue");
const privacyPage = await readFile(path.join(dist, "privacy/index.html"), "utf8");
if (!privacyPage.includes("Cloudflare Web Analytics")) errors.push("privacy page is missing the production analytics disclosure");
if (!privacyPage.includes("app.pageview.app")) errors.push("privacy page is missing the Pageview analytics disclosure");

if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Build check passed: ${htmlFiles.length} HTML pages, internal links and SEO essentials verified.`);
}

async function walk(directory, predicate) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(target, predicate));
    else if (predicate(target)) output.push(target);
  }
  return output;
}
