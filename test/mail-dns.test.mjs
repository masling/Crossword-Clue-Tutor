import test from "node:test";
import assert from "node:assert/strict";
import { validateMailDns } from "../scripts/check-mail-dns.mjs";

const validRecords = {
  mx: [
    { exchange: "route1.mx.cloudflare.net", priority: 32 },
    { exchange: "route2.mx.cloudflare.net", priority: 90 },
    { exchange: "route3.mx.cloudflare.net", priority: 65 }
  ],
  rootTxt: ["v=spf1 include:_spf.mx.cloudflare.net include:zohomail.com ~all"],
  dkimTxt: ["v=DKIM1; k=rsa; p=ABC123"],
  dmarcTxt: ["v=DMARC1; p=none; adkim=r; aspf=r; pct=100"]
};

test("accepts the Cloudflare inbound and Zoho outbound DNS policy", () => {
  assert.deepEqual(validateMailDns(validRecords).errors, []);
});

test("blocks sending when SPF or Zoho DKIM disappears", () => {
  assert.match(validateMailDns({ ...validRecords, rootTxt: [] }).errors.join(" "), /SPF/);
  assert.match(validateMailDns({ ...validRecords, dkimTxt: [] }).errors.join(" "), /DKIM/);
});

test("rejects a second mailbox provider in the MX set", () => {
  const result = validateMailDns({ ...validRecords, mx: [...validRecords.mx, { exchange: "mx.zoho.com", priority: 10 }] });
  assert.match(result.errors.join(" "), /MX records/);
});
