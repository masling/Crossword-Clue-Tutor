import path from "node:path";
import { pathToFileURL } from "node:url";

export function buildQaUrl({ siteUrl = "https://crosswordcluetutor.com/", runId = "manual" } = {}) {
  const url = new URL("/qa/", siteUrl);
  url.searchParams.set("utm_source", "operator_qa");
  url.searchParams.set("utm_medium", "internal");
  url.searchParams.set("utm_campaign", "site_qa");
  url.searchParams.set("utm_content", runId);
  return url.href;
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const runId = process.argv[2] || new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  console.log(buildQaUrl({ siteUrl: process.env.SITE_URL, runId }));
}
