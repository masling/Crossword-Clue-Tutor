import test from "node:test";
import assert from "node:assert/strict";
import { collectIndexNowUrls, extractSitemapUrls } from "../scripts/indexnow-urls.mjs";

const siteUrl = "https://crosswordcluetutor.com/";
const sitemap = (paths) => `<?xml version="1.0"?><urlset>${paths.map((path) => `<url><loc>${siteUrl.replace(/\/$/, "")}${path}</loc></url>`).join("")}</urlset>`;

test("extracts and decodes sitemap locations", () => {
  assert.deepEqual(extractSitemapUrls("<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc></url></urlset>"), ["https://example.com/a?x=1&y=2"]);
});

test("submits only newly added sitemap URLs by default", () => {
  const urls = collectIndexNowUrls({ siteUrl, previousSitemap: sitemap(["/a/"]), currentSitemap: sitemap(["/a/", "/b/"]) });
  assert.deepEqual(urls, [siteUrl, `${siteUrl}b/`]);
});

test("adds explicitly updated publish and manual records when requested", () => {
  const urls = collectIndexNowUrls({
    siteUrl,
    previousSitemap: sitemap(["/a/", "/b/"]),
    currentSitemap: sitemap(["/a/", "/b/"]),
    includeRecords: true,
    publishRecord: { urls: ["/a/"], hubUrls: ["/"] },
    manualRecord: { urls: ["/classroom-solver/", "https://other.example/nope"] }
  });
  assert.deepEqual(urls, [siteUrl, `${siteUrl}a/`, `${siteUrl}classroom-solver/`]);
});

test("returns no work when sitemap and records are unchanged", () => {
  assert.deepEqual(collectIndexNowUrls({ siteUrl, previousSitemap: sitemap(["/a/"]), currentSitemap: sitemap(["/a/"]) }), []);
});
