import test from "node:test";
import assert from "node:assert/strict";
import { validateOutreach } from "../scripts/validate-outreach.mjs";

test("prepared outreach assets match current reviewed data and cannot be sent silently", async () => {
  const result = await validateOutreach();
  assert.deepEqual(result.errors, []);
  assert.equal(result.items, 10);
  assert.equal(result.emailItems, 5);
  assert.equal(result.formItems, 5);
});
