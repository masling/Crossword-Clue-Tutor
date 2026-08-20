import test from "node:test";
import assert from "node:assert/strict";
import { buildQaUrl } from "../scripts/create-qa-url.mjs";

test("builds a stable operator QA campaign entry URL", () => {
  const url = new URL(buildQaUrl({ runId: "release-42" }));
  assert.equal(url.pathname, "/qa/");
  assert.equal(url.searchParams.get("utm_source"), "operator_qa");
  assert.equal(url.searchParams.get("utm_medium"), "internal");
  assert.equal(url.searchParams.get("utm_campaign"), "site_qa");
  assert.equal(url.searchParams.get("utm_content"), "release-42");
});
