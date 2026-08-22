export function extractSitemapUrls(xml = "") {
  return [...String(xml).matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeXml(match[1].trim()));
}

export function collectIndexNowUrls({ siteUrl, currentSitemap = "", previousSitemap = "", includeRecords = false, publishRecord = {}, manualRecord = {} }) {
  const site = new URL(siteUrl);
  const previous = new Set(extractSitemapUrls(previousSitemap).map((value) => normalizeUrl(value, site)).filter(Boolean));
  const current = extractSitemapUrls(currentSitemap).map((value) => normalizeUrl(value, site)).filter(Boolean);
  const output = current.filter((value) => !previous.has(value));

  if (includeRecords) {
    for (const value of [
      ...(publishRecord.urls ?? []),
      ...(publishRecord.answerUrls ?? []),
      ...(publishRecord.clinicUrls ?? []),
      ...(publishRecord.hubUrls ?? []),
      ...(manualRecord.urls ?? [])
    ]) {
      const normalized = normalizeUrl(value, site);
      if (normalized) output.push(normalized);
    }
  }

  const unique = [...new Set(output)];
  if (unique.length) unique.unshift(site.href);
  return [...new Set(unique)].slice(0, 10_000);
}

function normalizeUrl(value, site) {
  try {
    const url = new URL(value, site);
    if (url.hostname !== site.hostname || !["http:", "https:"].includes(url.protocol)) return null;
    url.protocol = site.protocol;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
