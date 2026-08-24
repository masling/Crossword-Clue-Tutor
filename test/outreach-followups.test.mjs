import test from "node:test";
import assert from "node:assert/strict";
import { buildFollowUpReport, parseArgs } from "../scripts/outreach-followups.mjs";

const sent = (id, sentAt, extra = {}) => ({
  id,
  target: id,
  recipient: `${id}@example.com`,
  channel: "email",
  gmailDraftStatus: "sent",
  sentAt,
  ...extra
});

test("schedules one follow-up from the latest transmission", () => {
  const report = buildFollowUpReport({ items: [
    sent("due", "2026-08-20T09:00:00+08:00"),
    sent("duplicate", "2026-08-20T09:00:00+08:00", { duplicateSentAt: "2026-08-22T09:00:00+08:00" })
  ] }, { asOf: "2026-08-28T09:01:00+08:00", waitDays: 8 });

  assert.deepEqual(report.due.map((item) => item.id), ["due"]);
  assert.deepEqual(report.scheduled.map((item) => item.id), ["duplicate"]);
  assert.equal(report.scheduled[0].dueAt, "2026-08-30T09:00:00.000+08:00");
  assert.equal(report.scheduled[0].daysUntilDue, 2);
});

test("suppresses replies, listing work, prior follow-ups, and do-not-contact targets", () => {
  const report = buildFollowUpReport({ items: [
    sent("reply", "2026-08-20T09:00:00+08:00", { replyStatus: "received" }),
    sent("listing", "2026-08-20T09:00:00+08:00", { listingStatus: "pending_publication" }),
    sent("followed", "2026-08-20T09:00:00+08:00", { followUpStatus: "sent" }),
    sent("stop", "2026-08-20T09:00:00+08:00", { followUpStatus: "do_not_contact" })
  ] }, { asOf: "2026-09-01T09:00:00+08:00" });

  assert.equal(report.counts.due, 0);
  assert.equal(report.counts.suppressed, 4);
});

test("keeps the follow-up window inside the reviewed 7–10 day policy", () => {
  assert.deepEqual(parseArgs(["--as-of", "2026-08-24T09:00:00+08:00", "--wait-days", "9"]), {
    asOf: "2026-08-24T09:00:00+08:00",
    waitDays: 9
  });
  assert.throws(() => buildFollowUpReport({ items: [] }, { waitDays: 6 }), /7 through 10/);
  assert.throws(() => parseArgs(["--send"]), /Unknown or incomplete option/);
});
