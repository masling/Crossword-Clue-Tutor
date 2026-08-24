import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { clueHubCandidates, solveClues } from "../src/solver.mjs";

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));
}

test("classroom beta has six balanced skill packs and meaningful difficulty coverage", async () => {
  const classroomClues = await readJson("../data/classroom-clues.json");
  const groupBy = (items, field) => items.reduce((groups, item) => {
    if (!groups.has(item[field])) groups.set(item[field], []);
    groups.get(item[field]).push(item);
    return groups;
  }, new Map());
  const bySkill = groupBy(classroomClues, "skill");
  const byDifficulty = groupBy(classroomClues, "difficulty");

  assert.ok(classroomClues.length >= 30);
  assert.ok(bySkill.size >= 6);
  for (const skill of ["context-and-meaning", "word-structure", "academic-language", "science-vocabulary", "language-arts", "precision-and-revision"]) assert.ok((bySkill.get(skill) ?? []).length >= 5);
  if (classroomClues.length >= 100) {
    assert.ok((bySkill.get("mathematics-language") ?? []).length >= 20);
    assert.ok((bySkill.get("social-studies") ?? []).length >= 20);
  }
  assert.ok((byDifficulty.get("introductory") ?? []).length >= 10);
  assert.ok((byDifficulty.get("intermediate") ?? []).length >= 5);
  assert.ok((byDifficulty.get("advanced") ?? []).length >= 5);
});

test("every printable worksheet clue resolves to its intended reviewed classroom answer", async () => {
  const [clues, hubs, classroomClues] = await Promise.all([
    readJson("../data/clues.json"),
    readJson("../data/clue-hubs.json"),
    readJson("../data/classroom-clues.json")
  ]);
  const pool = [...classroomClues, ...clues, ...clueHubCandidates(hubs)];
  const worksheetExamples = [
    ["A word's emotional association", 11, "CONNOTATION"],
    ["Make less severe", 4, "EASE"],
    ["Able to be trusted", 8, "RELIABLE"],
    ["Evidence surrounding an unfamiliar word", 7, "CONTEXT"],
    ["A word with the opposite meaning", 7, "ANTONYM"]
  ];

  for (const [clue, length, expected] of worksheetExamples) {
    const matches = solveClues(pool, { clue, length });
    assert.equal(matches[0]?.answer, expected, `${clue} should resolve to ${expected}`);
  }
});
