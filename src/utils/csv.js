import fs from 'fs-extra';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

export function generateEmptyCSV(fields, filePath) {
  const output = stringify([fields.reduce((acc, f) => ({ ...acc, [f]: '' }), {})], {
    header: true,
    columns: fields,
  });
  // Write header-only CSV (remove the blank data row)
  const headerLine = fields.join(',');
  fs.writeFileSync(filePath, headerLine + '\n', 'utf8');
}

export function applyReplacements(html, row) {
  let result = html;
  for (const [key, value] of Object.entries(row)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g');
    result = result.replace(regex, value ?? '');
  }
  return result;
}
