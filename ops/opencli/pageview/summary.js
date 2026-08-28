import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const PERIODS = new Set(['day', '7d', '30d', 'month', '6mo', '12mo', 'custom']);

function reportUrl(args) {
  const site = String(args.site ?? 'crosswordcluetutor.com').trim().toLowerCase();
  const period = String(args.period ?? '7d').trim().toLowerCase();
  const from = String(args.from ?? '').trim();
  const to = String(args.to ?? '').trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) throw new ArgumentError('site must be a valid domain name');
  if (!PERIODS.has(period)) throw new ArgumentError(`period must be one of: ${[...PERIODS].join(', ')}`);
  if (period === 'custom') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new ArgumentError('custom period requires --from and --to in YYYY-MM-DD format');
    if (from > to) throw new ArgumentError('from must not be later than to');
  } else if (from || to) {
    throw new ArgumentError('--from and --to require --period custom');
  }
  const url = new URL(`https://app.pageview.app/${site}`);
  url.searchParams.set('period', period);
  if (period === 'custom') {
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
  }
  return { site, period, from, to, url };
}

cli({
  site: 'pageview',
  name: 'summary',
  description: 'Read Pageview/Plausible visitors, visits, pageviews, bounce rate, and duration for one site',
  access: 'read',
  example: 'opencli --profile girl pageview summary --site crosswordcluetutor.com --period 7d -f json',
  domain: 'app.pageview.app',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  args: [
    { name: 'site', type: 'string', default: 'crosswordcluetutor.com', help: 'Pageview site domain' },
    { name: 'period', type: 'string', default: '7d', choices: [...PERIODS], help: 'day / 7d / 30d / month / 6mo / 12mo / custom' },
    { name: 'from', type: 'string', required: false, help: 'Custom range start date (YYYY-MM-DD)' },
    { name: 'to', type: 'string', required: false, help: 'Custom range end date (YYYY-MM-DD)' },
  ],
  columns: ['site', 'range', 'uniqueVisitors', 'totalVisits', 'totalPageviews', 'viewsPerVisit', 'bounceRatePct', 'visitDurationSeconds', 'currentVisitors', 'sourceUrl'],
  func: async (page, args) => {
    const report = reportUrl(args);
    try {
      await page.goto(report.url.toString());
      await page.sleep(2);
    } catch (error) {
      throw new CommandExecutionError(`Pageview report navigation failed: ${error?.message || error}`);
    }
    const currentUrl = await page.getCurrentUrl();
    if (!currentUrl?.startsWith(`https://app.pageview.app/${report.site}`)) {
      if (/\/login|\/sites(?:\?|$)/.test(currentUrl ?? '')) throw new AuthRequiredError('app.pageview.app', `The selected profile is not authorized for ${report.site}`);
      throw new CommandExecutionError(`Pageview opened an unexpected URL: ${currentUrl ?? 'unknown'}`);
    }

    const result = await page.evaluate((payload) => {
      const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() || null;
      const compactNumber = (value) => {
        const match = String(value ?? '').replace(/,/g, '').trim().match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
        if (!match) return null;
        const scale = { k: 1e3, m: 1e6, b: 1e9 }[String(match[2] ?? '').toLowerCase()] ?? 1;
        return Number(match[1]) * scale;
      };
      const percentage = (value) => {
        const number = Number(String(value ?? '').replace('%', '').trim());
        return Number.isFinite(number) ? number : null;
      };
      const durationSeconds = (value) => {
        const source = String(value ?? '').trim().toLowerCase();
        if (!source) return null;
        let seconds = 0;
        for (const match of source.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*([hms])/g)) {
          const scale = match[2] === 'h' ? 3600 : match[2] === 'm' ? 60 : 1;
          seconds += Number(match[1]) * scale;
        }
        return seconds || null;
      };
      const rangeLabel = [...document.querySelectorAll('[role="button"] span')]
        .map((element) => element.textContent?.replace(/\s+/g, ' ').trim())
        .find((value) => value && /^(Today|Last |This |Custom)/i.test(value)) || payload.range;
      const realtimeLink = [...document.querySelectorAll('a[href*="period=realtime"]')]
        .find((element) => element.getClientRects().length > 0);
      const realtimeMatch = realtimeLink?.textContent?.replace(/,/g, '').match(/\d+(?:\.\d+)?[kmb]?/i);
      return {
        site: payload.site,
        range: rangeLabel,
        uniqueVisitors: compactNumber(text('#visitors')),
        totalVisits: compactNumber(text('#visits')),
        totalPageviews: compactNumber(text('#pageviews')),
        viewsPerVisit: Number(text('#views_per_visit')) || null,
        bounceRatePct: percentage(text('#bounce_rate')),
        visitDurationSeconds: durationSeconds(text('#visit_duration')),
        currentVisitors: compactNumber(realtimeMatch?.[0]),
        sourceUrl: location.href,
      };
    }, { site: report.site, range: report.period === 'custom' ? `${report.from}..${report.to}` : report.period });

    if (!result || [result.uniqueVisitors, result.totalVisits, result.totalPageviews].every((value) => value === null)) {
      throw new EmptyResultError('pageview summary', `No visible analytics metrics for ${report.site}`);
    }
    return [result];
  },
});
