import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pageviewScript = '<script defer data-domain="crosswordcluetutor.com" src="https://app.pageview.app/js/script.js"></script>';

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
  const pageviewCount = html.split(pageviewScript).length - 1;
  const robots = html.match(/<meta name="robots" content="([^"]+)">/)?.[1] ?? "";
  const jsonLdBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  if (!title) errors.push("missing title");
  else if (title.length > 70) errors.push(`title exceeds 70 characters (${title.length})`);
  if (h1Count !== 1) errors.push(`expected one h1, found ${h1Count}`);
  if (canonical !== url) errors.push(`canonical mismatch: ${canonical || "missing"}`);
  if (descriptions.length !== 1) errors.push(`expected one meta description, found ${descriptions.length}`);
  if (!robots.includes("index,follow")) errors.push(`unexpected robots directive: ${robots || "missing"}`);
  if (pageviewCount !== 1) errors.push(`expected one Pageview script, found ${pageviewCount}`);
  if (jsonLdBlocks.length === 0) errors.push("missing JSON-LD");
  for (const block of jsonLdBlocks) {
    try { JSON.parse(block[1]); } catch { errors.push("invalid JSON-LD"); }
  }

  return { url, title, titleLength: title.length, h1Count, canonical, jsonLdBlocks: jsonLdBlocks.length, errors };
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
  const urls = [...sitemap.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  const errors = [];
  if (urls.length === 0) errors.push("sitemap contains no URLs");
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
  const longest = [...pages].sort((a, b) => b.titleLength - a.titleLength)[0] ?? { url: null, title: null, titleLength: 0 };

  return {
    auditedAt: new Date().toISOString(),
    sitemapUrl,
    sitemapUrls: urls.length,
    pagesAudited: pages.length,
    pagesWithErrors: pages.filter((page) => page.errors.length).length,
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
