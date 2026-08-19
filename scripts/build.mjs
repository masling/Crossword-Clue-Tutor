import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateContent } from "./validate-content.mjs";

const root = process.cwd();
const dist = path.join(root, "dist");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [config, clues, answers, clueTypes] = await Promise.all([
  readJson("site.config.json"),
  readJson("data/clues.json"),
  readJson("data/answers.json"),
  readJson("data/clue-types.json")
]);

const validation = validateContent({ clues, answers, clueTypes, config });
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
  return `<footer class="site-footer">
    <div class="shell footer-grid">
      <div><a class="brand footer-brand" href="/">${logo()}<span>${escapeHtml(config.name)}</span></a><p>${escapeHtml(config.tagline)}</p></div>
      <nav aria-label="Footer navigation">
        <a href="/about/">About</a>
        <a href="/editorial-policy/">Editorial policy</a>
        <a href="/privacy/">Privacy</a>
        <a href="/daily-clue-clinic/">Daily clue clinic</a>
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
  const fullTitle = title === config.name ? `${config.name} — ${config.tagline}` : `${title} | ${config.name}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">
  <link rel="canonical" href="${canonicalUrl(route)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(route)}">
  <meta name="theme-color" content="oklch(0.48 0.09 210)">
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

for (const clue of clues) {
  const route = `/explainers/${clue.slug}/`;
  const profile = answerByValue.get(clue.answer);
  const related = clues.filter((item) => item.slug !== clue.slug && (item.answer === clue.answer || item.tags.some((tag) => clue.tags.includes(tag)))).slice(0, 4);
  const sourceContext = clue.publication
    ? `<section class="source-context"><h2>Where this clue appeared</h2><p>${escapeHtml(clue.clueNumber)} in ${escapeHtml(clue.publication)} puzzle for ${escapeHtml(formatDate(clue.sourceDate))}.</p></section>`
    : "";
  const contentKind = clue.publication
    ? `${clue.publication} · ${clue.clueNumber} · ${clue.answer.length} letters`
    : `Reviewed crossword explanation · ${clue.answer.length} letters`;
  const pageHeading = clue.publication
    ? `${escapeHtml(clue.clue)} ${escapeHtml(publicationClueSuffix(clue.publication))}`
    : `${escapeHtml(clue.clue)} crossword clue`;
  const pageTitle = clue.publication
    ? `${clue.clue} ${publicationClueSuffix(clue.publication)}`
    : `${clue.clue} crossword clue explained`;
  const affiliationNote = clue.publication
    ? `${config.name} is not affiliated with or endorsed by ${clue.publication} or its publisher.`
    : "It is not an official answer key from a crossword publisher.";
  const body = `<article class="shell article-layout clue-article"><div class="article-main">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Explanations", href: "/daily-clue-clinic/" }, { label: clue.clue }])}<header><p class="content-kind">${escapeHtml(contentKind)}</p><h1>${pageHeading}</h1><p class="review-date">Editorially reviewed ${escapeHtml(formatDate(clue.reviewedAt))}</p></header><section class="answer-reveal"><p>Answer</p><div class="answer-cells" aria-label="${clue.answer.split("").join(" ")}">${[...clue.answer].map((letter) => `<span>${letter}</span>`).join("")}</div></section><section><h2>Why ${clue.answer} fits</h2><p>${escapeHtml(clue.explanation)}</p></section><section class="mechanism-grid"><div><h2>Clue signal</h2><p>${escapeHtml(clue.signal)}</p></div><div><h2>${clue.answer} meaning</h2><p>${escapeHtml(clue.definition)}</p></div></section>${sourceContext}${profile ? `<p><a class="text-link" href="/crosswordese/${profile.slug}/">See ${profile.answer} meaning and common clue patterns →</a></p>` : ""}${related.length ? `<section><h2>Related reviewed clues</h2>${clueRows(related)}</section>` : ""}<p class="source-note">This independently written explanation is for learning and clue analysis. ${escapeHtml(affiliationNote)}</p></div><aside class="article-aside hint-aside"><p>Try it without the spoiler</p><span>${escapeHtml(clue.hint)}</span><a class="aside-all" href="/solver/">Open the hint-first solver →</a></aside></article>`;
  const articleLd = { "@context": "https://schema.org", "@type": "Article", headline: `${clue.clue} crossword clue explained`, description: clue.explanation, datePublished: clue.reviewedAt, dateModified: clue.reviewedAt, mainEntityOfPage: canonicalUrl(route), publisher: { "@type": "Organization", name: config.name } };
  await writePage(route, pageTemplate({ title: pageTitle, description: `The answer is ${clue.answer}. Learn why it fits, what the clue signal means, and the definition used here.`, route, body, bodyClass: "article-page", jsonLd: [articleLd] }), false, clue.reviewedAt);
}

const clinicIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic" }])}<h1>Daily Clue Clinic</h1><p>A small set of independently written, reviewed examples for learning how clues work. No reproduced grids or full publisher answer keys.</p></section><section class="shell clinic-archive">${dates.map((date) => { const items = clues.filter((clue) => clue.date === date); return `<a href="/daily-clue-clinic/${date}/"><time datetime="${date}">${escapeHtml(formatDate(date))}</time><span>${items.length} reviewed clues</span><b aria-hidden="true">→</b></a>`; }).join("")}</section>`;
await writePage("/daily-clue-clinic/", pageTemplate({ title: "Daily crossword clue clinic", description: "Browse daily sets of independently written crossword clues with progressive hints and reviewed explanations.", route: "/daily-clue-clinic/", body: clinicIndexBody }));

for (const date of dates) {
  const items = clues.filter((clue) => clue.date === date).sort((a, b) => b.popularity - a.popularity);
  const route = `/daily-clue-clinic/${date}/`;
  const body = `<section class="shell page-hero clinic-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic", href: "/daily-clue-clinic/" }, { label: formatDate(date) }])}<p class="content-kind">Independent teaching set</p><h1>Clue Clinic · ${escapeHtml(formatDate(date))}</h1><p>Use the hint first, then open the reviewed explanation only when you are ready.</p></section><section class="shell clinic-list">${items.map((clue, index) => `<article><div class="clinic-number">${String(index + 1).padStart(2, "0")}</div><div class="clinic-content"><span>${escapeHtml(clueTypeLabel(clue.clueType))} · ${clue.answer.length} letters</span><h2>${escapeHtml(clue.clue)}</h2><details><summary>Show a hint</summary><p>${escapeHtml(clue.hint)}</p></details><a href="/explainers/${clue.slug}/">Reveal and understand the answer →</a></div></article>`).join("")}</section>`;
  await writePage(route, pageTemplate({ title: `Crossword clue clinic for ${formatDate(date)}`, description: `Practice ${items.length} independently written crossword clues with progressive hints and reviewed explanations.`, route, body, bodyClass: "clinic-page" }), false, date);
}

const aboutBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "About" }])}<h1>Less spoiling. More solving.</h1><p>Clue Tutor is an independent crossword learning tool. It helps solvers use crossing letters, notice clue signals, and understand why an answer fits instead of dropping an unexplained answer at the top of the page.</p><h2>What we are building</h2><p>A fast pattern-aware solver, a clear “explain my answer” workflow, and an editorial library of crosswordese and clue-reading guides.</p><h2>What we are not</h2><p>We are not affiliated with any crossword publisher, and we do not reproduce complete commercial puzzles or present automatically generated text as reviewed guidance.</p></article>`;
await writePage("/about/", pageTemplate({ title: "About", description: "Why Clue Tutor puts progressive hints and clear explanations ahead of instant crossword spoilers.", route: "/about/", body: aboutBody, bodyClass: "prose-page-body" }));

const editorialBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Editorial policy" }])}<h1>Editorial policy</h1><p>Indexed explanations are written or materially reviewed for accuracy, usefulness, and clue grammar. Each clue page shows its latest review date.</p><h2>What earns an indexed page</h2><ul><li>A verified clue-answer relationship.</li><li>A specific explanation of the signal, sense, or wordplay.</li><li>Independent value beyond a bare answer or dictionary definition.</li><li>A path for users to report confusing or incorrect guidance.</li></ul><h2>Automation boundary</h2><p>Private tool queries are not automatically published. Empty results, low-confidence suggestions, and unreviewed generated text stay outside the sitemap.</p><h2>Source boundary</h2><p>We use independently written examples and rights-cleared lexical resources. We do not scrape or republish complete daily puzzles from commercial publishers.</p></article>`;
await writePage("/editorial-policy/", pageTemplate({ title: "Editorial policy", description: "How Clue Tutor reviews crossword explanations, separates private tool output from indexed content, and handles sources.", route: "/editorial-policy/", body: editorialBody, bodyClass: "prose-page-body" }));

const privacyBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Privacy" }])}<h1>Privacy</h1><p>This validation build performs clue matching in your browser. The clue, pattern, and answer you type are not sent to a server or stored by this site.</p><h2>Analytics</h2><p>No analytics or advertising scripts are included in this build. If that changes, this policy will be updated before collection begins.</p><h2>Local behavior</h2><p>The browser downloads the reviewed example data needed for matching. Clearing or closing the page removes form input; the site does not create an account or save history.</p></article>`;
await writePage("/privacy/", pageTemplate({ title: "Privacy", description: "How the Clue Tutor validation build handles crossword clues, patterns, answers, storage, and analytics.", route: "/privacy/", body: privacyBody, bodyClass: "prose-page-body" }));

const notFoundBody = `<section class="shell not-found"><div class="empty-grid" aria-hidden="true"><i>C</i><i>L</i><i>U</i><i>E</i></div><h1>That square is empty.</h1><p>The page does not exist, but the clue solver may still get you moving.</p><a class="button button-primary" href="/solver/">Open the solver</a></section>`;
await writePage("/404.html", pageTemplate({ title: "Page not found", description: "The requested page could not be found.", route: "/404.html", body: notFoundBody, noindex: true }), true);

await mkdir(path.join(dist, "assets"), { recursive: true });
await Promise.all([
  cp(path.join(root, "src/style.css"), path.join(dist, "assets/style.css")),
  cp(path.join(root, "src/app.js"), path.join(dist, "assets/app.js")),
  cp(path.join(root, "src/solver.mjs"), path.join(dist, "assets/solver.mjs")),
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
