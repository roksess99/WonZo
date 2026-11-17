#!/usr/bin/env node
// Sends one test mail, apart from the shop (docs/MAIL.md § Tijdens het
// ontwikkelen): when something does not arrive, this tells whether it is the
// shop or the mail server. D-29: the mail of Hostinger, over SMTP.
//
// Run by the owner (the password lives in .env, which Claude may not read):
//
//   node --env-file=.env scripts/mail-test.mjs jouw@adres.nl
//
// It uses SMTP_HOST/PORT/USER/PASSWORD and MAIL_FROM, logs in, sends one
// short mail to the address given, and reports what the server answered.
// Never the password. Look in the inbox — and in the spam folder: that is
// the whole point of the test (docs/CHECKLIST.md § Mail).

import nodemailer from 'nodemailer';

const env = (k) => (process.env[k] ?? '').trim();
const to = (process.argv[2] ?? '').trim();
if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(to)) {
  console.error('Gebruik: node --env-file=.env scripts/mail-test.mjs jouw@adres.nl');
  process.exit(2);
}
const missing = ['SMTP_HOST', 'SMTP_USER', 'MAIL_FROM'].filter((k) => !env(k)).concat(process.env.SMTP_PASSWORD ? [] : ['SMTP_PASSWORD']);
if (missing.length) {
  console.error(`Niet ingesteld in .env: ${missing.join(', ')}`);
  process.exit(2);
}
const port = Number(env('SMTP_PORT') || '465');
const transporter = nodemailer.createTransport({
  host: env('SMTP_HOST'),
  port,
  secure: port === 465,
  requireTLS: port !== 465,
  auth: { user: env('SMTP_USER'), pass: process.env.SMTP_PASSWORD ?? '' },
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
});

const started = Date.now();
try {
  await transporter.verify();
  console.log(`Inloggen bij ${env('SMTP_HOST')}:${port} gelukt (${Date.now() - started} ms).`);
} catch (err) {
  console.error(`Inloggen mislukt: ${err.code ?? 'ERROR'}${err.responseCode ? ` ${err.responseCode}` : ''} — ${String(err.response ?? err.message).slice(0, 200)}`);
  process.exit(1);
}

const when = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
try {
  const info = await transporter.sendMail({
    from: env('MAIL_FROM'),
    to,
    subject: `Testmail WonZo — ${when}`,
    text: `Dit is een testmail van de winkel (scripts/mail-test.mjs), verstuurd op ${when}.\n\nKomt hij aan in de inbox, dan werkt de mailserver. Staat hij bij ongewenst, kijk dan naar SPF, DKIM en DMARC van het domein.`,
    html: `<p>Dit is een testmail van de winkel (<code>scripts/mail-test.mjs</code>), verstuurd op ${when}.</p><p>Komt hij aan in de inbox, dan werkt de mailserver. Staat hij bij ongewenst, kijk dan naar SPF, DKIM en DMARC van het domein.</p>`,
  });
  console.log(`Verstuurd. Kenmerk: ${info.messageId ?? '(geen)'}`);
  console.log(`Antwoord van de server: ${String(info.response ?? '').slice(0, 200)}`);
  console.log(`Geaccepteerd: ${(info.accepted ?? []).length}, geweigerd: ${(info.rejected ?? []).length}`);
} catch (err) {
  console.error(`Versturen mislukt: ${err.code ?? 'ERROR'}${err.responseCode ? ` ${err.responseCode}` : ''} — ${String(err.response ?? err.message).slice(0, 200)}`);
  process.exit(1);
}
