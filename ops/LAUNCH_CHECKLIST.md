# 14-day launch checklist

## External setup required once

- [ ] Register a production domain and replace `https://cluetutor.example`. `crosswordcluetutor.com` returned no registry match on 2026-08-19, but availability must be rechecked at purchase time.
- [ ] Choose hosting and connect the GitHub repository.
- [ ] Enable HTTPS and redirect every alternate host to one canonical host.
- [ ] Verify a domain property in Google Search Console.
- [ ] Submit `/sitemap.xml` and `/feed.xml` in Search Console.
- [ ] Verify the site in Bing Webmaster Tools.
- [ ] Generate an IndexNow key and expose `/<key>.txt` through the production build.
- [ ] Enable traffic measurement through hosting analytics or a privacy-appropriate analytics provider.

## Definition of the traffic target

Primary launch metric: at least 100 human sessions during the first 14 complete days after production deployment. Secondary metrics: Google organic clicks, indexed explainer pages, and returning users.

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
