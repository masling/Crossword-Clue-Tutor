import { resolveMx, resolveTxt } from "node:dns/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DOMAIN = "crosswordcluetutor.com";
const expectedMx = new Set([
  "route1.mx.cloudflare.net",
  "route2.mx.cloudflare.net",
  "route3.mx.cloudflare.net"
]);

function flattenTxt(records = []) {
  return records.map((segments) => segments.join(""));
}

export function validateMailDns({ mx = [], rootTxt = [], dkimTxt = [], dmarcTxt = [] }) {
  const errors = [];
  const mxHosts = new Set(mx.map((record) => record.exchange.replace(/\.$/, "").toLowerCase()));
  const spf = rootTxt.filter((record) => record.startsWith("v=spf1"));
  const dkim = dkimTxt.filter((record) => record.startsWith("v=DKIM1"));
  const dmarc = dmarcTxt.filter((record) => record.startsWith("v=DMARC1"));

  if (mxHosts.size !== expectedMx.size || [...expectedMx].some((host) => !mxHosts.has(host))) {
    errors.push("Cloudflare Email Routing MX records are incomplete or mixed with another provider");
  }
  if (spf.length !== 1) errors.push("exactly one SPF record is required");
  if (spf.length === 1 && !spf[0].includes("include:_spf.mx.cloudflare.net")) errors.push("SPF does not authorize Cloudflare Email Routing");
  if (spf.length === 1 && !spf[0].includes("include:zohomail.com")) errors.push("SPF does not authorize Zoho Mail");
  const dkimKey = dkim[0]?.match(/\bp=([A-Za-z0-9+/=]+)/)?.[1] ?? "";
  if (dkim.length !== 1 || dkimKey.length < 300) errors.push("Zoho cct2026 2048-bit DKIM key is missing or malformed");
  if (dmarc.length !== 1 || !/\bp=(none|quarantine|reject)\b/.test(dmarc[0])) errors.push("DMARC record is missing or malformed");

  return { errors, mx: [...mxHosts].sort(), spf, dkimSelectors: dkim.length ? ["cct2026"] : [], dmarc };
}

export async function checkMailDns(resolver = { resolveMx, resolveTxt }) {
  const safeTxt = async (name) => {
    try { return flattenTxt(await resolver.resolveTxt(name)); } catch { return []; }
  };
  const [mx, rootTxt, dkimTxt, dmarcTxt] = await Promise.all([
    resolver.resolveMx(DOMAIN).catch(() => []),
    safeTxt(DOMAIN),
    safeTxt(`cct2026._domainkey.${DOMAIN}`),
    safeTxt(`_dmarc.${DOMAIN}`)
  ]);
  return validateMailDns({ mx, rootTxt, dkimTxt, dmarcTxt });
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  const result = await checkMailDns();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 1;
}
