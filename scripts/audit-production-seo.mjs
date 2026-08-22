import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pageviewScript = '<script defer data-domain="crosswordcluetutor.com" src="https://app.pageview.app/js/script.js"></script>';
const googleAnalyticsLoader = 'https://www.googletagmanager.com/gtag/js?id=G-HVMXR2YN3N';
const googleAnalyticsConfig = "gtag('config', 'G-HVMXR2YN3N')";

function decodeEntities(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function auditHtml({ html, url }) {
  const errors = [];
  const title = decodeEntities(html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "");
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1] ?? "";
  const h1Count = (html.match(/<h1(?:\s|>)/g) ?? []).length;
  const descriptions = html.match(/<meta name="description" content="[^"]+">/g) ?? [];
  const description = decodeEntities(html.match(/<meta name="description" content="([^"]+)">/)?.[1] ?? "");
  const pageviewCount = html.split(pageviewScript).length - 1;
  const googleAnalyticsLoaderCount = html.split(googleAnalyticsLoader).length - 1;
  const googleAnalyticsConfigCount = html.split(googleAnalyticsConfig).length - 1;
  const analyticsMode = html.match(/<meta name="analytics-mode" content="([^"]+)">/)?.[1] ?? "";
  const expectedGa4Count = analyticsMode === "minimal" ? 0 : 1;
  const robots = html.match(/<meta name="robots" content="([^"]+)">/)?.[1] ?? "";
  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

  if (!title) errors.push("missing title");
  else if (title.length > 70) errors.push(`title exceeds 70 characters (${title.length})`);
  if (h1Count !== 1) errors.push(`expected one h1, found ${h1Count}`);
  if (canonical !== url) errors.push(`canonical mismatch: ${canonical || "missing"}`);
  if (descriptions.length !== 1) errors.push(`expected one meta description, found ${descriptions.length}`);
  if (!robots.includes("index,follow")) errors.push(`unexpected robots directive: ${robots || "missing"}`);
  if (!analyticsMode) errors.push("missing analytics mode");
  if (pageviewCount !== 1) errors.push(`expected one Pageview script, found ${pageviewCount}`);
  if (googleAnalyticsLoaderCount !== expectedGa4Count) errors.push(`expected ${expectedGa4Count} GA4 loaders, found ${googleAnalyticsLoaderCount}`);
  if (googleAnalyticsConfigCount !== expectedGa4Count) errors.push(`expected ${expectedGa4Count} GA4 configs, found ${googleAnalyticsConfigCount}`);
  if (jsonLdBlocks.length === 0) errors.push("missing JSON-LD");
  for (const block of jsonLdBlocks) {
    try { JSON.parse(block[1]); } catch { errors.push("invalid JSON-LD"); }
  }

  return { url, title, titleLength: title.length, description, h1Count, canonical, hrefs, jsonLdBlocks: jsonLdBlocks.length, errors };
}

function duplicateGroups(items, field) {
  const grouped = new Map();
  for (const item of items) {
    const value = item[field];
    if (!value) continue;
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item.url);
  }
  return [...grouped.entries()].filter(([, urls]) => urls.length > 1).map(([value, urls]) => ({ value, urls }));
}

export function auditSiteStructure({ pages, homeUrl }) {
  const errors = [];
  const urls = pages.map((page) => page.url);
  const urlSet = new Set(urls);
  const edges = new Map(urls.map((url) => [url, new Set()]));
  const inbound = new Map(urls.map((url) => [url, new Set()]));
  const duplicateTitles = duplicateGroups(pages, "title");
  const duplicateDescriptions = duplicateGroups(pages, "description");
  const duplicateCanonicals = duplicateGroups(pages, "canonical");

  for (const page of pages) {
    for (const href of page.hrefs ?? []) {
      let target;
      try {
        const resolved = new URL(href, page.url);
        if (resolved.origin !== new URL(homeUrl).origin) continue;
        resolved.hash = "";
        resolved.search = "";
        target = resolved.href;
      } catch {
        continue;
      }
      if (!urlSet.has(target) || target === page.url) continue;
      edges.get(page.url).add(target);
      inbound.get(target).add(page.url);
    }
  }

  const orphanUrls = urls.filter((url) => url !== homeUrl && inbound.get(url).size === 0);
  const depth = new Map([[homeUrl, 0]]);
  const queue = [homeUrl];
  while (queue.length) {
    const current = queue.shift();
    for (const target of edges.get(current) ?? []) {
      if (depth.has(target)) continue;
      depth.set(target, depth.get(current) + 1);
      queue.push(target);
    }
  }
  const unreachableUrls = urls.filter((url) => !depth.has(url));
  const maximumClickDepth = Math.max(...depth.values());

  if (duplicateTitles.length) errors.push(`${duplicateTitles.length} duplicate title groups`);
  if (duplicateDescriptions.length) errors.push(`${duplicateDescriptions.length} duplicate description groups`);
  if (duplicateCanonicals.length) errors.push(`${duplicateCanonicals.length} duplicate canonical groups`);
  if (orphanUrls.length) errors.push(`${orphanUrls.length} orphan pages`);
  if (unreachableUrls.length) errors.push(`${unreachableUrls.length} pages unreachable from home`);
  if (maximumClickDepth > 3) errors.push(`maximum click depth is ${maximumClickDepth}`);

  return { errors, duplicateTitles, duplicateDescriptions, duplicateCanonicals, orphanUrls, unreachableUrls, maximumClickDepth };
}

export function auditRobots(robots, sitemapUrl) {
  const errors = [];
  let agents = [];
  let hasDirectives = false;
  let wildcardAllowsRoot = false;
  let wildcardBlocksRoot = false;

  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (hasDirectives) agents = [];
      agents.push(value.toLowerCase());
      hasDirectives = false;
      continue;
    }
    if (!["allow", "disallow"].includes(field)) continue;
    hasDirectives = true;
    if (!agents.includes("*") || value !== "/") continue;
    if (field === "allow") wildcardAllowsRoot = true;
    if (field === "disallow") wildcardBlocksRoot = true;
  }

  if (!robots.includes(`Sitemap: ${sitemapUrl}`)) errors.push("robots.txt does not declare the production sitemap");
  if (wildcardBlocksRoot) errors.push("robots.txt blocks the site root for the wildcard crawler group");
  if (!wildcardAllowsRoot) errors.push("robots.txt does not explicitly allow the site root for the wildcard crawler group");
  return errors;
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export async function auditProduction({ siteUrl, fetchImpl = fetch, concurrency = 8 }) {
  const base = new URL(siteUrl);
  const sitemapUrl = new URL("/sitemap.xml", base).href;
  const robotsUrl = new URL("/robots.txt", base).href;
  const headers = { "user-agent": "Crossword-Clue-Tutor-production-audit/1.0" };
  const [sitemapResponse, robotsResponse] = await Promise.all([
    fetchImpl(sitemapUrl, { headers }),
    fetchImpl(robotsUrl, { headers })
  ]);
  if (!sitemapResponse.ok) throw new Error(`Sitemap returned HTTP ${sitemapResponse.status}`);
  if (!robotsResponse.ok) throw new Error(`robots.txt returned HTTP ${robotsResponse.status}`);
  const [sitemap, robots] = await Promise.all([sitemapResponse.text(), robotsResponse.text()]);
  const sitemapEntries = [...sitemap.matchAll(/<url><loc>(https:\/\/[^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((match) => ({ url: match[1], lastmod: match[2] ?? "" }));
  const urls = sitemapEntries.map((entry) => entry.url);
  const errors = [];
  if (urls.length === 0) errors.push("sitemap contains no URLs");
  const duplicateSitemapUrls = urls.length - new Set(urls).size;
  const missingLastmod = sitemapEntries.filter((entry) => !/^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)).length;
  if (duplicateSitemapUrls) errors.push(`sitemap contains ${duplicateSitemapUrls} duplicate URLs`);
  if (missingLastmod) errors.push(`${missingLastmod} sitemap URLs have missing or invalid lastmod`);
  errors.push(...auditRobots(robots, sitemapUrl));

  const pages = await mapConcurrent(urls, concurrency, async (url) => {
    try {
      const response = await fetchImpl(url, { headers });
      if (!response.ok) return { url, title: "", titleLength: 0, errors: [`HTTP ${response.status}`] };
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) return { url, title: "", titleLength: 0, errors: [`unexpected content type: ${contentType}`] };
      return auditHtml({ html: await response.text(), url });
    } catch (error) {
      return { url, title: "", titleLength: 0, errors: [error.message] };
    }
  });
  const pageErrors = pages.flatMap((page) => page.errors.map((error) => `${page.url}: ${error}`));
  errors.push(...pageErrors);
  const structure = auditSiteStructure({ pages, homeUrl: base.href });
  errors.push(...structure.errors);
  const longest = [...pages].sort((a, b) => b.titleLength - a.titleLength)[0] ?? { url: null, title: null, titleLength: 0 };

  return {
    auditedAt: new Date().toISOString(),
    sitemapUrl,
    sitemapUrls: urls.length,
    pagesAudited: pages.length,
    pagesWithErrors: pages.filter((page) => page.errors.length).length,
    duplicateSitemapUrls,
    invalidLastmod: missingLastmod,
    duplicateTitleGroups: structure.duplicateTitles.length,
    duplicateDescriptionGroups: structure.duplicateDescriptions.length,
    duplicateCanonicalGroups: structure.duplicateCanonicals.length,
    orphanPages: structure.orphanUrls.length,
    unreachableFromHome: structure.unreachableUrls.length,
    maximumClickDepth: structure.maximumClickDepth,
    titleTooLong: pages.filter((page) => page.errors.some((error) => error.startsWith("title exceeds"))).length,
    longestTitle: { url: longest.url, title: longest.title, characters: longest.titleLength },
    errors
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const config = JSON.parse(await readFile(path.resolve("site.config.json"), "utf8"));
  const result = await auditProduction({ siteUrl: config.siteUrl });
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
