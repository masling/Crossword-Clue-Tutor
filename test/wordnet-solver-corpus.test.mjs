import test from "node:test";
import assert from "node:assert/strict";
import { buildWordNetSolverCorpus } from "../scripts/wordnet-solver-corpus.mjs";

test("builds a licensed, non-adult solver corpus above the requested minimum", async () => {
  const corpus = await buildWordNetSolverCorpus({ reviewedCount: 10, minimumCount: 1_000, targetCount: 1_000 });
  assert.equal(corpus.source, "Princeton WordNet 3.1");
  assert.equal(corpus.count, 1_000);
  assert.equal(corpus.candidates.length, 1_000);
  assert.ok(corpus.candidates.every((item) => /^[A-Z]{2,20}$/.test(item.answer)));
  assert.ok(corpus.candidates.every((item) => item.sourceKind === "wordnet" && item.definition.length > 0));
  const serialized = JSON.stringify(corpus.candidates).toLowerCase();
  for (const blocked of [" pornography", " sexual intercourse", " masturbation", " prostitution"]) assert.equal(serialized.includes(blocked), false);
});
