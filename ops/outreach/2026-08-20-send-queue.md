# Outreach send queue — 2026-08-20

No message or form has been submitted. Each item still requires action-time approval.
The domain sender, inbound route, and SPF/DKIM/DMARC delivery checks are verified. The
two email items now exist as Gmail drafts from `hello@crosswordcluetutor.com` and are
ready for review; neither has been sent.

The active Cloudflare-inbound/Zoho-outbound setup is documented in `../EMAIL_SETUP.md`.
Gmail Send mail as is a temporary manual interface through 2026, not a separate relay.
`manifest.json` is the machine-checked source of truth for recipient, subject, message
file, form payload, and unsent status.

## Ready 1 — OneLook Dictionary Search

- Channel: official feedback form linked from OneLook's dictionary-inclusion guidelines.
- Evidence: the FAQ explicitly asks owners of missing dictionary sites to tell OneLook;
  its requirements are free access, unique and accurate content, commercial neutrality,
  legal publication rights, and a high content-to-ads ratio.
- Asset: `/crosswordese/` plus `/assets/onelook-dictionary.txt`, with one absolute link
  per headword as recommended in the official webmaster format.
- Payload: `forms/onelook-dictionary.json`.
- Expected value: durable discovery links from a word-search service with a dedicated
  crossword mode and more than 1,000 indexed dictionaries.

## Ready 2 — Daily Crossword Links

- Channel: email to `crosswordlinks@gmail.com`
- Evidence: its current About/Support pages invite tips, guest essays, and new sites.
- Asset: `/research/ambiguous-crossword-clues/` with JSON and CSV downloads
- Message: `messages/daily-crossword-links.txt`
- Dry-run: `npm run outreach:send -- --outreach-id daily-crossword-links`
- Gmail: draft created and ready for review on 2026-08-20.
- Expected value: the most relevant direct community audience in this queue.

## Ready 3 — XWord Blog

- Channel: email to `info@xwordinfo.com`
- Evidence: its current Home page explicitly says it is interested in guest submissions;
  its Contact page publishes this address.
- Asset: JSON/CSV dataset plus `/guides/answer-length-and-crossings/`
- Message: `messages/xword-blog.txt`
- Dry-run: `npm run outreach:send -- --outreach-id xword-blog`
- Gmail: draft created and ready for review on 2026-08-20.
- Expected value: editorial link and credibility if the proposed essay is accepted.

## Ready 4 — American Crossword Puzzle Tournament Links

- Channel: public “Add a Link” Zoho form linked from the current ACPT Links page.
- Category: `Dictionaries and Solving aids`.
- Required fields and prepared copy: `forms/acpt-links.json`.
- Expected value: durable resource-page referral and backlink if approved.

## Hold

- Crossword Nexus: a public email exists, but the current resources page does not invite
  outside listings. A cold backlink request would be weak.
- Crossword Resources: directory fit is strong, but no public contact route was found.
- Big Dave's Crossword Blog: reciprocal-link requirement conflicts with the current
  editorial links policy.
- Data Is Plural: the dataset fit is credible, but its public archive currently ends in
  August 2025 and no current submission route was verified; revisit after activity resumes.
