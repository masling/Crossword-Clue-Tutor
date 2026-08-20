import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateContent } from "../scripts/validate-content.mjs";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("all indexable content passes editorial validation", async () => {
  const [clues, answers, clueTypes, publications, config] = await Promise.all([
    readJson("../data/clues.json"),
    readJson("../data/answers.json"),
    readJson("../data/clue-types.json"),
    readJson("../data/publications.json"),
    readJson("../site.config.json")
  ]);
  const result = validateContent({ clues, answers, clueTypes, publications, config });
  assert.deepEqual(result.errors, []);
});
