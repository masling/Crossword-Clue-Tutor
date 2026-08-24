const DIRECTIONS = new Set(["Across", "Down"]);

export function validateSourceClueSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Source snapshot must be a JSON object.");
  }
  for (const forbidden of ["answer", "answers", "solution", "solutions"]) {
    if (hasKeyDeep(value, forbidden)) throw new Error(`Source snapshot must not contain ${forbidden} fields.`);
  }

  const requiredText = ["publication", "sourceDate", "sourceId", "title", "sourceUrl"];
  for (const field of requiredText) {
    if (!String(value[field] ?? "").trim()) throw new Error(`Source snapshot is missing ${field}.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.sourceDate)) throw new Error("sourceDate must use YYYY-MM-DD.");
  if (!/^https:\/\//.test(value.sourceUrl)) throw new Error("sourceUrl must be an HTTPS URL.");
  if (!Array.isArray(value.clues) || value.clues.length === 0) throw new Error("Source snapshot must include clues.");

  const seen = new Set();
  const clues = value.clues.map((item, index) => {
    const direction = String(item?.direction ?? "").trim();
    const number = String(item?.number ?? "").trim();
    const clue = String(item?.clue ?? "").trim();
    if (!DIRECTIONS.has(direction)) throw new Error(`clues[${index}] has an invalid direction.`);
    if (!/^\d+[A-Za-z]?$/.test(number)) throw new Error(`clues[${index}] has an invalid number.`);
    if (!clue) throw new Error(`clues[${index}] has an empty clue.`);
    const key = `${direction}|${number}`;
    if (seen.has(key)) throw new Error(`Duplicate clue key: ${key}`);
    seen.add(key);
    return { direction, number, clue };
  });

  return {
    publication: String(value.publication).trim(),
    sourceDate: value.sourceDate,
    sourceId: String(value.sourceId).trim(),
    title: String(value.title).trim(),
    creator: nullableText(value.creator),
    editor: nullableText(value.editor),
    sourceUrl: value.sourceUrl,
    capturedAt: nullableText(value.capturedAt) ?? new Date().toISOString(),
    captureMode: nullableText(value.captureMode) ?? "public-browser-dom-no-login",
    clues
  };
}

function nullableText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function hasKeyDeep(value, target) {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (key.toLowerCase() === target) return true;
    if (hasKeyDeep(child, target)) return true;
  }
  return false;
}
