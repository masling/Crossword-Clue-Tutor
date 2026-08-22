import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outreachRoot = path.resolve("ops/outreach");
const projectUrl = "https://crosswordcluetutor.com/";
const placeholderPattern = /\[(?:name|email|link|insert|todo)[^\]]*\]|\b(?:TODO|TBD)\b/i;

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);
}

export async function validateOutreach() {
  const errors = [];
  const [manifest, hubs, answers] = await Promise.all([
    readJson(path.join(outreachRoot, "manifest.json")),
    readJson(path.resolve("data/clue-hubs.json")),
    readJson(path.resolve("data/answers.json"))
  ]);
  const candidateCount = hubs.reduce((total, hub) => total + hub.answers.length, 0);

  if (!new Set(["outreach_drafts_not_sent", "emails_sent_forms_pending", "outreach_sent"]).has(manifest.status)) errors.push("manifest has an unsupported outreach status");
  if (!validEmail(manifest.sender?.email)) errors.push("manifest sender email is invalid");
  if (manifest.sender?.email !== "hello@crosswordcluetutor.com") errors.push("manifest sender must use the verified domain address");
  if (manifest.datasetEvidence?.clueFamilies !== hubs.length) errors.push("manifest clue-family count is stale");
  if (manifest.datasetEvidence?.reviewedCandidates !== candidateCount) errors.push("manifest candidate count is stale");
  if (manifest.datasetEvidence?.meaningEntries !== answers.length) errors.push("manifest meaning-entry count is stale");

  const ids = new Set();
  for (const item of manifest.items ?? []) {
    if (!item.id || ids.has(item.id)) errors.push(`duplicate or missing outreach id: ${item.id ?? "unknown"}`);
    ids.add(item.id);
    if (item.approvalRequired !== true) errors.push(`${item.id} must require approval`);

    if (item.channel === "email") {
      if (!validEmail(item.recipient)) errors.push(`${item.id} recipient is invalid`);
      if (!item.subject || /[\r\n]/.test(item.subject)) errors.push(`${item.id} subject is invalid`);
      if (!new Set(["ready_for_review", "local_draft_ready", "sent"]).has(item.gmailDraftStatus)) errors.push(`${item.id} has an unsupported email status`);
      if (item.gmailDraftStatus === "ready_for_review" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.gmailDraftCreatedAt ?? "")) errors.push(`${item.id} Gmail draft timestamp is invalid`);
      if (item.gmailDraftStatus === "local_draft_ready" && item.gmailDraftCreatedAt !== null) errors.push(`${item.id} local draft must not claim a Gmail creation time`);
      if (item.gmailDraftStatus === "sent" && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.sentAt ?? "") || !/^[a-f0-9]+$/.test(item.messageId ?? ""))) errors.push(`${item.id} sent evidence is invalid`);
      if (item.gmailDraftStatus !== "sent" && item.sentAt !== null) errors.push(`${item.id} is unexpectedly marked sent`);
      if (item.duplicateSentAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.duplicateSentAt) || !/^[a-f0-9]+$/.test(item.duplicateMessageId ?? ""))) errors.push(`${item.id} duplicate-send evidence is invalid`);
      const body = await readFile(path.join(outreachRoot, item.textFile), "utf8");
      if (body.length < 100 || body.length > 2_500) errors.push(`${item.id} body length is outside the reviewed range`);
      if (placeholderPattern.test(body)) errors.push(`${item.id} contains an unresolved placeholder`);
      if (!body.includes(projectUrl)) errors.push(`${item.id} does not disclose the project URL`);
      if (!/Full disclosure:|disclose that I maintain/.test(body)) errors.push(`${item.id} is missing ownership disclosure`);
    } else if (item.channel === "form") {
      if (!item.formUrl?.startsWith("https://")) errors.push(`${item.id} form URL is invalid`);
      if (!new Set(["pending", "submitted_no_receipt", "submitted_user_confirmed", "blocked_recaptcha"]).has(item.submissionStatus ?? "pending")) errors.push(`${item.id} has an unsupported form status`);
      if (new Set(["submitted_no_receipt", "submitted_user_confirmed"]).has(item.submissionStatus) && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.submittedAt ?? "")) errors.push(`${item.id} submitted evidence is invalid`);
      if (item.submissionStatus === "blocked_recaptcha" && (item.submittedAt !== null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(item.lastAttemptAt ?? ""))) errors.push(`${item.id} blocked-form evidence is invalid`);
      if ((item.submissionStatus ?? "pending") === "pending" && item.submittedAt !== null) errors.push(`${item.id} is unexpectedly marked submitted`);
      const payload = await readJson(path.join(outreachRoot, item.payloadFile));
      if (!validEmail(payload.email)) errors.push(`${item.id} form email is invalid`);
      if (placeholderPattern.test(JSON.stringify(payload))) errors.push(`${item.id} form contains an unresolved placeholder`);
      if (!JSON.stringify(payload).includes("crosswordcluetutor.com")) errors.push(`${item.id} form omits the project domain`);
    } else {
      errors.push(`${item.id} has an unsupported channel`);
    }
  }

  return { errors, items: manifest.items?.length ?? 0, emailItems: manifest.items?.filter((item) => item.channel === "email").length ?? 0, formItems: manifest.items?.filter((item) => item.channel === "form").length ?? 0, candidateCount, clueFamilies: hubs.length, meaningEntries: answers.length };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const result = await validateOutreach();
  if (result.errors.length) {
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Outreach check passed: ${result.emailItems} email drafts and ${result.formItems} form payloads; ${result.candidateCount} candidates across ${result.clueFamilies} clue families and ${result.meaningEntries} meaning entries.`);
  }
}
