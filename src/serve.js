import express from 'express';
import archiver from 'archiver';
import nodemailer from 'nodemailer';

// ── Master placeholder list ───────────────────────────────────────────────────
// Every field the renderer understands. New blank templates show all of these.
export const ALL_FIELDS = [
  // Core recipient
  'FullName', 'FName', 'LName', 'Email',
  // Credential metadata
  'Title', 'CredentialID', 'Achievement', 'BadgeLevel',
  // Organisation
  'Institution', 'Issuer', 'Signature', 'Location',
  // Dates
  'IssueDate', 'ExpirationDate',
  // Academic
  'CourseName', 'Major', 'GPA', 'Hours',
  // Verification
  'QRUrl', 'VerificationURL',
  // Misc
  'Notes',
  // Workspace-level identity (auto-injected from workspace.json at render time)
  'WorkspaceIssuer', 'WorkspaceLogo',
  // Transcript course rows (1–12)
  ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap(n => [
    `Course${n}Name`, `Course${n}Grade`, `Course${n}Credits`, `Course${n}Semester`,
  ]),
];

function generateBlankTemplate(name, width, height) {
  const meta = JSON.stringify({
    name,
    description: 'Custom credential template',
    width, height,
    fields: ALL_FIELDS,
  });

  const courseRows = Array.from({ length: 12 }, (_, i) => i + 1).map(n => `
        <tr class="course-row">
          <td>{{Course${n}Name}}</td>
          <td>{{Course${n}Grade}}</td>
          <td>{{Course${n}Credits}}</td>
          <td>{{Course${n}Semester}}</td>
        </tr>`).join('');

  return `<!--CREDCLI:${meta}-->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${width}">
<title>${name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;600&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${width}px; min-height: ${height}px;
    font-family: 'Inter', sans-serif;
    background: #ffffff;
    color: #1a1a2e;
    font-size: 14px;
  }
  .page {
    width: ${width}px; min-height: ${height}px;
    padding: 48px 64px;
    display: flex; flex-direction: column; gap: 0;
  }
  /* ── Section headers ─────────────────── */
  .section {
    margin-bottom: 24px;
    padding: 16px 20px;
    background: #f8f9fd;
    border-left: 4px solid #1a237e;
    border-radius: 4px;
  }
  .section-title {
    font-size: 10px; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase; color: #6c757d; margin-bottom: 12px;
  }
  .field-row { display: flex; flex-wrap: wrap; gap: 16px; }
  .field {
    display: flex; flex-direction: column; gap: 3px; min-width: 160px;
  }
  .field-label {
    font-size: 9px; font-weight: 600; letter-spacing: 1.5px;
    text-transform: uppercase; color: #aaa;
  }
  .field-value {
    font-size: 14px; color: #1a237e;
    font-family: 'Playfair Display', serif;
    word-break: break-word;
  }
  .field-value.large {
    font-size: 28px; font-style: italic;
  }
  .field-value.mono {
    font-family: monospace; font-size: 11px; color: #888;
  }
  /* ── Course table ────────────────────── */
  .course-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .course-table th {
    background: #1a237e; color: white;
    padding: 7px 12px; text-align: left;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  }
  .course-table td { padding: 7px 12px; border-bottom: 1px solid #eee; color: #555; }
  .course-row:empty { display: none; }
  /* ── Bottom bar ──────────────────────── */
  .bottom-bar {
    margin-top: auto; padding-top: 20px;
    border-top: 1px solid #e0e4f0;
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px;
  }
  .qr-block { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .qr-block img { width: 80px; height: 80px; }
  .qr-label { font-size: 9px; color: #aaa; letter-spacing: 1px; text-transform: uppercase; }
  .hint {
    background: #fffbeb; border: 1px solid #fcd34d;
    border-radius: 6px; padding: 10px 14px;
    font-size: 11px; color: #92400e; line-height: 1.6;
    margin-bottom: 20px;
  }
</style>
</head>
<body>
<div class="page">

  <div class="hint">
    ✏️ <strong>This is your blank template.</strong>
    Replace this layout with your own design.
    Use <code>{{PLACEHOLDER_NAME}}</code> anywhere in the HTML to inject that field — including
    <strong>custom ones you invent</strong> (e.g. <code>{{StudentID}}</code>, <code>{{Department}}</code>).
    Every <code>{{TOKEN}}</code> you use is automatically added to the CSV when you save.
    <code>{{QR_CODE_IMAGE}}</code> is replaced with a QR code image at render time.
    <code>{{WorkspaceLogo}}</code> and <code>{{WorkspaceIssuer}}</code> are auto-filled from your workspace settings.
  </div>

  <!-- ── Recipient ──────────────────────────────────── -->
  <div class="section">
    <div class="section-title">Recipient</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Full Name</div>
        <div class="field-value large">{{FullName}}</div>
      </div>
      <div class="field">
        <div class="field-label">First Name</div>
        <div class="field-value">{{FName}}</div>
      </div>
      <div class="field">
        <div class="field-label">Last Name</div>
        <div class="field-value">{{LName}}</div>
      </div>
    </div>
  </div>

  <!-- ── Credential ─────────────────────────────────── -->
  <div class="section">
    <div class="section-title">Credential</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Title / Degree</div>
        <div class="field-value">{{Title}}</div>
      </div>
      <div class="field">
        <div class="field-label">Achievement</div>
        <div class="field-value">{{Achievement}}</div>
      </div>
      <div class="field">
        <div class="field-label">Badge Level</div>
        <div class="field-value">{{BadgeLevel}}</div>
      </div>
      <div class="field">
        <div class="field-label">Credential ID</div>
        <div class="field-value mono">{{CredentialID}}</div>
      </div>
    </div>
  </div>

  <!-- ── Academic ────────────────────────────────────── -->
  <div class="section">
    <div class="section-title">Academic</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Course / Programme</div>
        <div class="field-value">{{CourseName}}</div>
      </div>
      <div class="field">
        <div class="field-label">Major / Field</div>
        <div class="field-value">{{Major}}</div>
      </div>
      <div class="field">
        <div class="field-label">GPA</div>
        <div class="field-value">{{GPA}}</div>
      </div>
      <div class="field">
        <div class="field-label">Hours / Credits</div>
        <div class="field-value">{{Hours}}</div>
      </div>
    </div>
  </div>

  <!-- ── Organisation ────────────────────────────────── -->
  <div class="section">
    <div class="section-title">Organisation — Workspace Identity (auto-injected from workspace settings)</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Workspace Issuer Name</div>
        <div class="field-value">{{WorkspaceIssuer}}</div>
      </div>
      <div class="field" style="align-items:flex-start;">
        <div class="field-label">Workspace Logo</div>
        <img src="{{WorkspaceLogo}}" alt="Logo" style="height:48px;width:auto;max-width:120px;object-fit:contain;margin-top:4px;border:1px solid #e0e4f0;border-radius:4px;" onerror="this.style.display='none'">
      </div>
    </div>
  </div>

  <!-- ── Per-row Organisation ──────────────────────── -->
  <div class="section">
    <div class="section-title">Per-row Organisation (from CSV)</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Institution</div>
        <div class="field-value">{{Institution}}</div>
      </div>
      <div class="field">
        <div class="field-label">Issuer</div>
        <div class="field-value">{{Issuer}}</div>
      </div>
      <div class="field">
        <div class="field-label">Signatory Title</div>
        <div class="field-value">{{Signature}}</div>
      </div>
      <div class="field">
        <div class="field-label">Location</div>
        <div class="field-value">{{Location}}</div>
      </div>
    </div>
  </div>

  <!-- ── Dates ───────────────────────────────────────── -->
  <div class="section">
    <div class="section-title">Dates</div>
    <div class="field-row">
      <div class="field">
        <div class="field-label">Issue Date</div>
        <div class="field-value">{{IssueDate}}</div>
      </div>
      <div class="field">
        <div class="field-label">Expiration Date</div>
        <div class="field-value">{{ExpirationDate}}</div>
      </div>
      <div class="field">
        <div class="field-label">Notes</div>
        <div class="field-value">{{Notes}}</div>
      </div>
    </div>
  </div>

  <!-- ── Course table (transcript use) ──────────────── -->
  <div class="section">
    <div class="section-title">Course Rows (for transcripts — remove if not needed)</div>
    <table class="course-table">
      <thead>
        <tr><th>Course Name</th><th>Grade</th><th>Credits</th><th>Semester</th></tr>
      </thead>
      <tbody>${courseRows}
      </tbody>
    </table>
  </div>

  <!-- ── Bottom bar: QR + verification ──────────────── -->
  <div class="bottom-bar">
    <div>
      <div class="field-label" style="margin-bottom:4px">Verification URL</div>
      <div class="field-value mono">{{VerificationURL}}</div>
    </div>
    <div class="qr-block">
      <img src="{{QR_CODE_IMAGE}}" alt="QR Code">
      <div class="qr-label">Scan to verify · {{QRUrl}}</div>
    </div>
  </div>

</div>
</body>
</html>`;
}
import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import {
  getWorkspace, getTemplatesDir, setWorkspace,
  listTemplates, listJobs, createJob,
  parseTemplateMeta, getPackageTemplatesDir,
  initTenantWorkspace, getDataDir,
} from './utils/jobs.js';
import { generateEmptyCSV, parseCSV } from './utils/csv.js';
import { renderJob, generateMailMergeFolder } from './utils/renderer.js';
import { resolveTemplatePath, validateCsvBuffer, validateTemplateHtml, validateLogoValue } from './utils/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auth (Chainletter token-based) ───────────────────────────────────────────
const activeSessions = new Map(); // credcli-token → { jwt, webhookUrl, tenant, groupname, expires }

function getSessionsPath() {
  return path.join(getDataDir(), 'sessions.json');
}

function loadSessions() {
  try {
    const data = fs.readJsonSync(getSessionsPath());
    const now = Date.now();
    for (const [token, session] of Object.entries(data)) {
      // Skip expired sessions
      if (session.expires && now > new Date(session.expires).getTime()) continue;
      activeSessions.set(token, session);
    }
  } catch { /* no sessions file yet */ }
}

function persistSessions() {
  try {
    const obj = {};
    for (const [token, session] of activeSessions) obj[token] = session;
    fs.ensureDirSync(getDataDir());
    fs.writeJsonSync(getSessionsPath(), obj, { spaces: 2 });
  } catch { /* best effort */ }
}

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const session = token && activeSessions.get(token);
  if (session) {
    req.chainSession = session;
    setWorkspace(path.join(getDataDir(), session.tenant));
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Server factory ────────────────────────────────────────────────────────────
export async function startServer(port = 3037) {
  loadSessions();
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Static SPA — served from dist/web/ (copied by build script)
  const webDir = path.join(__dirname, 'web');
  app.use(express.static(webDir));

  // ── Auth routes ─────────────────────────────────────────────────────────────
  app.post('/api/session/bootstrap', async (req, res) => {
    const { shortlink } = req.body ?? {};
    if (!shortlink) return res.status(400).json({ error: 'shortlink required' });
    console.log(`[auth] Bootstrap attempt from shortlink: ${shortlink}`);
    try {
      const claimUrl = new URL(shortlink);
      claimUrl.searchParams.set('claim', 'true');
      const r = await fetch(claimUrl.toString(), { redirect: 'follow' });
      if (!r.ok) {
        console.log(`[auth] Token claim failed — upstream returned ${r.status}`);
        return res.status(r.status).json({ error: `Upstream error ${r.status}` });
      }
      const data = await r.json();
      if (!data.success || !data.jwt) {
        console.log(`[auth] Token claim rejected: ${data.message || 'unknown reason'}`);
        return res.status(401).json({ error: data.message || 'Token claim failed' });
      }
      await initTenantWorkspace(data.tenant);
      console.log(`[auth] Login OK — tenant: ${data.tenant}, group: ${data.groupname}`);
      console.log(`[workspace] Assigned folder: ${path.join(getDataDir(), data.tenant)}`);
      const token = randomUUID();
      activeSessions.set(token, {
        jwt: data.jwt,
        webhookUrl: data.webhookurl,
        tenant: data.tenant,
        groupname: data.groupname,
        expires: data.expires,
        expiresIn: data.expires_in,
      });
      persistSessions();
      res.json({
        token,
        webhookUrl: data.webhookurl,
        tenant: data.tenant,
        groupname: data.groupname,
        expires: data.expires,
        expiresIn: data.expires_in,
      });
    } catch (e) {
      console.log(`[auth] Bootstrap error: ${e.message}`);
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/auth/logout', auth, (req, res) => {
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const { tenant, groupname } = req.chainSession;
    activeSessions.delete(token);
    persistSessions();
    console.log(`[auth] Logout — tenant: ${tenant}, group: ${groupname}`);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', auth, (req, res) => {
    const s = req.chainSession;
    res.json({ tenant: s.tenant, groupname: s.groupname, webhookUrl: s.webhookUrl, expires: s.expires });
  });

  // ── Workspace settings ────────────────────────────────────────────────────────
  const getWsConfigPath = () => path.join(getWorkspace(), 'workspace.json');

  app.get('/api/workspace', auth, async (_req, res) => {
    try {
      const cfg = await fs.readJson(getWsConfigPath());
      const smtp = cfg.smtp || {};
      res.json({
        issuerName: cfg.issuerName || '',
        logo: cfg.logo || '',
        smtp: {
          host: smtp.host || '',
          port: smtp.port || 587,
          secure: smtp.secure || false,
          user: smtp.user || '',
          fromAddress: smtp.fromAddress || '',
          hasPass: !!(smtp.pass),
        },
      });
    } catch {
      res.json({ issuerName: '', logo: '', smtp: { host: '', port: 587, secure: false, user: '', fromAddress: '', hasPass: false } });
    }
  });

  app.put('/api/workspace', auth, async (req, res) => {
    const { issuerName = '', logo = '', smtp } = req.body ?? {};
    const logoCheck = validateLogoValue(logo);
    if (!logoCheck.ok) return res.status(400).json({ error: logoCheck.error });
    let existing = {};
    try { existing = await fs.readJson(getWsConfigPath()); } catch {}
    const existingSmtp = existing.smtp || {};
    const newSmtp = smtp ? {
      host: smtp.host || '',
      port: Number(smtp.port) || 587,
      secure: !!smtp.secure,
      user: smtp.user || '',
      // Keep existing password if caller sends empty string (masked field)
      pass: smtp.pass || existingSmtp.pass || '',
      fromAddress: smtp.fromAddress || '',
    } : existingSmtp;
    await fs.writeJson(getWsConfigPath(), { issuerName, logo, smtp: newSmtp }, { spaces: 2 });
    res.json({ ok: true });
  });

  // Test SMTP settings by sending a test email
  app.post('/api/workspace/smtp/test', auth, async (req, res) => {
    const { to } = req.body ?? {};
    if (!to) return res.status(400).json({ error: 'to address required' });
    let cfg = {};
    try { cfg = await fs.readJson(getWsConfigPath()); } catch {}
    const smtp = cfg.smtp || {};
    if (!smtp.host) return res.status(400).json({ error: 'SMTP host not configured' });
    if (!smtp.pass) return res.status(400).json({ error: 'SMTP password not set' });
    const fromAddress = smtp.fromAddress || smtp.user || 'noreply@example.com';
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: Number(smtp.port) || 587,
        secure: !!smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
      });
      await transporter.sendMail({
        from: fromAddress,
        to,
        subject: 'CredCLI SMTP Test',
        text: `This is a test email from CredCLI.\n\nSMTP host: ${smtp.host}\nFrom: ${fromAddress}`,
        html: `<p>This is a test email from <strong>CredCLI</strong>.</p><p style="color:#888;font-size:12px">SMTP host: ${smtp.host} &nbsp;·&nbsp; From: ${fromAddress}</p>`,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Template routes ──────────────────────────────────────────────────────────
  app.get('/api/templates', auth, (_req, res) => {
    res.json(listTemplates());
  });

  app.get('/api/templates/:name', auth, (req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), req.params.name); } catch { return res.status(400).json({ error: 'Invalid file name' }); }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const html = fs.readFileSync(filePath, 'utf8');
    const meta = parseTemplateMeta(filePath);
    res.json({ file: req.params.name, html, meta });
  });

  // Raw HTML endpoint — for iframe previews (no auth required, low-sensitivity)
  app.get('/api/templates/:name/raw', (_req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), _req.params.name); } catch { return res.status(400).send(''); }
    if (!fs.existsSync(filePath)) return res.status(404).send('');
    res.setHeader('Content-Type', 'text/html');
    res.send(fs.readFileSync(filePath, 'utf8'));
  });

  app.put('/api/templates/:name', auth, (req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), req.params.name); } catch { return res.status(400).json({ error: 'Invalid file name' }); }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    let html = req.body.html ?? '';
    const htmlCheck = validateTemplateHtml(html);
    if (!htmlCheck.ok) return res.status(400).json({ error: htmlCheck.error });

    // Auto-sync the fields list from every {{PLACEHOLDER}} token found in the HTML.
    // This means users can define custom placeholders simply by typing them — they'll
    // automatically appear as columns in the generated mailmerge CSV.
    const seen = new Set();
    const fields = [];
    for (const m of html.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
      if (m[1] !== 'QR_CODE_IMAGE' && !seen.has(m[1])) {
        seen.add(m[1]);
        fields.push(m[1]);
      }
    }
    html = html.replace(/<!--CREDCLI:([\s\S]*?)-->/, (full, json) => {
      try {
        const meta = JSON.parse(json);
        meta.fields = fields;
        return `<!--CREDCLI:${JSON.stringify(meta)}-->`;
      } catch {
        return full;
      }
    });

    fs.writeFileSync(filePath, html, 'utf8');
    res.json({ ok: true });
  });

  // Create a new blank template
  app.post('/api/templates', auth, (req, res) => {
    const { name, width = 1200, height = 900 } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const filename = `${slug}_${width}x${height}.html`;
    const filePath = path.join(getTemplatesDir(), filename);
    if (fs.existsSync(filePath)) return res.status(409).json({ error: `Template "${filename}" already exists` });
    fs.writeFileSync(filePath, generateBlankTemplate(name.trim(), width, height), 'utf8');
    res.json({ file: filename, name: name.trim(), width, height });
  });

  app.post('/api/templates/:name/reset', auth, (req, res) => {
    let pkgPath, wsPath;
    try {
      pkgPath = resolveTemplatePath(getPackageTemplatesDir(), req.params.name);
      wsPath  = resolveTemplatePath(getTemplatesDir(), req.params.name);
    } catch { return res.status(400).json({ error: 'Invalid file name' }); }
    if (!fs.existsSync(pkgPath)) return res.status(404).json({ error: 'Original not found' });
    fs.copySync(pkgPath, wsPath);
    res.json({ ok: true, html: fs.readFileSync(wsPath, 'utf8') });
  });

  // ── Job routes ───────────────────────────────────────────────────────────────
  app.get('/api/jobs', auth, (_req, res) => res.json(listJobs()));

  app.post('/api/jobs', auth, async (req, res) => {
    const templates = listTemplates();
    const tmpl = templates.find(t => t.file === req.body.template);
    if (!tmpl) return res.status(400).json({ error: 'Template not found' });
    const { jobId, jobDir } = await createJob(tmpl);
    generateEmptyCSV(tmpl.fields, path.join(jobDir, 'mailmerge.csv'));
    res.json({ jobId, jobDir });
  });

  app.get('/api/jobs/:id', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    let csvRows = [];
    try { csvRows = parseCSV(job.csvPath); } catch {}
    const outputDir = path.join(job.jobDir, 'output');
    let outputFiles = [];
    try {
      let resultsMap = {};
      try {
        const saved = await fs.readJson(path.join(outputDir, 'results.json'));
        for (const r of saved) resultsMap[r.file] = r.row;
      } catch {}
      outputFiles = fs.readdirSync(outputDir)
        .filter(f => !f.startsWith('_tmp') && f !== 'results.json')
        .map(f => {
          const stat = fs.statSync(path.join(outputDir, f));
          return { name: f, size: stat.size, mtime: stat.mtime, row: resultsMap[f] ?? null };
        });
    } catch {}
    res.json({ ...job, csvRows, outputFiles });
  });

  // Download the job's mailmerge CSV
  app.get('/api/jobs/:id/csv', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.download(job.csvPath, 'mailmerge.csv');
  });

  // Upload a filled mailmerge CSV
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
  app.post('/api/jobs/:id/csv', auth, upload.single('csv'), (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const csvCheck = validateCsvBuffer(req.file.buffer);
    if (!csvCheck.ok) return res.status(400).json({ error: csvCheck.error });
    fs.writeFileSync(job.csvPath, req.file.buffer.toString('utf8'), 'utf8');
    res.json({ ok: true });
  });

  // Clear a job's CSV back to an empty template
  app.delete('/api/jobs/:id/csv', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    generateEmptyCSV(job.fields || [], job.csvPath);
    res.json({ ok: true });
  });

  // Run a job — streams progress as Server-Sent Events
  app.get('/api/jobs/:id/run', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const format = req.query.format === 'png' ? 'png' : 'pdf';

    // Optional secondary email template (path.basename prevents traversal)
    let emailTemplatePath = null;
    if (req.query.emailTemplate) {
      const candidate = path.join(getTemplatesDir(), path.basename(req.query.emailTemplate));
      if (fs.existsSync(candidate)) emailTemplatePath = candidate;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const results = await renderJob(job.jobDir, format, (eventOrDone, total, latest) => {
        if (typeof eventOrDone === 'object') {
          send(eventOrDone);
        } else {
          send({ type: 'progress', done: eventOrDone, total, latest });
        }
      }, emailTemplatePath);
      send({ type: 'done', results });
    } catch (err) {
      send({ type: 'error', message: err.message });
    }
    res.end();
  });

  // List output files
  app.get('/api/jobs/:id/output', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const outputDir = path.join(job.jobDir, 'output');
    let files = [];
    try {
      let resultsMap = {};
      try {
        const saved = await fs.readJson(path.join(outputDir, 'results.json'));
        for (const r of saved) resultsMap[r.file] = r.row;
      } catch {}
      files = fs.readdirSync(outputDir)
        .filter(f => !f.startsWith('_tmp') && f !== 'results.json')
        .map(f => {
          const s = fs.statSync(path.join(outputDir, f));
          return { name: f, size: s.size, mtime: s.mtime, row: resultsMap[f] ?? null };
        });
    } catch {}
    res.json(files);
  });

  // List files in the mail_merge subfolder
  app.get('/api/jobs/:id/output/mail_merge', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const mmDir = path.join(job.jobDir, 'output', 'mail_merge');
    if (!fs.existsSync(mmDir)) return res.json([]);
    const files = fs.readdirSync(mmDir)
      .filter(f => !f.startsWith('_tmp'))
      .map(f => {
        const s = fs.statSync(path.join(mmDir, f));
        return { name: f, size: s.size };
      });
    res.json(files);
  });

  // Download a file from the mail_merge subfolder
  app.get('/api/jobs/:id/output/mail_merge/:file', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(job.jobDir, 'output', 'mail_merge', req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const ext  = path.extname(filePath).toLowerCase();
    const mime = ext === '.eml' ? 'message/rfc822' : ext === '.mbox' ? 'application/mbox' : 'text/csv';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  });

  // Download a single output file
  app.get('/api/jobs/:id/output/:file', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(job.jobDir, 'output', req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.pdf' ? 'application/pdf' : ext === '.eml' ? 'message/rfc822' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(path.basename(filePath))}"`);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => res.status(500).end());
    stream.pipe(res);
  });

  // Delete a single output file
  app.delete('/api/jobs/:id/output/:file', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(job.jobDir, 'output', req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    fs.removeSync(filePath);
    res.json({ ok: true });
  });

  // ── Chainletter integration ───────────────────────────────────────────────────

  // List existing collections (groups) from Chainletter
  app.get('/api/chainletter/collections', auth, async (req, res) => {
    const { jwt, webhookUrl } = req.chainSession;
    try {
      const r = await fetch(webhookUrl, { headers: { Authorization: `Bearer ${jwt}` } });
      const data = await r.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Assign / lock a Chainletter collection to this job
  app.patch('/api/jobs/:id/chainletter', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const { collectionId, collectionName, network } = req.body;
    if (!collectionId) return res.status(400).json({ error: 'collectionId required' });
    const validNetworks = ['public', 'private'];
    const resolvedNetwork = validNetworks.includes(network) ? network : 'private';
    const jobMetaPath = path.join(job.jobDir, 'job.json');
    const meta = await fs.readJson(jobMetaPath);
    meta.chainletterCollection = { id: collectionId, name: collectionName || collectionId, network: resolvedNetwork };
    await fs.writeJson(jobMetaPath, meta, { spaces: 2 });
    res.json({ ok: true, collection: meta.chainletterCollection });
  });

  // Upload all output files to the assigned Chainletter collection (SSE stream)
  app.get('/api/jobs/:id/send-to-chainletter', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);
    try {
      const { jwt, webhookUrl } = req.chainSession;
      const meta = await fs.readJson(path.join(job.jobDir, 'job.json'));
      const collection = meta.chainletterCollection;
      if (!collection) throw new Error('No Chainletter collection assigned to this job');
      const outputDir = path.join(job.jobDir, 'output');
      // Only upload credential files — skip .eml and mail_merge outputs
      const files = fs.readdirSync(outputDir)
        .filter(f => !f.startsWith('_tmp') && f !== 'results.json' && /\.(pdf|png)$/i.test(f));
      send({ type: 'start', total: files.length });
      let done = 0;
      for (const filename of files) {
        const filePath = path.join(outputDir, filename);
        const ext = path.extname(filename).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : 'application/pdf';
        const fileBuffer = await fs.readFile(filePath);
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer], { type: mime }), filename);
        const r = await fetch(webhookUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}`, 'group-id': collection.id, network: collection.network || 'private' },
          body: formData,
        });
        const result = await r.json();
        done++;
        const alreadyExists = !result.success && /already exists/i.test(result.message || '');
        if (!result.success && !alreadyExists) throw new Error(`Upload failed for ${filename}: ${result.message}`);
        send({ type: 'progress', done, total: files.length, file: filename, hash: result.hash ?? null, skipped: alreadyExists });
      }

      // Fetch claim links for all uploaded files from Chainletter
      const claimLinks = {};
      try {
        const serverBase = new URL(webhookUrl).origin;
        const linksResp = await fetch(webhookUrl, {
          headers: { Authorization: `Bearer ${jwt}`, 'group-id': collection.id, 'export-links': 'true' },
        });
        const filesData = await linksResp.json();
        const filesList = Array.isArray(filesData) ? filesData : (filesData.files ?? filesData.data ?? []);
        for (const f of filesList) {
          const name = f.name || f.filename || '';
          // Use the explicit link if provided; fall back to a server-derived URL from the hash
          const link = f.link || f.url || f.claim_link || f.download_link
            || (f.hash ? `${serverBase}/view/${f.hash}` : null);
          if (name && link) claimLinks[name] = link;
        }
      } catch {}

      // Persist claim links so generate-emails can use them later
      meta.chainletterClaimLinks = claimLinks;
      meta.chainletterSent = true;
      meta.chainletterSentAt = new Date().toISOString();
      await fs.writeJson(path.join(job.jobDir, 'job.json'), meta, { spaces: 2 });

      send({ type: 'done', total: files.length, collectionId: collection.id, claimLinks });
    } catch (e) {
      send({ type: 'error', message: e.message });
    }
    res.end();
  });

  // Mark job as successfully sent to Chainletter
  app.patch('/api/jobs/:id/chainletter-sent', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const jobMetaPath = path.join(job.jobDir, 'job.json');
    const meta = await fs.readJson(jobMetaPath);
    meta.chainletterSent = true;
    meta.chainletterSentAt = new Date().toISOString();
    await fs.writeJson(jobMetaPath, meta, { spaces: 2 });
    res.json({ ok: true });
  });

  // Generate .eml files for a job using stored Chainletter claim links
  app.post('/api/jobs/:id/generate-emails', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const { emailTemplate } = req.body ?? {};
    if (!emailTemplate) return res.status(400).json({ error: 'emailTemplate required' });

    const tmplPath = path.join(getTemplatesDir(), path.basename(emailTemplate));
    if (!fs.existsSync(tmplPath)) return res.status(404).json({ error: 'Email template not found' });

    const meta        = await fs.readJson(path.join(job.jobDir, 'job.json'));
    const claimLinks  = meta.chainletterClaimLinks ?? {};
    const outputDir   = path.join(job.jobDir, 'output');
    const resultsPath = path.join(outputDir, 'results.json');
    if (!fs.existsSync(resultsPath)) return res.status(400).json({ error: 'No results found — run the job first' });

    const results         = await fs.readJson(resultsPath);
    const emailTemplateHtml  = fs.readFileSync(tmplPath, 'utf8');
    const { parseTemplateMeta } = await import('./utils/jobs.js');
    const emailTemplateMeta  = parseTemplateMeta(tmplPath);

    await generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, claimLinks);

    const mmDir = path.join(outputDir, 'mail_merge');
    const files = fs.existsSync(mmDir)
      ? fs.readdirSync(mmDir).filter(f => !f.startsWith('_tmp')).map(f => {
          const s = fs.statSync(path.join(mmDir, f));
          return { name: f, size: s.size };
        })
      : [];
    res.json({ ok: true, count: results.length, files });
  });

  // Stamp the Chainletter collection (blockchain postmark)
  app.post('/api/jobs/:id/stamp-chainletter', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const jobMetaPath = path.join(job.jobDir, 'job.json');
    const meta = await fs.readJson(jobMetaPath);
    const collection = meta.chainletterCollection;
    if (!collection) return res.status(400).json({ error: 'No Chainletter collection assigned' });
    const { jwt, webhookUrl } = req.chainSession;
    try {
      const r = await fetch(webhookUrl, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${jwt}`, 'group-id': collection.id, network: collection.network || 'private' },
      });
      const data = await r.json();
      if (!data.success) throw new Error(data.message || 'Stamp failed');
      meta.chainletterStamped = true;
      meta.chainletterStampedAt = new Date().toISOString();
      await fs.writeJson(jobMetaPath, meta, { spaces: 2 });
      res.json({ ok: true, filesStamped: data.files_stamped });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Download all EML files from mail_merge as a ZIP
  app.get('/api/jobs/:id/output/mail_merge.zip', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const mmDir = path.join(job.jobDir, 'output', 'mail_merge');
    if (!fs.existsSync(mmDir)) return res.status(404).json({ error: 'No mail_merge folder' });
    const files = fs.readdirSync(mmDir).filter(f => !f.startsWith('_tmp') && f.endsWith('.eml'));
    if (!files.length) return res.status(404).json({ error: 'No EML files found' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="emails-${req.params.id}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { console.error('[zip] Error:', err.message); res.end(); });
    archive.pipe(res);
    for (const f of files) archive.file(path.join(mmDir, f), { name: f });
    archive.finalize();
  });

  // Download all credential images (PNG/PDF) as a ZIP
  app.get('/api/jobs/:id/output/credentials.zip', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const outputDir = path.join(job.jobDir, 'output');
    let files = [];
    try { files = fs.readdirSync(outputDir).filter(f => !f.startsWith('_tmp') && /\.(pdf|png)$/i.test(f)); } catch {}
    if (!files.length) return res.status(404).json({ error: 'No credential files found' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="credentials-${req.params.id}.zip"`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { console.error('[zip] Error:', err.message); res.end(); });
    archive.pipe(res);
    for (const f of files) archive.file(path.join(outputDir, f), { name: f });
    archive.finalize();
  });

  // ── SPA catch-all ────────────────────────────────────────────────────────────
  app.get('/{*path}', (_req, res) => res.send(fs.readFileSync(path.join(webDir, 'index.html'), 'utf8')));

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, () => resolve(s));
    s.on('error', reject);
  });

  return { port, server };
}
