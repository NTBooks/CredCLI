import fs from 'fs-extra';
import path from 'path';
import qrcode from 'qrcode';
import { parseCSV, applyReplacements } from './csv.js';
import { getWorkspace, parseTemplateMeta } from './jobs.js';

async function generateQR(url) {
  if (!url || url.trim() === '') return '';
  try {
    return await qrcode.toDataURL(url, { margin: 1, width: 180 });
  } catch {
    return '';
  }
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-]/g, '_').replace(/_+/g, '_').slice(0, 80);
}

// ── EML generation ────────────────────────────────────────────────────────────

function buildPlainText(row) {
  const name   = row.FullName || row.FName || 'Recipient';
  const issuer = row.WorkspaceIssuer || 'Your issuer';
  const title  = row.Title || row.CourseName || 'your credential';
  const url    = row.VerificationURL || row.QRUrl || '';
  const id     = row.CredentialID || '';
  const date   = row.IssueDate || '';

  const lines = [
    `Dear ${name},`,
    '',
    `${issuer} is pleased to inform you that your ${title} credential has been issued and is ready to claim.`,
  ];
  if (date) lines.push('', `Issue date: ${date}`);
  if (id)   lines.push(`Credential ID: ${id}`);
  if (url)  lines.push('', `Claim your certificate: ${url}`);
  lines.push('', 'Best regards,', issuer);
  return lines.join('\n');
}

function buildEml(htmlBody, row, subject) {
  const recipientName = row.FullName || row.FName || '';
  const to   = row.Email
    ? (recipientName ? `${recipientName} <${row.Email}>` : row.Email)
    : recipientName || 'Recipient';
  const from = row.WorkspaceIssuer || 'Issuer';
  const boundary = `----=_Part_CredCLI_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const plainText = buildPlainText(row);

  return [
    'MIME-Version: 1.0',
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plainText,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

function buildEmlWithAttachment(htmlBody, plainText, subject, row, attachmentPath) {
  const recipientName = row.FullName || row.FName || '';
  const to   = row.Email
    ? (recipientName ? `"${recipientName}" <${row.Email}>` : row.Email)
    : recipientName || 'Recipient';
  const from = row.WorkspaceIssuer || 'Issuer';
  const outerBoundary = `----=_Mix_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const innerBoundary = `----=_Alt_${Date.now() + 1}_${Math.random().toString(36).slice(2)}`;

  const attachBuffer = fs.readFileSync(attachmentPath);
  const attachBase64 = attachBuffer.toString('base64').match(/.{1,76}/g).join('\r\n');
  const ext      = path.extname(attachmentPath).toLowerCase();
  const mime     = ext === '.pdf' ? 'application/pdf' : 'image/png';
  const filename = path.basename(attachmentPath);

  return [
    'MIME-Version: 1.0',
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${outerBoundary}"`,
    '',
    `--${outerBoundary}`,
    `Content-Type: multipart/alternative; boundary="${innerBoundary}"`,
    '',
    `--${innerBoundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    plainText,
    '',
    `--${innerBoundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    htmlBody,
    '',
    `--${innerBoundary}--`,
    '',
    `--${outerBoundary}`,
    `Content-Type: ${mime}; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    attachBase64,
    '',
    `--${outerBoundary}--`,
  ].join('\r\n');
}

export async function generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, claimLinks = {}, onProgress) {
  const mmDir = path.join(outputDir, 'mail_merge');
  await fs.ensureDir(mmDir);

  // Load workspace defaults (WorkspaceIssuer, WorkspaceLogo) so they resolve in templates
  const workspaceDefaults = {};
  try {
    const wsDir = getWorkspace() || path.join(outputDir, '..', '..', '..');
    const wsCfg = await fs.readJson(path.join(wsDir, 'workspace.json'));
    if (wsCfg.issuerName) workspaceDefaults.WorkspaceIssuer = wsCfg.issuerName;
    if (wsCfg.logo)       workspaceDefaults.WorkspaceLogo   = wsCfg.logo;
  } catch {}

  const mboxParts = [];
  const csvRows   = ['To,ToName,Subject,AttachmentFile,ClaimLink'];

  for (const { file, row } of results) {
    const attachPath = path.join(outputDir, file);
    if (!fs.existsSync(attachPath)) continue;

    // Inject the Chainletter claim link if we have one for this file
    const claimLink  = claimLinks[file] || '';
    const enrichedRow = { ...workspaceDefaults, ...row };
    // Fallbacks: map common CSV column names to template field names
    if (!enrichedRow.Title && enrichedRow.CourseName) enrichedRow.Title = enrichedRow.CourseName;
    if (!enrichedRow.WorkspaceIssuer && enrichedRow.Issuer) enrichedRow.WorkspaceIssuer = enrichedRow.Issuer;
    if (claimLink) { enrichedRow.VerificationURL = claimLink; enrichedRow.QRUrl = claimLink; }

    const emailHtml = applyReplacements(emailTemplateHtml, enrichedRow);
    const subject   = applyReplacements(emailTemplateMeta.subject || 'Your credential is ready', enrichedRow);
    const plain     = buildPlainText(enrichedRow);
    const eml       = buildEmlWithAttachment(emailHtml, plain, subject, enrichedRow, attachPath);

    const baseName = path.basename(file, path.extname(file));
    const emlName  = `${baseName}.eml`;
    fs.writeFileSync(path.join(mmDir, emlName), eml, 'utf8');

    mboxParts.push(`From credcli@localhost ${new Date().toUTCString()}\r\n${eml}\r\n\r\n`);

    const to   = (enrichedRow.Email || '').replace(/,/g, '');
    const name = (enrichedRow.FullName || enrichedRow.FName || '').replace(/,/g, ' ');
    const subj = subject.replace(/,/g, ' ');
    csvRows.push(`${to},${name},${subj},${path.basename(file)},${claimLink}`);

    if (onProgress) onProgress({ type: 'mail_merge_file', file: emlName });
  }

  fs.writeFileSync(path.join(mmDir, 'all_recipients.mbox'), mboxParts.join(''), 'utf8');
  fs.writeFileSync(path.join(mmDir, 'mail_merge_manifest.csv'), csvRows.join('\n'), 'utf8');
  if (onProgress) onProgress({ type: 'mail_merge_done', count: results.length });
}

// ── Main render entry ─────────────────────────────────────────────────────────

export async function renderJob(jobDir, format = 'pdf', onProgress, emailTemplatePath = null) {
  const csvPath      = path.join(jobDir, 'mailmerge.csv');
  const templatePath = path.join(jobDir, 'template.html');
  const outputDir    = path.join(jobDir, 'output');

  await fs.ensureDir(outputDir);

  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const templateMeta = parseTemplateMeta(templatePath);
  const rows = parseCSV(csvPath);

  // Load workspace defaults (WorkspaceIssuer, WorkspaceLogo)
  const workspaceDefaults = {};
  try {
    const wsDir = getWorkspace() || path.join(jobDir, '..', '..');
    const wsCfg = await fs.readJson(path.join(wsDir, 'workspace.json'));
    if (wsCfg.issuerName) workspaceDefaults.WorkspaceIssuer = wsCfg.issuerName;
    if (wsCfg.logo)       workspaceDefaults.WorkspaceLogo   = wsCfg.logo;
  } catch {}

  // ── Email-only template path (no Playwright) ─────────────────────────────
  if (templateMeta?.type === 'email') {
    const results = [];
    const emailSubjectTpl = templateMeta.subject || 'Your credential is ready';

    for (let i = 0; i < rows.length; i++) {
      const row     = { ...workspaceDefaults, ...rows[i] };
      if (!row.Title && row.CourseName) row.Title = row.CourseName;
      if (!row.WorkspaceIssuer && row.Issuer) row.WorkspaceIssuer = row.Issuer;
      const html    = applyReplacements(templateHtml, row);
      const subject = applyReplacements(emailSubjectTpl, row);
      const eml     = buildEml(html, row, subject);

      const recipientName = safeFilename(row.FullName || row.LName || `recipient_${i + 1}`);
      const outputPath    = path.join(outputDir, `${recipientName}_${row.CredentialID || i + 1}.eml`);
      fs.writeFileSync(outputPath, eml, 'utf8');

      results.push({ name: row.FullName || `Recipient ${i + 1}`, file: path.basename(outputPath), row: { ...row } });
      if (onProgress) onProgress(i + 1, rows.length, results[results.length - 1]);
    }

    await fs.writeJson(path.join(outputDir, 'results.json'), results, { spaces: 2 });
    return results;
  }

  // ── Load email template if a secondary email output was requested ─────────
  let emailTemplateMeta = null;
  let emailTemplateHtml = null;
  if (emailTemplatePath && fs.existsSync(emailTemplatePath)) {
    emailTemplateHtml = fs.readFileSync(emailTemplatePath, 'utf8');
    emailTemplateMeta = parseTemplateMeta(emailTemplatePath);
  }

  // Read job metadata for viewport dimensions
  let width = 1200, height = 900;
  try {
    const meta = await fs.readJson(path.join(jobDir, 'job.json'));
    width  = meta.width  ?? 1200;
    height = meta.height ?? 900;
  } catch {}

  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const row = { ...workspaceDefaults, ...rows[i] };
    if (!row.Title && row.CourseName) row.Title = row.CourseName;
    if (!row.WorkspaceIssuer && row.Issuer) row.WorkspaceIssuer = row.Issuer;
    const qrDataUrl = await generateQR(row.QRUrl || row.VerificationURL || '');

    let html = applyReplacements(templateHtml, row);
    html = html.replace(/\{\{QR_CODE_IMAGE\}\}/g, qrDataUrl);

    const tmpPath = path.join(outputDir, `_tmp_${i}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');

    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(`file:///${tmpPath.replace(/\\/g, '/')}`);
    await page.waitForLoadState('networkidle');

    const recipientName = safeFilename(row.FullName || row.LName || `recipient_${i + 1}`);
    const ext        = format === 'png' ? 'png' : 'pdf';
    const outputPath = path.join(outputDir, `${recipientName}_${row.CredentialID || i + 1}.${ext}`);

    if (format === 'png') {
      await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width, height } });
    } else {
      await page.pdf({
        path: outputPath,
        width:  `${width}px`,
        height: `${height}px`,
        printBackground: true,
      });
    }

    await page.close();
    fs.removeSync(tmpPath);

    const result = { name: row.FullName || `Recipient ${i + 1}`, file: path.basename(outputPath), row: { ...row } };
    results.push(result);

    // Generate matching .eml if an email template was selected
    if (emailTemplateHtml && emailTemplateMeta) {
      const emailHtml    = applyReplacements(emailTemplateHtml, row);
      const emailSubject = applyReplacements(emailTemplateMeta.subject || 'Your credential is ready', row);
      const eml          = buildEml(emailHtml, row, emailSubject);
      const emlPath      = outputPath.replace(/\.(pdf|png)$/i, '.eml');
      fs.writeFileSync(emlPath, eml, 'utf8');
    }

    if (onProgress) onProgress(i + 1, rows.length, result);
  }

  await browser.close();

  await fs.writeJson(path.join(outputDir, 'results.json'), results, { spaces: 2 });

  if (emailTemplatePath && emailTemplateHtml && emailTemplateMeta) {
    await generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, {}, onProgress);
  }

  return results;
}
