# Crossword Clue Tutor domain email setup

Status: prepared, not activated. The preferred route is Zoho Mail Free when available in
the selected data center. Account creation, DNS changes, and any credentials still require
explicit action-time approval.

## Proposed public identity

- Display name: `Crossword Clue Tutor`
- Address: `hello@crosswordcluetutor.com`
- Inbound destination: `masling@gmail.com`
- Intended use: individual outreach, directory submissions, replies, and support follow-up

## Verified preflight — 2026-08-20

- `crosswordcluetutor.com` uses Cloudflare DNS.
- No MX record currently exists on the domain.
- No mail SPF, DKIM, or DMARC record currently exists. The only root TXT record is Google
  Search Console verification.
- `masling@gmail.com` is already a verified Cloudflare Email Routing destination.
- No account routing rule currently uses `crosswordcluetutor.com`.
- Existing routing rules belong to other domains and must remain unchanged.

The domain is therefore clear for onboarding, with no existing mailbox configuration to
migrate or replace.

## Preferred free option — Zoho Mail Free

Zoho's current free organization plan supports one custom domain, up to five users, and
5 GB per user, with web-only mailbox access. Availability is limited to selected data
centers. IMAP, POP, automatic forwarding, and ActiveSync are paid-plan features.

Use this option only if the free plan is shown during signup:

1. Create a Zoho Mail organization in the appropriate data center.
2. Add and verify `crosswordcluetutor.com` with a temporary TXT or CNAME record.
3. Create the user `hello@crosswordcluetutor.com` with display name
   `Crossword Clue Tutor`.
4. Replace the domain's mail records with the MX, SPF, and DKIM values shown by Zoho.
5. Add a DMARC record in monitoring mode before sending external mail.
6. Use Zoho Webmail for inbound replies. Do not expect Gmail forwarding or POP retrieval
   on the free plan.
7. If Zoho exposes SMTP for the free organization in the selected data center, use the
   exact server settings shown inside that account; do not copy settings from another
   region.

Cloudflare Email Routing and Zoho cannot both own the root MX records. If Zoho is chosen,
do not onboard Cloudflare Email Routing for this domain.

## Paid all-Cloudflare fallback — inbound mail

Requires approval to modify DNS and Cloudflare Email Routing.

1. Open Cloudflare Email Service → Email Routing.
2. Onboard `crosswordcluetutor.com`.
3. Allow Cloudflare to create the required root MX, SPF, and routing DKIM records.
4. Create the exact rule:
   - Match: `hello@crosswordcluetutor.com`
   - Action: forward
   - Destination: `masling@gmail.com`
5. Keep the catch-all rule disabled so unrequested addresses are not accepted.
6. Send an inbound test from an unrelated external mailbox and verify delivery to Gmail.

## Paid all-Cloudflare fallback — outbound mail

Cloudflare Email Sending to arbitrary recipients requires Workers Paid. The current public
price is a USD 5 monthly account minimum; Email Sending includes 3,000 outbound messages
per month before usage charges.

Requires separate action-time approval for the recurring charge and API credential.

1. Enable Workers Paid for the Cloudflare account.
2. Open Email Service → Email Sending and onboard `crosswordcluetutor.com`.
3. Allow Cloudflare to create the `cf-bounce` MX/SPF records, sending DKIM record, and
   DMARC record.
4. Create an account-owned API token scoped only to `Email Sending: Edit` for this account.
5. Never store the token in Git, project files, shell history, analytics, or D1.
6. Add the address to Gmail's “Send mail as” configuration:
   - Email: `hello@crosswordcluetutor.com`
   - SMTP host: `smtp.mx.cloudflare.net`
   - Port: `465`
   - Security: implicit TLS / SSL
   - Username: literal `api_token`
   - Password: the scoped Cloudflare API token
7. Complete Gmail's verification message through the Phase 1 forwarding rule.

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
2. Remove Gmail's send-as alias and delete/revoke the scoped API token.
3. Disable Email Sending for the domain.
4. Remove only DNS records created by Email Service onboarding; preserve website and
   Search Console records.
5. Cancel Workers Paid only after confirming no other project in the account depends on it.
