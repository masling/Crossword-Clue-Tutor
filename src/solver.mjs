export function normalizePattern(value = "") {
  return value
    .toUpperCase()
    .replace(/[^A-Z?*._-]/g, "")
    .replace(/[._-]/g, "?");
}

const STOP_WORDS = new Set([
  "a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"
]);

export function normalizeClue(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeClue(value = "") {
  return normalizeClue(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

export function patternToRegExp(value = "") {
  const normalized = normalizePattern(value);
  if (!normalized) return null;
  const expression = normalized
    .replaceAll("?", ".")
    .replaceAll("*", ".*");
  return new RegExp(`^${expression}$`, "i");
}

export function scoreClueMatch(item, query = "") {
  const normalizedQuery = normalizeClue(query);
  if (!normalizedQuery) return 1;

  const normalizedClue = normalizeClue(item.clue);
  if (normalizedClue === normalizedQuery) return 1000;

  let score = 0;
  if (normalizedClue.includes(normalizedQuery) || normalizedQuery.includes(normalizedClue)) score += 240;

  const queryTokens = tokenizeClue(normalizedQuery);
  const clueTokens = tokenizeClue(normalizedClue);
  const supportingText = normalizeClue(`${item.definition ?? ""} ${(item.tags ?? []).join(" ")}`);

  for (const term of queryTokens) {
    if (clueTokens.includes(term)) score += 60;
    else if (clueTokens.some((token) => token.startsWith(term) || term.startsWith(token))) score += 25;
    else if (supportingText.includes(term)) score += 12;
  }

  const matchedTerms = queryTokens.filter((term) =>
    clueTokens.some((token) => token === term || token.startsWith(term) || term.startsWith(token))
  ).length;
  if (queryTokens.length && matchedTerms === queryTokens.length) score += 80;

  return score;
}

export function solveClues(clues, { pattern = "", clue = "", length } = {}) {
  const matcher = patternToRegExp(pattern);
  const numericLength = Number.parseInt(length, 10);
  const hasLength = Number.isFinite(numericLength) && numericLength > 0;

  return clues
    .filter((item) => !matcher || matcher.test(item.answer))
    .filter((item) => !hasLength || answerCells(item.answer).length === numericLength)
    .map((item) => ({ item, relevance: scoreClueMatch(item, clue) }))
    .filter(({ relevance }) => !normalizeClue(clue) || relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.item.popularity - a.item.popularity || a.item.answer.localeCompare(b.item.answer))
    .map(({ item }) => item);
}

export function clueHubCandidates(clueHubs = []) {
  return clueHubs.flatMap((hub) => {
    const preferredOrder = new Map((hub.preferredAnswers ?? []).map((answer, index) => [answer, index]));
    return hub.answers.map((option, index) => {
      const preferredIndex = preferredOrder.get(option.answer);
      const popularity = preferredIndex === undefined ? Math.max(10, 40 - index) : 80 - preferredIndex;
      return {
        slug: `hub-${hub.slug}-${option.answer.toLowerCase()}`,
        clue: hub.clue,
        answer: option.answer,
        definition: option.sense,
        explanation: `${option.answer} can answer “${hub.clue}” when the clue uses this sense: ${option.sense} The grid must also match ${answerCells(option.answer).length} letters and every crossing.`,
        signal: "This recurring one-word clue has several legitimate senses; answer length and crossings select the intended one.",
        hint: `Look for a ${answerCells(option.answer).length}-letter answer matching this sense: ${option.sense}`,
        tags: ["recurring clue", "multiple answers", hub.clue, option.sense],
        clueType: "multi-answer",
        popularity,
        reviewedAt: hub.reviewedAt,
        hubSlug: hub.slug,
        sourceKind: "clue-hub"
      };
    });
  });
}

export function answerCells(answer) {
  return [...answer].filter((character) => /[A-Z]/i.test(character));
}
