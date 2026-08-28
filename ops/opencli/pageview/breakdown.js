import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const PERIODS = new Set(['day', '7d', '30d', 'month', '6mo', '12mo', 'custom']);
const DIMENSIONS = new Set(['source', 'page', 'entryPage']);

function reportUrl(args) {
  const site = String(args.site ?? 'crosswordcluetutor.com').trim().toLowerCase();
  const period = String(args.period ?? '7d').trim().toLowerCase();
  const from = String(args.from ?? '').trim();
  const to = String(args.to ?? '').trim();
  const dimension = String(args.dimension ?? 'source').trim();
  const limit = Number(args.limit ?? 10);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(site)) throw new ArgumentError('site must be a valid domain name');
  if (!PERIODS.has(period)) throw new ArgumentError(`period must be one of: ${[...PERIODS].join(', ')}`);
  if (!DIMENSIONS.has(dimension)) throw new ArgumentError(`dimension must be one of: ${[...DIMENSIONS].join(', ')}`);
  if (!Number.isInteger(limit) || limit <= 0) throw new ArgumentError('limit must be a positive integer');
  if (limit > 100) throw new ArgumentError('limit must be <= 100');
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
  return { site, period, from, to, dimension, limit, url };
}

cli({
  site: 'pageview',
  name: 'breakdown',
  description: 'Read Pageview/Plausible top sources, pages, or entry pages as structured rows',
  access: 'read',
  example: 'opencli --profile girl pageview breakdown --site crosswordcluetutor.com --period 7d --dimension source -f json',
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
    { name: 'dimension', type: 'string', default: 'source', choices: [...DIMENSIONS], help: 'source / page / entryPage' },
    { name: 'limit', type: 'int', default: 10, help: 'Maximum visible rows to return (max 100)' },
  ],
  columns: ['rank', 'dimension', 'value', 'visitors', 'site', 'range', 'sourceUrl'],
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

    if (report.dimension === 'page' || report.dimension === 'entryPage') {
      const selected = await page.evaluate((payload) => {
        const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
        const currentRows = [...document.querySelectorAll('a')]
          .filter((anchor) => anchor.getAttribute('href')?.includes(`filters=((is,${payload.filterKey},`));
        if (currentRows.length) return true;
        const control = [...document.querySelectorAll('button')].find((button) => clean(button.textContent) === payload.label);
        if (!control) return false;
        control.click();
        return true;
      }, report.dimension === 'entryPage'
        ? { label: 'Entry Pages', filterKey: 'entry_page' }
        : { label: 'Top Pages', filterKey: 'page' });
      if (!selected) throw new CommandExecutionError(`Could not select the ${report.dimension} report`);
      await page.sleep(1);
    }

    const rows = await page.evaluate((payload) => {
      const filterKey = payload.dimension === 'entryPage' ? 'entry_page' : payload.dimension;
      const compactNumber = (value) => {
        const match = String(value ?? '').replace(/,/g, '').trim().match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
        if (!match) return null;
        const scale = { k: 1e3, m: 1e6, b: 1e9 }[String(match[2] ?? '').toLowerCase()] ?? 1;
        return Number(match[1]) * scale;
      };
      const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
      const anchors = [...document.querySelectorAll('a')]
        .filter((anchor) => anchor.getAttribute('href')?.includes(`filters=((is,${filterKey},`));
      return anchors.slice(0, payload.limit).map((anchor, index) => {
        let rowNode = anchor.parentElement;
        while (rowNode && rowNode !== document.body && !rowNode.querySelector('span[tooltip]')) rowNode = rowNode.parentElement;
        const visitorText = rowNode?.querySelector('span[tooltip]')?.getAttribute('tooltip')
          ?? rowNode?.querySelector('span[tooltip]')?.textContent
          ?? null;
        return {
          rank: index + 1,
          dimension: payload.dimension,
          value: clean(anchor.textContent),
          visitors: compactNumber(visitorText),
          site: payload.site,
          range: payload.range,
          sourceUrl: location.href,
        };
      });
    }, {
      site: report.site,
      dimension: report.dimension,
      limit: report.limit,
      range: report.period === 'custom' ? `${report.from}..${report.to}` : report.period,
    });

    if (!Array.isArray(rows) || rows.length === 0) throw new EmptyResultError('pageview breakdown', `No visible ${report.dimension} rows for ${report.site}`);
    if (rows.some((row) => !row.value || row.visitors === null)) throw new CommandExecutionError(`Pageview ${report.dimension} row parsing returned incomplete values`);
    return rows;
  },
});
