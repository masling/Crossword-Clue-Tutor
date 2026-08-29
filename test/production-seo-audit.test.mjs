import test from "node:test";
import assert from "node:assert/strict";
import { auditHtml, auditRobots, auditSiteStructure } from "../scripts/audit-production-seo.mjs";

const pageview = '<script defer data-domain="crosswordcluetutor.com" src="https://app.pageview.app/js/script.js"></script>';
const googleAnalytics = '<meta name="google-analytics-measurement-id" content="G-HVMXR2YN3N">';

function html({ title = "Useful crossword page", description = "A useful description.", canonical = "https://crosswordcluetutor.com/test/", h1 = "<h1>Useful crossword page</h1>", links = "", analyticsMode = "standard" } = {}) {
  const analytics = analyticsMode === "minimal" ? pageview : `${pageview}${googleAnalytics}`;
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="analytics-mode" content="${analyticsMode}"><link rel="canonical" href="${canonical}">${analytics}<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script></head><body>${h1}${links}</body></html>`;
}

test("accepts a production page with the required SEO contract", () => {
  const result = auditHtml({ html: html(), url: "https://crosswordcluetutor.com/test/" });
  assert.deepEqual(result.errors, []);
});

test("accepts a cookie-free reduced-analytics classroom page", () => {
  const result = auditHtml({ html: html({ analyticsMode: "minimal" }), url: "https://crosswordcluetutor.com/test/" });
  assert.deepEqual(result.errors, []);
});

test("detects long titles, canonical drift, and h1 duplication", () => {
  const result = auditHtml({
    html: html({ title: "X".repeat(71), canonical: "https://crosswordcluetutor.com/wrong/", h1: "<h1>One</h1><h1>Two</h1>" }),
    url: "https://crosswordcluetutor.com/test/"
  });
  assert.match(result.errors.join(" "), /title exceeds 70/);
  assert.match(result.errors.join(" "), /canonical mismatch/);
  assert.match(result.errors.join(" "), /expected one h1/);
});

test("requires a specific public license URL on Dataset structured data", () => {
  const withoutLicense = html().replace('{"@context":"https://schema.org","@type":"WebPage"}', '{"@context":"https://schema.org","@type":"Dataset","name":"Test data","description":"A sufficiently useful test dataset description for validation."}');
  const withLicense = html().replace('{"@context":"https://schema.org","@type":"WebPage"}', '{"@context":"https://schema.org","@type":"Dataset","name":"Test data","description":"A sufficiently useful test dataset description for validation.","license":{"@type":"CreativeWork","name":"Custom License 1.0","url":"https://crosswordcluetutor.com/content-license/"}}');
  assert.match(auditHtml({ html: withoutLicense, url: "https://crosswordcluetutor.com/test/" }).errors.join(" "), /missing an absolute HTTPS license URL/);
  assert.deepEqual(auditHtml({ html: withLicense, url: "https://crosswordcluetutor.com/test/" }).errors, []);
});

test("allows AI-specific blocks while keeping wildcard search crawling open", () => {
  const robots = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://crosswordcluetutor.com/sitemap.xml\n`;
  assert.deepEqual(auditRobots(robots, "https://crosswordcluetutor.com/sitemap.xml"), []);
});

test("rejects a wildcard root block", () => {
  const robots = `User-agent: *\nDisallow: /\nSitemap: https://crosswordcluetutor.com/sitemap.xml\n`;
  assert.match(auditRobots(robots, "https://crosswordcluetutor.com/sitemap.xml").join(" "), /blocks the site root/);
});

test("finds duplicate metadata and unreachable pages across a site", () => {
  const pages = [
    auditHtml({ html: html({ title: "Home", description: "Home page.", canonical: "https://crosswordcluetutor.com/", links: '<a href="/a/">A</a>' }), url: "https://crosswordcluetutor.com/" }),
    auditHtml({ html: html({ title: "Duplicate", description: "Same.", canonical: "https://crosswordcluetutor.com/a/" }), url: "https://crosswordcluetutor.com/a/" }),
    auditHtml({ html: html({ title: "Duplicate", description: "Same.", canonical: "https://crosswordcluetutor.com/b/" }), url: "https://crosswordcluetutor.com/b/" })
  ];
  const result = auditSiteStructure({ pages, homeUrl: "https://crosswordcluetutor.com/" });
  assert.equal(result.duplicateTitles.length, 1);
  assert.equal(result.duplicateDescriptions.length, 1);
  assert.deepEqual(result.orphanUrls, ["https://crosswordcluetutor.com/b/"]);
  assert.deepEqual(result.unreachableUrls, ["https://crosswordcluetutor.com/b/"]);
});
