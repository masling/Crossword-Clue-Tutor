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
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${relative}: missing title`);
  if (!/<meta name="description" content="[^"]+">/.test(html)) errors.push(`${relative}: missing meta description`);
  if (!/<link rel="canonical" href="https:\/\/[^\"]+">/.test(html)) errors.push(`${relative}: missing absolute canonical`);

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

for (const asset of ["assets/style.css", "assets/app.js", "assets/solver.mjs", "assets/clues.json", "assets/answers.json", "robots.txt", "sitemap.xml", "feed.xml"]) {
  try {
    await access(path.join(dist, asset));
  } catch {
    errors.push(`missing build asset: ${asset}`);
  }
}

const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
if (sitemap.includes("404.html")) errors.push("sitemap must not include the 404 page");
if (!sitemap.includes("/crosswordese/spec/")) errors.push("sitemap is missing the SPEC answer entity");
if (!sitemap.includes("/explainers/contractors-detail-for-short/")) errors.push("sitemap is missing the reviewed SPEC explainer");
if (!sitemap.includes("<lastmod>")) errors.push("sitemap is missing lastmod metadata for fresh content");
if (!sitemap.includes("/explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/")) errors.push("sitemap is missing the current NYT Mini batch");
const feed = await readFile(path.join(dist, "feed.xml"), "utf8");
if (!feed.includes("/explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/")) errors.push("feed is missing the current NYT Mini batch");
const freshPage = await readFile(path.join(dist, "explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/index.html"), "utf8");
if (!freshPage.includes("NYT Mini crossword clue")) errors.push("fresh explainer does not target the publication long-tail query");

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
