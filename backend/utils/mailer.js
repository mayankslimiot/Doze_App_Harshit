// utils/mailer.js
const nodemailer = require('nodemailer');
const { logger } = require('./logger');

let transporterPromise = null;

async function createTransporter() {
  const { SMTP_HOST, SMTP_PORT = '587', SMTP_USER, SMTP_PASS, NODE_ENV, SMTP_SECURE } = process.env;

  if (SMTP_HOST) {
    const port = Number(SMTP_PORT);
    const secure = typeof SMTP_SECURE === 'string'
      ? SMTP_SECURE.toLowerCase() === 'true'
      : port === 465;

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    await transporter.verify();
    logger.info('📧 SMTP transporter ready', { host: SMTP_HOST, port, secure });
    return transporter;
  }

  if (NODE_ENV === 'production') {
    throw new Error('SMTP not configured (SMTP_HOST missing) and NODE_ENV=production');
  }

  // Dev fallback only
  const test = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: test.user, pass: test.pass },
  });
  logger.info('📧 Using Ethereal test SMTP (DEV)');
  return transporter;
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch(err => {
      (logger.err ? logger.err : logger.error)?.(err, { where: 'initMailer' });
      throw err;
    });
  }
  return transporterPromise;
}

async function verifySmtp() {
  const t = await getTransporter();
  return t.verify();
}

async function sendEmail({ to, subject, text, html, from }) {
  const t = await getTransporter();
  const mailFrom =
    from || process.env.FROM_EMAIL || process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@dozemate.com';

  const info = await t.sendMail({ from: mailFrom, to, subject, text, html });
  const ok = Array.isArray(info.accepted) && info.accepted.length > 0;

  logger.info('📨 MAIL_SENT', {
    to, subject, ok,
    accepted: info.accepted, rejected: info.rejected,
    response: info.response, messageId: info.messageId,
  });

  return {
    ok,
    accepted: info.accepted || [],
    rejected: info.rejected || [],
    response: info.response,
    messageId: info.messageId,
  };
}

async function sendNewUserCredentials(to, name, tempPassword) {
  const first = (name || '').split(' ')[0] || 'there';
  const subject = 'Your temporary Dozemate password';
  const text = `Hi ${first},\n\nYour temporary password is: ${tempPassword}\n\nPlease log in and change it immediately.\n`;
  const html = `<p>Hi ${first},</p><p>Your temporary password is: <b>${tempPassword}</b></p><p>Please log in and change it immediately.</p>`;
  return sendEmail({ to, subject, text, html });
}

/**
 * Send email to caretaker when owner shares a device with them.
 * @param {Object} opts
 * @param {string} opts.to - Caretaker email
 * @param {string} opts.ownerName - Name of person who shared the device
 * @param {string} opts.ownerEmail - Email of person who shared the device
 * @param {string} opts.deviceName - Display name of the device (custom name or device ID)
 * @param {string} opts.deviceId - Device ID
 */
async function sendCaretakerShareNotification({ to, ownerName, ownerEmail, deviceName, deviceId }) {
  const subject = 'You have been given access to a device';
  const text = [
    'Hello,',
    '',
    `${ownerName || 'A user'} (${ownerEmail || '—'}) has shared a device with you.`,
    '',
    'Details:',
    `  • Who shared: ${ownerName || '—'} (${ownerEmail || '—'})`,
    `  • Device name: ${deviceName || deviceId || '—'}`,
    `  • Device ID: ${deviceId || '—'}`,
    '',
    'You can now view this device in the app under your shared devices.',
    '',
    '— Dozemate',
  ].join('\n');

  const html = [
    '<p>Hello,</p>',
    `<p><strong>${escapeHtml(ownerName || 'A user')}</strong> (<a href="mailto:${escapeHtml(ownerEmail || '')}">${escapeHtml(ownerEmail || '—')}</a>) has shared a device with you.</p>`,
    '<p><strong>Details:</strong></p>',
    '<ul>',
    `<li><strong>Who shared:</strong> ${escapeHtml(ownerName || '—')} (${escapeHtml(ownerEmail || '—')})</li>`,
    `<li><strong>Device name:</strong> ${escapeHtml(deviceName || deviceId || '—')}</li>`,
    `<li><strong>Device ID:</strong> ${escapeHtml(deviceId || '—')}</li>`,
    '</ul>',
    '<p>You can now view this device in the app under your shared devices.</p>',
    '<p>— Dozemate</p>',
  ].join('');

  return sendEmail({ to, subject, text, html });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { verifySmtp, sendEmail, sendNewUserCredentials, sendCaretakerShareNotification };
