import express from 'express';
import archiver from 'archiver';
import { stampCollection, uploadFilesToCollection } from './utils/chainletter.js';
import { resolveSmtp, sendEmailsFromMailMerge, testSmtp } from './utils/email.js';

// Fields that are auto-injected at render time — never needed as CSV columns.
const AUTO_INJECTED_FIELDS = new Set(['WorkspaceIssuer', 'WorkspaceLogo', 'VerificationURL', 'QRUrl', 'QR_CODE_IMAGE']);
import 'dotenv/config';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { randomUUID } from 'crypto';
import {
  getWorkspace, getTemplatesDir, setWorkspace,
  listTemplates, listJobs, createJob,
  parseTemplateMeta,
  initTenantWorkspace, getDataDir,
  createTemplate, resetTemplate,
} from './utils/jobs.js';
import { generateEmptyCSV, parseCSV, applyReplacements } from './utils/csv.js';
import { renderJob, generateMailMergeFolder } from './utils/renderer.js';
import { resolveTemplatePath, validateCsvBuffer, validateTemplateHtml, validateLogoValue } from './utils/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Auth (Chainletter token-based) ───────────────────────────────────────────
const activeSessions = new Map(); // credcli-token → { jwt, webhookUrl, tenant, groupname, expires }
const activeRenders  = new Set(); // job IDs currently being rendered

function getSessionsPath() {
  return path.join(getDataDir(), 'sessions.json');
}

const HOSTED = process.env.HOSTED === 'true';

function loadSessions() {
  if (HOSTED) return; // hosted mode: sessions are in-memory only, never read from disk
  try {
    const data = fs.readJsonSync(getSessionsPath());
    const now = Date.now();
    let loaded = 0, expired = 0;
    for (const [token, session] of Object.entries(data)) {
      // Skip expired sessions
      if (session.expires && now > new Date(session.expires).getTime()) { expired++; continue; }
      activeSessions.set(token, session);
      loaded++;
    }
    console.log(`[sessions] Loaded ${loaded} session(s) from disk${expired ? `, skipped ${expired} expired` : ''}`);
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[sessions] Failed to load sessions.json:', e.message);
  }
}

function persistSessions() {
  if (HOSTED) return; // hosted mode: sessions are in-memory only, never written to disk
  try {
    const obj = {};
    for (const [token, session] of activeSessions) obj[token] = session;
    fs.ensureDirSync(getDataDir());
    fs.writeJsonSync(getSessionsPath(), obj, { spaces: 2 });
    console.log(`[sessions] Persisted ${activeSessions.size} session(s) to ${getSessionsPath()}`);
  } catch (e) {
    console.error('[sessions] Failed to persist sessions:', e.message);
  }
}

function auth(req, res, next) {
  let token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  // Fallback: read token from cookie (used by iframes which can't send headers)
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/credcli_session=([^;]+)/);
    if (match) {
      try { token = JSON.parse(decodeURIComponent(match[1])).token || ''; } catch { /* ignore */ }
    }
  }
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
      // Reuse existing session if the JWT is the same
      let token = null;
      for (const [t, s] of activeSessions) {
        if (s.jwt === data.jwt) { token = t; break; }
      }
      if (token) {
        console.log(`[auth] Reusing existing session for JWT`);
      } else {
        token = randomUUID();
        activeSessions.set(token, {
          jwt: data.jwt,
          webhookUrl: data.webhookurl,
          tenant: data.tenant,
          groupname: data.groupname,
          expires: data.expires,
          expiresIn: data.expires_in,
        });
        persistSessions();
      }
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

  // Tenant stats proxy: returns credits/remaining stamps
  app.get('/api/stats', auth, async (req, res) => {
    const { jwt, webhookUrl } = req.chainSession;
    try {
      const r = await fetch(webhookUrl, { method: 'HEAD', headers: { Authorization: `Bearer ${jwt}` } });
      const creditsHeader = r.headers.get('x-credits');
      const parsedCredits = parseInt(creditsHeader, 10);
      const credits = Number.isNaN(parsedCredits) ? null : parsedCredits;
      return res.json({ success: true, credits, remaining: credits });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // ── Workspace settings ────────────────────────────────────────────────────────
  const getWsConfigPath = () => path.join(getWorkspace(), 'workspace.json');


  app.get('/api/workspace', auth, async (_req, res) => {
    try {
      const cfg = await fs.readJson(getWsConfigPath());
      const smtp = resolveSmtp(cfg.smtp || {});
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
    const smtp = resolveSmtp(cfg.smtp || {});
    if (!smtp.host) return res.status(400).json({ error: 'SMTP host not configured' });
    if (!smtp.pass) return res.status(400).json({ error: 'SMTP password not set' });
    try {
      const info = await testSmtp(smtp, to);
      if (process.env.DEBUG === 'true') console.log('[SMTP test] accepted:', info.accepted, '| rejected:', info.rejected, '| response:', info.response);
      res.json({ ok: true, accepted: info.accepted, rejected: info.rejected, response: info.response, messageId: info.messageId });
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

  // Raw HTML endpoint — for iframe previews (requires session auth)
  app.get('/api/templates/:name/raw', auth, (_req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), _req.params.name); } catch { return res.status(400).send(''); }
    if (!fs.existsSync(filePath)) return res.status(404).send('');
    res.setHeader('Content-Type', 'text/html');
    res.send(fs.readFileSync(filePath, 'utf8'));
  });

  // Preview endpoint — same as /raw but with workspace vars (logo, issuer) pre-filled
  app.get('/api/templates/:name/preview', auth, async (_req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), _req.params.name); } catch { return res.status(400).send(''); }
    if (!fs.existsSync(filePath)) return res.status(404).send('');
    let html = fs.readFileSync(filePath, 'utf8');
    try {
      const wsCfg = await fs.readJson(path.join(getWorkspace(), 'workspace.json'));
      const vars = {};
      if (wsCfg.issuerName) vars.WorkspaceIssuer = wsCfg.issuerName;
      if (wsCfg.logo)       vars.WorkspaceLogo   = wsCfg.logo;
      html = applyReplacements(html, vars);
    } catch { /* no workspace config — serve raw */ }
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
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

  // Update template metadata fields (e.g. type)
  app.patch('/api/templates/:name/meta', auth, (req, res) => {
    let filePath;
    try { filePath = resolveTemplatePath(getTemplatesDir(), req.params.name); } catch { return res.status(400).json({ error: 'Invalid file name' }); }
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    const updates = req.body ?? {};
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/<!--CREDCLI:([\s\S]*?)-->/, (full, json) => {
      try {
        const meta = JSON.parse(json);
        Object.assign(meta, updates);
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
    try {
      const tmpl = createTemplate(name.trim(), width, height);
      res.json({ file: tmpl.filename, name: tmpl.name, width: tmpl.width, height: tmpl.height });
    } catch (e) {
      if (e.message.includes('already exists')) return res.status(409).json({ error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/templates/:name/reset', auth, (req, res) => {
    try {
      const html = resetTemplate(req.params.name);
      res.json({ ok: true, html });
    } catch (e) {
      if (e.message.includes('not found')) return res.status(404).json({ error: e.message });
      res.status(400).json({ error: e.message });
    }
  });

  // ── Job routes ───────────────────────────────────────────────────────────────
  app.get('/api/jobs', auth, (_req, res) => res.json(listJobs()));

  app.post('/api/jobs', auth, async (req, res) => {
    const templates = listTemplates();
    const tmpl = templates.find(t => t.file === req.body.template);
    if (!tmpl) return res.status(400).json({ error: 'Template not found' });
    const { jobId, jobDir } = await createJob(tmpl);
    generateEmptyCSV(tmpl.fields.filter(f => !AUTO_INJECTED_FIELDS.has(f)), path.join(jobDir, 'mailmerge.csv'));
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
          return { name: f, size: stat.size, mtime: stat.mtime, isDir: stat.isDirectory(), row: resultsMap[f] ?? null };
        })
        .filter(f => !f.isDir);
    } catch {}
    res.json({ ...job, csvRows, outputFiles });
  });

  // Download the job's mailmerge CSV
  app.get('/api/jobs/:id/csv', auth, (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    if (!fs.existsSync(job.csvPath)) {
      generateEmptyCSV((job.fields || []).filter(f => !AUTO_INJECTED_FIELDS.has(f)), job.csvPath);
    }
    res.download(job.csvPath, 'mailmerge.csv', { dotfiles: 'allow' });
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

    if (activeRenders.has(job.jobId)) {
      return res.status(409).json({ error: 'A render is already in progress for this job. Please wait for it to finish.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    activeRenders.add(job.jobId);
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
    } finally {
      activeRenders.delete(job.jobId);
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
      const files = fs.readdirSync(outputDir).filter(f => /\.(pdf|png)$/i.test(f));
      send({ type: 'start', total: files.length });
      let progressDone = 0;
      const { fileHashes } = await uploadFilesToCollection(
        webhookUrl, collection.id, jwt, collection.network || 'private', outputDir, collection.name ?? collection.id,
        ({ filename, hash, skipped, manifest }) => {
          if (!manifest) {
            progressDone++;
            send({ type: 'progress', done: progressDone, total: files.length, file: filename, hash: hash ?? null, skipped });
          }
        },
      );

      // Persist file hashes — claim links are fetched after stamp
      meta.chainletterFileHashes = { ...meta.chainletterFileHashes, ...fileHashes };
      meta.chainletterClaimLinks = {};
      meta.chainletterSent = true;
      meta.chainletterSentAt = new Date().toISOString();
      await fs.writeJson(path.join(job.jobDir, 'job.json'), meta, { spaces: 2 });

      send({ type: 'done', total: files.length, collectionId: collection.id, claimLinks: {} });
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

    const meta             = await fs.readJson(path.join(job.jobDir, 'job.json'));
    const claimLinks       = meta.chainletterClaimLinks ?? {};
    const verificationLinks = meta.chainletterVerificationLinks ?? {};
    const outputDir   = path.join(job.jobDir, 'output');
    const resultsPath = path.join(outputDir, 'results.json');
    if (!fs.existsSync(resultsPath)) return res.status(400).json({ error: 'No results found — run the job first' });

    const results         = await fs.readJson(resultsPath);
    const emailTemplateHtml  = fs.readFileSync(tmplPath, 'utf8');
    const { parseTemplateMeta } = await import('./utils/jobs.js');
    const emailTemplateMeta  = parseTemplateMeta(tmplPath);

    await generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, claimLinks, undefined, verificationLinks);

    const mmDir = path.join(outputDir, 'mail_merge');
    const files = fs.existsSync(mmDir)
      ? fs.readdirSync(mmDir).filter(f => !f.startsWith('_tmp')).map(f => {
          const s = fs.statSync(path.join(mmDir, f));
          return { name: f, size: s.size };
        })
      : [];
    res.json({ ok: true, count: results.length, files });
  });

  // Send all .eml files in mail_merge/ via SMTP
  app.post('/api/jobs/:id/send-emails', auth, async (req, res) => {
    const job = listJobs().find(j => j.jobId === req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const wsPath = getWsConfigPath();
    const cfg = fs.existsSync(wsPath) ? await fs.readJson(wsPath) : {};
    const smtp = resolveSmtp(cfg.smtp || {});
    if (!smtp.host) return res.status(400).json({ error: 'SMTP not configured' });
    if (!smtp.pass) return res.status(400).json({ error: 'SMTP password not set' });

    const mmDir = path.join(job.jobDir, 'output', 'mail_merge');
    if (!fs.existsSync(mmDir)) return res.status(400).json({ error: 'No mail_merge folder — generate emails first' });

    try {
      const { sent, skipped, errors } = await sendEmailsFromMailMerge(mmDir, smtp);
      res.json({ ok: true, sent, skipped, errors });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
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
      const { filesStamped, claimLinks, verificationLinks } = await stampCollection(
        webhookUrl, collection.id, jwt, collection.network || 'private',
      );
      meta.chainletterStamped = true;
      meta.chainletterStampedAt = new Date().toISOString();
      meta.chainletterClaimLinks = claimLinks;
      meta.chainletterVerificationLinks = verificationLinks;

      await fs.writeJson(jobMetaPath, meta, { spaces: 2 });
      res.json({ ok: true, filesStamped, claimLinks });
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
