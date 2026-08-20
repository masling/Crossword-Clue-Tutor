import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateContent } from "./validate-content.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [config, clues, answers, clueTypes, publications, clueHubs] = await Promise.all([
  readJson("site.config.json"),
  readJson("data/clues.json"),
  readJson("data/answers.json"),
  readJson("data/clue-types.json"),
  readJson("data/publications.json"),
  readJson("data/clue-hubs.json")
]);

const validation = validateContent({ clues, answers, clueTypes, publications, clueHubs, config });
for (const warning of validation.warnings) console.warn(`warning: ${warning}`);
if (validation.errors.length) throw new Error(validation.errors.join("\n"));

const answerBySlug = new Map(answers.map((answer) => [answer.slug, answer]));
const answerByValue = new Map(answers.map((answer) => [answer.answer, answer]));
const pages = [];

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function xmlEscape(value = "") {
  return escapeHtml(value).replaceAll("&#039;", "&apos;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function canonicalUrl(route) {
  return new URL(route, config.siteUrl).href;
}

function seoTitle(subject, suffix) {
  const separator = " — ";
  const maxLength = 70;
  const subjectBudget = maxLength - separator.length - suffix.length;
  const trimmedSubject = subject.trim();
  const fittedSubject = trimmedSubject.length <= subjectBudget
    ? trimmedSubject
    : `${trimmedSubject.slice(0, subjectBudget - 1).trimEnd()}…`;
  return `${fittedSubject}${separator}${suffix}`;
}

function logo() {
  return `<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
}

function header() {
  return `<header class="site-header">
    <div class="shell header-inner">
      <a class="brand" href="/" aria-label="${escapeHtml(config.name)} home">${logo()}<span>${escapeHtml(config.name)}</span></a>
      <nav class="primary-nav" aria-label="Primary navigation">
        <a href="/solver/">Solve</a>
        <a href="/explain/">Explain</a>
        <a href="/crosswordese/">Crosswordese</a>
        <a href="/clue-types/">Clue types</a>
      </nav>
    </div>
  </header>`;
}

function footer() {
  const publicationLinks = activePublicationHubs()
    .map((hub) => `<a href="${hub.route}">${escapeHtml(hub.linkLabel)}</a>`)
    .join("");
  return `<footer class="site-footer">
    <div class="shell footer-grid">
      <div><a class="brand footer-brand" href="/">${logo()}<span>${escapeHtml(config.name)}</span></a><p>${escapeHtml(config.tagline)}</p></div>
      <nav aria-label="Footer navigation">
        <a href="/about/">About</a>
        <a href="/editorial-policy/">Editorial policy</a>
        <a href="/privacy/">Privacy</a>
        <a href="/crossword-answers-today/">Answers today</a>
        <a href="/daily-clue-clinic/">Daily clue clinic</a>
        <a href="/crossword-clues/">Clue dictionary</a>
        <a href="/crossword-answers-by-length/">Answers by length</a>
        <a href="/guides/answer-length-and-crossings/">Solving guide</a>
        <a href="/feed.xml">Fresh clue feed</a>
        ${publicationLinks}
      </nav>
    </div>
  </footer>`;
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => {
    const separator = index ? `<span aria-hidden="true">/</span>` : "";
    return `${separator}${item.href ? `<a href="${item.href}">${escapeHtml(item.label)}</a>` : `<span aria-current="page">${escapeHtml(item.label)}</span>`}`;
  }).join("")}</nav>`;
}

function pageTemplate({ title, description, route, body, bodyClass = "", noindex = false, jsonLd = [] }) {
  const brandedTitle = `${title} | ${config.name}`;
  const fullTitle = title === config.name
    ? `${config.name} — ${config.tagline}`
    : brandedTitle.length <= 70 ? brandedTitle : title;
  const pageview = config.analytics?.pageview;
  const pageviewMarkup = pageview
    ? `<link rel="preconnect" href="${escapeHtml(new URL(pageview.scriptSrc).origin)}" crossorigin>\n  <script defer data-domain="${escapeHtml(pageview.domain)}" src="${escapeHtml(pageview.scriptSrc)}"></script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">
  <link rel="canonical" href="${canonicalUrl(route)}">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(config.name)} fresh crossword clues" href="${canonicalUrl("/feed.xml")}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(route)}">
  <meta name="theme-color" content="oklch(0.48 0.09 210)">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  ${pageviewMarkup}
  <link rel="stylesheet" href="/assets/style.css">
  ${jsonLd.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll("<", "\\u003c")}</script>`).join("\n  ")}
</head>
<body class="${escapeHtml(bodyClass)}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${header()}
  <main id="main">${body}</main>
  ${footer()}
  <script type="module" src="/assets/app.js"></script>
</body>
</html>`;
}

function toolShell(initialTab = "solve", compact = false) {
  return `<section class="tool-shell${compact ? " tool-shell-compact" : ""}" data-tool-root data-initial-tab="${initialTab}">
    <div class="tool-tabs" role="tablist" aria-label="Crossword help mode">
      <button type="button" role="tab" id="solve-tab" aria-controls="solve-panel" aria-selected="${initialTab === "solve"}" data-tab="solve">Help me solve</button>
      <button type="button" role="tab" id="explain-tab" aria-controls="explain-panel" aria-selected="${initialTab === "explain"}" data-tab="explain">Explain my answer</button>
    </div>
    <div class="tool-panel" id="solve-panel" role="tabpanel" aria-labelledby="solve-tab" ${initialTab !== "solve" ? "hidden" : ""}>
      <form class="tool-form" data-solve-form novalidate>
        <div class="field field-wide">
          <label for="solve-clue">Crossword clue</label>
          <input id="solve-clue" name="clue" type="text" placeholder="e.g. Contractor's detail, for short" autocomplete="off">
        </div>
        <div class="field">
          <label for="solve-pattern">Known letters</label>
          <input id="solve-pattern" name="pattern" type="text" placeholder="S?E?" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text">
          <small>Use ? for each unknown letter.</small>
        </div>
        <div class="field field-length">
          <label for="solve-length">Length</label>
          <input id="solve-length" name="length" type="number" min="2" max="30" inputmode="numeric" placeholder="4">
          <small>Optional if the pattern sets it.</small>
        </div>
        <div class="form-actions field-wide">
          <button class="button button-primary" type="submit">Find a helpful hint</button>
          <button class="example-button" type="button" data-example="solve">Try the SPEC example</button>
        </div>
        <p class="form-error field-wide" data-solve-error role="alert" hidden></p>
      </form>
      <div class="tool-results" data-solve-results aria-live="polite"></div>
    </div>
    <div class="tool-panel" id="explain-panel" role="tabpanel" aria-labelledby="explain-tab" ${initialTab !== "explain" ? "hidden" : ""}>
      <form class="tool-form" data-explain-form novalidate>
        <div class="field field-wide">
          <label for="explain-clue">Crossword clue</label>
          <input id="explain-clue" name="clue" type="text" placeholder="e.g. Contractor's detail, for short" autocomplete="off" required>
        </div>
        <div class="field field-answer">
          <label for="explain-answer">Answer you have</label>
          <input id="explain-answer" name="answer" type="text" placeholder="SPEC" autocomplete="off" autocapitalize="characters" spellcheck="false" required>
          <small>Spaces and punctuation are ignored.</small>
        </div>
        <div class="form-actions field-wide">
          <button class="button button-primary" type="submit">Explain why it fits</button>
          <button class="example-button" type="button" data-example="explain">Try the SPEC example</button>
        </div>
        <p class="form-error field-wide" data-explain-error role="alert" hidden></p>
      </form>
      <div class="tool-results" data-explain-results aria-live="polite"></div>
    </div>
  </section>`;
}

function clueTypeLabel(type) {
  return ({
    "abbreviation": "Abbreviation",
    "direct-definition": "Direct definition",
    "wordplay": "Wordplay",
    "factoid": "Fact clue",
    "informal": "Informal usage",
    "proper-noun": "Name or title",
    "fill-in-the-blank": "Fill in the blank"
  })[type] ?? "Crossword clue";
}

function publicationClueSuffix(publication) {
  return /crossword$/i.test(publication.trim())
    ? `${publication} clue`
    : `${publication} crossword clue`;
}

const publicationHubs = new Map(publications.map((publication) => [publication.name, publication]));

function publicationHubFor(publication) {
  return publicationHubs.get(publication);
}

function activePublicationHubs() {
  return publications.filter((publication) => clues.some((clue) => clue.publication === publication.name));
}

function clueRows(items, { showDate = false } = {}) {
  return `<div class="clue-list">${items.map((clue) => `<a class="clue-row" href="/explainers/${clue.slug}/">
    <span class="clue-row-main"><strong>${escapeHtml(clue.clue)}</strong><small>${escapeHtml(clue.publication ? `${clue.publication} · ${clueTypeLabel(clue.clueType)}` : clueTypeLabel(clue.clueType))}${showDate ? ` · ${escapeHtml(formatDate(clue.date))}` : ""}</small></span>
    <span class="length-badge" aria-label="${clue.answer.length} letters">${clue.answer.length}</span>
    <span class="row-arrow" aria-hidden="true">→</span>
  </a>`).join("")}</div>`;
}

const dates = [...new Set(clues.map((clue) => clue.date))].sort().reverse();
const latestDate = dates[0];
const latestClues = clues.filter((clue) => clue.date === latestDate).sort((a, b) => b.popularity - a.popularity);

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: config.name,
  url: config.siteUrl,
  description: config.description
};

const homeBody = `<section class="hero shell">
  <div class="hero-copy">
    <p class="status-line"><span aria-hidden="true"></span> Reviewed clues, not an answer dump</p>
    <h1>Get unstuck without giving up the puzzle.</h1>
    <p class="hero-lede">Start with a nudge. Reveal the answer only when you want it. Then learn exactly why the clue works.</p>
    <ul class="trust-list" aria-label="Product principles"><li>Pattern-aware</li><li>Hints before spoilers</li><li>Plain-English explanations</li></ul>
  </div>
  <aside class="today-note" aria-label="Today's clue clinic">
    <span>Clue clinic · ${escapeHtml(formatDate(latestDate))}</span>
    <p>${escapeHtml(latestClues[0].clue)}</p>
    <a href="/daily-clue-clinic/${latestDate}/">Work through today's set <span aria-hidden="true">→</span></a>
  </aside>
</section>
<div class="shell home-tool">${toolShell("solve")}</div>
<section class="shell section-split">
  <div>
    <p class="section-intro">Built for the moment after crossings stop helping.</p>
    <h2>Answers are easy to copy. Understanding is what sticks.</h2>
  </div>
  <div class="principle-list">
    <div><strong>01</strong><p><b>Use what you know.</b> Add length and crossing letters to remove noise.</p></div>
    <div><strong>02</strong><p><b>Choose how much help.</b> Open a clue-type hint, a semantic hint, or the answer.</p></div>
    <div><strong>03</strong><p><b>Learn the mechanism.</b> See the abbreviation signal, tense match, pun, or fact behind the fill.</p></div>
  </div>
</section>
<section class="shell latest-section">
  <div class="section-heading"><div><h2>Recently reviewed clues</h2><p>Every indexed explanation has an editorial review date.</p></div><a href="/daily-clue-clinic/">Browse the clinic archive</a></div>
  ${clueRows(latestClues.slice(0, 6))}
  <div class="daily-hub-links"><a href="/crossword-answers-today/">Crossword answers today →</a><a href="/crossword-answers-by-length/">Answers by length →</a>${activePublicationHubs().map((hub) => `<a href="${hub.route}">${escapeHtml(hub.linkLabel)} →</a>`).join("")}</div>
</section>
<section class="answer-strip">
  <div class="shell answer-strip-inner"><div><h2>Meet the words crosswords keep bringing back.</h2><p>Meaning, pronunciation, common clue patterns, and why the fill works so well in a grid.</p></div><div class="answer-links">${answers.slice(0, 5).map((answer) => `<a href="/crosswordese/${answer.slug}/">${answer.answer}</a>`).join("")}</div><a class="button button-secondary" href="/crosswordese/">Explore crosswordese</a></div>
</section>`;

await writePage("/", pageTemplate({ title: config.name, description: config.description, route: "/", body: homeBody, bodyClass: "home-page", jsonLd: [organizationLd] }));

function toolPage(mode) {
  const isSolve = mode === "solve";
  const title = isSolve ? "Crossword clue solver with hints" : "Explain a crossword answer";
  const description = isSolve
    ? "Search a crossword clue with answer length and known letters. Get progressive hints before revealing an answer."
    : "Enter a crossword clue and the answer you have to learn why it fits, which clue signal matters, and what the answer means.";
  const route = isSolve ? "/solver/" : "/explain/";
  const body = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: isSolve ? "Solver" : "Explain" }])}<h1>${title}</h1><p>${description}</p></section><div class="shell standalone-tool">${toolShell(mode)}</div><section class="shell guidance"><h2>${isSolve ? "A better way to use a solver" : "When the fill is right but still makes no sense"}</h2><div class="guidance-columns">${isSolve ? `<p>Enter the clue as written, then add the letters you trust. The tool applies pattern and length constraints before ranking reviewed clue matches.</p><p>Start with hints. A crossing letter learned from another answer is often more satisfying than revealing the whole word.</p>` : `<p>Crossword clues can turn on an abbreviation, a less familiar word sense, a title, or one small piece of punctuation. Enter both sides and we will point to the mechanism.</p><p>If a pairing is not in the reviewed set, the tool says so. It will not invent an explanation just to fill the space.</p>`}</div></section>`;
  return { route, html: pageTemplate({ title, description, route, body, bodyClass: "tool-page" }) };
}

for (const mode of ["solve", "explain"]) {
  const item = toolPage(mode);
  await writePage(item.route, item.html);
}

const answerLengths = [3, 4, 5, 6];
const answersByLengthRoute = "/crossword-answers-by-length/";
const answerLengthGroups = answerLengths.map((length) => ({ length, items: clues.filter((clue) => clue.answer.length === length).sort((a, b) => b.popularity - a.popularity) })).filter((group) => group.items.length >= 5);
const answerLengthIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword answers by length" }])}<h1>Crossword answers by length</h1><p>Start with the number of squares, then use the clue and crossing letters to narrow reviewed answer candidates.</p></section><section class="shell type-directory">${answerLengthGroups.map(({ length, items }) => `<a href="/crossword-answers/${length}-letters/"><span>${length}-letter answers</span><p>${items.length} reviewed clue-answer pairs with hints, definitions, and explanations.</p><b>Browse ${length}-letter clues <i aria-hidden="true">→</i></b></a>`).join("")}</section>`;
const answerLengthIndexLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crossword answers by length", description: "Reviewed crossword clue-answer pairs organized by answer length.", url: canonicalUrl(answersByLengthRoute), mainEntity: { "@type": "ItemList", itemListElement: answerLengthGroups.map((group, index) => ({ "@type": "ListItem", position: index + 1, name: `${group.length}-letter crossword answers`, url: canonicalUrl(`/crossword-answers/${group.length}-letters/`) })) } };
await writePage(answersByLengthRoute, pageTemplate({ title: "Crossword answers by length", description: "Browse reviewed crossword answers by letter count, then use clue wording and crossings to choose the right fill.", route: answersByLengthRoute, body: answerLengthIndexBody, bodyClass: "answer-length-index-page", jsonLd: [answerLengthIndexLd] }), false, config.contentUpdatedAt);

for (const { length, items } of answerLengthGroups) {
  const route = `/crossword-answers/${length}-letters/`;
  const lastmod = items.map((clue) => clue.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
  const body = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Answers by length", href: answersByLengthRoute }, { label: `${length}-letter answers` }])}<p class="content-kind">${items.length} reviewed clue-answer pairs</p><h1>${length}-letter crossword answers</h1><p>Use the clue wording and known crossing letters to choose among current and evergreen ${length}-letter fills. Open any clue for hints before the answer.</p></section><section class="shell guidance"><h2>Length removes noise. Crossings confirm the fill.</h2><div class="guidance-columns"><p>These are reviewed examples, not every word with ${length} letters. Results preserve the clue, publication context when available, and an explanation of why the answer fits.</p><p>If several clues look plausible, enter the letters you already trust in the pattern-aware solver before revealing an answer.</p></div><p><a class="button button-primary" href="/solver/">Open the clue solver</a></p></section><section class="shell latest-section"><div class="section-heading"><div><h2>Browse ${length}-letter clue matches</h2><p>Sorted by current editorial priority.</p></div><a href="${answersByLengthRoute}">All lengths</a></div>${clueRows(items, { showDate: true })}</section>`;
  const collectionLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: `${length}-letter crossword answers`, description: `Reviewed ${length}-letter crossword clue-answer pairs with hints and explanations.`, url: canonicalUrl(route), dateModified: lastmod, mainEntity: { "@type": "ItemList", itemListElement: items.map((clue, index) => ({ "@type": "ListItem", position: index + 1, name: clue.clue, url: canonicalUrl(`/explainers/${clue.slug}/`) })) } };
  await writePage(route, pageTemplate({ title: `${length}-letter crossword answers`, description: `Browse reviewed ${length}-letter crossword answers with clue context, spoiler-light hints, definitions, and explanations.`, route, body, bodyClass: "answer-length-page", jsonLd: [collectionLd] }), false, lastmod);
}

const clueHubLatestReview = clueHubs.map((hub) => hub.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
const clueHubIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword clue dictionary" }])}<h1>Crossword clues with more than one answer.</h1><p>Use answer length, crossings, and clue sense to choose among reviewed possibilities for recurring clues.</p></section><section class="shell directory-layout"><aside><p>Why multiple answers?</p><span>A short clue can point to different synonyms in different grids. These pages organize the useful candidates instead of pretending one answer always fits.</span></aside><div class="word-directory">${clueHubs.map((hub) => `<a href="/crossword-clues/${hub.slug}/"><span class="word-name">${escapeHtml(hub.clue)}</span><span>${escapeHtml(hub.summary)}</span><span class="row-arrow" aria-hidden="true">→</span></a>`).join("")}</div></section>`;
const clueHubIndexLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crossword clue dictionary", description: "Recurring crossword clues organized by answer length and meaning.", url: canonicalUrl("/crossword-clues/") };
await writePage("/crossword-clues/", pageTemplate({ title: "Crossword clue dictionary", description: "Find possible crossword answers by clue, length, crossings, and meaning.", route: "/crossword-clues/", body: clueHubIndexBody, bodyClass: "clue-dictionary-page", jsonLd: [clueHubIndexLd] }), false, clueHubLatestReview);

for (const hub of clueHubs) {
  const route = `/crossword-clues/${hub.slug}/`;
  const groupedAnswers = new Map();
  for (const answer of hub.answers) {
    const length = answer.answer.length;
    if (!groupedAnswers.has(length)) groupedAnswers.set(length, []);
    groupedAnswers.get(length).push(answer);
  }
  const answerGroups = [...groupedAnswers.entries()].sort(([a], [b]) => a - b).map(([length, items]) => `<section class="answer-length-group"><h3>${length} letters</h3><div>${items.map((answer) => `<article><strong>${escapeHtml(answer.answer)}</strong><span>${escapeHtml(answer.sense)}</span></article>`).join("")}</div></section>`).join("");
  const body = `<article class="shell article-layout clue-dictionary-entry"><div class="article-main">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue dictionary", href: "/crossword-clues/" }, { label: hub.clue }])}<header><p class="content-kind">Recurring crossword clue · multiple possible answers</p><h1>${escapeHtml(hub.clue)} crossword clue</h1><p class="review-date">Editorially reviewed ${escapeHtml(formatDate(hub.reviewedAt))}</p></header><section><h2>Best starting answer</h2><p>${escapeHtml(hub.answerGuidance)}</p></section><section><h2>${escapeHtml(hub.clue)} answers by length</h2><p>The correct fill depends on the number of squares, crossing letters, and the sense intended by the setter.</p><div class="answer-length-groups">${answerGroups}</div></section><section><h2>Meanings to check</h2><ul class="pattern-list"><li>Spread, scatter, or distribute.</li><li>Pass gradually through a material or membrane.</li><li>Emit light, heat, liquid, or another output.</li><li>Wordy or not concise, when used as an adjective.</li></ul></section><section><h2>Related searches</h2><ul class="pattern-list">${hub.relatedQueries.map((query) => `<li>${escapeHtml(query)}</li>`).join("")}</ul></section><p class="source-note">This page groups independently reviewed possibilities for a recurring clue. It is not tied to one publisher or reproduced puzzle.</p></div><aside class="article-aside"><p>Use your crossings</p><span>Match the number of squares first, then compare the letters you already trust.</span><a class="aside-all" href="/solver/">Open the pattern solver →</a><a class="aside-all" href="/guides/answer-length-and-crossings/">Read the ambiguity guide →</a></aside></article>`;
  const itemListLd = { "@context": "https://schema.org", "@type": "ItemList", name: `${hub.clue} crossword clue answers`, itemListElement: hub.answers.map((answer, index) => ({ "@type": "ListItem", position: index + 1, name: answer.answer, description: answer.sense })) };
  await writePage(route, pageTemplate({ title: `${hub.clue} crossword clue: answers by length`, description: hub.summary, route, body, bodyClass: "article-page clue-dictionary-page", jsonLd: [itemListLd] }), false, hub.reviewedAt);
}

const ambiguityGuideRoute = "/guides/answer-length-and-crossings/";
const ambiguityGuideBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Answer length and crossings" }])}<p class="content-kind">Crossword solving guide</p><h1>How answer length and crossings solve ambiguous crossword clues</h1><p>A short clue can have many legitimate answers. The grid—not a generic synonym list—decides which one fits. This guide shows how to combine entry length, crossing letters, grammar, and clue signals before revealing an answer.</p><h2>1. Treat the answer length as evidence</h2><p>For the recurring clue “Diffuse,” four squares might suggest <strong>SEEP</strong> or <strong>SHED</strong>, six squares might suggest <strong>SPREAD</strong>, <strong>OSMOSE</strong>, or <strong>PROLIX</strong>, and eight squares might suggest <strong>PERMEATE</strong> or <strong>DISPERSE</strong>. The clue has not changed; the grid has narrowed the intended sense.</p><p>“Pitch” shows the same ambiguity across meanings: <strong>TAR</strong> is a three-letter sticky material, <strong>TONE</strong> is a four-letter sound quality, while five letters might be <strong>SLOPE</strong> or <strong>SPIEL</strong>. “Charge” may instead mean a <strong>FEE</strong>, <strong>ONUS</strong>, <strong>RUSH</strong>, <strong>ACCUSE</strong>, or <strong>IONIZE</strong>.</p><p><a class="text-link" href="/crossword-clues/diffuse/">Compare Diffuse answers by length →</a><br><a class="text-link" href="/crossword-clues/pitch/">Compare Pitch answers by length →</a><br><a class="text-link" href="/crossword-clues/charge/">Compare Charge answers by length →</a></p><h2>2. Add only crossing letters you trust</h2><p>One confirmed crossing can remove most candidates. A six-letter pattern <code>S?R?A?</code> points strongly toward SPREAD, while <code>O?M?S?</code> points toward OSMOSE. Do not lock in a speculative crossing just because it produces a familiar word.</p><h2>3. Match the clue's grammar</h2><p>Plural clues usually need plural fills, past-tense clues need past-tense answers, and abbreviations in the clue often license abbreviations in the grid. A clue using “org.” is evidence that a shortened organization name may be expected.</p><h2>4. Check punctuation and register</h2><p>A question mark can signal a pun or nonliteral reading. Quotation marks can indicate a spoken phrase. Words such as “briefly,” “for short,” “informally,” and “in texts” tell you what register or shortened form the setter wants.</p><h2>5. Confirm the exact sense</h2><p>Before entering the fill, read the clue and candidate together as a definition. If the answer fits only vaguely, keep it provisional. A strong solution satisfies the length, crossings, grammar, and meaning at the same time.</p><h2>A repeatable solving order</h2><ol><li>Count the squares.</li><li>Mark reliable crossing letters.</li><li>Identify tense, number, abbreviation, and punctuation signals.</li><li>Generate candidates for the intended sense.</li><li>Confirm every letter through crossings where possible.</li></ol><p><a class="button button-primary" href="/solver/">Try the pattern-aware clue solver</a></p><p class="source-note">This guide teaches a general solving method and does not reproduce a publisher's grid or answer key.</p></article>`;
const ambiguityGuideLd = { "@context": "https://schema.org", "@type": "Article", headline: "How answer length and crossings solve ambiguous crossword clues", description: "A practical method for using entry length, crossing letters, grammar, and clue signals to choose the right crossword answer.", datePublished: "2026-08-20", dateModified: "2026-08-20", mainEntityOfPage: canonicalUrl(ambiguityGuideRoute), publisher: { "@type": "Organization", name: config.name } };
await writePage(ambiguityGuideRoute, pageTemplate({ title: "Solve ambiguous crossword clues with length and crossings", description: "Learn how answer length, crossing letters, grammar, and clue signals narrow ambiguous crossword answers.", route: ambiguityGuideRoute, body: ambiguityGuideBody, bodyClass: "prose-page-body guide-page", jsonLd: [ambiguityGuideLd] }), false, "2026-08-20");

const answerIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crosswordese" }])}<h1>Crosswordese, explained.</h1><p>Words that show up in grids more often than conversation—plus their meaning, pronunciation, and recurring clue patterns.</p></section>
<section class="shell directory-layout"><aside><p>Why these words?</p><span>Short answers with vowel-rich or flexible letter patterns help constructors connect a grid. Good clues keep them fair.</span></aside><div class="word-directory">${answers.map((answer) => `<a href="/crosswordese/${answer.slug}/"><span class="word-name">${answer.answer}</span><span>${escapeHtml(answer.meaning)}</span><span class="row-arrow" aria-hidden="true">→</span></a>`).join("")}</div></section>`;
await writePage("/crosswordese/", pageTemplate({ title: "Crosswordese meanings and definitions", description: "Learn the meaning, pronunciation, common clue patterns, and grid logic behind frequently seen crossword answers.", route: "/crosswordese/", body: answerIndexBody }));

for (const answer of answers) {
  const relatedClues = clues.filter((clue) => clue.answer === answer.answer);
  const relatedAnswers = (answer.related ?? []).map((slug) => answerBySlug.get(slug)).filter(Boolean);
  const route = `/crosswordese/${answer.slug}/`;
  const title = `${answer.answer} in crosswords: meaning, definition and clue patterns`;
  const body = `<article class="shell article-layout">
    <div class="article-main">
      ${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crosswordese", href: "/crosswordese/" }, { label: answer.answer }])}
      <header class="answer-header"><div><p class="content-kind">Crossword answer · ${answer.answer.length} letters</p><h1>${answer.answer}</h1><p class="pronunciation">${escapeHtml(answer.pronunciation)} · ${escapeHtml(answer.partOfSpeech)}</p></div><div class="answer-cells" aria-label="${answer.answer.split("").join(" ")}">${[...answer.answer].map((letter) => `<span>${letter}</span>`).join("")}</div></header>
      <section><h2>What does ${answer.answer} mean in a crossword?</h2><p>${escapeHtml(answer.meaning)}</p><p>${escapeHtml(answer.crosswordUse)}</p></section>
      <section><h2>Why does ${answer.answer} appear in crosswords?</h2><p>${escapeHtml(answer.whyCommon)}</p></section>
      <section><h2>Common clue patterns</h2><ul class="pattern-list">${answer.cluePatterns.map((pattern) => `<li>${escapeHtml(pattern)}</li>`).join("")}</ul><p class="source-note">These are editorially written pattern summaries, not a reproduced puzzle archive.</p></section>
      <section><h2>Other meanings to watch</h2><p>${escapeHtml(answer.otherMeanings)}</p></section>
      ${relatedClues.length ? `<section><h2>Reviewed explanation</h2>${clueRows(relatedClues)}</section>` : ""}
    </div>
    <aside class="article-aside"><p>Related crosswordese</p>${relatedAnswers.map((item) => `<a href="/crosswordese/${item.slug}/"><strong>${item.answer}</strong><span>${escapeHtml(item.meaning)}</span></a>`).join("")}<a class="aside-all" href="/crosswordese/">View all terms →</a></aside>
  </article>`;
  const definedTermLd = { "@context": "https://schema.org", "@type": "DefinedTerm", name: answer.answer, description: answer.meaning, url: canonicalUrl(route), inDefinedTermSet: canonicalUrl("/crosswordese/") };
  const answerLastmod = relatedClues.map((clue) => clue.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
  await writePage(route, pageTemplate({ title, description: `${answer.answer} means ${answer.meaning} Learn why it appears in crossword puzzles and the clue patterns that point to it.`, route, body, bodyClass: "article-page", jsonLd: [definedTermLd] }), false, answerLastmod);
}

const typesIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue types" }])}<h1>Read the clue before you solve it.</h1><p>Small signals reveal the answer's grammar, format, and intended sense. Learn the patterns setters use most often.</p></section><section class="shell type-directory">${clueTypes.map((type) => `<a href="/clue-types/${type.slug}/"><span>${escapeHtml(type.title)}</span><p>${escapeHtml(type.summary)}</p><b>Learn this clue type <i aria-hidden="true">→</i></b></a>`).join("")}</section>`;
await writePage("/clue-types/", pageTemplate({ title: "Crossword clue types and signals", description: "Learn how abbreviation clues, direct definitions, question marks, blanks, and proper-name clues work.", route: "/clue-types/", body: typesIndexBody }));

for (const type of clueTypes) {
  const route = `/clue-types/${type.slug}/`;
  const body = `<article class="shell guide-article">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue types", href: "/clue-types/" }, { label: type.title }])}<header><p class="content-kind">Clue-reading guide</p><h1>${escapeHtml(type.title)}</h1><p>${escapeHtml(type.summary)}</p></header><section class="signal-section"><div><h2>Signals to notice</h2><ul>${type.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul></div><div class="worked-example"><span>Worked example</span><p>${escapeHtml(type.exampleClue)}</p><div class="example-answer"><small>Answer</small><strong>${escapeHtml(type.exampleAnswer)}</strong></div><p>${escapeHtml(type.explanation)}</p></div></section><section><h2>How to use this in a grid</h2><p>${escapeHtml(type.advice)}</p></section><a class="text-link" href="/solver/">Try the clue solver with hints →</a></article>`;
  await writePage(route, pageTemplate({ title: `${type.title}: how they work`, description: `${type.summary} See common signals, a worked example, and practical solving advice.`, route, body, bodyClass: "guide-page" }));
}

for (const [publication, hub] of publicationHubs) {
  const publicationClues = clues.filter((clue) => clue.publication === publication);
  if (publicationClues.length === 0) continue;
  const sourceDates = [...new Set(publicationClues.map((clue) => clue.sourceDate))].sort().reverse();
  const latestReview = publicationClues.map((clue) => clue.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
  const dateSections = sourceDates.map((sourceDate) => {
    const items = publicationClues.filter((clue) => clue.sourceDate === sourceDate).sort((a, b) => b.popularity - a.popularity).slice(0, hub.maxPerDate);
    return `<section class="shell latest-section"><div class="section-heading"><div><h2>${escapeHtml(formatDate(sourceDate))}</h2><p>${items.length} selected, reviewed clues</p></div></div>${clueRows(items)}</section>`;
  }).join("");
  const body = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: hub.heading }])}<p class="content-kind">Hints before spoilers</p><h1>${escapeHtml(hub.heading)}</h1><p>${escapeHtml(hub.description)}</p></section><section class="shell guidance"><h2>Demand-selected clues, not a complete answer key.</h2><div class="guidance-columns"><p>Selection starts with current search demand, freshness, and rising query or entity signals. We publish only the small subset people are actively looking for.</p><p>Clue text identifies the puzzle entry; every hint, definition, and explanation here is independently written or materially reviewed.</p></div></section>${dateSections}`;
  const collectionLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: hub.heading, description: hub.description, url: canonicalUrl(hub.route), dateModified: latestReview };
  await writePage(hub.route, pageTemplate({ title: hub.title, description: hub.description, route: hub.route, body, bodyClass: "publication-hub-page", jsonLd: [collectionLd] }), false, latestReview);
}

const answersTodayRoute = "/crossword-answers-today/";
const answersTodayGroups = activePublicationHubs().map((hub) => {
  const publicationClues = clues.filter((clue) => clue.publication === hub.name);
  const sourceDate = publicationClues.map((clue) => clue.sourceDate).sort().reverse()[0];
  const items = publicationClues.filter((clue) => clue.sourceDate === sourceDate).sort((a, b) => b.popularity - a.popularity).slice(0, hub.maxPerDate);
  return { hub, sourceDate, items };
});
const answersTodayLatestReview = answersTodayGroups.flatMap((group) => group.items.map((clue) => clue.reviewedAt)).sort().reverse()[0] ?? config.contentUpdatedAt;
const answersTodaySections = answersTodayGroups.map(({ hub, sourceDate, items }) => `<section class="shell latest-section"><div class="section-heading"><div><p class="content-kind">${escapeHtml(hub.name)}</p><h2>${escapeHtml(formatDate(sourceDate))}</h2><p>${items.length} selected clues with hints before spoilers</p></div><a href="${hub.route}">Browse this source</a></div>${clueRows(items)}</section>`).join("");
const answersTodayBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword answers today" }])}<p class="content-kind">Updated from publicly verifiable puzzle dates</p><h1>Crossword answers today — selected clues</h1><p>Open a clue for a spoiler-light hint, answer, definition, and independently written explanation. Dates are shown per publication because daily release schedules differ.</p></section><section class="shell guidance"><h2>Current help without a full answer dump.</h2><div class="guidance-columns"><p>This page brings the latest reviewed NYT, NYT Mini, LA Times, and USA TODAY coverage into one return destination.</p><p>We publish selected clue explanations and clearly label the original puzzle date instead of reproducing complete grids or answer keys.</p></div></section>${answersTodaySections}`;
const answersTodayItems = answersTodayGroups.flatMap((group) => group.items);
const answersTodayLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crossword answers today — selected clues", description: "Selected current crossword clues with hints, answers, definitions, and explanations across major publications.", url: canonicalUrl(answersTodayRoute), dateModified: answersTodayLatestReview, mainEntity: { "@type": "ItemList", itemListElement: answersTodayItems.map((clue, index) => ({ "@type": "ListItem", position: index + 1, name: clue.clue, url: canonicalUrl(`/explainers/${clue.slug}/`) })) } };
await writePage(answersTodayRoute, pageTemplate({ title: "Crossword answers today: selected hints", description: "Browse selected current crossword clues with spoiler-light hints, answers, definitions, and explanations across major publications.", route: answersTodayRoute, body: answersTodayBody, bodyClass: "answers-today-page publication-hub-page", jsonLd: [answersTodayLd] }), false, answersTodayLatestReview);

for (const clue of clues) {
  const route = `/explainers/${clue.slug}/`;
  const profile = answerByValue.get(clue.answer);
  const related = clues.filter((item) => item.slug !== clue.slug && (item.answer === clue.answer || item.tags.some((tag) => clue.tags.includes(tag)))).slice(0, 4);
  const publicationHub = publicationHubFor(clue.publication);
  const sourceContext = clue.publication
    ? `<section class="source-context"><h2>Where this clue appeared</h2><p>${escapeHtml(clue.clueNumber)} in ${escapeHtml(clue.publication)} puzzle for ${escapeHtml(formatDate(clue.sourceDate))}.</p>${publicationHub ? `<a class="text-link" href="${publicationHub.route}">Browse selected ${escapeHtml(clue.publication)} clues →</a>` : ""}</section>`
    : "";
  const contentKind = clue.publication
    ? `${clue.publication} · ${clue.clueNumber} · ${clue.answer.length} letters`
    : `Reviewed crossword explanation · ${clue.answer.length} letters`;
  const pageHeading = clue.publication
    ? `${escapeHtml(clue.clue)} ${escapeHtml(publicationClueSuffix(clue.publication))}`
    : `${escapeHtml(clue.clue)} crossword clue`;
  const pageTitle = clue.publication
    ? seoTitle(clue.clue, publicationHub?.titleSuffix ?? "Crossword Clue")
    : seoTitle(clue.clue, "Crossword Clue Answer");
  const affiliationNote = clue.publication
    ? `${config.name} is not affiliated with or endorsed by ${clue.publication} or its publisher.`
    : "It is not an official answer key from a crossword publisher.";
  const body = `<article class="shell article-layout clue-article"><div class="article-main">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Explanations", href: "/daily-clue-clinic/" }, { label: clue.clue }])}<header><p class="content-kind">${escapeHtml(contentKind)}</p><h1>${pageHeading}</h1><p class="review-date">Editorially reviewed ${escapeHtml(formatDate(clue.reviewedAt))}</p></header><section class="answer-reveal"><p>Answer</p><div class="answer-cells" aria-label="${clue.answer.split("").join(" ")}">${[...clue.answer].map((letter) => `<span>${letter}</span>`).join("")}</div></section><section><h2>Why ${clue.answer} fits</h2><p>${escapeHtml(clue.explanation)}</p></section><section class="mechanism-grid"><div><h2>Clue signal</h2><p>${escapeHtml(clue.signal)}</p></div><div><h2>${clue.answer} meaning</h2><p>${escapeHtml(clue.definition)}</p></div></section>${sourceContext}${profile ? `<p><a class="text-link" href="/crosswordese/${profile.slug}/">See ${profile.answer} meaning and common clue patterns →</a></p>` : ""}${related.length ? `<section><h2>Related reviewed clues</h2>${clueRows(related)}</section>` : ""}<p class="source-note">This independently written explanation is for learning and clue analysis. ${escapeHtml(affiliationNote)}</p></div><aside class="article-aside hint-aside"><p>Try it without the spoiler</p><span>${escapeHtml(clue.hint)}</span><a class="aside-all" href="/solver/">Open the hint-first solver →</a></aside></article>`;
  const articleLd = { "@context": "https://schema.org", "@type": "Article", headline: `${clue.clue} crossword clue explained`, description: clue.explanation, datePublished: clue.reviewedAt, dateModified: clue.reviewedAt, mainEntityOfPage: canonicalUrl(route), publisher: { "@type": "Organization", name: config.name } };
  await writePage(route, pageTemplate({ title: pageTitle, description: `The answer is ${clue.answer}. Learn why it fits, what the clue signal means, and the definition used here.`, route, body, bodyClass: "article-page", jsonLd: [articleLd] }), false, clue.reviewedAt);
}

const clinicIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic" }])}<h1>Daily Clue Clinic</h1><p>Curated, independently explained clues for learning how clues work. No reproduced grids or complete publisher answer keys.</p></section><section class="shell clinic-archive">${dates.map((date) => { const items = clues.filter((clue) => clue.date === date); return `<a href="/daily-clue-clinic/${date}/"><time datetime="${date}">${escapeHtml(formatDate(date))}</time><span>${items.length} reviewed clues</span><b aria-hidden="true">→</b></a>`; }).join("")}</section>`;
await writePage("/daily-clue-clinic/", pageTemplate({ title: "Daily crossword clue clinic", description: "Browse curated daily crossword clues with progressive hints and independently written explanations.", route: "/daily-clue-clinic/", body: clinicIndexBody }));

for (const date of dates) {
  const items = clues.filter((clue) => clue.date === date).sort((a, b) => b.popularity - a.popularity);
  const route = `/daily-clue-clinic/${date}/`;
  const body = `<section class="shell page-hero clinic-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic", href: "/daily-clue-clinic/" }, { label: formatDate(date) }])}<p class="content-kind">Independent explanations</p><h1>Clue Clinic · ${escapeHtml(formatDate(date))}</h1><p>Use the hint first, then open the reviewed explanation only when you are ready.</p></section><section class="shell clinic-list">${items.map((clue, index) => `<article><div class="clinic-number">${String(index + 1).padStart(2, "0")}</div><div class="clinic-content"><span>${escapeHtml(clueTypeLabel(clue.clueType))} · ${clue.answer.length} letters</span><h2>${escapeHtml(clue.clue)}</h2><details><summary>Show a hint</summary><p>${escapeHtml(clue.hint)}</p></details><a href="/explainers/${clue.slug}/">Reveal and understand the answer →</a></div></article>`).join("")}</section>`;
  await writePage(route, pageTemplate({ title: `Crossword clue clinic for ${formatDate(date)}`, description: `Practice ${items.length} curated crossword clues with progressive hints and independently written explanations.`, route, body, bodyClass: "clinic-page" }), false, date);
}

const aboutBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "About" }])}<h1>Less spoiling. More solving.</h1><p>Clue Tutor is an independent crossword learning tool. It helps solvers use crossing letters, notice clue signals, and understand why an answer fits instead of dropping an unexplained answer at the top of the page.</p><h2>What we are building</h2><p>A fast pattern-aware solver, a clear “explain my answer” workflow, and an editorial library of crosswordese and clue-reading guides.</p><h2>What we are not</h2><p>We are not affiliated with any crossword publisher, and we do not reproduce complete commercial puzzles or present automatically generated text as reviewed guidance.</p></article>`;
await writePage("/about/", pageTemplate({ title: "About", description: "Why Clue Tutor puts progressive hints and clear explanations ahead of instant crossword spoilers.", route: "/about/", body: aboutBody, bodyClass: "prose-page-body" }));

const editorialBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Editorial policy" }])}<h1>Editorial policy</h1><p>Indexed explanations are written or materially reviewed for accuracy, usefulness, and clue grammar. Each clue page shows its latest review date.</p><h2>What earns an indexed page</h2><ul><li>A verified clue-answer relationship.</li><li>A specific explanation of the signal, sense, or wordplay.</li><li>Independent value beyond a bare answer or dictionary definition.</li><li>A path for users to report confusing or incorrect guidance.</li></ul><h2>Automation boundary</h2><p>Private tool queries are not automatically published. Empty results, low-confidence suggestions, and unreviewed generated text stay outside the sitemap.</p><h2>Source boundary</h2><p>Selected published clue text may be quoted for identification, commentary, and teaching. Hints, definitions, and explanations are independently written or materially reviewed. We do not scrape or republish complete daily puzzles, grids, or full answer keys.</p></article>`;
await writePage("/editorial-policy/", pageTemplate({ title: "Editorial policy", description: "How Clue Tutor reviews crossword explanations, separates private tool output from indexed content, and handles sources.", route: "/editorial-policy/", body: editorialBody, bodyClass: "prose-page-body" }));

const privacyBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Privacy" }])}<h1>Privacy</h1><p>Clue matching runs in your browser. The clue, pattern, and answer you type are not sent to our application server or saved in an account.</p><h2>Analytics</h2><p>We use Cloudflare Web Analytics for aggregate visits and real-user performance metrics. We also use Pageview, a self-managed Plausible Community Edition instance, to record pageview events. Its browser script sends the visited page URL, referrer, site domain, and event name to <code>app.pageview.app</code>. The supplied script does not set cookies, and both analytics tools ignore common automated-browser signals. We do not run advertising scripts or session replay.</p><h2>Local behavior</h2><p>The browser downloads the reviewed example data needed for matching. Clearing or closing the page removes form input; the site does not create an account or save history.</p></article>`;
await writePage("/privacy/", pageTemplate({ title: "Privacy", description: "How the Clue Tutor validation build handles crossword clues, patterns, answers, storage, and analytics.", route: "/privacy/", body: privacyBody, bodyClass: "prose-page-body" }));

const notFoundBody = `<section class="shell not-found"><div class="empty-grid" aria-hidden="true"><i>C</i><i>L</i><i>U</i><i>E</i></div><h1>That square is empty.</h1><p>The page does not exist, but the clue solver may still get you moving.</p><a class="button button-primary" href="/solver/">Open the solver</a></section>`;
await writePage("/404.html", pageTemplate({ title: "Page not found", description: "The requested page could not be found.", route: "/404.html", body: notFoundBody, noindex: true }), true);

await mkdir(path.join(dist, "assets"), { recursive: true });
await Promise.all([
  cp(path.join(root, "src/style.css"), path.join(dist, "assets/style.css")),
  cp(path.join(root, "src/app.js"), path.join(dist, "assets/app.js")),
  cp(path.join(root, "src/solver.mjs"), path.join(dist, "assets/solver.mjs")),
  cp(path.join(root, "src/favicon.svg"), path.join(dist, "favicon.svg")),
  writeFile(path.join(dist, "assets/clues.json"), JSON.stringify(clues)),
  writeFile(path.join(dist, "assets/answers.json"), JSON.stringify(answers))
]);

const indexablePages = pages.filter((page) => !page.noindex);
const indexableRoutes = indexablePages.map((page) => page.route);
const sitemapWithLastmod = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexablePages.map((page) => `  <url><loc>${xmlEscape(canonicalUrl(page.route))}</loc>${page.lastmod ? `<lastmod>${page.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(dist, "sitemap.xml"), sitemapWithLastmod);
const feedClues = [...clues].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt) || b.popularity - a.popularity).slice(0, 30);
const feedUpdated = `${feedClues[0]?.reviewedAt ?? config.contentUpdatedAt}T00:00:00Z`;
const feed = `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>${xmlEscape(config.name)} fresh crossword clues</title><id>${xmlEscape(canonicalUrl("/feed.xml"))}</id><link href="${xmlEscape(canonicalUrl("/feed.xml"))}" rel="self"/><link href="${xmlEscape(canonicalUrl("/"))}"/><updated>${feedUpdated}</updated>${feedClues.map((clue) => `<entry><title>${xmlEscape(`${clue.clue} crossword clue`)}</title><id>${xmlEscape(canonicalUrl(`/explainers/${clue.slug}/`))}</id><link href="${xmlEscape(canonicalUrl(`/explainers/${clue.slug}/`))}"/><updated>${clue.reviewedAt}T00:00:00Z</updated><summary>${xmlEscape(clue.explanation)}</summary></entry>`).join("")}</feed>\n`;
await writeFile(path.join(dist, "feed.xml"), feed);
await writeFile(path.join(dist, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${canonicalUrl("/sitemap.xml")}\nSitemap: ${canonicalUrl("/feed.xml")}\n`);
const indexNowKey = process.env.INDEXNOW_KEY ?? config.indexNowKey;
if (indexNowKey) await writeFile(path.join(dist, `${indexNowKey}.txt`), indexNowKey);

console.log(`Built ${pages.length} pages (${indexableRoutes.length} indexable) in dist/.`);

async function writePage(route, html, noindex = false, lastmod = null) {
  const relative = route === "/" ? "index.html" : route.endsWith(".html") ? route.slice(1) : path.join(route.slice(1), "index.html");
  const target = path.join(dist, relative);
  if (pages.length === 0) await rm(dist, { recursive: true, force: true });
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html);
  pages.push({ route, noindex, lastmod });
}
