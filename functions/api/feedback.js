const ISSUE_TYPES = new Set([
  "wrong-answer",
  "missing-answer",
  "unclear-explanation",
  "incorrect-definition",
  "technical-problem",
  "teacher-pilot",
  "other"
]);

const MODES = new Set(["solver", "explain", "clue", "answer", "hub", "general", "classroom"]);
const EDUCATOR_ROLES = new Set(["classroom-teacher", "tutor-specialist", "homeschool-educator", "school-leader", "other-educator"]);
const GRADE_BANDS = new Set(["6-8", "9-12", "mixed-6-12"]);
const REUSE_INTENTS = new Set(["yes", "maybe", "no"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers }
  });
}

function clean(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!origin || origin !== requestUrl.origin) return json({ ok: false, error: "Invalid request origin." }, 403);

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ ok: false, error: "Expected JSON." }, 415);

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) return json({ ok: false, error: "Feedback is too large." }, 413);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  if (clean(body.website, 200)) return json({ ok: true }, 201);

  const issueType = clean(body.issueType, 40);
  const mode = clean(body.mode, 20) || "general";
  const pagePath = clean(body.pagePath, 1_000);
  const clue = clean(body.clue, 300) || null;
  const answer = clean(body.answer, 50).toUpperCase() || null;
  const message = clean(body.message, 2_000);
  const email = clean(body.email, 254).toLowerCase() || null;
  const educatorRole = clean(body.educatorRole, 40) || null;
  const gradeBand = clean(body.gradeBand, 20) || null;
  const sessionsCompleted = Number.parseInt(clean(body.sessionsCompleted, 4), 10);
  const skillUsed = clean(body.skillUsed, 80) || null;
  const matchRating = Number.parseInt(clean(body.matchRating, 2), 10);
  const usefulnessRating = Number.parseInt(clean(body.usefulnessRating, 2), 10);
  const reuseIntent = clean(body.reuseIntent, 20) || null;

  if (!ISSUE_TYPES.has(issueType)) return json({ ok: false, error: "Choose a valid feedback type." }, 400);
  if (!MODES.has(mode)) return json({ ok: false, error: "Invalid feedback context." }, 400);
  if (!pagePath.startsWith("/") || pagePath.startsWith("//")) return json({ ok: false, error: "Invalid page context." }, 400);
  if (message.length < 10) return json({ ok: false, error: "Please add at least 10 characters of detail." }, 400);
  if (email && !EMAIL_PATTERN.test(email)) return json({ ok: false, error: "Enter a valid email or leave it blank." }, 400);
  if (issueType === "teacher-pilot") {
    if (mode !== "classroom") return json({ ok: false, error: "Invalid teacher-pilot context." }, 400);
    if (!EDUCATOR_ROLES.has(educatorRole)) return json({ ok: false, error: "Choose your educator role." }, 400);
    if (!GRADE_BANDS.has(gradeBand)) return json({ ok: false, error: "Choose a grade band." }, 400);
    if (!Number.isInteger(sessionsCompleted) || sessionsCompleted < 1 || sessionsCompleted > 20) return json({ ok: false, error: "Enter the number of completed sessions." }, 400);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillUsed ?? "")) return json({ ok: false, error: "Choose the skill pack used." }, 400);
    if (!Number.isInteger(matchRating) || matchRating < 1 || matchRating > 5) return json({ ok: false, error: "Rate reviewed-answer matching from 1 to 5." }, 400);
    if (!Number.isInteger(usefulnessRating) || usefulnessRating < 1 || usefulnessRating > 5) return json({ ok: false, error: "Rate classroom usefulness from 1 to 5." }, 400);
    if (!REUSE_INTENTS.has(reuseIntent)) return json({ ok: false, error: "Choose whether you would use it again." }, 400);
  }
  if (!env.FEEDBACK_DB) return json({ ok: false, error: "Feedback storage is temporarily unavailable." }, 503);

  const id = crypto.randomUUID();
  try {
    await env.FEEDBACK_DB.prepare(`
      INSERT INTO feedback (
        id, issue_type, page_path, mode, clue, answer, message, email,
        educator_role, grade_band, sessions_completed, skill_used,
        match_rating, usefulness_rating, reuse_intent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, issueType, pagePath, mode, clue, answer, message, email,
      issueType === "teacher-pilot" ? educatorRole : null,
      issueType === "teacher-pilot" ? gradeBand : null,
      issueType === "teacher-pilot" ? sessionsCompleted : null,
      issueType === "teacher-pilot" ? skillUsed : null,
      issueType === "teacher-pilot" ? matchRating : null,
      issueType === "teacher-pilot" ? usefulnessRating : null,
      issueType === "teacher-pilot" ? reuseIntent : null
    ).run();
  } catch (error) {
    console.error("feedback insert failed", error);
    return json({ ok: false, error: "Feedback could not be saved. Please try again." }, 500);
  }

  return json({ ok: true, id }, 201);
}

export function onRequest() {
  return json({ ok: false, error: "Method not allowed." }, 405, { Allow: "POST" });
}
