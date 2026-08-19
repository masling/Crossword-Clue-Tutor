# 14-day launch checklist

## External setup required once

- [x] Register `crosswordcluetutor.com` and configure it as the canonical production domain.
- [x] Deploy the production build to the `crossword-clue-tutor` Cloudflare Pages project.
- [x] Automatically deploy the verified `main` artifact through GitHub Actions.
- [x] Enable HTTPS and use `https://crosswordcluetutor.com` as the canonical host.
- [x] Verify `sc-domain:crosswordcluetutor.com` in Google Search Console.
- [x] Submit `/sitemap.xml` and `/feed.xml` in Search Console.
- [x] Verify the site in Bing Webmaster Tools and submit `/sitemap.xml`.
- [x] Generate an IndexNow key, expose `/<key>.txt`, and submit the first 14 production URLs.
- [x] Enable Cloudflare Web Analytics with automatic RUM beacon injection.
- [x] Add Pageview analytics with the production domain configuration.

## Definition of the traffic target

Primary launch metric: at least 100 human sessions during the first 14 complete days after production deployment. Operator launch-QA visits are recorded separately and excluded. Secondary metrics: Google organic clicks, indexed explainer pages, and returning users.

## Daily measurements

- New reviewed pages published
- New URLs submitted to IndexNow
- URLs requested through Google URL Inspection
- Indexed pages reported by Google and Bing
- Search impressions and clicks
- Total human sessions
- Top landing pages and queries

## Stop/go checks

- Day 3: homepage and sitemap fetched; at least five clue pages discovered.
- Day 7: at least 25 fresh pages published and some search impressions visible.
- Day 10: double down on queries already earning impressions.
- Day 14: 100 sessions achieved, or document the exact discovery/indexing/CTR constraint before changing the content strategy.
