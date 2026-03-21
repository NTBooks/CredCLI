import fs from 'fs-extra';
import path from 'path';
import nodemailer from 'nodemailer';

/**
 * Merge workspace SMTP config with env-var fallbacks.
 */
export function resolveSmtp(raw) {
  const user = raw.user?.trim() || process.env.SMTP_USER || process.env.TEST_SENDER || '';
  const host = raw.host?.trim() || process.env.SMTP_HOST || '';
  const port = raw.port || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined);
  // Port 465 always requires implicit TLS — override any stored value
  const secure = Number(port) === 465 ? true : (raw.secure ?? (process.env.SMTP_SECURE === 'true' ? true : undefined));
  return {
    ...raw,
    host,
    port,
    secure,
    user,
    pass:        raw.pass?.trim()        || process.env.SMTP_PASS || process.env.TEST_SENDER_PW || '',
    fromAddress: raw.fromAddress?.trim() || process.env.SMTP_FROM || user,
  };
}

/**
 * Send all .eml files from a mail_merge directory via SMTP.
 * @param {function({ file: string, toAddr: string, success: boolean, error?: string })} onItem
 * @returns {{ sent: number, skipped: number, errors: Array<{file: string, error: string}> }}
 */
export async function sendEmailsFromMailMerge(mmDir, smtp, onItem = null) {
  const emlFiles = fs.readdirSync(mmDir).filter(f => f.endsWith('.eml'));
  if (!emlFiles.length) throw new Error('No .eml files found in mail_merge folder');

  const receiptsDir = path.join(mmDir, '.receipts');
  await fs.ensureDir(receiptsDir);

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    name: smtp.host,
    logger: process.env.DEBUG === 'true',
    debug: process.env.DEBUG === 'true',
  });

  let sent = 0, skipped = 0;
  const errors = [];

  for (const file of emlFiles) {
    const receiptPath = path.join(receiptsDir, `${file}.json`);
    if (await fs.pathExists(receiptPath)) {
      skipped++;
      if (onItem) onItem({ file, toAddr: null, success: true, skipped: true });
      continue;
    }

    const raw = fs.readFileSync(path.join(mmDir, file), 'utf8');
    const toMatch = raw.match(/^To:\s*(.+)/mi);
    const toHeader = toMatch ? toMatch[1].trim() : '';
    const addrMatch = toHeader.match(/<([^>]+)>/) || toHeader.match(/([^\s,]+@[^\s,]+)/);
    const toAddr = addrMatch ? addrMatch[1] : '';
    if (!toAddr) { skipped++; continue; }
    try {
      const info = await transporter.sendMail({ envelope: { from: smtp.fromAddress || smtp.user, to: toAddr }, raw });
      await fs.writeJson(receiptPath, { sentAt: new Date().toISOString(), toAddr, messageId: info.messageId });
      sent++;
      if (onItem) onItem({ file, toAddr, success: true });
    } catch (e) {
      errors.push({ file, error: e.message });
      if (onItem) onItem({ file, toAddr, success: false, error: e.message });
    }
  }

  return { sent, skipped, errors };
}

/**
 * Send a test email to verify SMTP configuration.
 * @returns {object} nodemailer sendMail info object
 */
export async function testSmtp(smtp, to) {
  const fromAddress = smtp.fromAddress || smtp.user || 'noreply@example.com';
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    name: smtp.host,
    logger: process.env.DEBUG === 'true',
    debug: process.env.DEBUG === 'true',
  });
  return transporter.sendMail({
    from: fromAddress,
    to,
    subject: 'CredCLI SMTP Test',
    text: `This is a test email from CredCLI.\n\nSMTP host: ${smtp.host}\nFrom: ${fromAddress}`,
    html: `<p>This is a test email from <strong>CredCLI</strong>.</p><p style="color:#888;font-size:12px">SMTP host: ${smtp.host} &nbsp;·&nbsp; From: ${fromAddress}</p>`,
  });
}
