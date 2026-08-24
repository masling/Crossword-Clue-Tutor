import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REQUIRED_CLUE_FIELDS = [
  "slug", "clue", "answer", "date", "definition", "explanation", "partOfSpeech",
  "tags", "clueType", "signal", "hint", "reviewedAt"
];

export function validateContent({ clues, answers, clueTypes, publications, clueHubs, classroomClues = [], config }) {
  const errors = [];
  const warnings = [];
  const clueSlugs = new Set();
  const answerSlugs = new Set();
  const typeSlugs = new Set();
  const publicationNames = new Set();
  const publicationRoutes = new Set();
  const clueHubSlugs = new Set();

  if (!config?.name || !config?.description || !config?.siteUrl) {
    errors.push("site.config.json must include name, description, and siteUrl");
  } else {
    try {
      const siteUrl = new URL(config.siteUrl);
      if (siteUrl.hostname.endsWith(".example")) {
        warnings.push("siteUrl uses the reserved .example domain; replace it before deployment");
      }
    } catch {
      errors.push("siteUrl must be a valid absolute URL");
    }
  }

  if (!Array.isArray(clueHubs)) {
    errors.push("data/clue-hubs.json must contain an array");
  } else {
    for (const [index, hub] of clueHubs.entries()) {
      const label = `clueHubs[${index}]`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(hub.slug ?? "")) errors.push(`${label} has an invalid slug`);
      if (clueHubSlugs.has(hub.slug)) errors.push(`duplicate clue hub slug: ${hub.slug}`);
      clueHubSlugs.add(hub.slug);
      for (const field of ["clue", "summary", "answerGuidance", "reviewedAt"]) {
        if (!hub[field]) errors.push(`${label} is missing ${field}`);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hub.reviewedAt ?? "")) errors.push(`${label} reviewedAt must be YYYY-MM-DD`);
      if (!Array.isArray(hub.answers) || hub.answers.length < 3) errors.push(`${label} needs at least three possible answers`);
      if (!Array.isArray(hub.meaningBuckets) || hub.meaningBuckets.length < 3) errors.push(`${label} needs at least three meaning buckets`);
      for (const meaning of hub.meaningBuckets ?? []) {
        if (meaning.length < 25) errors.push(`${label} has a meaning bucket that is too short`);
      }
      const possibleAnswers = new Set();
      for (const option of hub.answers ?? []) {
        if (!/^[A-Z]+$/.test(option.answer ?? "")) errors.push(`${label} possible answers must contain uppercase A-Z only`);
        if ((option.sense ?? "").length < 20) errors.push(`${label} answer ${option.answer ?? "unknown"} needs a useful sense`);
        if (possibleAnswers.has(option.answer)) errors.push(`${label} has duplicate answer ${option.answer}`);
        possibleAnswers.add(option.answer);
      }
      if (!Array.isArray(hub.preferredAnswers) || hub.preferredAnswers.length === 0) errors.push(`${label} needs at least one preferred answer`);
      for (const answer of hub.preferredAnswers ?? []) {
        if (!possibleAnswers.has(answer)) errors.push(`${label} preferred answer ${answer} is not in its answer list`);
      }
      const variantQueries = new Set();
      for (const [variantIndex, variant] of (hub.queryVariants ?? []).entries()) {
        const variantLabel = `${label}.queryVariants[${variantIndex}]`;
        if (!variant.query || !variant.guidance) errors.push(`${variantLabel} needs query and guidance`);
        if ((variant.guidance ?? "").length < 50) errors.push(`${variantLabel} guidance is too short`);
        if (variantQueries.has(variant.query)) errors.push(`${label} has duplicate query variant ${variant.query}`);
        variantQueries.add(variant.query);
        if (!Array.isArray(variant.answers) || variant.answers.length < 2) errors.push(`${variantLabel} needs at least two candidate answers`);
        const variantAnswers = new Set();
        for (const answer of variant.answers ?? []) {
          if (!possibleAnswers.has(answer)) errors.push(`${variantLabel} answer ${answer} is not in the hub answer list`);
          if (variantAnswers.has(answer)) errors.push(`${variantLabel} repeats answer ${answer}`);
          variantAnswers.add(answer);
        }
      }
      if (hub.queryVariants && hub.queryVariants.length < 3) errors.push(`${label} needs at least three query variants when variants are provided`);
      if (!Array.isArray(hub.relatedQueries) || hub.relatedQueries.length < 2) errors.push(`${label} needs at least two related queries`);
    }
  }

  if (!Array.isArray(publications) || publications.length === 0) {
    errors.push("data/publications.json must define at least one supported publication");
  } else {
    for (const [index, publication] of publications.entries()) {
      const label = `publications[${index}]`;
      for (const field of ["name", "route", "title", "heading", "description", "titleSuffix", "linkLabel"]) {
        if (!publication[field]) errors.push(`${label} is missing ${field}`);
      }
      if (!/^\/[a-z0-9-]+\/$/.test(publication.route ?? "")) errors.push(`${label} has an invalid route`);
      if (!Number.isInteger(publication.maxPerDate) || publication.maxPerDate < 1) errors.push(`${label} maxPerDate must be a positive integer`);
      if (publicationNames.has(publication.name)) errors.push(`duplicate publication name: ${publication.name}`);
      if (publicationRoutes.has(publication.route)) errors.push(`duplicate publication route: ${publication.route}`);
      publicationNames.add(publication.name);
      publicationRoutes.add(publication.route);
    }
  }

  for (const [index, clue] of clues.entries()) {
    const label = `clues[${index}]`;
    for (const field of REQUIRED_CLUE_FIELDS) {
      if (clue[field] === undefined || clue[field] === "") errors.push(`${label} is missing ${field}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clue.slug ?? "")) errors.push(`${label} has an invalid slug`);
    if (clueSlugs.has(clue.slug)) errors.push(`duplicate clue slug: ${clue.slug}`);
    clueSlugs.add(clue.slug);
    if (!/^[A-Z]+$/.test(clue.answer ?? "")) errors.push(`${label} answer must contain uppercase A-Z only`);
    if ((clue.explanation ?? "").length < 55) errors.push(`${label} explanation is too short to be useful`);
    if ((clue.hint ?? "").toUpperCase().includes(clue.answer ?? "__NO_ANSWER__")) {
      errors.push(`${label} hint reveals the answer`);
    }
    if (!Array.isArray(clue.tags) || clue.tags.length === 0) errors.push(`${label} needs at least one tag`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(clue.reviewedAt ?? "")) errors.push(`${label} reviewedAt must be YYYY-MM-DD`);
    if (clue.publication) {
      if (!publicationNames.has(clue.publication)) errors.push(`${label} uses unsupported publication ${clue.publication}`);
      if (!clue.sourceDate || !/^\d{4}-\d{2}-\d{2}$/.test(clue.sourceDate)) errors.push(`${label} with a publication needs sourceDate in YYYY-MM-DD format`);
      if (!clue.clueNumber) errors.push(`${label} with a publication needs clueNumber`);
    }
  }

  const classroomSkills = new Set(["context-and-meaning", "word-structure", "academic-language", "science-vocabulary", "language-arts", "precision-and-revision"]);
  const classroomDifficulties = new Set(["introductory", "intermediate", "advanced"]);
  const classroomSlugs = new Set();
  if (!Array.isArray(classroomClues) || classroomClues.length < 5) {
    errors.push("classroomClues must contain at least five original reviewed clues");
  } else {
    for (const [index, clue] of classroomClues.entries()) {
      const label = `classroomClues[${index}]`;
      for (const field of REQUIRED_CLUE_FIELDS) {
        if (clue[field] === undefined || clue[field] === "") errors.push(`${label} is missing ${field}`);
      }
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clue.slug ?? "")) errors.push(`${label} has an invalid slug`);
      if (classroomSlugs.has(clue.slug) || clueSlugs.has(clue.slug)) errors.push(`duplicate classroom clue slug: ${clue.slug}`);
      classroomSlugs.add(clue.slug);
      if (!/^[A-Z]+$/.test(clue.answer ?? "")) errors.push(`${label} answer must contain uppercase A-Z only`);
      if ((clue.explanation ?? "").length < 55) errors.push(`${label} explanation is too short to be useful`);
      if ((clue.hint ?? "").toUpperCase().includes(clue.answer ?? "__NO_ANSWER__")) errors.push(`${label} hint reveals the answer`);
      if (!Array.isArray(clue.tags) || clue.tags.length < 2) errors.push(`${label} needs at least two tags`);
      if (!Array.isArray(clue.gradeBands) || !clue.gradeBands.includes("6-8") || !clue.gradeBands.includes("9-12")) errors.push(`${label} must support grades 6-8 and 9-12`);
      if (!classroomSkills.has(clue.skill)) errors.push(`${label} has unsupported skill ${clue.skill}`);
      if (!classroomDifficulties.has(clue.difficulty)) errors.push(`${label} has unsupported difficulty ${clue.difficulty}`);
      if (clue.sourceKind !== "original-classroom") errors.push(`${label} must be original-classroom content`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clue.reviewedAt ?? "")) errors.push(`${label} reviewedAt must be YYYY-MM-DD`);
    }
  }

  if (config?.contentUpdatedAt && !/^\d{4}-\d{2}-\d{2}$/.test(config.contentUpdatedAt)) {
    errors.push("contentUpdatedAt must be YYYY-MM-DD");
  }
  if (config?.indexNowKey && !/^[a-f0-9]{32,128}$/i.test(config.indexNowKey)) {
    errors.push("indexNowKey must be 32-128 hexadecimal characters");
  }
  if (config?.analytics?.pageview) {
    const pageview = config.analytics.pageview;
    try {
      if (pageview.domain !== new URL(config.siteUrl).hostname) errors.push("Pageview analytics domain must match siteUrl hostname");
      if (new URL(pageview.scriptSrc).protocol !== "https:") errors.push("Pageview analytics script must use HTTPS");
    } catch {
      errors.push("Pageview analytics requires a valid domain and absolute scriptSrc URL");
    }
  }

  for (const [index, answer] of answers.entries()) {
    const label = `answers[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(answer.slug ?? "")) errors.push(`${label} has an invalid slug`);
    if (answerSlugs.has(answer.slug)) errors.push(`duplicate answer slug: ${answer.slug}`);
    answerSlugs.add(answer.slug);
    if (!/^[A-Z]+$/.test(answer.answer ?? "")) errors.push(`${label} answer must contain uppercase A-Z only`);
    for (const field of ["meaning", "crosswordUse", "whyCommon", "otherMeanings"]) {
      if ((answer[field] ?? "").length < 35) errors.push(`${label} ${field} is too short`);
    }
    if (!Array.isArray(answer.cluePatterns) || answer.cluePatterns.length < 3) {
      errors.push(`${label} needs at least three clue patterns`);
    }
  }

  for (const answer of answers) {
    for (const related of answer.related ?? []) {
      if (!answerSlugs.has(related)) errors.push(`answer ${answer.slug} links to unknown related answer ${related}`);
    }
  }

  for (const [index, type] of clueTypes.entries()) {
    const label = `clueTypes[${index}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(type.slug ?? "")) errors.push(`${label} has an invalid slug`);
    if (typeSlugs.has(type.slug)) errors.push(`duplicate clue type slug: ${type.slug}`);
    typeSlugs.add(type.slug);
    for (const field of ["title", "summary", "exampleClue", "exampleAnswer", "explanation", "advice"]) {
      if (!type[field]) errors.push(`${label} is missing ${field}`);
    }
    if (!Array.isArray(type.signals) || type.signals.length < 3) errors.push(`${label} needs at least three signals`);
  }

  return { errors, warnings };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const [clues, answers, clueTypes, publications, clueHubs, classroomClues, config] = await Promise.all([
    readJson("data/clues.json"),
    readJson("data/answers.json"),
    readJson("data/clue-types.json"),
    readJson("data/publications.json"),
    readJson("data/clue-hubs.json"),
    readJson("data/classroom-clues.json"),
    readJson("site.config.json")
  ]);
  const result = validateContent({ clues, answers, clueTypes, publications, clueHubs, classroomClues, config });
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  if (result.errors.length) {
    for (const error of result.errors) console.error(`error: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Content valid: ${clues.length} clues, ${classroomClues.length} classroom clues, ${answers.length} answers, ${clueTypes.length} clue types.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
