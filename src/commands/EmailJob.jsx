import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs, getTemplatesDir, listTemplates, parseTemplateMeta } from '../utils/jobs.js';
import { generateMailMergeFolder } from '../utils/renderer.js';

export default function EmailJob({ jobArg, emailTemplate }) {
  const { exit } = useApp();
  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState('working');
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  function log(text, color = 'gray') {
    setLines(prev => [...prev, { text, color }]);
  }

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli email <job> [--email-template <file>]');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run() {
      try {
        const jobs = listJobs();
        const job = jobs.find(j => j.jobId === jobArg)
                 ?? (/^\d+$/.test(jobArg) ? jobs[parseInt(jobArg, 10) - 1] : null);
        if (!job) throw new Error(`Job "${jobArg}" not found. Run "credcli list" to see available jobs.`);

        const outputDir = path.join(job.jobDir, 'output');
        const resultsPath = path.join(outputDir, 'results.json');
        if (!await fs.pathExists(resultsPath)) {
          throw new Error(`No results.json found. Run "credcli run ${jobArg}" first.`);
        }
        const results = await fs.readJson(resultsPath);

        // Resolve email template path
        const templates = listTemplates();
        const emailTemplates = templates.filter(t => t.type === 'email');

        let emailTemplatePath;
        if (emailTemplate) {
          emailTemplatePath = path.join(getTemplatesDir(), path.basename(emailTemplate));
        } else if (emailTemplates.length > 0) {
          emailTemplatePath = emailTemplates[0].path;
        } else {
          throw new Error('No email templates found in your workspace templates folder.');
        }

        if (!await fs.pathExists(emailTemplatePath)) {
          throw new Error(`Email template not found: ${emailTemplatePath}`);
        }

        const emailTemplateHtml = fs.readFileSync(emailTemplatePath, 'utf8');
        const emailTemplateMeta = parseTemplateMeta(emailTemplatePath) ?? {};
        const templateName = path.basename(emailTemplatePath);

        log(`Template: ${templateName}`);
        log(`Recipients: ${results.length}`);

        // Load stored claim links (populated by "credcli send")
        const jobMetaPath = path.join(job.jobDir, 'job.json');
        let claimLinks = {};
        try {
          const meta = await fs.readJson(jobMetaPath);
          claimLinks = meta.chainletterClaimLinks ?? {};
        } catch {}

        await generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, claimLinks, (event) => {
          if (event.type === 'mail_merge_file') log(`  ✔ ${event.file}`, 'green');
          else if (event.type === 'mail_merge_done') setSummary({ count: event.count, outputDir });
        });

        setStatus('done');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'error') return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((l, i) => <Text key={i} color={l.color}>{l.text}</Text>)}
      {summary && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>✔ {summary.count} email{summary.count !== 1 ? 's' : ''} generated</Text>
          <Text color="gray">  Folder: <Text color="cyan">{summary.outputDir}/mail_merge/</Text></Text>
        </Box>
      )}
    </Box>
  );
}
