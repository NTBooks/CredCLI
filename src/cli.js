#!/usr/bin/env node
import React from 'react';
import { render, Text, Box } from 'ink';
import meow from 'meow';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode';
import { chromium } from 'playwright';
import readline from 'readline/promises';
import { stdin as inputStream, stdout as outputStream } from 'node:process';

const templateDir = path.join(process.cwd(), 'templates');

const placeholders = [
    'FName',
    'LName',
    'FullName',
    'Title',
    'CredentialID',
    'Institution',
    'Issuer',
    'IssueDate',
    'ExpirationDate',
    'CourseName',
    'GPA',
    'Major',
    'Hours',
    'Level',
    'Description',
    'BadgeLevel',
    'Achievement',
    'QRUrl',
    'QRCodeDataURL',
    'VerificationURL',
    'LogoSrc',
    'Signature',
    'Location',
    'Notes'
];

function replacePlaceholders(template, data) {
    let result = template;
    for (const key of Object.keys(data)) {
        const value = data[key] ?? '';
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
        result = result.replace(regex, value);
    }
    // Replace missing placeholders with empty string
    result = result.replace(/{{\s*[A-Za-z0-9_]+\s*}}/g, '');
    return result;
}

function listTemplates() {
    if (!fs.existsSync(templateDir)) {
        return [];
    }
    return fs.readdirSync(templateDir).filter((file) => file.endsWith('.html'));
}

function parseCsv(csvContent) {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) {
        return [];
    }
    const headers = lines[0].split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        const values = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j += 1) {
            const ch = line[j];
            if (ch === '"') {
                inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
                values.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += ch;
            }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => {
            if (h) {
                row[h] = values[idx] ?? '';
            }
        });
        rows.push(row);
    }
    return rows;
}

function rowMatchesFilter(row, filter) {
    if (!filter) return true;
    const conditions = filter.split(',').map((part) => part.trim()).filter(Boolean);
    for (const condition of conditions) {
        const [rawKey, ...rawValueParts] = condition.split('=');
        if (!rawKey || rawValueParts.length === 0) continue;
        const key = rawKey.trim();
        const value = rawValueParts.join('=').trim();
        if (!key) continue;
        const rowValue = (row[key] ?? '').toString();
        if (value.startsWith('/') && value.endsWith('/')) {
            const regex = new RegExp(value.slice(1, -1));
            if (!regex.test(rowValue)) return false;
        } else {
            if (rowValue.toLowerCase() !== value.toLowerCase()) return false;
        }
    }
    return true;
}

function parseJobCsv(csvContent) {
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) {
        throw new Error('Job CSV must include template row and header row.');
    }
    const templateLine = lines[0].split(',').map((c) => c.trim());
    if (templateLine[0].toLowerCase() !== 'templateid') {
        throw new Error('First line must start with templateId,<templateName>');
    }
    const templateName = templateLine[1];
    const headers = lines[1].split(',').map((c) => c.trim());
    const rows = lines.slice(2).map((line) => {
        const values = line.split(',').map((c) => c.trim());
        const obj = {};
        headers.forEach((h, idx) => {
            if (h) obj[h] = values[idx] ?? '';
        });
        return obj;
    });
    return { templateName, headers, rows };
}

async function runJob(jobFile, outDir, flags) {
    const jobPath = path.isAbsolute(jobFile) ? jobFile : path.join(process.cwd(), jobFile);
    if (!fs.existsSync(jobPath)) {
        throw new Error(`Job file not found: ${jobPath}`);
    }
    const jobCsv = fs.readFileSync(jobPath, 'utf-8');
    const { templateName, rows } = parseJobCsv(jobCsv);
    const outputDir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir || 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const outputs = [];
    for (const [index, row] of rows.entries()) {
        const data = { ...flags, ...row };
        const id = (row.CredentialID || row.FullName || `row-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
        const htmlOut = path.join(outputDir, `${id}-${templateName}`);
        const generated = await generateTemplate(templateName, htmlOut, data);
        outputs.push(generated);
        if ((flags.format || 'html').toLowerCase() === 'png') {
            const pngName = generated.replace(/\.html?$/, '.png');
            await renderHtmlToPng(generated, pngName);
            outputs.push(pngName);
        }
    }
    return outputs;
}

async function createNewJob(jobFile, templateName, headers) {
    const jobPath = path.isAbsolute(jobFile) ? jobFile : path.join(process.cwd(), jobFile);
    const dir = path.dirname(jobPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const lines = [];
    lines.push(`templateId,${templateName}`);
    lines.push(headers.join(','));
    lines.push(headers.map(() => '').join(','));
    fs.writeFileSync(jobPath, lines.join('\n'), 'utf-8');
    return jobPath;
}

async function prompt(question) {
    const rl = readline.createInterface({ input: inputStream, output: outputStream });
    const answer = await rl.question(question);
    rl.close();
    return answer;
}

async function newJobInteractive() {
    const templateName = await prompt('Template file name (e.g. Diploma-1200x900.html): ');
    if (!templateName) throw new Error('Template name required.');
    const defaultHeaders = ['FName', 'LName', 'FullName', 'Title', 'Institution', 'Issuer', 'IssueDate', 'ExpirationDate', 'Major', 'GPA', 'CredentialID', 'VerificationURL', 'QRUrl'];
    const headerLine = await prompt(`Headers (comma-separated, default: ${defaultHeaders.join(',')}): `);
    const headers = headerLine.trim() ? headerLine.split(',').map((h) => h.trim()).filter(Boolean) : defaultHeaders;
    const jobName = await prompt('Job file path (default jobs/job1.csv): ');
    const jobFile = jobName.trim() ? jobName.trim() : 'jobs/job1.csv';
    const pathOut = await createNewJob(jobFile, templateName.trim(), headers);
    return pathOut;
}

async function generateFromCsv(templateName, csvFile, outDir, flags) {
    const csvPath = path.isAbsolute(csvFile) ? csvFile : path.join(process.cwd(), csvFile);
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }
    const templatePath = path.join(templateDir, templateName);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found: ${templateName}`);
    }
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(csvContent);
    if (rows.length === 0) {
        throw new Error('No rows found in CSV.');
    }
    const outputDir = path.isAbsolute(outDir) ? outDir : path.join(process.cwd(), outDir || 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filteredRows = flags.filter ? rows.filter((row) => rowMatchesFilter(row, flags.filter)) : rows;
    if (filteredRows.length === 0) {
        throw new Error(`No rows matched filter '${flags.filter}'.`);
    }

    const results = [];
    for (const [index, row] of filteredRows.entries()) {
        const data = { ...flags, ...row };
        const fileNameSafe = (row.CredentialID || row.FullName || `record-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
        const outFile = path.join(outputDir, `${fileNameSafe}-${templateName}`);
        const generated = await generateTemplate(templateName, outFile, data);
        results.push(generated);
    }
    return results;
}

async function renderHtmlToPng(htmlPath, outPng, width = 1200, height = 900) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const absolutePath = path.isAbsolute(htmlPath) ? htmlPath : path.join(process.cwd(), htmlPath);
    if (!fs.existsSync(absolutePath)) {
        await browser.close();
        throw new Error(`HTML file not found: ${absolutePath}`);
    }
    await page.goto(`file://${absolutePath}`);
    await page.screenshot({ path: outPng, fullPage: true });
    await browser.close();
    return outPng;
}

async function generateTemplate(templateName, outFile, flags) {
    const file = path.join(templateDir, templateName);
    if (!fs.existsSync(file)) {
        throw new Error(`Template not found: ${templateName}`);
    }
    const template = fs.readFileSync(file, 'utf-8');

    const data = { ...flags };
    const logoPath = path.join(process.cwd(), 'user_files', 'logo.png');
    let logoDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCAxNDAgNDAiPjxkZWZzPjxzdHlsZT4uY3tmaWxsOiNkZGRkZGQ7fTwvc3R5bGU+PC9kZWZzPjxwYXRoIGNsYXNzPSJjIiBkPSJNMTQgMThoOTJ2MTRIMTR6bTU0IDEwaC00MXYtOGgyMHYtMmg0MXY4aDIwdjJoLTUweiIvPjwvc3ZnPg==';
    if (fs.existsSync(logoPath)) {
        const fileData = fs.readFileSync(logoPath);
        const ext = path.extname(logoPath).toLowerCase().replace('.', '') || 'png';
        logoDataUrl = `data:image/${ext};base64,${fileData.toString('base64')}`;
    }
    data.LogoSrc = flags.LogoSrc || logoDataUrl;

    if (!data.QRUrl) {
        data.QRUrl = flags.VerificationURL || 'https://example.com/verify';
    }
    const qrUrl = data.QRUrl;
    const qrDataURL = await qrcode.toDataURL(qrUrl, { margin: 1, width: 260 });
    data.QRCodeDataURL = qrDataURL;
    const out = replacePlaceholders(template, data);

    if (!outFile) {
        outFile = templateName.replace('.html', '-filled.html');
    }
    fs.writeFileSync(outFile, out, 'utf-8');
    return outFile;
}

const cli = meow(
    {
        importMeta: import.meta,
        flags: {
            out: { type: 'string', shortFlag: 'o' },
            template: { type: 'string', shortFlag: 't' },
            list: { type: 'boolean', shortFlag: 'l' },
            QRUrl: { type: 'string' },
            VerificationURL: { type: 'string' },
            FName: { type: 'string' },
            LName: { type: 'string' },
            FullName: { type: 'string' },
            Title: { type: 'string' },
            Institution: { type: 'string' },
            Issuer: { type: 'string' },
            IssueDate: { type: 'string' },
            ExpirationDate: { type: 'string' },
            CourseName: { type: 'string' },
            GPA: { type: 'string' },
            Major: { type: 'string' },
            CredentialID: { type: 'string' },
            Notes: { type: 'string' },
            Signature: { type: 'string' },
            Location: { type: 'string' },
            LogoSrc: { type: 'string' },
            filter: { type: 'string' },
            format: { type: 'string' }
        },
        autoHelp: true,
        autoVersion: true,
        argv: process.argv.slice(2)
    },
    {
        allowUnknownFlags: true
    }
);

const { flags, input } = cli;

const command = input[0] || (flags.help ? 'help' : 'help');

function printHelp() {
    render(React.createElement(UI, {
        message: 'credcli command list:\n  list\n  generate --template <name> --out <file> [--format png] [--placeholders]...\n  generate-csv --template <name> --csv <file> --out <dir> [--format png]\n  render --file <html> --out <png> [--width] [--height]\n  newjob --job <job.csv> --template <name> --headers <h1,h2,...>\n  runjob --file <job.csv> --out <dir> [--format png]',
    }));
}

function UI({ message, next }) {
    return React.createElement(Box, { flexDirection: 'column' }, React.createElement(Text, null, message), next ? React.createElement(Text, null, next) : null);
}

async function main() {
    if (flags.list || command === 'list') {
        const items = listTemplates();
        render(React.createElement(UI, { message: `Available templates (${items.length}):`, next: items.join('\n`') }));
        process.exit(0);
    }

    if (command === 'generate') {
        const templateName = flags.template || input[1];
        if (!templateName) {
            console.error('Please pass a template name via --template or second positional argument.');
            process.exit(1);
        }
        const outFile = flags.out || input[2] || templateName.replace(/\.html?$/, '-filled.html');
        try {
            const outputPath = await generateTemplate(templateName, outFile, flags);
            if ((flags.format || 'html').toLowerCase() === 'png') {
                const pngOut = outputPath.replace(/\.html?$/, '.png');
                const screenshot = await renderHtmlToPng(outputPath, pngOut);
                render(React.createElement(UI, { message: `Generated ${screenshot} from ${templateName}` }));
            } else {
                render(React.createElement(UI, { message: `Generated ${outputPath} from ${templateName}` }));
            }
            process.exit(0);
        } catch (err) {
            console.error('Generation failed:', err.message);
            process.exit(1);
        }
    }

    if (command === 'generate-csv') {
        const templateName = flags.template || input[1];
        const csvFile = flags.csv || input[2];
        const outDir = flags.out || input[3] || 'output';
        if (!templateName || !csvFile) {
            console.error('Usage: credcli generate-csv --template <name> --csv <file> [--out <outputFolder>] [--format png]');
            process.exit(1);
        }
        try {
            const outputs = await generateFromCsv(templateName, csvFile, outDir, flags);
            render(React.createElement(UI, { message: `Generated ${outputs.length} outputs to ${outDir}` }));
            process.exit(0);
        } catch (err) {
            console.error('Mail merge generation failed:', err.message);
            process.exit(1);
        }
    }

    if (command === 'newjob') {
        try {
            let file;
            if (flags.job && flags.template && flags.headers) {
                const headers = flags.headers.split(',').map((h) => h.trim()).filter(Boolean);
                file = await createNewJob(flags.job, flags.template, headers);
            } else if (flags.job) {
                file = await newJobInteractive();
            } else {
                file = await newJobInteractive();
            }
            render(React.createElement(UI, { message: `Created job csv: ${file}` }));
            process.exit(0);
        } catch (err) {
            console.error('newjob failed:', err.message);
            process.exit(1);
        }
    }

    if (command === 'runjob') {
        const jobFile = flags.file || flags.job || input[1];
        const outDir = flags.out || input[2] || 'output';
        if (!jobFile) {
            console.error('Usage: credcli runjob --file <job.csv> [--out <outputFolder>] [--format png]');
            process.exit(1);
        }
        try {
            const outputs = await runJob(jobFile, outDir, flags);
            render(React.createElement(UI, { message: `Generated ${outputs.length} files to ${outDir}` }));
            process.exit(0);
        } catch (err) {
            console.error('runjob failed:', err.message);
            process.exit(1);
        }
    }

    if (command === 'help' || command === '--help' || command === '-h') {
        printHelp();
        process.exit(0);
    }

    if (command === 'render') {
        const htmlFile = flags.file || input[1];
        const outImage = flags.out || input[2] || 'output/render.png';
        const width = Number(flags.width || 1200);
        const height = Number(flags.height || 900);
        if (!htmlFile) {
            console.error('Usage: credcli render --file <template.html> --out <image.png> [--width] [--height]');
            process.exit(1);
        }
        try {
            const outputPath = await renderHtmlToPng(htmlFile, outImage, width, height);
            render(React.createElement(UI, { message: `Rendered PNG: ${outputPath}` }));
            process.exit(0);
        } catch (err) {
            console.error('Render failed:', err.message);
            process.exit(1);
        }
    }

    if (command === 'placeholders') {
        render(React.createElement(UI, { message: 'Common placeholders:', next: placeholders.join(', ') }));
        process.exit(0);
    }

    render(React.createElement(UI, { message: 'Usage: credcli generate ... | generate-csv ... | newjob | runjob --file <job.csv> | render ...' }));
    process.exit(0);
}

main();
