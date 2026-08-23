# Data boundaries

This repository separates public editorial build inputs from private operational and
user data.

## Public repository data

The following may be committed because they are required to build or review the public
product:

- source code and tests;
- schema-only database migrations;
- independently written editorial fields in `data/`;
- selected clue excerpts needed to identify the reviewed relationship;
- aggregate, non-personal operational evidence;
- sanitized intake files that contain no accounts, credentials, or user submissions.

Public editorial JSON is not a copy of the production feedback database. It is reviewed
source content used to generate public pages.

## Local-only or service-only data

Never commit:

- D1 rows or database exports;
- feedback messages and optional contact emails;
- mailbox contents, address books, or SMTP credentials;
- Cloudflare, GitHub, Google, Bing, Pageview, or Zoho secrets;
- raw analytics event exports or IP-level logs;
- SQLite databases, WAL/SHM files, dumps, or temporary migration copies;
- unreviewed private research containing personal data.
- complete publisher clue snapshots retained for local source-frequency and tool research.

Place local copies under `.local/`, `private-data/`, `exports/`, `ops/private/`, or
`ops/exports/`. These paths and common database file extensions are ignored by Git.

The USA TODAY source adapter stores complete public clue text only in
`.local/source-intelligence.sqlite`. This database is for private frequency, repetition,
entity, and tool-design analysis. It is never read by the static build, committed,
uploaded as a GitHub artifact, or exposed by the site. The adapter does not request or
store the publisher's hidden `solution` field.

## Runtime boundary

The static build reads reviewed files from `data/` and never queries the feedback D1
database. The feedback API writes user reports to D1 at runtime; those rows are not
serialized into `dist/`, Sitemap files, feeds, Git commits, or GitHub Actions artifacts.

Secrets must be injected through environment variables, Cloudflare bindings, or GitHub
Actions Secrets. A public repository is never a secret store.
