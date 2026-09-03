import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

/**
 * Mailer — SMTP when configured, otherwise logs the email (dev).
 * Sending NEVER fails the request: errors are logged and swallowed.
 */
let transporter = null;
let mailerWarned = false;

function getTransporter() {
  if (transporter) return transporter;
  if (env.smtpHost) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
    });
    return transporter;
  }
  if (!mailerWarned) {
    console.warn('[mailer] SMTP not configured — emails are logged to the console (dev mode).');
    mailerWarned = true;
  }
  return null;
}

export async function sendMail({ to, subject, text, html }) {
  const active = getTransporter();
  if (!active) {
    console.log(`[mail:dev] to=${to} subject="${subject}"\n${text}\n`);
    return { devLogged: true };
  }
  try {
    await active.sendMail({ from: env.emailFrom, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] send failed: ${err.message}`);
    return { sent: false, error: err.message };
  }
}
