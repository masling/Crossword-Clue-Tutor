import test from "node:test";
import assert from "node:assert/strict";
import { validateOutreach } from "../scripts/validate-outreach.mjs";

test("prepared outreach assets match current reviewed data and cannot be sent silently", async () => {
  const result = await validateOutreach();
  assert.deepEqual(result.errors, []);
  assert.equal(result.items, result.emailItems + result.formItems);
  assert.ok(result.emailItems >= 12, "reviewed email inventory must not shrink below its established baseline");
  assert.ok(result.formItems >= 6, "reviewed form inventory must not shrink below its established baseline");
});
