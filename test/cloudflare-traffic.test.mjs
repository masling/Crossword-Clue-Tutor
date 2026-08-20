import test from "node:test";
import assert from "node:assert/strict";
import { queryCloudflareTraffic, summarizeRumRows } from "../scripts/query-cloudflare-traffic.mjs";

test("separates direct, self, external, and verified search traffic", () => {
  const result = summarizeRumRows([
    { count: 40, sum: { visits: 40 }, dimensions: { refererHost: "" } },
    { count: 6, sum: { visits: 0 }, dimensions: { refererHost: "crosswordcluetutor.com" } },
    { count: 3, sum: { visits: 2 }, dimensions: { refererHost: "www.google.com" } },
    { count: 1, sum: { visits: 1 }, dimensions: { refererHost: "example.com" } }
  ], { legacyOperatorQaBaseline: 4, taggedOperatorQaVisits: 2, taggedOperatorQaPageviews: 3 });

  assert.equal(result.pageviews, 50);
  assert.equal(result.visits, 43);
  assert.equal(result.operatorQaVisits, 6);
  assert.equal(result.taggedOperatorQaPageviews, 3);
  assert.equal(result.visitsAfterOperatorQa, 37);
  assert.equal(result.directVisits, 40);
  assert.equal(result.selfPageviews, 6);
  assert.equal(result.externalReferrerVisits, 3);
  assert.equal(result.verifiedSearchVisits, 2);
});

test("dry-run exposes the query without requiring or returning a token", async () => {
  const result = await queryCloudflareTraffic({ env: { TRAFFIC_DRY_RUN: "1", CLOUDFLARE_ACCOUNT_ID: "account" } });
  assert.equal(result.dryRun, true);
  assert.equal(result.variables.accountTag, "account");
  assert.equal(JSON.stringify(result).includes("Bearer"), false);
});
