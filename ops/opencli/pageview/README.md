# Pageview OpenCLI adapter

This project keeps a reviewable copy of the private OpenCLI adapter installed under
`~/.opencli/clis/pageview/`. The adapter reads the authenticated Pageview/Plausible
Community Edition dashboard through the approved `girl` Chrome profile.

It never stores browser cookies, login tokens, account email addresses, or dashboard
HTML in Git.

## Commands

```bash
opencli --profile girl pageview summary \
  --site crosswordcluetutor.com --period 7d -f json

opencli --profile girl pageview summary \
  --site crosswordcluetutor.com --period custom \
  --from 2026-08-25 --to 2026-08-28 -f json

opencli --profile girl pageview breakdown \
  --site crosswordcluetutor.com --period 7d \
  --dimension source --limit 10 -f json

opencli --profile girl pageview breakdown \
  --site crosswordcluetutor.com --period 7d \
  --dimension entryPage --limit 10 -f json
```

Supported breakdown dimensions are `source`, `page`, and `entryPage`. Pageview does
not currently expose a returning-visitors value in this dashboard, so the adapter does
not manufacture one.

## Install local copy

```bash
cp ops/opencli/pageview/summary.js ~/.opencli/clis/pageview/summary.js
cp ops/opencli/pageview/breakdown.js ~/.opencli/clis/pageview/breakdown.js
cp ops/opencli/pageview/verify/*.json ~/.opencli/sites/pageview/verify/
```

All OpenCLI commands must run in the host permission layer. Do not diagnose browser
bridge health from sandbox loopback errors.
