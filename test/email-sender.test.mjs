import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, run, smtpConfig, validateSingleAddress } from "../scripts/send-outreach.mjs";

test("defaults to a non-sending dry run", () => {
  const options = parseArgs(["--to", "editor@example.com", "--subject", "Hello", "--text-file", "draft.txt"]);
  assert.equal(options.send, false);
  assert.equal(options.to, "editor@example.com");
  assert.equal(options.text_file, "draft.txt");
});

test("accepts a manifest outreach id without enabling sending", () => {
  const options = parseArgs(["--outreach-id", "daily-crossword-links"]);
  assert.equal(options.outreach_id, "daily-crossword-links");
  assert.equal(options.send, false);
});

test("refuses to pass a form payload to the email transport", async () => {
  await assert.rejects(() => run(["--outreach-id", "onelook-dictionary"], {}), /is a form, not an email/);
});

test("rejects recipient lists and header injection", () => {
  assert.throws(() => validateSingleAddress("one@example.com,two@example.com"), /one valid email/);
  assert.throws(() => validateSingleAddress("one@example.com\nBcc: two@example.com"), /line break/);
});

test("keeps the sender on the project domain and never returns a secret in preview fields", () => {
  const config = smtpConfig({ ZOHO_SMTP_PASSWORD: "not-printed" });
  assert.equal(config.host, "smtp.zoho.com");
  assert.equal(config.fromEmail, "hello@crosswordcluetutor.com");
  assert.equal(Object.keys(config).includes("password"), true);
  assert.equal(JSON.stringify({ ...config, password: undefined }).includes("not-printed"), false);
  assert.throws(() => smtpConfig({ OUTREACH_FROM_EMAIL: "other@example.com" }), /crosswordcluetutor\.com/);
});

test("does not accept a password as a command-line option", () => {
  assert.throws(() => parseArgs(["--password", "secret"]), /Unknown option/);
});
