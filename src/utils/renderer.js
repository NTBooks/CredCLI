import fs from 'fs-extra';
import path from 'path';
import qrcode from 'qrcode';
import { parseCSV, applyReplacements } from './csv.js';
import { getWorkspace } from './jobs.js';

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

export async function renderJob(jobDir, format = 'pdf', onProgress) {
  const csvPath = path.join(jobDir, 'mailmerge.csv');
  const templatePath = path.join(jobDir, 'template.html');
  const outputDir = path.join(jobDir, 'output');

  await fs.ensureDir(outputDir);

  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const rows = parseCSV(csvPath);

  // Load workspace defaults (WorkspaceIssuer, WorkspaceLogo) from workspace.json
  const workspaceDefaults = {};
  try {
    const wsDir = getWorkspace() || path.join(jobDir, '..', '..');
    const wsCfg = await fs.readJson(path.join(wsDir, 'workspace.json'));
    if (wsCfg.issuerName) workspaceDefaults.WorkspaceIssuer = wsCfg.issuerName;
    if (wsCfg.logo)       workspaceDefaults.WorkspaceLogo   = wsCfg.logo;
  } catch {}

  // Read job metadata for viewport dimensions
  let width = 1200, height = 900;
  try {
    const meta = await fs.readJson(path.join(jobDir, 'job.json'));
    width = meta.width ?? 1200;
    height = meta.height ?? 900;
  } catch {}

  // Lazy-load playwright so it stays external to the bundle
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    // Workspace defaults fill placeholders not present in CSV; CSV values take precedence
    const row = { ...workspaceDefaults, ...rows[i] };
    const qrDataUrl = await generateQR(row.QRUrl || row.VerificationURL || '');

    let html = applyReplacements(templateHtml, row);
    html = html.replace(/\{\{QR_CODE_IMAGE\}\}/g, qrDataUrl);

    // Stamp a temp file so Playwright can load local resources
    const tmpPath = path.join(outputDir, `_tmp_${i}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');

    const page = await browser.newPage();
    await page.setViewportSize({ width, height });
    await page.goto(`file:///${tmpPath.replace(/\\/g, '/')}`);
    await page.waitForLoadState('networkidle');

    const recipientName = safeFilename(row.FullName || row.LName || `recipient_${i + 1}`);
    const ext = format === 'png' ? 'png' : 'pdf';
    const outputPath = path.join(outputDir, `${recipientName}_${row.CredentialID || i + 1}.${ext}`);

    if (format === 'png') {
      await page.screenshot({ path: outputPath, clip: { x: 0, y: 0, width, height } });
    } else {
      await page.pdf({
        path: outputPath,
        width: `${width}px`,
        height: `${height}px`,
        printBackground: true,
      });
    }

    await page.close();
    fs.removeSync(tmpPath);

    results.push({ name: row.FullName || `Recipient ${i + 1}`, file: path.basename(outputPath) });
    if (onProgress) onProgress(i + 1, rows.length, results[results.length - 1]);
  }

  await browser.close();
  return results;
}
