import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import nodemailer from "nodemailer";

const DEFAULT_FROM = "hello@crosswordcluetutor.com";
const DEFAULT_NAME = "Crossword Clue Tutor";

function takeValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv) {
  const options = { send: false, verify: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (["--send", "--verify", "--help"].includes(flag)) {
      options[flag.slice(2)] = true;
      continue;
    }
    if (["--to", "--subject", "--text-file", "--confirm-recipient"].includes(flag)) {
      options[flag.slice(2).replaceAll("-", "_")] = takeValue(argv, index, flag);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }
  if (options.send && options.verify) throw new Error("Use either --send or --verify, not both");
  return options;
}

function cleanHeader(value, label, maxLength) {
  if (!value || value.length > maxLength || /[\r\n]/.test(value)) {
    throw new Error(`${label} is missing, too long, or contains a line break`);
  }
  return value;
}

export function validateSingleAddress(value, label = "Recipient") {
  cleanHeader(value, label, 254);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value)) {
    throw new Error(`${label} must be one valid email address`);
  }
  return value.toLowerCase();
}

export function smtpConfig(env = process.env) {
  const host = env.ZOHO_SMTP_HOST || "smtp.zoho.com";
  const port = Number(env.ZOHO_SMTP_PORT || 465);
  const user = validateSingleAddress(env.ZOHO_SMTP_USER || DEFAULT_FROM, "SMTP user");
  const fromEmail = validateSingleAddress(env.OUTREACH_FROM_EMAIL || DEFAULT_FROM, "From address");
  const fromName = cleanHeader(env.OUTREACH_FROM_NAME || DEFAULT_NAME, "From name", 100);

  if (!/^smtp(?:pro)?\.zoho\.(?:com|eu|in|com\.au|jp|ca|sa)$/.test(host)) {
    throw new Error("ZOHO_SMTP_HOST must be an official Zoho SMTP host");
  }
  if (![465, 587].includes(port)) throw new Error("ZOHO_SMTP_PORT must be 465 or 587");
  if (!fromEmail.endsWith("@crosswordcluetutor.com")) {
    throw new Error("From address must use crosswordcluetutor.com");
  }

  return { host, port, secure: port === 465, user, password: env.ZOHO_SMTP_PASSWORD, fromEmail, fromName };
}

function usage() {
  return `Usage:
  npm run outreach:send -- --to person@example.com --subject "Subject" --text-file message.txt
  npm run outreach:send -- --to person@example.com --subject "Subject" --text-file message.txt --send --confirm-recipient person@example.com
  npm run outreach:send -- --verify

Dry-run is the default. SMTP credentials are read only from ZOHO_SMTP_USER and
ZOHO_SMTP_PASSWORD; never pass a password on the command line.`;
}

export async function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const smtp = smtpConfig(env);
  if (options.verify) {
    if (!smtp.password) throw new Error("Set ZOHO_SMTP_PASSWORD before --verify");
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
      tls: { minVersion: "TLSv1.2" }
    });
    await transport.verify();
    console.log(`Zoho SMTP authentication verified for ${smtp.user}.`);
    return;
  }

  const to = validateSingleAddress(options.to);
  const subject = cleanHeader(options.subject, "Subject", 180);
  if (!options.text_file) throw new Error("--text-file is required");
  const text = (await readFile(path.resolve(options.text_file), "utf8")).trim();
  if (text.length < 20 || text.length > 20_000) throw new Error("Message text must be 20 to 20,000 characters");

  const preview = {
    mode: options.send ? "send" : "dry-run",
    smtpHost: smtp.host,
    from: `${smtp.fromName} <${smtp.fromEmail}>`,
    replyTo: smtp.fromEmail,
    to,
    subject,
    textFile: path.resolve(options.text_file),
    textCharacters: text.length
  };

  if (!options.send) {
    console.log(JSON.stringify(preview, null, 2));
    console.log("Dry-run only. Add --send and an exact --confirm-recipient to transmit.");
    return;
  }
  if (validateSingleAddress(options.confirm_recipient, "Confirmed recipient") !== to) {
    throw new Error("--confirm-recipient must exactly match --to");
  }
  if (!smtp.password) throw new Error("Set ZOHO_SMTP_PASSWORD before sending");

  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    tls: { minVersion: "TLSv1.2" }
  });
  const result = await transport.sendMail({
    from: { name: smtp.fromName, address: smtp.fromEmail },
    replyTo: smtp.fromEmail,
    to,
    subject,
    text,
    headers: { "X-Auto-Response-Suppress": "OOF, AutoReply" }
  });
  console.log(JSON.stringify({ ...preview, messageId: result.messageId, accepted: result.accepted, rejected: result.rejected }, null, 2));
}

const isDirectRun = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
