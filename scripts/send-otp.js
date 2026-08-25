#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const eventPath = process.argv[2] || process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.error('Missing GITHUB_EVENT_PATH or event file not provided');
  process.exit(1);
}

const event = await fs.readJson(eventPath);
const payload = event.client_payload || {};
const email = (payload.email || '').toLowerCase();
if (!email) {
  console.error('No email provided in client_payload');
  process.exit(1);
}

const otp = ('' + Math.floor(100000 + Math.random() * 900000));
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.createHmac('sha256', salt).update(otp).digest('hex');
const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

const otpRecord = { email, hash, salt, expiresAt, createdAt: new Date().toISOString() };

const otpsDir = path.join(process.cwd(), 'data', 'otps');
await fs.ensureDir(otpsDir);
const safeFileName = email.replace(/[^a-z0-9@.\-]/gi, '_');
const filePath = path.join(otpsDir, `${safeFileName}.json`);
await fs.writeJson(filePath, otpRecord, { spaces: 2 });
console.log(`Wrote OTP record to ${filePath}`);

const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (!smtpHost || !smtpUser || !smtpPass) {
  console.warn('SMTP credentials not fully set. Skipping sending email. OTP is:', otp);
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: Number(smtpPort),
  secure: Number(smtpPort) === 465,
  auth: { user: smtpUser, pass: smtpPass }
});

const mailText = 'Your exam login code is: ' + otp + '\n\nValid for 2 hours.';

try {
  const res = await transporter.sendMail({ from: process.env.SMTP_USER, to: email, subject: 'Your exam login code', text: mailText });
  console.log('Email sent', res && res.messageId);
} catch (err) {
  console.error('Error sending email', err);
  console.error('OTP for', email, 'is', otp);
  process.exit(1);
}