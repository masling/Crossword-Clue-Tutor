import path from "node:path";
import { pathToFileURL } from "node:url";

export const rumTrafficQuery = `query RumTraffic($accountTag: string!, $start: Time!, $end: Time!, $siteTag: string!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      referrers: rumPageloadEventsAdaptiveGroups(
        limit: 1000
        filter: { datetime_geq: $start, datetime_leq: $end, siteTag: $siteTag, bot: 0 }
        orderBy: [sum_visits_DESC]
      ) {
        count
        sum { visits }
        dimensions { refererHost }
      }
      operatorQa: rumPageloadEventsAdaptiveGroups(
        limit: 10
        filter: { datetime_geq: $start, datetime_leq: $end, siteTag: $siteTag, bot: 0, requestPath: "/qa/" }
      ) {
        count
        sum { visits }
        dimensions { requestPath }
      }
    }
  }
}`;

function isSearchHost(host) {
  return /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|yandex\.[a-z.]+)$/i.test(host);
}

export function summarizeRumRows(rows = [], { siteHost = "crosswordcluetutor.com", legacyOperatorQaBaseline = 0, taggedOperatorQaVisits = 0, taggedOperatorQaPageviews = 0 } = {}) {
  const referrers = rows.map((row) => ({
    host: row.dimensions?.refererHost || "(direct)",
    pageviews: Number(row.count || 0),
    visits: Number(row.sum?.visits || 0)
  }));
  const pageviews = referrers.reduce((total, row) => total + row.pageviews, 0);
  const visits = referrers.reduce((total, row) => total + row.visits, 0);
  const directVisits = referrers.filter((row) => row.host === "(direct)").reduce((total, row) => total + row.visits, 0);
  const selfPageviews = referrers.filter((row) => row.host === siteHost).reduce((total, row) => total + row.pageviews, 0);
  const external = referrers.filter((row) => !["(direct)", siteHost].includes(row.host));
  const search = external.filter((row) => isSearchHost(row.host));
  const operatorQaVisits = legacyOperatorQaBaseline + taggedOperatorQaVisits;
  return {
    pageviews,
    visits,
    legacyOperatorQaBaseline,
    taggedOperatorQaVisits,
    taggedOperatorQaPageviews,
    operatorQaVisits,
    visitsAfterOperatorQa: Math.max(0, visits - operatorQaVisits),
    directVisits,
    selfPageviews,
    externalReferrerVisits: external.reduce((total, row) => total + row.visits, 0),
    verifiedSearchVisits: search.reduce((total, row) => total + row.visits, 0),
    referrers
  };
}

export async function queryCloudflareTraffic({ env = process.env, fetchImpl = fetch } = {}) {
  const token = env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN;
  const accountTag = env.CLOUDFLARE_ACCOUNT_ID;
  const siteTag = env.CLOUDFLARE_RUM_SITE_TAG || "9540d1c383b3452f99aa21ece1938246";
  const start = env.TRAFFIC_START_ISO || "2026-08-19T01:20:00Z";
  const end = env.TRAFFIC_END_ISO || new Date().toISOString();
  const variables = { accountTag, start, end, siteTag };

  if (env.TRAFFIC_DRY_RUN === "1") return { dryRun: true, variables, query: rumTrafficQuery };
  if (!token) throw new Error("Set CLOUDFLARE_API_TOKEN or CF_API_TOKEN");
  if (!accountTag) throw new Error("Set CLOUDFLARE_ACCOUNT_ID");

  const response = await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: rumTrafficQuery, variables })
  });
  if (!response.ok) throw new Error(`Cloudflare GraphQL returned HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(body.errors.map((error) => error.message).join("; "));
  const account = body.data?.viewer?.accounts?.[0];
  const rows = account?.referrers;
  if (!Array.isArray(rows)) throw new Error("Cloudflare GraphQL response did not include RUM rows");
  const qaRows = Array.isArray(account?.operatorQa) ? account.operatorQa : [];
  const taggedOperatorQaVisits = qaRows.reduce((total, row) => total + Number(row.sum?.visits || 0), 0);
  const taggedOperatorQaPageviews = qaRows.reduce((total, row) => total + Number(row.count || 0), 0);
  return {
    recordedAt: new Date().toISOString(),
    period: { start, end },
    botFilter: 0,
    ...summarizeRumRows(rows, {
      siteHost: new URL(env.SITE_URL || "https://crosswordcluetutor.com/").hostname,
      legacyOperatorQaBaseline: Number(env.OPERATOR_QA_BASELINE || 4),
      taggedOperatorQaVisits,
      taggedOperatorQaPageviews
    })
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  queryCloudflareTraffic().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
