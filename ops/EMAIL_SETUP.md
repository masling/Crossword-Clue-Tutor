# Crossword Clue Tutor domain email setup

Status: prepared, not activated. Enabling outbound delivery requires explicit approval
for the Workers Paid plan and for creating an email-sending API credential.

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

## Phase 1 — inbound mail

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

## Phase 2 — outbound mail

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

## Rollback

1. Disable the `hello@` routing rule.
2. Remove Gmail's send-as alias and delete/revoke the scoped API token.
3. Disable Email Sending for the domain.
4. Remove only DNS records created by Email Service onboarding; preserve website and
   Search Console records.
5. Cancel Workers Paid only after confirming no other project in the account depends on it.

