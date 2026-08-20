import test from "node:test";
import assert from "node:assert/strict";
import { auditHtml, auditRobots } from "../scripts/audit-production-seo.mjs";

const pageview = '<script defer data-domain="crosswordcluetutor.com" src="https://app.pageview.app/js/script.js"></script>';

function html({ title = "Useful crossword page", canonical = "https://crosswordcluetutor.com/test/", h1 = "<h1>Useful crossword page</h1>" } = {}) {
  return `<!doctype html><html><head><title>${title}</title><meta name="description" content="A useful description."><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}">${pageview}<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage"}</script></head><body>${h1}</body></html>`;
}

test("accepts a production page with the required SEO contract", () => {
  const result = auditHtml({ html: html(), url: "https://crosswordcluetutor.com/test/" });
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

test("allows AI-specific blocks while keeping wildcard search crawling open", () => {
  const robots = `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://crosswordcluetutor.com/sitemap.xml\n`;
  assert.deepEqual(auditRobots(robots, "https://crosswordcluetutor.com/sitemap.xml"), []);
});

test("rejects a wildcard root block", () => {
  const robots = `User-agent: *\nDisallow: /\nSitemap: https://crosswordcluetutor.com/sitemap.xml\n`;
  assert.match(auditRobots(robots, "https://crosswordcluetutor.com/sitemap.xml").join(" "), /blocks the site root/);
});
