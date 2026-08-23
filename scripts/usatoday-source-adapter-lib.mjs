const MONTHS = new Map([
  ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
  ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
  ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"]
]);

const SEARCHABLE_ENTITY_TERMS = /\b(actor|actress|artist|author|editor|investor|legend|musician|painter|rapper|singer|spy|star|Brazil|Vietnamese|Saturn|Grinch|Biles|DiMarco|Greiner|Mendes|Wong)\b/i;
const QUOTED_TITLE = /["“”][^"“”]{3,}["“”]/;
const PROPER_NAME = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/;

export function parseUsaTodayDate(label) {
  const match = String(label).trim().match(/^([A-Z][a-z]{2})\.\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match || !MONTHS.has(match[1])) return null;
  return `${match[3]}-${MONTHS.get(match[1])}-${match[2].padStart(2, "0")}`;
}

export function parseUsaTodayArchiveCard(text, now = new Date()) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 4) return null;
  const shortDate = lines[0].match(/^([A-Z][a-z]{2})\.\s+(\d{1,2})$/);
  if (!shortDate || !MONTHS.has(shortDate[1])) return null;
  const month = Number(MONTHS.get(shortDate[1]));
  const currentMonth = now.getUTCMonth() + 1;
  const year = month > currentMonth + 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return {
    sourceDate: `${year}-${MONTHS.get(shortDate[1])}-${shortDate[2].padStart(2, "0")}`,
    title: lines[1],
    creator: lines[2],
    editor: lines[3]
  };
}

export function scoreUsaTodayClue(clue) {
  const text = String(clue.clue ?? "").trim();
  let score = 0;
  const reasons = [];
  if (SEARCHABLE_ENTITY_TERMS.test(text)) { score += 5; reasons.push("entity-led"); }
  if (QUOTED_TITLE.test(text)) { score += 4; reasons.push("quoted-title"); }
  if (PROPER_NAME.test(text)) { score += 2; reasons.push("proper-name"); }
  if (text.includes("?")) { score += 2; reasons.push("question-mark"); }
  if (text.includes("___")) { score += 1; reasons.push("fill-in-blank"); }
  if (text.length >= 18 && text.length <= 70) { score += 1; reasons.push("specific-phrase"); }
  if (text.length < 8) score -= 1;
  return { score, reasons };
}

export function selectUsaTodayCandidates(clues, limit = 6) {
  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 6));
  return clues
    .map((clue, sourceOrder) => ({ ...clue, ...scoreUsaTodayClue(clue), sourceOrder }))
    .sort((a, b) => b.score - a.score || a.sourceOrder - b.sourceOrder)
    .slice(0, safeLimit)
    .map(({ sourceOrder: _sourceOrder, ...clue }) => clue);
}
