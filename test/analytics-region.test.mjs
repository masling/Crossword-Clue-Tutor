import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, onRequestGet } from "../functions/api/analytics-region.js";

function requestFor(country) {
  const request = new Request("https://crosswordcluetutor.com/api/analytics-region");
  if (country !== undefined) Object.defineProperty(request, "cf", { value: { country } });
  return request;
}

test("requires consent in the EEA, UK, and Switzerland", async () => {
  for (const country of ["GB", "DE", "IE", "NO", "CH"]) {
    const response = onRequestGet({ request: requestFor(country) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { country, consentRequired: true });
  }
});

test("allows automatic analytics loading in non-consent regions", async () => {
  const response = onRequestGet({ request: requestFor("US") });
  assert.deepEqual(await response.json(), { country: "US", consentRequired: false });
});

test("fails privacy-safe when Cloudflare country metadata is unavailable", async () => {
  const response = onRequestGet({ request: requestFor() });
  assert.deepEqual(await response.json(), { country: null, consentRequired: true });
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
});

test("rejects unsupported methods", async () => {
  const response = onRequest();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
});
