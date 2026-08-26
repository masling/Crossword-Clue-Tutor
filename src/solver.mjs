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
  return [...new Set(normalizeClue(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token)))];
}

function relatedToken(token, term) {
  if (token === term || token.startsWith(term) || term.startsWith(token)) return "strong";
  if (token.length >= 5 && term.length >= 5 && token.slice(0, 4) === term.slice(0, 4)) return "stem";
  return null;
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
  const supportingText = normalizeClue(`${item.definition ?? ""} ${(item.tags ?? []).join(" ")} ${(item.synonyms ?? []).join(" ")} ${(item.searchTerms ?? []).join(" ")}`);

  for (const term of queryTokens) {
    if (clueTokens.includes(term)) score += 60;
    else if (clueTokens.some((token) => relatedToken(token, term) === "strong")) score += 25;
    else if (clueTokens.some((token) => relatedToken(token, term) === "stem")) score += 18;
    else if (supportingText.includes(term)) score += 12;
  }

  const matchedTerms = queryTokens.filter((term) =>
    clueTokens.some((token) => relatedToken(token, term))
  ).length;
  if (queryTokens.length && matchedTerms === queryTokens.length) score += 80;

  return score;
}

export function solveClues(clues, { pattern = "", clue = "", length, skill = "" } = {}) {
  const matcher = patternToRegExp(pattern);
  const numericLength = Number.parseInt(length, 10);
  const hasLength = Number.isFinite(numericLength) && numericLength > 0;

  return clues
    .filter((item) => !skill || item.skill === skill)
    .filter((item) => !matcher || matcher.test(item.answer))
    .filter((item) => !hasLength || answerCells(item.answer).length === numericLength)
    .map((item) => ({ item, relevance: scoreClueMatch(item, clue) }))
    .filter(({ relevance }) => !normalizeClue(clue) || relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || candidateTrust(b.item) - candidateTrust(a.item) || b.item.popularity - a.item.popularity || a.item.answer.localeCompare(b.item.answer))
    .map(({ item }) => item);
}

export function lexicalCandidates(corpus = {}) {
  if (!Array.isArray(corpus.candidates)) return [];
  return corpus.candidates.map((item) => ({
    answer: item.answer,
    clue: item.definition,
    definition: item.definition,
    partOfSpeech: item.partOfSpeech,
    synonyms: item.synonyms ?? [],
    searchTerms: item.searchTerms ?? [],
    tags: item.synonyms ?? [],
    popularity: item.popularity ?? 1,
    sourceKind: "wordnet",
    signal: "Licensed dictionary fallback — this is not an exact reviewed clue-answer pairing.",
    hint: `Look for a ${answerCells(item.answer).length}-letter ${item.partOfSpeech} matching this dictionary sense.`,
    explanation: `This candidate matches the supplied grid constraints and this WordNet sense: ${item.definition} Confirm it against the exact clue and crossing letters.`,
    licensePath: corpus.licensePath
  }));
}

export function candidateEvidence(item, { clue = "", pattern = "", length = "" } = {}) {
  const normalizedQuery = normalizeClue(clue);
  const exact = Boolean(normalizedQuery) && normalizeClue(item.clue) === normalizedQuery;
  const lexical = item.sourceKind === "wordnet";
  const reasons = [];
  if (pattern) reasons.push(`Matches ${normalizePattern(pattern)}`);
  const numericLength = Number.parseInt(length, 10);
  const answerLength = answerCells(item.answer).length;
  if ((Number.isFinite(numericLength) && numericLength > 0) || pattern) reasons.push(`${answerLength} letters`);
  if (exact && !lexical) reasons.push("Exact reviewed clue-answer pair");
  else if (clue && scoreClueMatch(item, clue) > 0) reasons.push(lexical ? "Dictionary meaning overlaps the clue" : "Reviewed clue language overlaps");
  if (lexical) reasons.push("Verify with crossings");
  return {
    label: lexical ? "Dictionary candidate" : exact ? "Reviewed exact" : item.sourceKind === "clue-hub" ? "Reviewed clue family" : "Reviewed related",
    tier: lexical ? "lexical" : exact ? "exact" : "reviewed",
    reasons
  };
}

export function uniqueAnswerCandidates(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = normalizeClue(item.answer).replaceAll(" ", "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function candidateTrust(item) {
  return item.sourceKind === "wordnet" ? 0 : 1;
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
