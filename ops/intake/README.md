# Fresh clue intake files

Create one JSON file per publication/date batch:

```json
{
  "clues": [
    {
      "slug": "descriptive-slug-publication",
      "clue": "Exact clue text",
      "answer": "ANSWER",
      "date": "2026-08-19",
      "popularity": 100,
      "definition": "The answer sense used by this clue.",
      "explanation": "An original explanation of why this exact answer fits this exact clue.",
      "partOfSpeech": "noun",
      "tags": ["topic", "mechanism"],
      "clueType": "direct-definition",
      "signal": "The grammatical or wordplay signal in the clue.",
      "hint": "A useful hint that does not contain the answer.",
      "reviewedAt": "2026-08-19",
      "publication": "Publication name",
      "sourceDate": "2026-08-19",
      "clueNumber": "1-Across"
    }
  ]
}
```

Use `date` for the Clue Tutor publishing/clinic date and `sourceDate` for the original puzzle date.

`publication` must match a supported name in `data/publications.json`. Adding a
source to that file enables intake and a future hub, but the hub remains unpublished
until the first reviewed clue batch exists.
