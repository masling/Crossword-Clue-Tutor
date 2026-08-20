import test from "node:test";
import assert from "node:assert/strict";
import { onRequest, onRequestPost } from "../functions/api/feedback.js";

function mockDatabase() {
  const state = { runs: 0, sql: "", values: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...values) {
          state.values = values;
          return {
            async run() {
              state.runs += 1;
              return { success: true };
            }
          };
        }
      };
    }
  };
}

function context(body, { origin = "https://crosswordcluetutor.com", database = mockDatabase() } = {}) {
  return {
    request: new Request("https://crosswordcluetutor.com/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(body)
    }),
    env: database ? { FEEDBACK_DB: database } : {}
  };
}

const validFeedback = {
  issueType: "unclear-explanation",
  pagePath: "/explainers/example/",
  mode: "clue",
  clue: "Example clue",
  answer: "TEST",
  message: "The second sentence does not explain the abbreviation signal.",
  email: ""
};

test("stores anonymous feedback with prepared values", async () => {
  const database = mockDatabase();
  const response = await onRequestPost(context(validFeedback, { database }));
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.ok, true);
  assert.match(result.id, /^[0-9a-f-]{36}$/);
  assert.equal(database.state.runs, 1);
  assert.match(database.state.sql, /INSERT INTO feedback/);
  assert.deepEqual(database.state.values.slice(1), [
    "unclear-explanation",
    "/explainers/example/",
    "clue",
    "Example clue",
    "TEST",
    "The second sentence does not explain the abbreviation signal.",
    null
  ]);
});

test("keeps optional email only for a valid follow-up address", async () => {
  const database = mockDatabase();
  const response = await onRequestPost(context({ ...validFeedback, email: " Solver@Example.com " }, { database }));
  assert.equal(response.status, 201);
  assert.equal(database.state.values.at(-1), "solver@example.com");

  const invalid = await onRequestPost(context({ ...validFeedback, email: "not-an-email" }));
  assert.equal(invalid.status, 400);
});

test("rejects cross-origin and underspecified submissions", async () => {
  const crossOrigin = await onRequestPost(context(validFeedback, { origin: "https://example.com" }));
  assert.equal(crossOrigin.status, 403);

  const short = await onRequestPost(context({ ...validFeedback, message: "Too short" }));
  assert.equal(short.status, 400);
});

test("silently accepts honeypot spam without writing", async () => {
  const database = mockDatabase();
  const response = await onRequestPost(context({ ...validFeedback, website: "https://spam.example" }, { database }));
  assert.equal(response.status, 201);
  assert.equal(database.state.runs, 0);
});

test("fails safely when the D1 binding is unavailable", async () => {
  const response = await onRequestPost(context(validFeedback, { database: null }));
  assert.equal(response.status, 503);
});

test("rejects non-POST methods", async () => {
  const response = onRequest();
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
});
