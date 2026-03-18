import path from 'path';

// ── Path safety ────────────────────────────────────────────────────────────────

/**
 * Resolve a user-supplied filename safely within a trusted base directory.
 * Strips directory components and confirms the result stays inside baseDir.
 * Throws an Error if the resolved path would escape baseDir.
 */
export function resolveTemplatePath(baseDir, name) {
  const safe = path.resolve(baseDir, path.basename(name));
  if (!safe.startsWith(path.resolve(baseDir) + path.sep)) {
    throw new Error('Invalid file path');
  }
  return safe;
}

// ── CSV validation ─────────────────────────────────────────────────────────────

/**
 * Validate a CSV upload buffer.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export function validateCsvBuffer(buffer) {
  // Null bytes indicate binary (non-text) content
  if (buffer.includes(0x00)) {
    return { ok: false, error: 'File does not appear to be a text file (binary content detected)' };
  }

  const text = buffer.toString('utf8').trim();
  if (!text) return { ok: false, error: 'File is empty' };

  const firstLine = text.split(/\r?\n/)[0] ?? '';
  if (!firstLine.includes(',') && !firstLine.includes('\t') && !firstLine.includes(';')) {
    return { ok: false, error: 'File does not appear to be a CSV (no column delimiters found in header row)' };
  }

  return { ok: true };
}

// ── Template HTML validation ───────────────────────────────────────────────────

// Patterns that should never appear in credential templates.
// <script> blocks execute during Playwright rendering server-side and are
// served as-is via the /raw preview endpoint (stored XSS).
const BLOCKED = [
  { re: /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,           label: '<script> block' },
  { re: /<script\b[^>]*\bsrc\s*=/gi,                        label: 'external <script src>' },
  { re: /\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/gi, label: 'javascript: URL' },
  // Allow data:image/... but block other data: URIs (e.g. data:text/html for phishing)
  { re: /\b(?:href|src|action)\s*=\s*["']?\s*data:(?!image\/)/gi, label: 'non-image data: URI' },
];

/**
 * Check template HTML for dangerous patterns.
 * Returns { ok: true } or { ok: false, error: string, violations: string[] }.
 */
export function validateTemplateHtml(html) {
  const violations = [];
  for (const { re, label } of BLOCKED) {
    re.lastIndex = 0;
    if (re.test(html)) violations.push(label);
  }
  if (violations.length) {
    return {
      ok: false,
      error: `Template contains disallowed content: ${violations.join(', ')}`,
      violations,
    };
  }
  return { ok: true };
}

// ── Workspace logo ─────────────────────────────────────────────────────────────

/**
 * Logo must be either a base64-encoded image data URI or an HTTPS URL.
 * This value is injected into templates via {{WorkspaceLogo}}, so it must
 * not contain JavaScript or other executable content.
 */
export function validateLogoValue(logo) {
  if (!logo) return { ok: true };
  if (/^data:image\/(png|jpe?g|gif|svg\+xml|webp);base64,/i.test(logo)) return { ok: true };
  try {
    const u = new URL(logo);
    if (u.protocol === 'https:') return { ok: true };
  } catch {}
  return { ok: false, error: 'Logo must be a base64 image data URI or an HTTPS URL' };
}
