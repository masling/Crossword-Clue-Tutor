import { readFile, writeFile } from "node:fs/promises";

const selected = [
  ["LIFTS", "lifts", "lifts"], ["MLS", "em-el-ESS", "mls"], ["MESS", "mess", "mess"],
  ["COTS", "kots", "cots"], ["DOTS", "dots", "dots"], ["SALT", "sawlt", "salt"],
  ["SPOON", "spoon", "spoon"], ["PLUTO", "PLOO-toh", "pluto"], ["LATTE", "LAH-tay", "latte"],
  ["TEARS", "teerz", "tears"], ["SPLIT", "split", "split"], ["PLANE", "playn", "plane"],
  ["OTTER", "AH-ter", "otter"], ["DIVESIN", "dives IN", "dives-in"], ["EGO", "EE-goh", "ego"],
  ["GORMAN", "GOR-muhn", "gorman"], ["LAMA", "LAH-muh", "lama"], ["RABBITSTEW", "RAB-it stoo", "rabbit-stew"],
  ["ASIA", "AY-zhuh", "asia"], ["RICCI", "REE-chee", "ricci"], ["ASHE", "ash", "ashe"],
  ["HAWKE", "hawk", "hawke"], ["LAB", "lab", "lab"], ["REIKI", "RAY-kee", "reiki"],
  ["TUPACSHAKUR", "TOO-pahk shuh-KOOR", "tupac-shakur"], ["AMBERALES", "AM-ber aylz", "amber-ales"],
  ["INEXTREMIS", "in ek-STREE-mis", "in-extremis"], ["LEETSPEAK", "leet-speek", "leetspeak"],
  ["OFFTHEGRID", "off thuh grid", "off-the-grid"], ["ORIGAMI", "or-ih-GAH-mee", "origami"],
  ["NOKIA", "NOH-kee-uh", "nokia"], ["SCALY", "SKAY-lee", "scaly"], ["DUA", "DOO-uh", "dua"],
  ["ERAS", "AIR-uhz", "eras"], ["FORWARDTHINKING", "FOR-werd THINK-ing", "forward-thinking"],
  ["LINUS", "LY-nus", "linus"], ["MONAE", "moh-NAY", "monae"], ["NASA", "NASS-uh", "nasa"],
  ["CONTEXTCLUES", "KON-tekst klooz", "context-clues"], ["HANGMAN", "HANG-man", "hangman"],
  ["MEATBALLSUB", "MEET-bawl sub", "meatball-sub"], ["NOSPOILERS", "noh SPOY-lerz", "no-spoilers"],
  ["QUASIMODO", "kwah-zih-MOH-doh", "quasimodo"], ["LILTS", "lilts", "lilts"],
  ["MADISON", "MAD-ih-suhn", "madison"], ["AGGRO", "AG-roh", "aggro"], ["BOPIT", "BOP it", "bop-it"],
  ["ETSY", "ET-see", "etsy"], ["HADES", "HAY-deez", "hades"], ["SPHERE", "sfeer", "sphere"],
  ["TURNOFPHRASE", "turn uhv frayz", "turn-of-phrase"], ["AREPA", "uh-RAY-puh", "arepa"],
  ["CHARACTERARCS", "KAIR-ik-ter arks", "character-arcs"], ["EGGYOLK", "eg yohk", "egg-yolk"],
  ["EREADER", "EE-ree-der", "e-reader"], ["GETSTHEAX", "gets thee aks", "gets-the-ax"],
  ["KAY", "kay", "kay"], ["PANDA", "PAN-duh", "panda"], ["PUTINREVERSE", "put in ree-VURS", "put-in-reverse"],
  ["ROONEY", "ROO-nee", "rooney"], ["SHELL", "shel", "shell"], ["LIGHT", "lite", "light"],
  ["USENET", "YOOZ-net", "usenet"], ["NEWSMEDIA", "nooz MEE-dee-uh", "news-media"]
];

const [answers, clues] = await Promise.all([
  readJson("data/answers.json"),
  readJson("data/clues.json")
]);

const byAnswer = new Map(answers.map((profile) => [profile.answer, profile]));
const clueByAnswer = new Map(
  [...clues]
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((clue) => [clue.answer, clue])
);

const additions = [];
for (const [answer, pronunciation, slug] of selected) {
  if (byAnswer.has(answer)) continue;
  const clue = clueByAnswer.get(answer);
  if (!clue) throw new Error(`Missing reviewed clue for ${answer}`);
  const meaning = ensureLength(clue.definition, `This is the reviewed sense documented for ${answer}.`);
  additions.push({
    slug,
    answer,
    pronunciation,
    partOfSpeech: clue.partOfSpeech,
    meaning,
    crosswordUse: ensureLength(`${answer} appears in the reviewed clue “${clue.clue}.” ${clue.signal}`, "Answer length and crossings confirm the intended form."),
    whyCommon: `This teaching profile is included because ${answer} has a verified clue relationship and demonstrates how wording, grammar, length, or wordplay narrows a fill.`,
    cluePatterns: [
      clue.clue,
      clue.hint,
      `${answer.length}-letter ${humanize(clue.clueType)} answer confirmed by crossings`
    ],
    otherMeanings: ensureLength(`${clue.explanation} A different clue may target another sense, so solvers should still confirm the grammar and crossing letters.`, "Context decides the intended meaning."),
    related: []
  });
}

if (additions.length === 0) {
  console.log(`Added 0 reviewed answer profiles; total ${answers.length}.`);
  process.exit(0);
}

const merged = [...answers, ...additions.sort((a, b) => a.answer.localeCompare(b.answer))];
if (merged.length !== 100) throw new Error(`Expected exactly 100 answer profiles, found ${merged.length}`);
await writeFile("data/answers.json", `${JSON.stringify(merged, null, 2)}\n`);
console.log(`Added ${additions.length} reviewed answer profiles; total ${merged.length}.`);

function ensureLength(value, suffix) {
  const clean = String(value ?? "").trim();
  return clean.length >= 35 ? clean : `${clean} ${suffix}`.trim();
}

function humanize(value) {
  return String(value ?? "crossword").replaceAll("-", " ");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
