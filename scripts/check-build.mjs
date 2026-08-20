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
  if (!/<link rel="icon" href="\/favicon-32x32\.png" type="image\/png" sizes="32x32">/.test(html)) errors.push(`${relative}: missing 32px PNG favicon`);
  if (!/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" sizes="180x180">/.test(html)) errors.push(`${relative}: missing Apple touch icon`);
  if (!/<meta property="og:image" content="https:\/\/crosswordcluetutor\.com\/assets\/social-card\.png">/.test(html)) errors.push(`${relative}: missing absolute Open Graph image`);
  if (!/<meta name="twitter:card" content="summary_large_image">/.test(html)) errors.push(`${relative}: missing Twitter large-image card`);
  if (!/<link rel="alternate" type="application\/atom\+xml" title="[^"]+" href="https:\/\/crosswordcluetutor\.com\/feed\.xml">/.test(html)) errors.push(`${relative}: missing Atom feed discovery link`);
  const pageviewScripts = html.match(/<script defer data-domain="crosswordcluetutor\.com" src="https:\/\/app\.pageview\.app\/js\/script\.js"><\/script>/g) ?? [];
  if (pageviewScripts.length !== 1) errors.push(`${relative}: expected exactly one Pageview analytics script`);
  if (/crossword crossword clue/i.test(html)) errors.push(`${relative}: duplicated “crossword” in clue target`);
  if (/\bin the The\b/.test(html)) errors.push(`${relative}: duplicated article in publication context`);
  if (/<h1>“[“”]/.test(html)) errors.push(`${relative}: duplicated quotation marks in heading`);
  if (html.includes('class="breadcrumbs"') && !html.includes('"@type":"BreadcrumbList"')) errors.push(`${relative}: visible breadcrumbs are missing BreadcrumbList structured data`);
  const structuredDataBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const block of structuredDataBlocks) {
    try {
      const structuredData = JSON.parse(block[1]);
      if (structuredData["@type"] === "Article") {
        if (structuredData.author?.["@type"] !== "Organization" || !structuredData.author?.name || !structuredData.author?.url) errors.push(`${relative}: Article author entity is incomplete`);
        if (structuredData.publisher?.["@type"] !== "Organization" || !structuredData.publisher?.name || !structuredData.publisher?.logo?.url) errors.push(`${relative}: Article publisher entity is incomplete`);
      }
    } catch {
      errors.push(`${relative}: invalid JSON-LD block`);
    }
  }

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

for (const asset of ["assets/style.css", "assets/app.js", "assets/solver.mjs", "assets/social-card.png", "assets/logo-512.png", "assets/clues.json", "assets/answers.json", "assets/clue-hubs.json", "assets/clue-hubs.csv", "favicon.svg", "favicon-32x32.png", "favicon-16x16.png", "apple-touch-icon.png", "robots.txt", "sitemap.xml", "feed.xml"]) {
  try {
    await access(path.join(dist, asset));
  } catch {
    errors.push(`missing build asset: ${asset}`);
  }
}

const appScript = await readFile(path.join(dist, "assets/app.js"), "utf8");
const solverScript = await readFile(path.join(dist, "assets/solver.mjs"), "utf8");
if (!appScript.includes('fetch("/assets/clue-hubs.json")') || !appScript.includes("solverClues")) errors.push("solver app is not loading the multi-answer clue hub candidate pool");
if (!solverScript.includes("clueHubCandidates")) errors.push("solver module is missing the clue-hub adapter");

for (const [asset, expectedWidth, expectedHeight] of [["assets/social-card.png", 1200, 630], ["assets/logo-512.png", 512, 512], ["favicon-32x32.png", 32, 32], ["favicon-16x16.png", 16, 16], ["apple-touch-icon.png", 180, 180]]) {
  try {
    const image = await readFile(path.join(dist, asset));
    const width = image.readUInt32BE(16);
    const height = image.readUInt32BE(20);
    if (width !== expectedWidth || height !== expectedHeight) errors.push(`${asset}: expected ${expectedWidth}x${expectedHeight}, found ${width}x${height}`);
  } catch {
    errors.push(`${asset}: unable to verify PNG dimensions`);
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
const clues = JSON.parse(await readFile(path.resolve("data/clues.json"), "utf8"));
const publications = JSON.parse(await readFile(path.resolve("data/publications.json"), "utf8"));
const clueHubs = JSON.parse(await readFile(path.resolve("data/clue-hubs.json"), "utf8"));
const clueHubCandidateCount = clueHubs.reduce((total, hub) => total + hub.answers.length, 0);
const clueHubUniqueAnswerCount = new Set(clueHubs.flatMap((hub) => hub.answers.map((answer) => answer.answer))).size;
const sitemapEntries = [...sitemap.matchAll(/<url><loc>[^<]+<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)];
for (const [index, entry] of sitemapEntries.entries()) {
  if (!entry[1]) errors.push(`sitemap URL ${index + 1} is missing lastmod`);
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(entry[1])) errors.push(`sitemap URL ${index + 1} has an invalid lastmod`);
}
const sitemapRoutes = [...sitemap.matchAll(/<loc>(https:\/\/crosswordcluetutor\.com[^<]*)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
const sitemapRouteSet = new Set(sitemapRoutes);
const routeEdges = new Map(sitemapRoutes.map((route) => [route, new Set()]));
const routeInbound = new Map(sitemapRoutes.map((route) => [route, new Set()]));
for (const route of sitemapRoutes) {
  const relative = route === "/" ? "index.html" : path.join(route.slice(1), "index.html");
  const html = await readFile(path.join(dist, relative), "utf8");
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    let target;
    try {
      const resolved = new URL(match[1], `https://crosswordcluetutor.com${route}`);
      if (resolved.origin !== "https://crosswordcluetutor.com") continue;
      target = resolved.pathname;
    } catch {
      continue;
    }
    if (!sitemapRouteSet.has(target) || target === route) continue;
    routeEdges.get(route).add(target);
    routeInbound.get(target).add(route);
  }
}
for (const route of sitemapRoutes) {
  if (route !== "/" && routeInbound.get(route).size === 0) errors.push(`${route}: indexable orphan page has no inbound HTML link`);
}
const routeDepth = new Map([["/", 0]]);
const routeQueue = ["/"];
while (routeQueue.length) {
  const route = routeQueue.shift();
  for (const target of routeEdges.get(route)) {
    if (routeDepth.has(target)) continue;
    routeDepth.set(target, routeDepth.get(route) + 1);
    routeQueue.push(target);
  }
}
for (const route of sitemapRoutes) {
  if (!routeDepth.has(route)) errors.push(`${route}: indexable page is unreachable from the homepage`);
  else if (routeDepth.get(route) > 3) errors.push(`${route}: homepage click depth ${routeDepth.get(route)} exceeds 3`);
}
if (sitemap.includes("404.html")) errors.push("sitemap must not include the 404 page");
if (!sitemap.includes("/crosswordese/spec/")) errors.push("sitemap is missing the SPEC answer entity");
for (const answer of ["mia", "una", "goya"]) {
  if (!sitemap.includes(`/crosswordese/${answer}/`)) errors.push(`sitemap is missing the ${answer.toUpperCase()} answer entity`);
}
if (!sitemap.includes("/explainers/contractors-detail-for-short/")) errors.push("sitemap is missing the reviewed SPEC explainer");
if (!sitemap.includes("<lastmod>")) errors.push("sitemap is missing lastmod metadata for fresh content");
if (!sitemap.includes("/explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/")) errors.push("sitemap is missing the current NYT Mini batch");
if (!sitemap.includes("/explainers/forfends-nyt-daily/")) errors.push("sitemap is missing the selected current NYT Daily batch");
if (!sitemap.includes("/explainers/private-sleeping-accommodations-nyt-daily/")) errors.push("sitemap is missing the latest NYT Daily batch");
if (!sitemap.includes("/explainers/hidden-figures-star-janelle-usa-today/")) errors.push("sitemap is missing the latest USA TODAY batch");
if (!sitemap.includes("/crossword-clues/")) errors.push("sitemap is missing the clue dictionary");
if (!sitemap.includes("/crossword-clues/diffuse/")) errors.push("sitemap is missing the Diffuse clue hub");
if (!sitemap.includes("/crossword-clues/pitch/")) errors.push("sitemap is missing the Pitch clue hub");
if (!sitemap.includes("/crossword-clues/charge/")) errors.push("sitemap is missing the Charge clue hub");
if (!sitemap.includes("/crossword-clues/issue/")) errors.push("sitemap is missing the Issue clue hub");
if (!sitemap.includes("/crossword-clues/sharp/")) errors.push("sitemap is missing the Sharp clue hub");
if (!sitemap.includes("/crossword-clues/light/")) errors.push("sitemap is missing the Light clue hub");
if (!sitemap.includes("/guides/answer-length-and-crossings/")) errors.push("sitemap is missing the ambiguity solving guide");
if (!sitemap.includes("/research/ambiguous-crossword-clues/")) errors.push("sitemap is missing the ambiguity research page");
if (!sitemap.includes("/crossword-answers-today/")) errors.push("sitemap is missing the cross-publication answers-today hub");
if (!sitemap.includes("/crossword-answers-by-length/")) errors.push("sitemap is missing the answers-by-length index");
for (const length of [3, 4, 5, 6]) {
  if (!sitemap.includes(`/crossword-answers/${length}-letters/`)) errors.push(`sitemap is missing the ${length}-letter answers page`);
}
for (const publication of publications) {
  const hasPublishedClues = clues.some((clue) => clue.publication === publication.name);
  const routeInSitemap = sitemap.includes(publication.route);
  if (hasPublishedClues && !routeInSitemap) errors.push(`sitemap is missing the ${publication.name} publication hub`);
  if (!hasPublishedClues && routeInSitemap) errors.push(`sitemap includes an empty ${publication.name} publication hub`);
}
const feed = await readFile(path.join(dist, "feed.xml"), "utf8");
const latestPublish = JSON.parse(await readFile(path.resolve("ops/latest-publish.json"), "utf8"));
for (const url of latestPublish.urls ?? []) {
  if (!feed.includes(url)) errors.push(`feed is missing latest published URL ${url}`);
}
const freshPage = await readFile(path.join(dist, "explainers/blue-streams-down-a-yellow-emojis-face-nyt-mini/index.html"), "utf8");
if (!freshPage.includes("NYT Mini crossword clue")) errors.push("fresh explainer does not target the publication long-tail query");
const latestDailyPage = await readFile(path.join(dist, "explainers/private-sleeping-accommodations-nyt-daily/index.html"), "utf8");
if (!latestDailyPage.includes("Private sleeping accommodations? The New York Times Crossword clue")) errors.push("latest daily explainer does not target the publication long-tail query");
if (!latestDailyPage.includes("Why COTS fits")) errors.push("latest daily explainer is missing its reviewed explanation");
const miniHub = await readFile(path.join(dist, "nyt-mini-crossword-clues/index.html"), "utf8");
if (!miniHub.includes("It’s in a pickle")) errors.push("NYT Mini hub is missing the latest selected clue");
const dailyHub = await readFile(path.join(dist, "nyt-crossword-clues/index.html"), "utf8");
if (!dailyHub.includes("Private sleeping accommodations?")) errors.push("NYT daily hub is missing the latest selected clue");
const latHub = await readFile(path.join(dist, "la-times-crossword-answers/index.html"), "utf8");
if (!latHub.includes("&quot;All Eyez on Me&quot; rapper")) errors.push("LA Times demand hub is missing its selected current clue");
const usaTodayHub = await readFile(path.join(dist, "usa-today-crossword-answers/index.html"), "utf8");
if (!usaTodayHub.includes("Arthur for whom the ESPYs&#039; Courage Award is named")) errors.push("USA TODAY demand hub is missing its selected current clue");
if (!usaTodayHub.includes("&quot;Hidden Figures&quot; star Janelle") || !usaTodayHub.includes("August 20, 2026")) errors.push("USA TODAY hub is missing its August 20 selected batch");
const latestUsaTodayPage = await readFile(path.join(dist, "explainers/hidden-figures-star-janelle-usa-today/index.html"), "utf8");
if (!latestUsaTodayPage.includes("Why MONAE fits") || !latestUsaTodayPage.includes("USA TODAY Crossword · 44-Across")) errors.push("latest USA TODAY explainer is missing its reviewed answer or source context");
for (const [slug, answer, target] of [["mia", "MIA", "missing in action"], ["una", "UNA", "Spanish feminine singular"], ["goya", "GOYA", "Francisco Goya"]]) {
  const answerPage = await readFile(path.join(dist, `crosswordese/${slug}/index.html`), "utf8");
  if (!answerPage.includes(`${answer} in crosswords`) || !answerPage.includes(target) || !answerPage.includes('"@type":"DefinedTerm"')) errors.push(`${answer} answer page is missing its meaning target or DefinedTerm data`);
}
const diffuseHub = await readFile(path.join(dist, "crossword-clues/diffuse/index.html"), "utf8");
if (!diffuseHub.includes("Diffuse crossword clue")) errors.push("Diffuse clue hub is missing its search target");
if (!diffuseHub.includes("SPREAD") || !diffuseHub.includes("OSMOSE") || !diffuseHub.includes("PROLIX")) errors.push("Diffuse clue hub is missing reviewed multi-sense answers");
const pitchHub = await readFile(path.join(dist, "crossword-clues/pitch/index.html"), "utf8");
if (!pitchHub.includes("Pitch crossword clue")) errors.push("Pitch clue hub is missing its search target");
if (!pitchHub.includes("TAR") || !pitchHub.includes("TONE") || !pitchHub.includes("SPIEL")) errors.push("Pitch clue hub is missing reviewed multi-sense answers");
const chargeHub = await readFile(path.join(dist, "crossword-clues/charge/index.html"), "utf8");
if (!chargeHub.includes("Charge crossword clue")) errors.push("Charge clue hub is missing its search target");
if (!chargeHub.includes("FEE") || !chargeHub.includes("ONUS") || !chargeHub.includes("IONIZE")) errors.push("Charge clue hub is missing reviewed multi-sense answers");
const issueHub = await readFile(path.join(dist, "crossword-clues/issue/index.html"), "utf8");
if (!issueHub.includes("Issue crossword clue")) errors.push("Issue clue hub is missing its search target");
if (!issueHub.includes("EMIT") || !issueHub.includes("TOPIC") || !issueHub.includes("EDITION")) errors.push("Issue clue hub is missing reviewed multi-sense answers");
const sharpHub = await readFile(path.join(dist, "crossword-clues/sharp/index.html"), "utf8");
if (!sharpHub.includes("Sharp crossword clue") || !sharpHub.includes("KEEN") || !sharpHub.includes("ACUTE") || !sharpHub.includes("ASTUTE") || !sharpHub.includes("Sharp or biting in taste") || !sharpHub.includes("mentally sharp crossword clue") || !sharpHub.includes("looking sharp crossword clue")) errors.push("Sharp clue hub is missing its search target, reviewed answers, meanings, or query variants");
const lightHub = await readFile(path.join(dist, "crossword-clues/light/index.html"), "utf8");
if (!lightHub.includes("Light crossword clue") || !lightHub.includes("GLOW") || !lightHub.includes("PALE") || !lightHub.includes("IGNITE") || !lightHub.includes("Illumination, a beam") || !lightHub.includes("flashing light crossword clue") || !lightHub.includes("before it gets light crossword clue") || !lightHub.includes("STROBE") || !lightHub.includes("PREDAWN")) errors.push("Light clue hub is missing its search target, reviewed answers, meanings, or query variants");
const ambiguityGuide = await readFile(path.join(dist, "guides/answer-length-and-crossings/index.html"), "utf8");
if (!ambiguityGuide.includes("How answer length and crossings solve ambiguous crossword clues")) errors.push("ambiguity guide is missing its search target");
if (!ambiguityGuide.includes("/crossword-clues/diffuse/") || !ambiguityGuide.includes("/crossword-clues/pitch/") || !ambiguityGuide.includes("/crossword-clues/charge/") || !ambiguityGuide.includes("/crossword-clues/issue/") || !ambiguityGuide.includes("/crossword-clues/sharp/") || !ambiguityGuide.includes("/crossword-clues/light/") || !ambiguityGuide.includes("/solver/")) errors.push("ambiguity guide is missing its useful internal links");
const ambiguityResearchPage = await readFile(path.join(dist, "research/ambiguous-crossword-clues/index.html"), "utf8");
if (!ambiguityResearchPage.includes("Ambiguous crossword clues by answer length and meaning")) errors.push("ambiguity research page is missing its primary target");
if (!ambiguityResearchPage.includes(`${clueHubCandidateCount} reviewed clue-answer possibilities`) || !ambiguityResearchPage.includes(`${clueHubUniqueAnswerCount} unique answers`)) errors.push("ambiguity research page is missing its current dataset totals");
if (!ambiguityResearchPage.includes('"@type":"Dataset"')) errors.push("ambiguity research page is missing Dataset structured data");
if (!ambiguityResearchPage.includes("/assets/clue-hubs.json") || !ambiguityResearchPage.includes("/assets/clue-hubs.csv")) errors.push("ambiguity research page is missing a dataset download format");
const ambiguityCsv = await readFile(path.join(dist, "assets/clue-hubs.csv"), "utf8");
if (!ambiguityCsv.startsWith("clue,answer,length,sense,reviewed_at\n")) errors.push("ambiguity CSV is missing its stable header");
if (ambiguityCsv.trimEnd().split("\n").length !== clueHubCandidateCount + 1) errors.push(`ambiguity CSV must contain one header plus ${clueHubCandidateCount} reviewed rows`);
const answersTodayPage = await readFile(path.join(dist, "crossword-answers-today/index.html"), "utf8");
if (!answersTodayPage.includes("Crossword answers today — selected clues")) errors.push("answers-today hub is missing its search target");
for (const publication of ["NYT Mini", "The New York Times Crossword", "LA Times Crossword", "USA TODAY Crossword"]) {
  if (!answersTodayPage.includes(publication)) errors.push(`answers-today hub is missing ${publication}`);
}
if (!answersTodayPage.includes('"@type":"ItemList"')) errors.push("answers-today hub is missing ItemList structured data");
const abbreviationGuide = await readFile(path.join(dist, "clue-types/abbreviations/index.html"), "utf8");
if (!abbreviationGuide.includes("Crossword abbreviations and clue signals")) errors.push("abbreviation guide is missing its primary search target");
for (const answer of ["SPEC", "NATL", "ENE", "CPU", "MLS", "NASA"]) {
  if (!abbreviationGuide.includes(answer)) errors.push(`abbreviation guide is missing reviewed example ${answer}`);
}
if (!abbreviationGuide.includes('"@type":"Article"')) errors.push("abbreviation guide is missing Article structured data");
const questionMarkGuide = await readFile(path.join(dist, "clue-types/question-marks/index.html"), "utf8");
if (!questionMarkGuide.includes("What does a question mark mean in a crossword clue?")) errors.push("question-mark guide is missing its primary search target");
for (const answer of ["OBIT", "COTS", "DOTS", "LIGHT"]) {
  if (!questionMarkGuide.includes(answer)) errors.push(`question-mark guide is missing reviewed example ${answer}`);
}
if (!questionMarkGuide.includes('"@type":"Article"')) errors.push("question-mark guide is missing Article structured data");
const fillBlankGuide = await readFile(path.join(dist, "clue-types/fill-in-the-blank/index.html"), "utf8");
if (!fillBlankGuide.includes("How to solve fill-in-the-blank crossword clues")) errors.push("fill-in-the-blank guide is missing its primary search target");
for (const answer of ["SPOON", "OUTTA", "UNTO", "ERAS", "ANGER"]) {
  if (!fillBlankGuide.includes(answer)) errors.push(`fill-in-the-blank guide is missing reviewed example ${answer}`);
}
if (!fillBlankGuide.includes('"@type":"Article"')) errors.push("fill-in-the-blank guide is missing Article structured data");
const properNounGuide = await readFile(path.join(dist, "clue-types/proper-nouns/index.html"), "utf8");
if (!properNounGuide.includes("How to solve proper noun crossword clues")) errors.push("proper-noun guide is missing its primary search target");
const currentProperNounExamples = clues.filter((clue) => clue.clueType === "proper-noun").sort((a, b) => b.popularity - a.popularity).slice(0, 8);
for (const clue of currentProperNounExamples) {
  if (!properNounGuide.includes(clue.answer)) errors.push(`proper-noun guide is missing current reviewed example ${clue.answer}`);
}
if (!properNounGuide.includes('"@type":"Article"')) errors.push("proper-noun guide is missing Article structured data");
const directDefinitionGuide = await readFile(path.join(dist, "clue-types/direct-definitions/index.html"), "utf8");
if (!directDefinitionGuide.includes("How to solve direct definition crossword clues")) errors.push("direct-definition guide is missing its primary search target");
for (const answer of ["LIFTS", "MESS", "ERS", "LATTE", "SPLIT", "NOELS", "DETERS", "LAB"]) {
  if (!directDefinitionGuide.includes(answer)) errors.push(`direct-definition guide is missing reviewed example ${answer}`);
}
if (!directDefinitionGuide.includes('"@type":"Article"')) errors.push("direct-definition guide is missing Article structured data");
const answerLengthIndex = await readFile(path.join(dist, "crossword-answers-by-length/index.html"), "utf8");
if (!answerLengthIndex.includes("Crossword answers by length")) errors.push("answers-by-length index is missing its search target");
for (const length of [3, 4, 5, 6]) {
  const lengthPage = await readFile(path.join(dist, `crossword-answers/${length}-letters/index.html`), "utf8");
  if (!lengthPage.includes(`${length}-letter crossword answers`)) errors.push(`${length}-letter page is missing its search target`);
  if (!lengthPage.includes('"@type":"ItemList"')) errors.push(`${length}-letter page is missing ItemList structured data`);
}
const privacyPage = await readFile(path.join(dist, "privacy/index.html"), "utf8");
if (!privacyPage.includes("Cloudflare Web Analytics")) errors.push("privacy page is missing the production analytics disclosure");
if (!privacyPage.includes("app.pageview.app")) errors.push("privacy page is missing the Pageview analytics disclosure");
if (!privacyPage.includes("Saved clues") || !privacyPage.includes("local storage")) errors.push("privacy page is missing the local saved-clue disclosure");
const savedCluesPage = await readFile(path.join(dist, "saved-clues/index.html"), "utf8");
if (!savedCluesPage.includes("data-saved-clues-root")) errors.push("saved clues page is missing its local rendering root");
if (!savedCluesPage.includes("noindex,nofollow")) errors.push("saved clues page must remain out of the search index");
if (sitemap.includes("/saved-clues/")) errors.push("sitemap must not include the personalized saved clues page");
const cluePage = await readFile(path.join(dist, "explainers/scientists-workplace-nyt-mini/index.html"), "utf8");
if (!cluePage.includes("data-save-clue")) errors.push("reviewed clue pages are missing the save-clue control");

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
