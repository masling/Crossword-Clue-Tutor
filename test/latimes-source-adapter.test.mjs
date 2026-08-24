import test from "node:test";
import assert from "node:assert/strict";
import { parseLatimesPicker } from "../scripts/latimes-source-adapter-lib.mjs";

test("parses the first official LA Times picker record", () => {
  const params = {
    streakInfo: [{ puzzleDetails: {
      gridWidth: 21,
      gridHeight: 21,
      numWords: 144,
      title: 'L. A. Times, Sun, Aug 23, 2026 - "GENERATION X"',
      author: "Yijing Chen / Ed. Patti Varol",
      puzzleId: "tca260823",
      publicationTimeZone: "America/New_York"
    } }]
  };
  const html = `<script type="application/json" id="params">${JSON.stringify(params)}</script>`;
  assert.deepEqual(parseLatimesPicker(html), {
    sourceDate: "2026-08-23",
    sourceId: "tca260823",
    title: 'L. A. Times, Sun, Aug 23, 2026 - "GENERATION X"',
    theme: "GENERATION X",
    creator: "Yijing Chen",
    editor: "Patti Varol",
    gridWidth: 21,
    gridHeight: 21,
    officialClueCount: 144,
    publicationTimeZone: "America/New_York"
  });
});
