# Pageview OpenCLI adapter strategy

Strategy: `UI_SELECTOR`

Contract: `visible-ui`

Evidence:

- Observed state: the authenticated Plausible Community Edition dashboard renders
  summary metrics with stable IDs (`#visitors`, `#visits`, `#pageviews`,
  `#views_per_visit`, `#bounce_rate`, and `#visit_duration`).
- Breakdown rows are user-visible links whose filter keys identify `source`, `page`,
  and `entry_page`; each row exposes its visitor count in the same visible row.
- Auth source: the user-approved `girl` Chrome profile. No cookie, token, email address,
  or other credential is stored in the adapter.
- Replay result: the custom date URL remained on the requested site dashboard and
  returned non-empty summary metrics.
- Typed error path: invalid arguments use `ArgumentError`, missing access uses
  `AuthRequiredError`, empty reports use `EmptyResultError`, and DOM/navigation drift
  uses `CommandExecutionError`.

The adapter intentionally does not depend on Plausible's internal LiveView traffic or
an undocumented API. The visible dashboard is the more stable product contract.
