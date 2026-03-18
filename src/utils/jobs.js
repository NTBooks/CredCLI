import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Optional workspace override — set by `credcli serve`
let _workspaceDir = null;
export function setWorkspace(dir) { _workspaceDir = dir ? path.resolve(dir) : null; }
export function getWorkspace() { return _workspaceDir; }

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
      return { jobId, jobDir, csvPath, recipientCount, ...info };
    });
}

export function getNextJobId() {
  const jobs = listJobs();
  if (jobs.length === 0) return 'job001';
  const nums = jobs.map(j => parseInt(j.jobId.replace('job', ''), 10));
  const next = Math.max(...nums) + 1;
  return `job${String(next).padStart(3, '0')}`;
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
    createdAt: new Date().toISOString(),
    width: template.width,
    height: template.height,
    fields: template.fields,
  }, { spaces: 2 });

  return { jobId, jobDir };
}
