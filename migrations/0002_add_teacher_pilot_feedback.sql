ALTER TABLE feedback RENAME TO feedback_legacy;

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'wrong-answer', 'missing-answer', 'unclear-explanation',
    'incorrect-definition', 'technical-problem', 'teacher-pilot', 'other'
  )),
  page_path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('solver', 'explain', 'clue', 'answer', 'hub', 'general', 'classroom')),
  clue TEXT,
  answer TEXT,
  message TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'closed')),
  educator_role TEXT,
  grade_band TEXT,
  sessions_completed INTEGER,
  skill_used TEXT,
  match_rating INTEGER,
  usefulness_rating INTEGER,
  reuse_intent TEXT
);

INSERT INTO feedback (
  id, created_at, issue_type, page_path, mode, clue, answer, message, email, status
)
SELECT id, created_at, issue_type, page_path, mode, clue, answer, message, email, status
FROM feedback_legacy;

DROP TABLE feedback_legacy;

CREATE INDEX idx_feedback_status_created
  ON feedback (status, created_at DESC);

CREATE INDEX idx_feedback_teacher_pilot
  ON feedback (issue_type, sessions_completed, created_at DESC);
