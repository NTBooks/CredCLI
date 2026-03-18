import express from 'express';

// ── Master placeholder list ───────────────────────────────────────────────────
// Every field the renderer understands. New blank templates show all of these.
export const ALL_FIELDS = [
  // Core recipient
  'FullName', 'FName', 'LName',
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
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import {
  setWorkspace, getWorkspace, getTemplatesDir, getJobsDir,
  listTemplates, listJobs, createJob,
  parseTemplateMeta, getPackageTemplatesDir,
} from './utils/jobs.js';
import { generateEmptyCSV, parseCSV } from './utils/csv.js';
import { renderJob } from './utils/renderer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auth (Chainletter token-based) ───────────────────────────────────────────
const activeSessions = new Map(); // credcli-token → { jwt, webhookUrl, tenant, groupname, expires }

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const session = token && activeSessions.get(token);
  if (session) { req.chainSession = session; return next(); }
  res.status(401).json({ error: 'Unauthorized' });
}

// ── Server factory ────────────────────────────────────────────────────────────
export async function startServer(port = 3037) {
  const baseDir = path.join(process.cwd(), '.data');

  async function initTenantWorkspace(tenant) {
    const tenantDir = path.join(baseDir, tenant);
    await fs.ensureDir(tenantDir);
    const wsTemplates = path.join(tenantDir, 'templates');
    if (!await fs.pathExists(wsTemplates)) {
      await fs.copy(getPackageTemplatesDir(), wsTemplates);
    }
    await fs.ensureDir(path.join(tenantDir, 'jobs'));
    setWorkspace(tenantDir);
    return tenantDir;
  }

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
      console.log(`[workspace] Assigned folder: ${path.join(baseDir, data.tenant)}`);
      const token = randomUUID();
      activeSessions.set(token, {
        jwt: data.jwt,
        webhookUrl: data.webhookurl,
        tenant: data.tenant,
        groupname: data.groupname,
        expires: data.expires,
        expiresIn: data.expires_in,
      });
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
      res.json({ issuerName: cfg.issuerName || '', logo: cfg.logo || '' });
    } catch {
      res.json({ issuerName: '', logo: '' });
    }
  });

  app.put('/api/workspace', auth, async (req, res) => {
    const { issuerName = '', logo = '' } = req.body ?? {};
    await fs.writeJson(getWsConfigPath(), { issuerName, logo }, { spaces: 2 });
    res.json({ ok: true });
  });

  // ── Template routes ──────────────────────────────────────────────────────────
  app.get('/api/templates', auth, (_req, res) => {
    res.json(listTemplates());
  });

  app.get('/api/templates/:name', auth, (req, res) => {
    const filePath = path.join(getTemplatesDir(), req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const html = fs.readFileSync(filePath, 'utf8');
    const meta = parseTemplateMeta(filePath);
    res.json({ file: req.params.name, html, meta });
  });

  // Raw HTML endpoint — for iframe previews (no auth required, low-sensitivity)
  app.get('/api/templates/:name/raw', (_req, res) => {
    const filePath = path.join(getTemplatesDir(), _req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).send('');
    res.setHeader('Content-Type', 'text/html');
    res.send(fs.readFileSync(filePath, 'utf8'));
  });

  app.put('/api/templates/:name', auth, (req, res) => {
    const filePath = path.join(getTemplatesDir(), req.params.name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    let html = req.body.html ?? '';

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
    const pkgPath = path.join(getPackageTemplatesDir(), req.params.name);
    const wsPath  = path.join(getTemplatesDir(), req.params.name);
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

  app.get('/api/jobs/:id', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    let csvRows = [];
    try { csvRows = parseCSV(job.csvPath); } catch {}
    const outputDir = path.join(job.jobDir, 'output');
    let outputFiles = [];
    try {
      outputFiles = fs.readdirSync(outputDir)
        .filter(f => !f.startsWith('_tmp'))
        .map(f => {
          const stat = fs.statSync(path.join(outputDir, f));
          return { name: f, size: stat.size, mtime: stat.mtime };
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

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const results = await renderJob(job.jobDir, format, (done, total, latest) =>
        send({ type: 'progress', done, total, latest })
      );
      send({ type: 'done', results });
    } catch (err) {
      send({ type: 'error', message: err.message });
    }
    res.end();
  });

  // List output files
  app.get('/api/jobs/:id/output', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const outputDir = path.join(job.jobDir, 'output');
    let files = [];
    try {
      files = fs.readdirSync(outputDir)
        .filter(f => !f.startsWith('_tmp'))
        .map(f => {
          const s = fs.statSync(path.join(outputDir, f));
          return { name: f, size: s.size, mtime: s.mtime };
        });
    } catch {}
    res.json(files);
  });

  // Download a single output file
  app.get('/api/jobs/:id/output/:file', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    const filePath = path.join(job.jobDir, 'output', req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.download(filePath);
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

  // ── SPA catch-all ────────────────────────────────────────────────────────────
  app.get('/{*path}', (_req, res) => res.send(fs.readFileSync(path.join(webDir, 'index.html'), 'utf8')));

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, () => resolve(s));
    s.on('error', reject);
  });

  return { port, server };
}
