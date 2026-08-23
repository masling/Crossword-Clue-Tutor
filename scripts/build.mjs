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

function csvCell(value = "") {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function canonicalUrl(route) {
  return new URL(route, config.siteUrl).href;
}

function feedbackUrl({ mode = "general", pagePath = "/", clue = "", answer = "" } = {}) {
  const query = new URLSearchParams({ mode, page: pagePath });
  if (clue) query.set("clue", clue);
  if (answer) query.set("answer", answer);
  return `/feedback/?${query}`;
}

function answerEntityLabel(value, { variant = false } = {}) {
  const profile = answerByValue.get(value);
  const content = `<strong>${escapeHtml(value)}</strong>${variant ? `<small>${value.length} letters</small>` : ""}`;
  if (!profile) return variant ? `<span>${content}</span>` : content;
  return `<a class="${variant ? "variant-answer-link" : "answer-entity-link"}" href="/crosswordese/${profile.slug}/" aria-label="${escapeHtml(value)} meaning and crossword use">${content}</a>`;
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
        <a href="/crosswordese/">Dictionary</a>
        <a href="/clue-types/">Clue types</a>
        <a href="/saved-clues/">Saved</a>
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
        <button type="button" data-analytics-settings>Analytics choices</button>
        <a href="/feedback/">Feedback</a>
        <a href="/crossword-answers-today/">Puzzle answers today</a>
        <a href="/saved-clues/">Saved clues</a>
        <a href="/daily-clue-clinic/">Daily clue clinic</a>
        <a href="/crossword-clues/">Clues and answers</a>
        <a href="/crossword-answers-by-length/">Answers by length</a>
        <a href="/guides/answer-length-and-crossings/">Solving guide</a>
        <a href="/guides/crossword-clues-for-vocabulary-learning/">Teacher guide</a>
        <a href="/classroom-solver/">Classroom solver</a>
        <a href="/educators/crossword-vocabulary-worksheet/">Printable worksheet</a>
        <a href="/research/ambiguous-crossword-clues/">Ambiguity data</a>
        <a href="/feed.xml">Subscribe: fresh clue feed</a>
        ${publicationLinks}
      </nav>
    </div>
  </footer>`;
}

function breadcrumbs(items) {
  const navigation = `<nav class="breadcrumbs" aria-label="Breadcrumb">${items.map((item, index) => {
    const separator = index ? `<span aria-hidden="true">/</span>` : "";
    return `${separator}${item.href ? `<a href="${item.href}">${escapeHtml(item.label)}</a>` : `<span aria-current="page">${escapeHtml(item.label)}</span>`}`;
  }).join("")}</nav>`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: canonicalUrl(item.href) } : {})
    }))
  };
  return `${navigation}<script type="application/ld+json">${JSON.stringify(structuredData).replaceAll("<", "\\u003c")}</script>`;
}

function pageTemplate({ title, description, route, body, bodyClass = "", noindex = false, jsonLd = [], analyticsMode = "standard" }) {
  const brandedTitle = `${title} | ${config.name}`;
  const fullTitle = title === config.name
    ? `${config.name} — ${config.tagline}`
    : brandedTitle.length <= 70 ? brandedTitle : title;
  const pageview = config.analytics?.pageview;
  const pageviewMarkup = pageview
    ? `<link rel="preconnect" href="${escapeHtml(new URL(pageview.scriptSrc).origin)}" crossorigin>\n  <script defer data-domain="${escapeHtml(pageview.domain)}" src="${escapeHtml(pageview.scriptSrc)}"></script>`
    : "";
  const googleAnalytics = config.analytics?.google;
  const googleAnalyticsMarkup = analyticsMode === "standard" && googleAnalytics?.measurementId
    ? `<meta name="google-analytics-measurement-id" content="${escapeHtml(googleAnalytics.measurementId)}">`
    : "";
  const analyticsConsentMarkup = analyticsMode === "standard" && googleAnalytics?.measurementId
    ? `<section class="analytics-consent" data-analytics-consent role="region" aria-labelledby="analytics-consent-title" hidden><div><h2 id="analytics-consent-title">Optional Google Analytics</h2><p>Cookie-free Pageview is always active. In regions that require consent, Google Analytics loads only if you accept. You can change this choice from the footer.</p></div><div class="analytics-consent-actions"><button class="button button-primary" type="button" data-analytics-accept>Accept GA4</button><button class="button button-outline" type="button" data-analytics-decline>Continue without GA4</button><a href="/privacy/">Privacy details</a></div></section>`
    : "";
  const openGraphType = jsonLd.some((item) => item["@type"] === "Article") ? "article" : "website";
  const socialImageUrl = canonicalUrl(config.socialImage);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">
  <meta name="analytics-mode" content="${escapeHtml(analyticsMode)}">
  <link rel="canonical" href="${canonicalUrl(route)}">
  <link rel="alternate" type="application/atom+xml" title="${escapeHtml(config.name)} fresh crossword clues" href="${canonicalUrl("/feed.xml")}">
  <meta property="og:type" content="${openGraphType}">
  <meta property="og:site_name" content="${escapeHtml(config.name)}">
  <meta property="og:locale" content="${escapeHtml(config.locale)}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonicalUrl(route)}">
  <meta property="og:image" content="${socialImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(config.name)} — hints first, answers when you want them">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${socialImageUrl}">
  <meta name="twitter:image:alt" content="${escapeHtml(config.name)} — hints first, answers when you want them">
  <meta name="theme-color" content="oklch(0.48 0.09 210)">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
  <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  ${pageviewMarkup}
  ${googleAnalyticsMarkup}
  <link rel="stylesheet" href="/assets/style.css">
  ${jsonLd.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll("<", "\\u003c")}</script>`).join("\n  ")}
</head>
<body class="${escapeHtml(bodyClass)}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${header()}
  <main id="main">${body}</main>
  ${footer()}
  ${analyticsConsentMarkup}
  <script type="module" src="/assets/app.js"></script>
</body>
</html>`;
}

function toolShell(initialTab = "solve", compact = false, context = "standalone") {
  return `<section class="tool-shell${compact ? " tool-shell-compact" : ""}" data-tool-root data-initial-tab="${initialTab}" data-tool-context="${escapeHtml(context)}">
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
const featuredClueHubs = ["nipping", "congenital", "inflated", "noble", "cajole", "wealth", "pimento", "forefront", "path"].map((slug) => clueHubs.find((hub) => hub.slug === slug)).filter(Boolean);
const featuredAnswers = ["BITING", "INBORN", "SWOLLEN", "GRAND", "COAX", "RICHES", "ALLSPICE", "LEAD", "ROUTE"].map((value) => answerByValue.get(value)).filter(Boolean);
const contactEmail = "hello@crosswordcluetutor.com";

const organizationId = canonicalUrl("/#organization");
const organizationEntity = {
  "@type": "Organization",
  "@id": organizationId,
  name: config.name,
  url: config.siteUrl,
  logo: { "@type": "ImageObject", url: canonicalUrl(config.logoImage), width: 512, height: 512 },
  email: `mailto:${contactEmail}`,
  contactPoint: {
    "@type": "ContactPoint",
    email: contactEmail,
    contactType: "customer support",
    availableLanguage: "English"
  }
};
const organizationLd = {
  "@context": "https://schema.org",
  ...organizationEntity,
  description: config.description,
};
const websiteLd = { "@context": "https://schema.org", "@type": "WebSite", name: config.name, url: config.siteUrl, description: config.description, publisher: { "@id": organizationId } };

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
  <div class="daily-hub-links"><a href="/crossword-answers-today/">Crossword puzzle answers today →</a><a href="/crossword-answers-by-length/">Answers by length →</a>${activePublicationHubs().map((hub) => `<a href="${hub.route}">${escapeHtml(hub.linkLabel)} →</a>`).join("")}</div>
</section>
<section class="shell popular-clue-section">
  <div class="section-heading"><div><h2>Popular clues with more than one answer</h2><p>Start with the entry length, then use the clue's exact sense and your crossings.</p></div><a href="/crossword-clues/">Browse clues and answers</a></div>
  <div class="popular-clue-list">${featuredClueHubs.map((hub) => `<a href="/crossword-clues/${hub.slug}/"><strong>${escapeHtml(hub.clue)} crossword clue</strong><span>${hub.answers.length} reviewed possibilities</span><small>${hub.preferredAnswers.slice(0, 3).map(escapeHtml).join(" · ")}</small><i aria-hidden="true">→</i></a>`).join("")}</div>
</section>
<section class="answer-strip">
  <div class="shell answer-strip-inner"><div><h2>Meanings behind popular answers.</h2><p>Move from the clue to the answer's definition, pronunciation, and recurring clue patterns.</p></div><div class="answer-links">${featuredAnswers.map((answer) => `<a href="/crosswordese/${answer.slug}/">${answer.answer}</a>`).join("")}</div><a class="button button-secondary" href="/crosswordese/">Explore all meanings</a></div>
</section>`;

const homeBodyWithSubscription = homeBody.replace(`<section class="answer-strip">`, `<section class="shell freshness-subscribe"><div><h2>Follow the next clue, not another inbox.</h2><p>Subscribe to the public Atom feed for newly reviewed clues. No account, email address, or marketing list.</p></div><a class="button button-outline" href="/feed.xml">Subscribe to fresh clue feed</a></section><section class="answer-strip">`);
await writePage("/", pageTemplate({ title: config.name, description: config.description, route: "/", body: homeBodyWithSubscription, bodyClass: "home-page", jsonLd: [organizationLd, websiteLd] }), false, config.contentUpdatedAt);

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
  await writePage(item.route, item.html, false, config.contentUpdatedAt);
}

const qaCampaign = "utm_source=operator_qa&utm_medium=internal&utm_campaign=site_qa&utm_content=qa_entry";
const qaTargets = [["/", "Homepage"], ["/solver/", "Solver"], ["/explain/", "Explain"], ["/crossword-answers-today/", "Answers today"], ["/crosswordese/", "Dictionary"], ["/crossword-clues/", "Clues and answers"], ["/feedback/", "Feedback"]];
const qaBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Operator QA" }])}<p class="content-kind">Internal traffic marker</p><h1>Operator QA entry</h1><p>Start production checks here so analytics can separate operator sessions from search visitors.</p></section><section class="shell type-directory">${qaTargets.map(([route, label]) => `<a href="${route}?${qaCampaign}"><span>${label}</span><p>Open the production ${label.toLowerCase()} route with the operator QA campaign tag.</p><b>Test this route <i aria-hidden="true">→</i></b></a>`).join("")}</section><section class="shell guidance"><h2>How the tag is recorded</h2><div class="guidance-columns"><p>Pageview records <code>utm_source=operator_qa</code> in Campaigns. Cloudflare RUM records the entry path <code>/qa/</code>, allowing tagged QA visits to be subtracted separately from the fixed pre-tag baseline.</p><p>This utility is noindex, absent from the sitemap, and not linked from public navigation.</p></div></section>`;
await writePage("/qa/", pageTemplate({ title: "Operator QA entry", description: "Internal noindex entry point for tagged production QA visits.", route: "/qa/", body: qaBody, bodyClass: "qa-page", noindex: true }), true);

const savedCluesBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Saved clues" }])}<h1>Saved crossword clues</h1><p>Keep useful explanations together on this device. Saved clues stay in your browser and are never uploaded to Clue Tutor.</p></section><section class="shell saved-clues-shell" data-saved-clues-root><div class="empty-state" data-saved-empty><div class="empty-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></div><h2>No saved clues yet</h2><p>Open any reviewed clue and choose “Save clue.” It will appear here for quick return visits.</p><a class="button button-primary" href="/crossword-answers-today/">Browse today's clues</a></div><div class="saved-clues-list" data-saved-list hidden><div class="section-heading"><div><h2>Your saved clues</h2><p data-saved-count aria-live="polite"></p></div><a href="/crossword-answers-today/">Find more clues</a></div><div class="clue-list" data-saved-items></div></div></section>`;
await writePage("/saved-clues/", pageTemplate({ title: "Saved crossword clues", description: "Return to crossword clues saved privately in this browser.", route: "/saved-clues/", body: savedCluesBody, bodyClass: "saved-clues-page", noindex: true }), true);

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
const clueHubIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword clues and answers" }])}<h1>Crossword clues and answers by length and meaning</h1><p>Compare reviewed answers for recurring clues, then use entry length, crossings, and clue sense to choose the fill that fits your grid.</p></section><section class="shell directory-layout"><aside><p>Why multiple answers?</p><span>A short clue can point to different synonyms in different grids. These pages organize the useful candidates instead of pretending one answer always fits.</span><a class="text-link" href="/crosswordese/">Look up crossword answer meanings →</a></aside><div class="word-directory">${clueHubs.map((hub) => `<a href="/crossword-clues/${hub.slug}/"><span class="word-name">${escapeHtml(hub.clue)}</span><span>${escapeHtml(hub.summary)}</span><span class="row-arrow" aria-hidden="true">→</span></a>`).join("")}</div></section>`;
const clueHubIndexLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crossword clues and answers by length and meaning", description: "Recurring crossword clues and possible answers organized by letter count and exact meaning.", url: canonicalUrl("/crossword-clues/") };
await writePage("/crossword-clues/", pageTemplate({ title: "Crossword clues and answers by length", description: "Find possible crossword answers by clue, letter count, crossings, and meaning, with reviewed guidance for ambiguous fills.", route: "/crossword-clues/", body: clueHubIndexBody, bodyClass: "clue-dictionary-page", jsonLd: [clueHubIndexLd] }), false, clueHubLatestReview);

for (const hub of clueHubs) {
  const route = `/crossword-clues/${hub.slug}/`;
  const groupedAnswers = new Map();
  for (const answer of hub.answers) {
    const length = answer.answer.length;
    if (!groupedAnswers.has(length)) groupedAnswers.set(length, []);
    groupedAnswers.get(length).push(answer);
  }
  const answerGroups = [...groupedAnswers.entries()].sort(([a], [b]) => a - b).map(([length, items]) => `<section class="answer-length-group"><h3>${length} letters</h3><div>${items.map((answer) => `<article>${answerEntityLabel(answer.answer)}<span>${escapeHtml(answer.sense)}</span></article>`).join("")}</div></section>`).join("");
  const queryVariants = hub.queryVariants?.length ? `<section><h2>Common ${escapeHtml(hub.clue)} clue variants</h2><div class="clue-variant-reference">${hub.queryVariants.map((variant) => `<article><h3>${escapeHtml(variant.query)}</h3><p>${escapeHtml(variant.guidance)}</p><div class="variant-answer-list">${variant.answers.map((answer) => answerEntityLabel(answer, { variant: true })).join("")}</div></article>`).join("")}</div></section>` : "";
  const body = `<article class="shell article-layout clue-dictionary-entry"><div class="article-main">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue dictionary", href: "/crossword-clues/" }, { label: hub.clue }])}<header><p class="content-kind">Recurring crossword clue · multiple possible answers</p><h1>${escapeHtml(hub.clue)} crossword clue</h1><p class="review-date">Editorially reviewed ${escapeHtml(formatDate(hub.reviewedAt))}</p></header><section><h2>Best starting answer</h2><p>${escapeHtml(hub.answerGuidance)}</p></section><section><h2>${escapeHtml(hub.clue)} answers by length</h2><p>The correct fill depends on the number of squares, crossing letters, and the sense intended by the setter.</p><div class="answer-length-groups">${answerGroups}</div></section><section><h2>Meanings to check</h2><ul class="pattern-list">${hub.meaningBuckets.map((meaning) => `<li>${escapeHtml(meaning)}</li>`).join("")}</ul></section>${queryVariants}<section><h2>Related searches</h2><ul class="pattern-list">${hub.relatedQueries.map((query) => `<li>${escapeHtml(query)}</li>`).join("")}</ul></section><p class="source-note">This page groups independently reviewed possibilities for a recurring clue. It is not tied to one publisher or reproduced puzzle.</p></div><aside class="article-aside"><p>Use your crossings</p><span>Match the number of squares first, then compare the letters you already trust.</span><a class="aside-all" href="/solver/">Open the pattern solver →</a><a class="aside-all" href="/guides/answer-length-and-crossings/">Read the ambiguity guide →</a><a class="aside-all" href="${feedbackUrl({ mode: "hub", pagePath: route, clue: hub.clue })}">Report an issue →</a></aside></article>`;
  const itemListLd = { "@context": "https://schema.org", "@type": "ItemList", name: `${hub.clue} crossword clue answers`, itemListElement: hub.answers.map((answer, index) => ({ "@type": "ListItem", position: index + 1, name: answer.answer, description: answer.sense })) };
  await writePage(route, pageTemplate({ title: `${hub.clue} crossword clue: answers by length`, description: hub.summary, route, body, bodyClass: "article-page clue-dictionary-page", jsonLd: [itemListLd] }), false, hub.reviewedAt);
}

const ambiguityResearchRoute = "/research/ambiguous-crossword-clues/";
const ambiguityCandidateCount = clueHubs.reduce((total, hub) => total + hub.answers.length, 0);
const ambiguityUniqueAnswers = new Set(clueHubs.flatMap((hub) => hub.answers.map((answer) => answer.answer))).size;
const ambiguityAnswerLengths = clueHubs.flatMap((hub) => hub.answers.map((answer) => answer.answer.length));
const ambiguityMinLength = Math.min(...ambiguityAnswerLengths);
const ambiguityMaxLength = Math.max(...ambiguityAnswerLengths);
const ambiguityCsv = [
  "clue,answer,length,sense,reviewed_at",
  ...clueHubs.flatMap((hub) => hub.answers.map((answer) => [hub.clue, answer.answer, answer.answer.length, answer.sense, hub.reviewedAt].map(csvCell).join(",")))
].join("\n") + "\n";
const ambiguityResearchRows = clueHubs.map((hub) => {
  const lengths = hub.answers.map((answer) => answer.answer.length);
  return `<tr><th scope="row"><a href="/crossword-clues/${hub.slug}/">${escapeHtml(hub.clue)}</a></th><td>${hub.answers.length}</td><td>${Math.min(...lengths)}–${Math.max(...lengths)}</td><td>${escapeHtml(hub.summary)}</td></tr>`;
}).join("");
const ambiguityResearchBody = `<article class="shell prose-page research-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Ambiguous clue data" }])}<p class="content-kind">Original editorial dataset · updated ${escapeHtml(formatDate(clueHubLatestReview))}</p><h1>Ambiguous crossword clues by answer length and meaning</h1><p>A single crossword clue can support several correct answers. This living dataset records <strong>${clueHubs.length} recurring clues</strong>, <strong>${ambiguityCandidateCount} reviewed clue-answer possibilities</strong>, and <strong>${ambiguityUniqueAnswers} unique answers</strong> from ${ambiguityMinLength} to ${ambiguityMaxLength} letters. It is designed for solvers, educators, and researchers studying why answer length and clue sense matter.</p><p><a class="button button-primary" href="/assets/clue-hubs.json" download>Download JSON</a> <a class="button button-outline" href="/assets/clue-hubs.csv" download>Download CSV</a></p><h2>Current coverage</h2><div class="research-table-wrap"><table><thead><tr><th scope="col">Clue</th><th scope="col">Candidates</th><th scope="col">Length range</th><th scope="col">Why it is ambiguous</th></tr></thead><tbody>${ambiguityResearchRows}</tbody></table></div><h2>Method</h2><ol><li>Choose a short recurring clue that has several materially different senses.</li><li>Collect plausible answers by sense and letter count without copying a publisher grid or answer list.</li><li>Write a concise definition for the exact relationship between the clue and each answer.</li><li>Editorially review spelling, length, sense, and duplicate entries before publication.</li></ol><h2>What the data does not claim</h2><p>This is a curated teaching dataset, not a frequency ranking and not an exhaustive archive of every published crossword. Candidate order does not predict the answer to a specific puzzle. The grid, crossing letters, grammar, and publisher style still determine the intended fill.</p><h2>How to cite or reference it</h2><p>Link to this page as “Crossword Clue Tutor, Ambiguous crossword clues by answer length and meaning” and include the access date. The JSON and CSV downloads contain the same reviewed clue groups used by the live clue dictionary.</p><p><a class="text-link" href="/guides/answer-length-and-crossings/">Read the practical ambiguity-solving guide →</a></p><p class="source-note">All descriptions are independently written for Clue Tutor. The dataset does not reproduce complete grids, daily puzzles, or publisher answer keys.</p></article>`;
const ambiguityResearchLd = { "@context": "https://schema.org", "@type": "Dataset", name: "Ambiguous crossword clues by answer length and meaning", description: `A curated dataset of ${ambiguityCandidateCount} reviewed clue-answer possibilities for ${clueHubs.length} recurring ambiguous crossword clues, organized by meaning and answer length.`, url: canonicalUrl(ambiguityResearchRoute), datePublished: "2026-08-20", dateModified: clueHubLatestReview, creator: { "@type": "Organization", name: config.name, url: config.siteUrl }, isAccessibleForFree: true, measurementTechnique: "Independent editorial review of clue sense, answer spelling, and letter count", variableMeasured: ["clue", "answer", "answer length", "sense"], distribution: [{ "@type": "DataDownload", contentUrl: canonicalUrl("/assets/clue-hubs.json"), encodingFormat: "application/json" }, { "@type": "DataDownload", contentUrl: canonicalUrl("/assets/clue-hubs.csv"), encodingFormat: "text/csv" }] };
await writePage(ambiguityResearchRoute, pageTemplate({ title: "Ambiguous crossword clue dataset by length and meaning", description: `Explore and download ${ambiguityCandidateCount} reviewed answers for recurring ambiguous crossword clues, organized by letter count and meaning.`, route: ambiguityResearchRoute, body: ambiguityResearchBody, bodyClass: "prose-page-body research-page-body", jsonLd: [ambiguityResearchLd] }), false, clueHubLatestReview);

const ambiguityGuideRoute = "/guides/answer-length-and-crossings/";
const ambiguityGuideBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Answer length and crossings" }])}<p class="content-kind">Crossword solving guide</p><h1>How answer length and crossings solve ambiguous crossword clues</h1><p>A short clue can have many legitimate answers. The grid—not a generic synonym list—decides which one fits. This guide shows how to combine entry length, crossing letters, grammar, and clue signals before revealing an answer.</p><h2>1. Treat the answer length as evidence</h2><p>For the recurring clue “Diffuse,” four squares might suggest <strong>SEEP</strong> or <strong>SHED</strong>, six squares might suggest <strong>SPREAD</strong>, <strong>OSMOSE</strong>, or <strong>PROLIX</strong>, and eight squares might suggest <strong>PERMEATE</strong> or <strong>DISPERSE</strong>. The clue has not changed; the grid has narrowed the intended sense.</p><p>“Pitch” shows the same ambiguity across meanings: <strong>TAR</strong> is a three-letter sticky material, <strong>TONE</strong> is a four-letter sound quality, while five letters might be <strong>SLOPE</strong> or <strong>SPIEL</strong>. “Charge” may instead mean a <strong>FEE</strong>, <strong>ONUS</strong>, <strong>RUSH</strong>, <strong>ACCUSE</strong>, or <strong>IONIZE</strong>. “Issue” can be <strong>EMIT</strong>, <strong>TOPIC</strong>, <strong>EDITION</strong>, or <strong>PROGENY</strong>. “Sharp” can mean <strong>KEEN</strong>, <strong>ACUTE</strong>, <strong>ASTUTE</strong>, or <strong>TART</strong>, while “Light” might be <strong>RAY</strong>, <strong>GLOW</strong>, <strong>PALE</strong>, or <strong>IGNITE</strong>.</p><p><a class="text-link" href="/crossword-clues/diffuse/">Compare Diffuse answers by length →</a><br><a class="text-link" href="/crossword-clues/pitch/">Compare Pitch answers by length →</a><br><a class="text-link" href="/crossword-clues/charge/">Compare Charge answers by length →</a><br><a class="text-link" href="/crossword-clues/issue/">Compare Issue answers by length →</a><br><a class="text-link" href="/crossword-clues/sharp/">Compare Sharp answers by length →</a><br><a class="text-link" href="/crossword-clues/light/">Compare Light answers by length →</a></p><h2>2. Add only crossing letters you trust</h2><p>One confirmed crossing can remove most candidates. A six-letter pattern <code>S?R?A?</code> points strongly toward SPREAD, while <code>O?M?S?</code> points toward OSMOSE. Do not lock in a speculative crossing just because it produces a familiar word.</p><h2>3. Match the clue's grammar</h2><p>Plural clues usually need plural fills, past-tense clues need past-tense answers, and abbreviations in the clue often license abbreviations in the grid. A clue using “org.” is evidence that a shortened organization name may be expected.</p><h2>4. Check punctuation and register</h2><p>A question mark can signal a pun or nonliteral reading. Quotation marks can indicate a spoken phrase. Words such as “briefly,” “for short,” “informally,” and “in texts” tell you what register or shortened form the setter wants.</p><h2>5. Confirm the exact sense</h2><p>Before entering the fill, read the clue and candidate together as a definition. If the answer fits only vaguely, keep it provisional. A strong solution satisfies the length, crossings, grammar, and meaning at the same time.</p><h2>A repeatable solving order</h2><ol><li>Count the squares.</li><li>Mark reliable crossing letters.</li><li>Identify tense, number, abbreviation, and punctuation signals.</li><li>Generate candidates for the intended sense.</li><li>Confirm every letter through crossings where possible.</li></ol><p><a class="button button-primary" href="/solver/">Try the pattern-aware clue solver</a></p><p class="source-note">This guide teaches a general solving method and does not reproduce a publisher's grid or answer key.</p></article>`;
const ambiguityGuideLd = { "@context": "https://schema.org", "@type": "Article", headline: "How answer length and crossings solve ambiguous crossword clues", description: "A practical method for using entry length, crossings, grammar, and clue signals to choose the right crossword answer.", datePublished: "2026-08-20", dateModified: "2026-08-20", mainEntityOfPage: canonicalUrl(ambiguityGuideRoute), author: organizationEntity, publisher: organizationEntity };
await writePage(ambiguityGuideRoute, pageTemplate({ title: "Solve ambiguous crossword clues with length and crossings", description: "Learn how answer length, crossing letters, grammar, and clue signals narrow ambiguous crossword answers.", route: ambiguityGuideRoute, body: ambiguityGuideBody, bodyClass: "prose-page-body guide-page", jsonLd: [ambiguityGuideLd] }), false, "2026-08-20");

const vocabularyGuideRoute = "/guides/crossword-clues-for-vocabulary-learning/";
const vocabularyGuideDescription = "A classroom-ready method for using crossword clues to teach vocabulary, context clues, word meaning, grammar, and evidence-based inference.";
const vocabularyGuideBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Vocabulary learning with crossword clues" }])}<p class="content-kind">Teacher guide · grades 6–12</p><h1>How to use crossword clues for vocabulary learning</h1><p>Crossword clues can turn vocabulary practice into evidence-based inference. Students combine a definition, answer length, grammar, wordplay signals, and crossing letters instead of guessing from a memorized synonym list. This 20-minute routine works with teacher-written clues or the reviewed examples on Clue Tutor.</p><h2>Learning objectives</h2><ul><li>Infer word meaning from context and definition clues.</li><li>Use morphology, grammar, and answer length as evidence.</li><li>Explain why one candidate fits better than another.</li><li>Revise an answer when new crossing letters contradict it.</li></ul><h2>What teachers need</h2><p>Choose three to five clues appropriate for the class. Do not distribute a current publisher's complete puzzle or answer key. Students need the clue, number of letters, and a simple crossing pattern such as <code>?A??</code>. The free <a href="/solver/">hint-first solver</a> can model the process without requiring an account.</p><h2>A 20-minute classroom routine</h2><ol><li><strong>Notice the clue signal (3 minutes).</strong> Underline tense, number, punctuation, abbreviations, and qualifiers such as “for short.”</li><li><strong>Generate candidates (5 minutes).</strong> Ask groups for two or three meanings or answers. Require each suggestion to match the number of squares.</li><li><strong>Add trusted crossings (4 minutes).</strong> Reveal one or two letters. Students remove candidates that no longer fit rather than changing the letters to protect a guess.</li><li><strong>Take a hint, not the answer (4 minutes).</strong> Use a semantic hint or clue-type explanation. Students revise their reasoning before any reveal.</li><li><strong>Explain the fit (4 minutes).</strong> Students write one sentence connecting the clue signal, exact meaning, and final spelling.</li></ol><h2>Example: teach meaning through contrast</h2><p>The recurring clue “Light” can point to <strong>RAY</strong>, <strong>GLOW</strong>, <strong>PALE</strong>, or <strong>IGNITE</strong>. Instead of asking for one universal synonym, compare noun, adjective, and verb senses. Then add answer length and crossings to decide which meaning the grid demands.</p><p>For a reading-focused variation, use the reviewed clue “Hints that help decipher the meaning of an unfamiliar word.” Students can infer <strong>CONTEXT CLUES</strong>, describe which surrounding details function as evidence, and create a new sentence that supplies its own context clue.</p><h2>Discussion prompts</h2><ul><li>Which clue word supplied the strongest evidence?</li><li>What candidate was plausible but grammatically wrong?</li><li>Which crossing letter changed your interpretation?</li><li>How would you rewrite the clue to target a different sense?</li></ul><h2>Assessment and differentiation</h2><p>For emerging learners, provide the part of speech and first letter. For advanced learners, remove one support and ask students to defend two candidates before crossings settle the answer. A useful exit ticket is: “The answer is ___ because the clue's ___ signals ___.”</p><h2>Privacy and classroom boundaries</h2><p>No student account is required. Clue matching runs in the browser, and the site does not save a server-side search history. Teachers should still follow school policies for external websites and analytics. Use teacher-created clues, public-domain material, or short selected examples for commentary rather than copying complete commercial puzzles.</p><p><a class="button button-primary" href="/solver/">Open the classroom-ready solver</a> <a class="button button-outline" href="/research/ambiguous-crossword-clues/">Download the reviewed teaching dataset</a></p><p class="source-note">This guide is independently written for classroom vocabulary and word-study use. It is not affiliated with a crossword publisher.</p></article>`;
const vocabularyGuideLd = { "@context": "https://schema.org", "@type": "Article", headline: "How to use crossword clues for vocabulary learning", description: vocabularyGuideDescription, datePublished: "2026-08-22", dateModified: "2026-08-22", mainEntityOfPage: canonicalUrl(vocabularyGuideRoute), author: organizationEntity, publisher: organizationEntity, educationalLevel: "Grades 6–12", learningResourceType: "Lesson plan" };
const vocabularyGuideEnhancedBody = vocabularyGuideBody.replace(`<p><a class="button button-primary" href="/solver/">Open the classroom-ready solver</a> <a class="button button-outline" href="/research/ambiguous-crossword-clues/">Download the reviewed teaching dataset</a></p>`, `<p><a class="button button-primary" href="/classroom-solver/">Open the reduced-analytics classroom solver</a> <a class="button button-outline" href="/educators/crossword-vocabulary-worksheet/">Print the student worksheet</a></p><p><a class="text-link" href="/research/ambiguous-crossword-clues/">Download the reviewed teaching dataset →</a></p>`);
await writePage(vocabularyGuideRoute, pageTemplate({ title: "Crossword clues for vocabulary learning", description: vocabularyGuideDescription, route: vocabularyGuideRoute, body: vocabularyGuideEnhancedBody, bodyClass: "prose-page-body guide-page", jsonLd: [vocabularyGuideLd], analyticsMode: "minimal" }), false, "2026-08-22");

const classroomSolverRoute = "/classroom-solver/";
const classroomSolverBody = `<section class="shell page-hero classroom-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Classroom solver" }])}<p class="content-kind">Teacher-directed vocabulary practice</p><h1>A classroom solver that keeps the reasoning visible.</h1><p>Students enter a teacher-selected clue, answer length, and trusted crossings, then take a hint before revealing any fill. No student account is required. This page keeps cookie-free Pageview measurement but omits Google Analytics.</p></section><div class="shell standalone-tool classroom-tool">${toolShell("solve")}</div><section class="shell classroom-notes"><h2>Use it in one short cycle</h2><ol><li>Name the clue signal and part of speech.</li><li>Enter only crossing letters the group can defend.</li><li>Read one hint and revise the candidate list.</li><li>Reveal only after students explain the final fit.</li></ol><p>Cloudflare may still process aggregate request and security data at the network edge. The clue, pattern, and answer remain browser-side and are not saved as a student search history.</p><p><a href="/educators/crossword-vocabulary-worksheet/">Pair this tool with the printable worksheet →</a></p></section>`;
const classroomSolverLd = { "@context": "https://schema.org", "@type": "LearningResource", name: "Classroom crossword clue solver", description: "A reduced-analytics hint-first crossword clue solver for teacher-directed vocabulary practice.", url: canonicalUrl(classroomSolverRoute), educationalLevel: "Grades 6–12", learningResourceType: "Interactive tool", provider: organizationEntity };
await writePage(classroomSolverRoute, pageTemplate({ title: "Classroom crossword clue solver", description: "Use clue wording, answer length, trusted crossings, and progressive hints for classroom vocabulary practice without GA4 cookies.", route: classroomSolverRoute, body: classroomSolverBody, bodyClass: "classroom-page", jsonLd: [classroomSolverLd], analyticsMode: "minimal" }), false, "2026-08-22");

const worksheetRoute = "/educators/crossword-vocabulary-worksheet/";
const worksheetExamples = [["A word's emotional association", 11, "CONNOTATION", "noun"], ["Make less severe", 4, "EASE", "verb"], ["Able to be trusted", 8, "RELIABLE", "adjective"], ["Evidence surrounding an unfamiliar word", 7, "CONTEXT", "noun"], ["A word with the opposite meaning", 7, "ANTONYM", "noun"]];
const worksheetRows = worksheetExamples.map(([clue, length], index) => `<tr><th scope="row">${index + 1}</th><td>${escapeHtml(clue)}</td><td>${length}</td><td class="worksheet-writing">Candidate: ____________________<br>Evidence: __________________________________________</td></tr>`).join("");
const worksheetKey = worksheetExamples.map(([clue, length, answer, partOfSpeech]) => `<li><strong>${answer}</strong> · ${length} letters · ${escapeHtml(partOfSpeech)}<br><span>${escapeHtml(clue)}</span></li>`).join("");
const worksheetBody = `<article class="shell worksheet-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Teacher guide", href: vocabularyGuideRoute }, { label: "Printable worksheet" }])}<header><p class="content-kind">Original classroom material · grades 6–12</p><h1>Crossword clue evidence worksheet</h1><p>For each clue, propose a fill, label the part of speech, and cite the wording or crossing letters that support it. These examples were written for this worksheet and are not copied from a publisher puzzle.</p><button class="button button-outline no-print" type="button" data-print-page>Print worksheet</button></header><section class="student-sheet"><div class="worksheet-meta"><span>Name: ____________________</span><span>Date: ____________________</span></div><table><thead><tr><th>#</th><th>Clue</th><th>Letters</th><th>Candidate and evidence</th></tr></thead><tbody>${worksheetRows}</tbody></table><h2>Reflection</h2><p>Which clue word supplied the strongest evidence, and which first guess did you revise?</p><div class="reflection-lines" aria-hidden="true"></div></section><section class="teacher-key"><h2>Teacher key</h2><ol>${worksheetKey}</ol><p>Accept a different answer only when students can show that it matches the clue, length, grammar, and any crossings supplied by the teacher.</p></section><p class="source-note">Crossword Clue Tutor grants teachers permission to print this original worksheet for classroom use. Commercial puzzle grids and answer keys are not included.</p></article>`;
const worksheetLd = { "@context": "https://schema.org", "@type": "LearningResource", name: "Crossword clue evidence worksheet", description: "A printable vocabulary worksheet with five original crossword clues, evidence prompts, reflection, and a teacher key.", url: canonicalUrl(worksheetRoute), educationalLevel: "Grades 6–12", learningResourceType: "Worksheet", provider: organizationEntity };
await writePage(worksheetRoute, pageTemplate({ title: "Printable crossword vocabulary worksheet", description: "Print a five-clue vocabulary worksheet that asks students to use grammar, meaning, length, and evidence, with a separate teacher key.", route: worksheetRoute, body: worksheetBody, bodyClass: "worksheet-page-body", jsonLd: [worksheetLd], analyticsMode: "minimal" }), false, "2026-08-22");

const answerIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword dictionary" }])}<h1>Crossword dictionary: answer meanings and clue patterns</h1><p>Look up reviewed crossword answers, from classic crosswordese to names, phrases, and current fill. Each entry explains its meaning, pronunciation, clue signals, and exact reviewed use.</p></section>
<section class="shell directory-layout"><aside><p>Why these entries?</p><span>Every profile connects to an editorially reviewed clue. The dictionary teaches the meaning and mechanism without claiming that every answer is frequent.</span><a class="text-link" href="/crossword-clues/">Compare ambiguous clues and answers →</a></aside><div class="word-directory">${answers.map((answer) => `<a href="/crosswordese/${answer.slug}/"><span class="word-name">${answer.answer}</span><span>${escapeHtml(answer.meaning)}</span><span class="row-arrow" aria-hidden="true">→</span></a>`).join("")}</div></section>`;
const answerIndexLd = { "@context": "https://schema.org", "@type": "DefinedTermSet", name: "Crossword dictionary of answer meanings and clue patterns", description: "Independently written meanings, definitions, pronunciations, and common crossword clue patterns for recurring answers and crosswordese.", url: canonicalUrl("/crosswordese/"), hasDefinedTerm: answers.map((answer) => ({ "@type": "DefinedTerm", name: answer.answer, url: canonicalUrl(`/crosswordese/${answer.slug}/`) })) };
await writePage("/crosswordese/", pageTemplate({ title: "Crossword dictionary: meanings & clue patterns", description: "Use this crossword dictionary to learn answer meanings, pronunciations, common clue patterns, and why recurring crosswordese fits the grid.", route: "/crosswordese/", body: answerIndexBody, jsonLd: [answerIndexLd] }), false, config.contentUpdatedAt);

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
      <section><h2>Why is ${answer.answer} useful to learn?</h2><p>${escapeHtml(answer.whyCommon)}</p></section>
      <section><h2>Common clue patterns</h2><ul class="pattern-list">${answer.cluePatterns.map((pattern) => `<li>${escapeHtml(pattern)}</li>`).join("")}</ul><p class="source-note">These are editorially written pattern summaries, not a reproduced puzzle archive.</p></section>
      <section><h2>Other meanings to watch</h2><p>${escapeHtml(answer.otherMeanings)}</p></section>
      ${relatedClues.length ? `<section><h2>Reviewed explanation</h2>${clueRows(relatedClues)}</section>` : ""}
    </div>
    <aside class="article-aside"><p>Related crosswordese</p>${relatedAnswers.map((item) => `<a href="/crosswordese/${item.slug}/"><strong>${item.answer}</strong><span>${escapeHtml(item.meaning)}</span></a>`).join("")}<a class="aside-all" href="/crosswordese/">View all terms →</a><a class="aside-all" href="${feedbackUrl({ mode: "answer", pagePath: route, answer: answer.answer })}">Report an issue →</a></aside>
  </article>`;
  const definedTermLd = { "@context": "https://schema.org", "@type": "DefinedTerm", name: answer.answer, description: answer.meaning, url: canonicalUrl(route), inDefinedTermSet: canonicalUrl("/crosswordese/") };
  const answerLastmod = relatedClues.map((clue) => clue.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
  await writePage(route, pageTemplate({ title, description: `${answer.answer} means ${answer.meaning} Learn why it appears in crossword puzzles and the clue patterns that point to it.`, route, body, bodyClass: "article-page", jsonLd: [definedTermLd] }), false, answerLastmod);
}

const typesIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue types" }])}<h1>Read the clue before you solve it.</h1><p>Small signals reveal the answer's grammar, format, and intended sense. Learn the patterns setters use most often.</p></section><section class="shell type-directory">${clueTypes.map((type) => `<a href="/clue-types/${type.slug}/"><span>${escapeHtml(type.title)}</span><p>${escapeHtml(type.summary)}</p><b>Learn this clue type <i aria-hidden="true">→</i></b></a>`).join("")}</section>`;
await writePage("/clue-types/", pageTemplate({ title: "Crossword clue types and signals", description: "Learn how abbreviation clues, direct definitions, question marks, blanks, and proper-name clues work.", route: "/clue-types/", body: typesIndexBody }), false, "2026-08-20");

for (const type of clueTypes) {
  const route = `/clue-types/${type.slug}/`;
  const guideClueType = ({ abbreviations: "abbreviation", "direct-definitions": "direct-definition", "question-marks": "wordplay", "fill-in-the-blank": "fill-in-the-blank", "proper-nouns": "proper-noun" })[type.slug];
  const matchingClues = clues.filter((clue) => clue.clueType === guideClueType);
  const isAbbreviationGuide = type.slug === "abbreviations";
  const isQuestionMarkGuide = type.slug === "question-marks";
  const isFillInBlankGuide = type.slug === "fill-in-the-blank";
  const isProperNounGuide = type.slug === "proper-nouns";
  const isDirectDefinitionGuide = type.slug === "direct-definitions";
  const questionMarkClues = clues.filter((clue) => clue.clue.includes("?"));
  const properNounClues = [...matchingClues].sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  const directDefinitionClues = [...matchingClues].sort((a, b) => b.popularity - a.popularity).slice(0, 8);
  const guideExamples = (items) => items.map((clue) => `<a class="clue-row" href="/explainers/${clue.slug}/"><span class="clue-row-main"><strong>${escapeHtml(clue.clue)}</strong><small>${escapeHtml(clue.signal)}</small></span><span class="word-name">${clue.answer}</span><span class="row-arrow" aria-hidden="true">→</span></a>`).join("");
  const pageHeading = isAbbreviationGuide ? "Crossword abbreviations and clue signals" : isQuestionMarkGuide ? "What does a question mark mean in a crossword clue?" : isFillInBlankGuide ? "How to solve fill-in-the-blank crossword clues" : isProperNounGuide ? "How to solve proper noun crossword clues" : isDirectDefinitionGuide ? "How to solve direct definition crossword clues" : type.title;
  const extraReference = isAbbreviationGuide
    ? `<section><h2>Common crossword abbreviation signals</h2><div class="abbreviation-reference"><article><h3>Explicit shortening</h3><p><strong>for short</strong>, <strong>briefly</strong>, and <strong>Abbr.</strong> directly warn that the fill is shortened.</p></article><article><h3>Shortened clue words</h3><p>Terms such as <strong>org.</strong>, <strong>dept.</strong>, or an abbreviated title often require an answer at the same level of shortening.</p></article><article><h3>Maps and directions</h3><p>Compass abbreviations stay symmetrical: the opposite of WSW is ENE, not a spelled-out direction.</p></article><article><h3>Initialisms and acronyms</h3><p>Organizations, leagues, agencies, and technical parts frequently produce fills such as MLS, NASA, and CPU.</p></article><article><h3>Truncated words</h3><p>Some fills are conventional shortenings rather than initials, such as SPEC for specification and NATL for national.</p></article><article><h3>Crossings still decide</h3><p>A short entry is not automatically an abbreviation. Confirm the clue signal and crossing letters before committing.</p></article></div></section><section><h2>Reviewed abbreviation clue examples</h2><p>Each example below explains the exact shortening signal and why the answer format is fair.</p><div class="clue-list">${guideExamples(matchingClues)}</div></section>`
    : isQuestionMarkGuide
      ? `<section><h2>What the question mark changes</h2><div class="abbreviation-reference"><article><h3>It permits wordplay</h3><p>The clue may be a pun or use a less obvious meaning rather than a direct dictionary synonym.</p></article><article><h3>It can make wording literal</h3><p>“Top three sights in Fiji?” asks you to inspect the written word and notice three dots above letters.</p></article><article><h3>It can hide an identity</h3><p>“Private sleeping accommodations?” uses private as a military rank, not as a promise of privacy.</p></article><article><h3>It can stretch a category</h3><p>“Plant food?” treats light as what powers photosynthesis, not as something a plant literally eats.</p></article><article><h3>Grammar still matters</h3><p>The question mark licenses a playful sense, but answer length, tense, number, and crossings must still fit.</p></article><article><h3>Do not force a joke</h3><p>Some question-mark clues remain close to ordinary definitions. Use crossings before inventing elaborate wordplay.</p></article></div></section><section><h2>Reviewed question-mark clue examples</h2><p>These examples show different kinds of misdirection and the exact answer each one supports.</p><div class="clue-list">${guideExamples(questionMarkClues)}</div></section>`
      : isFillInBlankGuide
        ? `<section><h2>What kind of phrase completes the blank?</h2><div class="abbreviation-reference"><article><h3>Fixed expressions</h3><p>Common idioms and traditional sayings usually have one conventional completion, such as “Do unto others.”</p></article><article><h3>Quoted titles</h3><p>Quotation marks plus an artist or author often identify a song, book, film, or show title rather than ordinary prose.</p></article><article><h3>Names and branded phrases</h3><p>A possessive name or organization can narrow the blank to an official title, event, tour, or product.</p></article><article><h3>Informal speech</h3><p>Exclamation marks and conversational wording may require slang spelling such as OUTTA instead of a formal phrase.</p></article><article><h3>Parenthetical context</h3><p>Information in parentheses is part of the clue. It can define the phrase, name the source, or identify the speaker.</p></article><article><h3>Read it aloud</h3><p>Insert each candidate into the complete phrase. The right fill should sound natural and match every crossing.</p></article></div></section><section><h2>Reviewed fill-in-the-blank examples</h2><p>These examples cover idioms, quotations, titles, and informal speech with the exact answer shown.</p><div class="clue-list">${guideExamples(matchingClues)}</div></section>`
        : isProperNounGuide
          ? `<section><h2>Use every identifying detail</h2><div class="abbreviation-reference"><article><h3>Quoted works</h3><p>A song, album, film, or book title often identifies its performer, author, or character more precisely than a broad role does.</p></article><article><h3>First name or surname?</h3><p>If the clue supplies one part of a name, the answer usually supplies the missing part. Let the entry length decide which form fits.</p></article><article><h3>Relationships</h3><p>Possessives and phrases such as “friend of” or “pet of” ask for a specific named character connected to the person given.</p></article><article><h3>Brands and products</h3><p>A distinctive feature or category can point to a product or marketplace name even when the brand is not stated directly.</p></article><article><h3>Eponyms</h3><p>“Eponym” asks for the person whose name became attached to a system, award, place, or idea—not the thing itself.</p></article><article><h3>Crossings verify spelling</h3><p>Proper nouns can contain uncommon letter sequences. Treat uncertain vowels and doubled consonants as provisional until crossings confirm them.</p></article></div></section><section><h2>Reviewed proper noun clue examples</h2><p>These examples show how titles, relationships, roles, and distinctive attributes identify the answer.</p><div class="clue-list">${guideExamples(properNounClues)}</div></section>`
          : isDirectDefinitionGuide
            ? `<section><h2>Why a direct clue can still be ambiguous</h2><div class="abbreviation-reference"><article><h3>Match the grammar</h3><p>A plural clue normally needs a plural fill, a base-form verb needs a base-form verb, and third-person verbs must keep their ending.</p></article><article><h3>Use the answer length</h3><p>Many synonyms are valid in isolation. The number of squares removes candidates before you reach for an obscure word.</p></article><article><h3>Notice regional labels</h3><p>Phrases such as “in British English” or “in France” change the expected vocabulary without turning the clue into wordplay.</p></article><article><h3>Check secondary senses</h3><p>A familiar word may define an unexpected sense: “Pickle” can mean MESS rather than food.</p></article><article><h3>Read every qualifier</h3><p>Words such as “foamy,” “as the check,” or “at a café” narrow a broad definition to the intended answer.</p></article><article><h3>Let crossings choose</h3><p>Do not assume the first synonym that comes to mind is correct. Confirm uncertain letters with intersecting answers.</p></article></div></section><section><h2>Reviewed direct definition examples</h2><p>These examples show how grammar, qualifiers, regional usage, and secondary senses make a concise clue fair.</p><div class="clue-list">${guideExamples(directDefinitionClues)}</div></section>`
            : "";
  const body = `<article class="shell guide-article">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Clue types", href: "/clue-types/" }, { label: type.title }])}<header><p class="content-kind">Clue-reading guide</p><h1>${escapeHtml(pageHeading)}</h1><p>${escapeHtml(type.summary)}</p></header><section class="signal-section"><div><h2>Signals to notice</h2><ul>${type.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul></div><div class="worked-example"><span>Worked example</span><p>${escapeHtml(type.exampleClue)}</p><div class="example-answer"><small>Answer</small><strong>${escapeHtml(type.exampleAnswer)}</strong></div><p>${escapeHtml(type.explanation)}</p></div></section><section><h2>How to use this in a grid</h2><p>${escapeHtml(type.advice)}</p></section>${extraReference}<a class="text-link" href="/solver/">Try the clue solver with hints →</a></article>`;
  const pageTitle = isAbbreviationGuide ? "Crossword abbreviations: clue signals and answer formats" : isQuestionMarkGuide ? "Question mark crossword clues: what the ? means" : isFillInBlankGuide ? "Fill-in-the-blank crossword clues: phrases and titles" : isProperNounGuide ? "Proper noun crossword clues: people, titles and brands" : isDirectDefinitionGuide ? "Direct definition crossword clues: grammar and synonyms" : `${type.title}: how they work`;
  const description = isAbbreviationGuide ? "Learn common crossword abbreviation signals, answer formats, map directions, initialisms, and reviewed examples." : isQuestionMarkGuide ? "Learn why crossword clues use question marks, how they signal wordplay and misdirection, and see reviewed examples." : isFillInBlankGuide ? "Learn how crossword blanks complete idioms, quotations, titles, names, and informal speech using context and crossings." : isProperNounGuide ? "Learn how crossword clues identify people, characters, works, eponyms, products, and brands using precise context and crossings." : isDirectDefinitionGuide ? "Learn how answer length, grammar, qualifiers, regional usage, and crossings solve direct definition crossword clues." : `${type.summary} See common signals, a worked example, and practical solving advice.`;
  const datedClues = isQuestionMarkGuide ? questionMarkClues : isProperNounGuide ? properNounClues : isDirectDefinitionGuide ? directDefinitionClues : matchingClues;
  const lastmod = datedClues.map((clue) => clue.reviewedAt).sort().reverse()[0] ?? config.contentUpdatedAt;
  const articleLd = { "@context": "https://schema.org", "@type": "Article", headline: pageHeading, description, datePublished: config.contentUpdatedAt, dateModified: lastmod, mainEntityOfPage: canonicalUrl(route), author: organizationEntity, publisher: organizationEntity };
  await writePage(route, pageTemplate({ title: pageTitle, description, route, body, bodyClass: "guide-page", jsonLd: [articleLd] }), false, lastmod);
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
const answersTodayBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Crossword puzzle answers today" }])}<p class="content-kind">Updated from publicly verifiable puzzle dates</p><h1>Crossword puzzle answers today — selected clues</h1><p>Browse selected current puzzle answers by publication. Open a clue for a spoiler-light hint, answer, definition, and independently written explanation. Dates are shown per publication because daily release schedules differ.</p></section><section class="shell guidance"><h2>Current help without a full answer dump.</h2><div class="guidance-columns"><p>This page brings the latest reviewed NYT, NYT Mini, LA Times, and USA TODAY coverage into one return destination.</p><p>We publish selected clue explanations and clearly label the original puzzle date instead of reproducing complete grids or answer keys.</p></div></section>${answersTodaySections}`;
const answersTodayItems = answersTodayGroups.flatMap((group) => group.items);
const answersTodayLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Crossword puzzle answers today — selected clues", description: "Selected current crossword puzzle answers with hints, definitions, and explanations across major publications.", url: canonicalUrl(answersTodayRoute), dateModified: answersTodayLatestReview, mainEntity: { "@type": "ItemList", itemListElement: answersTodayItems.map((clue, index) => ({ "@type": "ListItem", position: index + 1, name: clue.clue, url: canonicalUrl(`/explainers/${clue.slug}/`) })) } };
await writePage(answersTodayRoute, pageTemplate({ title: "Crossword puzzle answers today", description: "Browse selected current crossword puzzle answers with spoiler-light hints, definitions, and explanations across major publications.", route: answersTodayRoute, body: answersTodayBody, bodyClass: "answers-today-page publication-hub-page", jsonLd: [answersTodayLd] }), false, answersTodayLatestReview);

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
  const sourceLabel = clue.publication ?? "reviewed crossword";
  const metaSourceLabel = sourceLabel.replace(/^The /, "");
  const sourceDateLabel = clue.sourceDate ? ` from ${formatDate(clue.sourceDate)}` : "";
  const pageDescription = `Find the ${clue.answer.length}-letter answer to this ${metaSourceLabel} clue${sourceDateLabel}. Check the clue signal and a concise explanation of why it fits.`;
  const affiliationNote = clue.publication
    ? `${config.name} is not affiliated with or endorsed by ${clue.publication} or its publisher.`
    : "It is not an official answer key from a crossword publisher.";
  const body = `<article class="shell article-layout clue-article" data-current-clue="${clue.slug}"><div class="article-main">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Explanations", href: "/daily-clue-clinic/" }, { label: clue.clue }])}<header><p class="content-kind">${escapeHtml(contentKind)}</p><h1>${pageHeading}</h1><p class="review-date">Editorially reviewed ${escapeHtml(formatDate(clue.reviewedAt))}</p></header><section class="answer-stage" aria-labelledby="answer-stage-${clue.slug}"><div class="answer-stage-heading"><div><p>Start spoiler-light</p><h2 id="answer-stage-${clue.slug}">Need a nudge first?</h2></div><span class="length-badge">${clue.answer.length} letters</span></div><p class="clue-hint">${escapeHtml(clue.hint)}</p><details class="answer-reveal" data-answer-reveal data-nosnippet><summary><span>Show the answer and explanation</span><small>One click · no signup</small></summary><div class="answer-reveal-content"><p class="answer-label">Answer</p><div class="answer-cells" aria-label="${clue.answer.split("").join(" ")}">${[...clue.answer].map((letter) => `<span>${letter}</span>`).join("")}</div><h3>Why it fits</h3><p>${escapeHtml(clue.explanation)}</p></div></details></section><section class="mechanism-grid"><div><h2>Clue signal</h2><p>${escapeHtml(clue.signal)}</p></div><div><h2>Answer meaning</h2><p>${escapeHtml(clue.definition)}</p></div></section>${sourceContext}${profile ? `<p data-nosnippet><a class="text-link" href="/crosswordese/${profile.slug}/">See ${profile.answer} meaning and common clue patterns →</a></p>` : ""}${related.length ? `<section data-related-clues><h2>Related reviewed clues</h2>${clueRows(related)}</section>` : ""}<section class="continuation-tool"><div class="continuation-heading"><div><h2>Solve the next clue here.</h2><p>Paste another clue, add the letters you trust, and keep solving without returning to search.</p></div><a class="text-link" href="/saved-clues/" data-return-link="saved">Open saved clues →</a></div>${toolShell("solve", true, "explainer")}</section><nav class="return-paths" aria-label="Keep solving"><a href="/crossword-answers-today/" data-return-link="today"><strong>Today’s selected clues</strong><span>Continue with the latest reviewed puzzles</span></a><a href="/saved-clues/" data-return-link="saved"><strong>Your saved clues</strong><span>Pick up where you left off on this device</span></a></nav><p class="source-note">This independently written explanation is for learning and clue analysis. ${escapeHtml(affiliationNote)}</p></div><aside class="article-aside return-aside"><p>Keep this useful</p><div class="save-clue-control"><button class="button button-outline save-clue-button" type="button" data-save-clue data-clue-slug="${clue.slug}" aria-pressed="false">Save clue</button><span class="save-clue-status" data-save-clue-status aria-live="polite"></span></div><a class="aside-all" href="/crossword-answers-today/" data-return-link="today">Browse today’s clues →</a><a class="aside-all" href="/solver/" data-return-link="solver">Open the full solver →</a><section class="recent-clues" data-recent-clues hidden><h2>Recently viewed</h2><div data-recent-clue-items></div></section><a class="aside-all" href="${feedbackUrl({ mode: "clue", pagePath: route, clue: clue.clue, answer: clue.answer })}">Report an issue →</a></aside></article>`;
  const articleLd = { "@context": "https://schema.org", "@type": "Article", headline: `${clue.clue} crossword clue answered`, description: pageDescription, datePublished: clue.reviewedAt, dateModified: clue.reviewedAt, mainEntityOfPage: canonicalUrl(route), author: organizationEntity, publisher: organizationEntity };
  await writePage(route, pageTemplate({ title: pageTitle, description: pageDescription, route, body, bodyClass: "article-page", jsonLd: [articleLd] }), false, clue.reviewedAt);
}

const clinicIndexBody = `<section class="shell page-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic" }])}<h1>Daily Clue Clinic</h1><p>Curated, independently explained clues for learning how clues work. No reproduced grids or complete publisher answer keys.</p></section><section class="shell clinic-archive">${dates.map((date) => { const items = clues.filter((clue) => clue.date === date); return `<a href="/daily-clue-clinic/${date}/"><time datetime="${date}">${escapeHtml(formatDate(date))}</time><span>${items.length} reviewed clues</span><b aria-hidden="true">→</b></a>`; }).join("")}</section>`;
await writePage("/daily-clue-clinic/", pageTemplate({ title: "Daily crossword clue clinic", description: "Browse curated daily crossword clues with progressive hints and independently written explanations.", route: "/daily-clue-clinic/", body: clinicIndexBody }), false, latestDate);

for (const date of dates) {
  const items = clues.filter((clue) => clue.date === date).sort((a, b) => b.popularity - a.popularity);
  const route = `/daily-clue-clinic/${date}/`;
  const body = `<section class="shell page-hero clinic-hero">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Daily clue clinic", href: "/daily-clue-clinic/" }, { label: formatDate(date) }])}<p class="content-kind">Independent explanations</p><h1>Clue Clinic · ${escapeHtml(formatDate(date))}</h1><p>Use the hint first, then open the reviewed explanation only when you are ready.</p></section><section class="shell clinic-list">${items.map((clue, index) => `<article><div class="clinic-number">${String(index + 1).padStart(2, "0")}</div><div class="clinic-content"><span>${escapeHtml(clueTypeLabel(clue.clueType))} · ${clue.answer.length} letters</span><h2>${escapeHtml(clue.clue)}</h2><details><summary>Show a hint</summary><p>${escapeHtml(clue.hint)}</p></details><a href="/explainers/${clue.slug}/">Reveal and understand the answer →</a></div></article>`).join("")}</section>`;
  await writePage(route, pageTemplate({ title: `Crossword clue clinic for ${formatDate(date)}`, description: `Practice ${items.length} curated crossword clues with progressive hints and independently written explanations.`, route, body, bodyClass: "clinic-page" }), false, date);
}

const feedbackBody = `<section class="shell feedback-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Feedback" }])}<header><h1>Report a clue or tool issue</h1><p>Tell us what is wrong or unclear. Page context is attached automatically when you arrive from a result or explanation.</p></header><div class="feedback-layout"><form class="feedback-form" data-feedback-form novalidate><div class="feedback-context" data-feedback-context hidden></div><input type="hidden" name="pagePath" value="/feedback/"><input type="hidden" name="mode" value="general"><div class="field"><label for="feedback-type">What needs attention?</label><select id="feedback-type" name="issueType" required><option value="">Choose a feedback type</option><option value="wrong-answer">Wrong answer</option><option value="missing-answer">Missing possible answer</option><option value="unclear-explanation">Unclear explanation</option><option value="incorrect-definition">Incorrect definition</option><option value="technical-problem">Technical problem</option><option value="other">Other</option></select></div><div class="feedback-pair"><div class="field"><label for="feedback-clue">Clue <span>(optional)</span></label><input id="feedback-clue" name="clue" type="text" maxlength="300" autocomplete="off"></div><div class="field"><label for="feedback-answer">Answer <span>(optional)</span></label><input id="feedback-answer" name="answer" type="text" maxlength="50" autocomplete="off"></div></div><div class="field"><label for="feedback-message">What should we know?</label><textarea id="feedback-message" name="message" minlength="10" maxlength="2000" rows="7" required placeholder="Describe the incorrect result, missing meaning, or technical problem."></textarea><small>10–2,000 characters. Do not paste a complete puzzle or answer grid.</small></div><div class="field"><label for="feedback-email">Email for follow-up <span>(optional)</span></label><input id="feedback-email" name="email" type="email" maxlength="254" autocomplete="email" inputmode="email"><small>If supplied, it is used only to discuss this report. It is not added to a mailing list.</small></div><div class="feedback-honeypot" aria-hidden="true"><label for="feedback-website">Website</label><input id="feedback-website" name="website" type="text" tabindex="-1" autocomplete="off"></div><button class="button button-primary" type="submit" data-feedback-submit>Send feedback</button><p class="feedback-status" data-feedback-status role="status" aria-live="polite" hidden></p></form><aside class="feedback-note"><h2>What happens next</h2><p>Reports are reviewed before any content changes. A supplied email lets us ask a specific follow-up question; anonymous reports are still welcome.</p><ul><li>No account is required.</li><li>No raw IP address or browser user agent is stored.</li><li>Feedback is not published automatically.</li></ul><p>For a longer conversation, email <a href="mailto:${contactEmail}">${contactEmail}</a>.</p><a href="/editorial-policy/">Read the editorial policy →</a></aside></div></section>`;
const feedbackLd = { "@context": "https://schema.org", "@type": "ContactPage", name: "Crossword Clue Tutor feedback", url: canonicalUrl("/feedback/"), mainEntity: { "@id": organizationId } };
await writePage("/feedback/", pageTemplate({ title: "Feedback", description: "Report an incorrect crossword answer, missing possibility, unclear explanation, or technical issue to Clue Tutor.", route: "/feedback/", body: feedbackBody, bodyClass: "feedback-page-body", noindex: true, jsonLd: [feedbackLd] }), true);

const aboutBody = `<article class="shell prose-page about-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "About" }])}<header><h1>Crossword help that teaches the clue, not just the answer.</h1><p>Crossword Clue Tutor is an independent, hint-first solving tool for the moment when the crossings stop helping. It narrows possibilities with the letters you know, gives you control over how much to reveal, and explains the mechanism after the fill makes sense.</p></header><h2>Why this exists</h2><p>Most crossword answer sites optimize for the fastest possible spoiler. That can finish a square, but it does not help with the next abbreviation, question-mark clue, proper name, or ambiguous one-word definition. Clue Tutor is built around a different outcome: get unstuck now and become a more confident solver over time.</p><h2>How it helps you solve</h2><ol><li><strong>Start with the clue as written.</strong> Punctuation, tense, abbreviations, and small qualifiers often carry the mechanism.</li><li><strong>Add only letters you trust.</strong> Answer length and confirmed crossings remove more noise than a long synonym list.</li><li><strong>Take a hint before the answer.</strong> Reveal semantic or clue-type guidance without ending the solve early.</li><li><strong>Check why the fill works.</strong> Read the exact definition, signal, fact, or wordplay instead of memorizing an unexplained answer.</li></ol><p><a class="button button-primary" href="/solver/">Try the hint-first solver</a> <a class="button button-outline" href="/explain/">Explain an answer</a></p><h2>What we publish</h2><p>The current library contains <strong>${clues.length} reviewed clue explanations</strong>, <strong>${answers.length} answer-meaning pages</strong>, and <strong>${clueHubs.length} recurring clue families</strong> with ${ambiguityCandidateCount} possible fills organized by length and sense. It also includes clue-reading guides, selected current-puzzle explanations, and downloadable editorial research.</p><p>Daily coverage is intentionally selective. We publish a small set of clues that benefit from a hint or explanation; we do not mirror a publisher's grid or release a complete answer list.</p><h2>How the content is reviewed</h2><p>An indexed explanation needs a verifiable clue-answer relationship, an original or materially reviewed hint and definition, a specific account of why the answer fits, and a visible review date. Low-confidence suggestions and private tool searches are not turned into public pages automatically.</p><p><a href="/editorial-policy/">Read the editorial policy →</a></p><h2>Independent by design</h2><p>Crossword Clue Tutor is not affiliated with, sponsored by, or endorsed by The New York Times, the Los Angeles Times, USA TODAY, or another crossword publisher. Publication names and selected clue text identify the puzzle being discussed; the hints, definitions, explanations, tools, and data model are independently produced.</p><h2>Open software, protected editorial work</h2><p>The software source is available on <a href="https://github.com/masling/Crossword-Clue-Tutor">GitHub</a> under the MIT License. Original explanations, reviewed datasets, research, branding, and site copy are separately rights-reserved. Permitted excerpts require clear credit and a standard follow link to the source.</p><p>The public repository contains no live feedback records, mailbox data, credentials, or database exports. Solver input is processed in the browser; see the <a href="/privacy/">privacy page</a> for the full data boundary.</p><h2>Where the project is going</h2><p>The roadmap is practical: cover useful current clues sooner, deepen answer meanings and ambiguous clue families when real search demand appears, improve the Solver with reviewed data, and use corrections to make the library more trustworthy. Growth should come from a better reference and solving experience, not from empty landing pages.</p><section id="contact"><h2>Contact</h2><p>Use the <a href="/feedback/">feedback form</a> for a wrong answer, missing possibility, unclear explanation, or tool problem. For editorial questions, directory listings, reuse permission, or a conversation that needs a reply, email <a href="mailto:${contactEmail}">${contactEmail}</a>.</p><p>Clue Tutor does not operate a marketing mailing list. Messages are used only to handle the request or conversation you start.</p></section></article>`;
const aboutDescription = "How Crossword Clue Tutor uses hints, crossing patterns, reviewed explanations, and clear editorial boundaries to help people become better crossword solvers.";
const aboutLd = { "@context": "https://schema.org", "@type": "AboutPage", name: "About Crossword Clue Tutor", description: aboutDescription, url: canonicalUrl("/about/"), dateModified: config.contentUpdatedAt, mainEntity: { "@id": organizationId } };
await writePage("/about/", pageTemplate({ title: "About Crossword Clue Tutor", description: aboutDescription, route: "/about/", body: aboutBody, bodyClass: "prose-page-body", jsonLd: [aboutLd] }), false, config.contentUpdatedAt);

const editorialBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Editorial policy" }])}<h1>Editorial policy</h1><p>Indexed explanations are written or materially reviewed for accuracy, usefulness, and clue grammar. Each clue page shows its latest review date.</p><h2>What earns an indexed page</h2><ul><li>A verified clue-answer relationship.</li><li>A specific explanation of the signal, sense, or wordplay.</li><li>Independent value beyond a bare answer or dictionary definition.</li><li>A path for users to report confusing or incorrect guidance.</li></ul><h2>Automation boundary</h2><p>Private tool queries are not automatically published. Empty results, low-confidence suggestions, and unreviewed generated text stay outside the sitemap.</p><h2>Source boundary</h2><p>Selected published clue text may be quoted for identification, commentary, and teaching. Hints, definitions, and explanations are independently written or materially reviewed. We do not scrape or republish complete daily puzzles, grids, or full answer keys.</p></article>`;
await writePage("/editorial-policy/", pageTemplate({ title: "Editorial policy", description: "How Clue Tutor reviews crossword explanations, separates private tool output from indexed content, and handles sources.", route: "/editorial-policy/", body: editorialBody, bodyClass: "prose-page-body" }), false, "2026-08-20");

const privacyBody = `<article class="shell prose-page">${breadcrumbs([{ label: "Home", href: "/" }, { label: "Privacy" }])}<h1>Privacy</h1><p>Clue matching runs in your browser. The clue, pattern, and answer you type are not sent to our application server or saved in an account.</p><h2>Analytics</h2><p>We use Cloudflare Web Analytics for aggregate visits and real-user performance metrics. We also use Pageview, a self-managed Plausible Community Edition instance, to record pageview events. Its browser script sends the visited page URL, referrer, site domain, and event name to <code>app.pageview.app</code> and does not set cookies.</p><p>Google Analytics 4 measures visits and site usage through measurement ID <code>G-HVMXR2YN3N</code>. Google may receive the visited page, referrer, device and browser information, approximate location derived from the network connection, and event timing; Google Analytics may set first-party measurement cookies. We use these analytics services for aggregate product and acquisition analysis, not advertising or session replay.</p><h2>Feedback and email</h2><p>When you submit feedback, we store the selected issue type, current page path, any clue or answer you include, and your message. Email is optional. If supplied, it is used only to discuss that report and is not added to a mailing list. We do not store a raw IP address or browser user agent with the report, and feedback is not published automatically.</p><p>If you email <a href="mailto:${contactEmail}">${contactEmail}</a> directly, your message and address are processed by our email providers and retained only as needed to answer or document the conversation you started. Direct email is not added to a marketing list.</p><h2>Saved clues and recently viewed clues</h2><p>When you save a clue or open a reviewed clue page, its public page identifier can be stored only in this browser using local storage. It is not uploaded to Clue Tutor or attached to an account. Remove saved clues from the Saved Clues page or clear this site's browser data to delete this local history.</p><h2>Local behavior</h2><p>The browser downloads the reviewed example data needed for matching. Closing a page removes unsaved form input; the site does not create an account or retain a server-side search history.</p></article>`;
const privacyBodyWithClassroom = privacyBody.replace("<h2>Feedback and email</h2>", "<h2>Google Analytics consent</h2><p>On standard pages, visitors in the EEA, United Kingdom, and Switzerland are asked before Google Analytics loads. Visitors elsewhere, including when the country cannot be determined, receive Google Analytics automatically and can open Analytics choices in the footer to opt out. The choice is stored only in this browser. Cookie-free Pageview remains active.</p><h2>Reduced-analytics classroom pages</h2><p>The Teacher guide, Classroom Solver, and printable worksheet keep the cookie-free Pageview script for basic page counts but omit Google Analytics 4. Cloudflare may still process aggregate request, performance, and security data at the network edge. No student account is created, and classroom clue searches are not stored as a server-side search history.</p><h2>Future AdSense requirement</h2><p>This GA4 choice is not an AdSense consent platform. Before serving AdSense ads in the EEA, United Kingdom, or Switzerland, the site must enable a Google-certified TCF consent management platform.</p><h2>Feedback and email</h2>");
await writePage("/privacy/", pageTemplate({ title: "Privacy", description: "How the Clue Tutor validation build handles crossword clues, patterns, answers, storage, and analytics.", route: "/privacy/", body: privacyBodyWithClassroom, bodyClass: "prose-page-body" }), false, "2026-08-22");

const notFoundBody = `<section class="shell not-found"><div class="empty-grid" aria-hidden="true"><i>C</i><i>L</i><i>U</i><i>E</i></div><h1>That square is empty.</h1><p>The page does not exist, but the clue solver may still get you moving.</p><a class="button button-primary" href="/solver/">Open the solver</a></section>`;
await writePage("/404.html", pageTemplate({ title: "Page not found", description: "The requested page could not be found.", route: "/404.html", body: notFoundBody, noindex: true }), true);

const oneLookDictionaryIndex = `${answers.map((answer) => `<a href="${canonicalUrl(`/crosswordese/${answer.slug}/`)}">${escapeHtml(answer.answer)}</a>`).join("\n")}\n`;
await mkdir(path.join(dist, "assets"), { recursive: true });
await Promise.all([
  cp(path.join(root, "src/style.css"), path.join(dist, "assets/style.css")),
  cp(path.join(root, "src/app.js"), path.join(dist, "assets/app.js")),
  cp(path.join(root, "src/solver.mjs"), path.join(dist, "assets/solver.mjs")),
  cp(path.join(root, "src/social-card.png"), path.join(dist, "assets/social-card.png")),
  cp(path.join(root, "src/logo-512.png"), path.join(dist, "assets/logo-512.png")),
  cp(path.join(root, "src/favicon.svg"), path.join(dist, "favicon.svg")),
  cp(path.join(root, "src/favicon-32x32.png"), path.join(dist, "favicon-32x32.png")),
  cp(path.join(root, "src/favicon-16x16.png"), path.join(dist, "favicon-16x16.png")),
  cp(path.join(root, "src/apple-touch-icon.png"), path.join(dist, "apple-touch-icon.png")),
  writeFile(path.join(dist, "assets/clues.json"), JSON.stringify(clues)),
  writeFile(path.join(dist, "assets/answers.json"), JSON.stringify(answers)),
  writeFile(path.join(dist, "assets/onelook-dictionary.txt"), oneLookDictionaryIndex),
  writeFile(path.join(dist, "assets/clue-hubs.json"), JSON.stringify(clueHubs, null, 2)),
  writeFile(path.join(dist, "assets/clue-hubs.csv"), ambiguityCsv)
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
