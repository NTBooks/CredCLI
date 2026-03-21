import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveTemplatePath } from './validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Optional workspace override — set by `credcli serve`
let _workspaceDir = null;
export function setWorkspace(dir) { _workspaceDir = dir ? path.resolve(dir) : null; }
export function getWorkspace() { return _workspaceDir; }

// Returns the persistent data root: $PERSIST (resolved) or <cwd>/.data
export function getDataDir() {
  return process.env.PERSIST
    ? path.resolve(process.env.PERSIST)
    : path.join(process.cwd(), '.data');
}

// token.json lives inside the data dir (.data/token.json).
// On first call, silently migrate any legacy root-level token.json into .data/.
export function getTokenPath() {
  const dataPath = path.join(getDataDir(), 'token.json');
  if (!process.env.PERSIST) {
    const legacyPath = path.join(process.cwd(), 'token.json');
    if (fs.existsSync(legacyPath) && !fs.existsSync(dataPath)) {
      try {
        fs.ensureDirSync(getDataDir());
        fs.moveSync(legacyPath, dataPath);
      } catch { /* best effort */ }
    }
  }
  return dataPath;
}

export function getPackageTemplatesDir() {
  const candidates = [
    path.join(__dirname, '..', '..', 'templates'),  // dev: src/utils -> root
    path.join(__dirname, '..', 'templates'),         // built: dist -> root
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('Cannot locate package templates directory');
}

export function getTemplatesDir() {
  if (_workspaceDir) return path.join(_workspaceDir, 'templates');
  return getPackageTemplatesDir();
}

export function getJobsDir() {
  if (_workspaceDir) return path.join(_workspaceDir, 'jobs');
  return path.join(process.cwd(), 'jobs');
}

// Parse <!--CREDCLI:{...}--> metadata from template HTML
export function parseTemplateMeta(htmlPath) {
  const content = fs.readFileSync(htmlPath, 'utf8');
  const match = content.match(/<!--CREDCLI:(.*?)-->/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function listTemplates() {
  const dir = getTemplatesDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  return files.map(file => {
    const meta = parseTemplateMeta(path.join(dir, file));
    // Fallback: parse name and dimensions from filename (name_WxH.html)
    const nameMatch = file.match(/^(.+?)_(\d+)x(\d+)\.html$/);
    return {
      file,
      path: path.join(dir, file),
      name: meta?.name ?? (nameMatch ? nameMatch[1].replace(/-/g, ' ') : file),
      description: meta?.description ?? '',
      type: meta?.type ?? 'credential',
      subject: meta?.subject ?? '',
      width: meta?.width ?? (nameMatch ? parseInt(nameMatch[2]) : 1200),
      height: meta?.height ?? (nameMatch ? parseInt(nameMatch[3]) : 900),
      fields: meta?.fields ?? [],
    };
  });
}

export function listJobs() {
  const jobsDir = getJobsDir();
  if (!fs.existsSync(jobsDir)) return [];
  return fs.readdirSync(jobsDir)
    .filter(d => /^job\d+$/.test(d) && fs.statSync(path.join(jobsDir, d)).isDirectory())
    .sort()
    .map(jobId => {
      const jobDir = path.join(jobsDir, jobId);
      const infoPath = path.join(jobDir, 'job.json');
      const csvPath = path.join(jobDir, 'mailmerge.csv');
      let info = {};
      try { info = fs.readJsonSync(infoPath); } catch {}
      let recipientCount = 0;
      try {
        const csv = fs.readFileSync(csvPath, 'utf8').trim();
        const lines = csv.split('\n').filter(Boolean);
        recipientCount = Math.max(0, lines.length - 1); // subtract header
      } catch {}
      let outputCount = 0;
      try {
        const outDir = path.join(jobDir, 'output');
        if (fs.existsSync(outDir)) {
          outputCount = fs.readdirSync(outDir)
            .filter(f => !f.startsWith('_tmp') && f !== 'results.json').length;
        }
      } catch {}
      return { jobId, jobDir, csvPath, recipientCount, outputCount, ...info };
    });
}

export function getNextJobId() {
  const jobs = listJobs();
  if (jobs.length === 0) return 'job001';
  const nums = jobs.map(j => parseInt(j.jobId.replace('job', ''), 10));
  const next = Math.max(...nums) + 1;
  return `job${String(next).padStart(3, '0')}`;
}

// Returns { expired: true, message } if the token is expired, otherwise { expired: false }
export function checkTokenExpiry(token) {
  if (!token?.expires) return { expired: false };
  const expiry = new Date(token.expires);
  if (isNaN(expiry.getTime())) return { expired: false };
  if (expiry <= new Date()) {
    return {
      expired: true,
      message: `Token expired on ${expiry.toLocaleString()}. Run "credcli register <new-url>" to get a fresh token.`,
    };
  }
  return { expired: false };
}

export async function initTenantWorkspace(tenant) {
  const baseDir = getDataDir();
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

export async function createJob(template) {
  const jobsDir = getJobsDir();
  await fs.ensureDir(jobsDir);
  const jobId = getNextJobId();
  const jobDir = path.join(jobsDir, jobId);
  await fs.ensureDir(jobDir);
  await fs.ensureDir(path.join(jobDir, 'output'));

  // Copy template
  await fs.copy(template.path, path.join(jobDir, 'template.html'));

  // Write job metadata
  await fs.writeJson(path.join(jobDir, 'job.json'), {
    templateName: template.name,
    templateFile: template.file,
    templateType: template.type ?? 'credential',
    createdAt: new Date().toISOString(),
    width: template.width,
    height: template.height,
    fields: template.fields,
  }, { spaces: 2 });

  return { jobId, jobDir };
}

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
  // Verification (set post-Chainletter stamp — not CSV fields)
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
  const meta = JSON.stringify({ name, description: 'Custom credential template', width, height, fields: ALL_FIELDS });
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
  body { width: ${width}px; min-height: ${height}px; font-family: 'Inter', sans-serif; background: #ffffff; color: #1a1a2e; font-size: 14px; }
  .page { width: ${width}px; min-height: ${height}px; padding: 48px 64px; display: flex; flex-direction: column; gap: 0; }
  .section { margin-bottom: 24px; padding: 16px 20px; background: #f8f9fd; border-left: 4px solid #1a237e; border-radius: 4px; }
  .section-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #6c757d; margin-bottom: 12px; }
  .field-row { display: flex; flex-wrap: wrap; gap: 16px; }
  .field { display: flex; flex-direction: column; gap: 3px; min-width: 160px; }
  .field-label { font-size: 9px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase; color: #aaa; }
  .field-value { font-size: 14px; color: #1a237e; font-family: 'Playfair Display', serif; word-break: break-word; }
  .field-value.large { font-size: 28px; font-style: italic; }
  .field-value.mono { font-family: monospace; font-size: 11px; color: #888; }
  .course-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .course-table th { background: #1a237e; color: white; padding: 7px 12px; text-align: left; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .course-table td { padding: 7px 12px; border-bottom: 1px solid #eee; color: #555; }
  .course-row:empty { display: none; }
  .hint { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 10px 14px; font-size: 11px; color: #92400e; line-height: 1.6; margin-bottom: 20px; }
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
    <code>{{WorkspaceLogo}}</code> and <code>{{WorkspaceIssuer}}</code> are auto-filled from your workspace settings.
  </div>
  <div class="section">
    <div class="section-title">Recipient</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Full Name</div><div class="field-value large">{{FullName}}</div></div>
      <div class="field"><div class="field-label">First Name</div><div class="field-value">{{FName}}</div></div>
      <div class="field"><div class="field-label">Last Name</div><div class="field-value">{{LName}}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Credential</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Title / Degree</div><div class="field-value">{{Title}}</div></div>
      <div class="field"><div class="field-label">Achievement</div><div class="field-value">{{Achievement}}</div></div>
      <div class="field"><div class="field-label">Badge Level</div><div class="field-value">{{BadgeLevel}}</div></div>
      <div class="field"><div class="field-label">Credential ID</div><div class="field-value mono">{{CredentialID}}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Academic</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Course / Programme</div><div class="field-value">{{CourseName}}</div></div>
      <div class="field"><div class="field-label">Major / Field</div><div class="field-value">{{Major}}</div></div>
      <div class="field"><div class="field-label">GPA</div><div class="field-value">{{GPA}}</div></div>
      <div class="field"><div class="field-label">Hours / Credits</div><div class="field-value">{{Hours}}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Organisation — Workspace Identity (auto-injected)</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Workspace Issuer Name</div><div class="field-value">{{WorkspaceIssuer}}</div></div>
      <div class="field" style="align-items:flex-start;"><div class="field-label">Workspace Logo</div><img src="{{WorkspaceLogo}}" alt="Logo" style="height:48px;width:auto;max-width:120px;object-fit:contain;margin-top:4px;" onerror="this.style.display='none'"></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Per-row Organisation (from CSV)</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Institution</div><div class="field-value">{{Institution}}</div></div>
      <div class="field"><div class="field-label">Issuer</div><div class="field-value">{{Issuer}}</div></div>
      <div class="field"><div class="field-label">Signatory Title</div><div class="field-value">{{Signature}}</div></div>
      <div class="field"><div class="field-label">Location</div><div class="field-value">{{Location}}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Dates</div>
    <div class="field-row">
      <div class="field"><div class="field-label">Issue Date</div><div class="field-value">{{IssueDate}}</div></div>
      <div class="field"><div class="field-label">Expiration Date</div><div class="field-value">{{ExpirationDate}}</div></div>
      <div class="field"><div class="field-label">Notes</div><div class="field-value">{{Notes}}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Course Rows (for transcripts — remove if not needed)</div>
    <table class="course-table">
      <thead><tr><th>Course Name</th><th>Grade</th><th>Credits</th><th>Semester</th></tr></thead>
      <tbody>${courseRows}
      </tbody>
    </table>
  </div>
</div>
</body>
</html>`;
}

/**
 * Create a new blank template file in the workspace templates directory.
 * @returns {{ filename: string, name: string, width: number, height: number, path: string }}
 */
export function createTemplate(name, width = 1200, height = 900) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const filename = `${slug}_${width}x${height}.html`;
  const filePath = path.join(getTemplatesDir(), filename);
  if (fs.existsSync(filePath)) throw new Error(`Template "${filename}" already exists`);
  fs.writeFileSync(filePath, generateBlankTemplate(name.trim(), width, height), 'utf8');
  return { filename, name: name.trim(), width, height, path: filePath };
}

/**
 * Reset a workspace template to the original package version.
 * @returns {string} The restored HTML content
 */
export function resetTemplate(name) {
  const pkgPath = resolveTemplatePath(getPackageTemplatesDir(), name);
  const wsPath = resolveTemplatePath(getTemplatesDir(), name);
  if (!fs.existsSync(pkgPath)) throw new Error(`Original package template "${name}" not found`);
  fs.copySync(pkgPath, wsPath);
  return fs.readFileSync(wsPath, 'utf8');
}
