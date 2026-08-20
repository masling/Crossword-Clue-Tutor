# Crossword Clue Tutor domain email setup

Status: inbound routing and DNS authentication activated on 2026-08-20. Outbound code is
prepared for Zoho SMTP, but no password is stored and no external message has been sent.

## Proposed public identity

- Display name: `Crossword Clue Tutor`
- Address: `hello@crosswordcluetutor.com`
- Inbound destination: `masling@gmail.com`
- Intended use: individual outreach, directory submissions, replies, and support follow-up

## Verified preflight — 2026-08-20

- `crosswordcluetutor.com` uses Cloudflare DNS.
- Cloudflare Email Routing owns the root MX records.
- Root SPF authorizes both Cloudflare forwarding and Zoho sending.
- Cloudflare routing DKIM, Zoho sending DKIM, and DMARC monitoring records are present.
- `masling@gmail.com` is already a verified Cloudflare Email Routing destination.
- The exact `hello@crosswordcluetutor.com` rule forwards to `masling@gmail.com`.
- Existing routing rules belong to other domains and must remain unchanged.

Catch-all stays disabled. No unrelated domain routing rule was changed.

## Active hybrid setup — Cloudflare inbound, Zoho outbound

This intentionally separates inbound routing from outbound SMTP:

- Inbound MX: Cloudflare Email Routing
- Exact route: `hello@crosswordcluetutor.com` → `masling@gmail.com`
- Outbound SMTP: Zoho Mail account `hello@crosswordcluetutor.com`
- Temporary mailbox UI: Gmail “Send mail as” through Zoho SMTP, only through 2026
- Code sender: `npm run outreach:send`

The root MX records must remain Cloudflare's. Do not add Zoho MX records while this hybrid
setup is active. Zoho may therefore continue to show an MX warning even when SPF and DKIM
are valid for outbound mail.

Current DNS policy:

- SPF at `@`: `v=spf1 include:_spf.mx.cloudflare.net include:zohomail.com ~all`
- Zoho DKIM at `zmail._domainkey`: value issued by this Zoho organization
- Cloudflare routing DKIM at `cf2024-1._domainkey`: managed by Email Routing
- DMARC at `_dmarc`: `v=DMARC1; p=none; adkim=r; aspf=r; pct=100`

## Code sender

The sender is dry-run by default and supports exactly one recipient per invocation. It
will not accept a password on the command line, and a real send requires both `--send`
and an exact matching `--confirm-recipient`.

Set credentials only in the current shell or a secret manager; never write them into the
repository:

```sh
export ZOHO_SMTP_USER='hello@crosswordcluetutor.com'
export ZOHO_SMTP_PASSWORD='use-a-Zoho-app-password-when-2FA-is-enabled'
npm run outreach:send -- --verify
```

Preview an individual message without transmitting it:

```sh
npm run outreach:send -- \
  --to editor@example.com \
  --subject 'A useful crossword clue resource' \
  --text-file /absolute/path/to/message.txt
```

After reviewing the preview, add `--send --confirm-recipient editor@example.com`. Every
external send still requires action-time approval.

## Gmail transition and 2027 cutover

Through December 2026, Gmail may be configured to send as
`hello@crosswordcluetutor.com` using Zoho's SMTP host, port 465, SSL, and the Zoho mailbox
credential or app password. Complete the verification message through Cloudflare Email
Routing.

Google has announced the end of third-party SMTP “Send mail as” support in January 2027.
Before that date:

1. Stop using the Gmail alias for new outbound mail.
2. Remove the alias from Gmail after confirming no workflow depends on it.
3. Use Zoho Webmail for manual sends and the repository sender for coded sends.
4. Keep the public From and Reply-To address unchanged.
5. Re-run Gmail and Outlook deliverability checks after the cutover.

## Deliverability checks

Before outreach, send individual tests to unrelated Gmail and Outlook recipients and
confirm:

- visible From address is `hello@crosswordcluetutor.com`;
- Reply-To returns to the same domain address;
- SPF passes;
- DKIM passes and aligns with `crosswordcluetutor.com`;
- DMARC passes;
- no `via gmail.com` or unrelated sender identity appears;
- replies reach `masling@gmail.com` through Email Routing.

Do not send the prepared outreach batch until these checks pass.

## Rejected free relay option

Resend's free tier includes custom domains and sufficient volume, but its Acceptable Use
Policy explicitly prohibits unsolicited messages and cold outreach. It must not be used
for the prepared directory and editorial pitches.

## Rollback

1. Disable the `hello@` routing rule.
2. Remove Gmail's send-as alias and revoke any Zoho app password used only by Gmail.
3. Disable the Zoho SMTP credential used by code.
4. Remove only the Zoho SPF include and `zmail._domainkey` record if Zoho sending is being
   retired; preserve Cloudflare Email Routing, website, and Search Console records.
