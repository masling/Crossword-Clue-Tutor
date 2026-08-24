# Controlled teacher pilot evidence

## Completion rule

The 500-record corpus and engineering hold-out benchmark establish data readiness.
They do not establish classroom effectiveness.

The controlled pilot is complete only after at least five distinct educators:

1. complete two or more classroom sessions;
2. submit the structured teacher-pilot form;
3. provide an email that can be normalized and used to avoid counting the same
   educator more than once.

Anonymous reports remain useful qualitative evidence but do not count toward the
five-educator requirement. Email is used only to deduplicate the pilot count and,
when necessary, ask one clarification question. It is not added to a mailing list.

## Production evidence query

Run this read-only query against `crossword-clue-tutor-feedback`:

```sql
SELECT
  lower(email) AS educator,
  MAX(sessions_completed) AS sessions_completed,
  COUNT(*) AS reports,
  ROUND(AVG(match_rating), 2) AS average_match_rating,
  ROUND(AVG(usefulness_rating), 2) AS average_usefulness_rating,
  MAX(reuse_intent) AS latest_reuse_intent
FROM feedback
WHERE issue_type = 'teacher-pilot'
  AND email IS NOT NULL
  AND trim(email) <> ''
GROUP BY lower(email)
HAVING MAX(sessions_completed) >= 2
ORDER BY sessions_completed DESC, educator;
```

Do not export or commit email addresses. Record only aggregate counts and ratings in
`ops/launch-state.json`. Keep anonymous comments and any follow-up conversation out of
the public repository.

## Quality signals

- At least five verified educators with two sessions each.
- Reviewed-answer matching is reported separately from classroom usefulness.
- Confirmed incorrect-answer reports stay below 2% of reviewed classroom records used.
- Reuse intent and qualitative comments identify the next product changes.
- Teacher-written clue phrasings remain separate from engineering hold-out fixtures.
