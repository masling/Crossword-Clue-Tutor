import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DAY_MS = 86_400_000;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1_000;

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function latestTransmissionAt(item) {
  return [item.sentAt, item.duplicateSentAt]
    .filter(validDate)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function singaporeIso(timestampMs) {
  return new Date(timestampMs + SINGAPORE_OFFSET_MS).toISOString().replace("Z", "+08:00");
}

export function buildFollowUpReport(manifest, { asOf = new Date().toISOString(), waitDays = 8 } = {}) {
  if (!validDate(asOf)) throw new Error("asOf must be a valid ISO timestamp");
  if (!Number.isInteger(waitDays) || waitDays < 7 || waitDays > 10) throw new Error("waitDays must be an integer from 7 through 10");

  const scheduled = [];
  const due = [];
  const suppressed = [];
  const asOfMs = Date.parse(asOf);

  for (const item of manifest.items ?? []) {
    if (item.channel !== "email" || item.gmailDraftStatus !== "sent") continue;
    const transmittedAt = latestTransmissionAt(item);
    if (!transmittedAt) continue;

    const suppressionReason = item.replyStatus || item.listingStatus
      ? "reply_or_listing_in_progress"
      : ["sent", "skipped", "do_not_contact"].includes(item.followUpStatus)
        ? `follow_up_${item.followUpStatus}`
        : null;
    if (suppressionReason) {
      suppressed.push({ id: item.id, target: item.target, transmittedAt, reason: suppressionReason });
      continue;
    }

    const dueAt = singaporeIso(Date.parse(transmittedAt) + waitDays * DAY_MS);
    const record = {
      id: item.id,
      target: item.target,
      recipient: item.recipient,
      transmittedAt,
      dueAt,
      daysUntilDue: Math.max(0, Math.ceil((Date.parse(dueAt) - asOfMs) / DAY_MS))
    };
    if (Date.parse(dueAt) <= asOfMs) due.push(record);
    else scheduled.push(record);
  }

  due.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  scheduled.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  suppressed.sort((a, b) => a.transmittedAt.localeCompare(b.transmittedAt));
  return {
    asOf,
    waitDays,
    policy: "One follow-up after 7–10 days; suppress any target with a reply, active listing, prior follow-up, skip, or do-not-contact status.",
    counts: { due: due.length, scheduled: scheduled.length, suppressed: suppressed.length },
    due,
    scheduled,
    suppressed
  };
}

export function parseArgs(argv) {
  const options = { asOf: new Date().toISOString(), waitDays: 8 };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--as-of" && value) options.asOf = value;
    else if (key === "--wait-days" && value) options.waitDays = Number(value);
    else throw new Error(`Unknown or incomplete option: ${key}`);
    index += 1;
  }
  return options;
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const manifest = JSON.parse(await readFile(path.resolve("ops/outreach/manifest.json"), "utf8"));
  console.log(JSON.stringify(buildFollowUpReport(manifest, parseArgs(process.argv.slice(2))), null, 2));
}
