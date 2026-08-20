CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'wrong-answer',
    'missing-answer',
    'unclear-explanation',
    'incorrect-definition',
    'technical-problem',
    'other'
  )),
  page_path TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('solver', 'explain', 'clue', 'answer', 'hub', 'general')),
  clue TEXT,
  answer TEXT,
  message TEXT NOT NULL,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_status_created
  ON feedback (status, created_at DESC);
