const CONSENT_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK", "GB", "CH"
]);

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export function onRequestGet({ request }) {
  const country = typeof request.cf?.country === "string" ? request.cf.country.toUpperCase() : null;
  return json({
    country,
    consentRequired: !country || CONSENT_COUNTRIES.has(country)
  });
}

export function onRequest() {
  return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
}
