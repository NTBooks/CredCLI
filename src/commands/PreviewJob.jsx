import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs } from '../utils/jobs.js';
import { renderJob } from '../utils/renderer.js';

export default function PreviewJob({ jobArg, row = 1, format = 'pdf' }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError]   = useState(null);
  const [outFile, setOutFile] = useState(null);

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli preview <job> [--row N]');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run() {
      try {
        const jobs = listJobs();
        const job  = jobs.find(j => j.jobId === jobArg)
                  ?? (/^\d+$/.test(jobArg) ? jobs[parseInt(jobArg, 10) - 1] : null);
        if (!job) throw new Error(`Job "${jobArg}" not found. Run "credcli list" to see available jobs.`);
        if (job.recipientCount === 0) throw new Error(`Job ${job.jobId} has no recipients — add a CSV first.`);

        const rowIndex = Math.max(1, parseInt(row, 10) || 1);
        if (rowIndex > job.recipientCount) {
          throw new Error(`Row ${rowIndex} out of range — job has ${job.recipientCount} recipient(s).`);
        }

        // Preserve results.json so preview doesn't clobber the full run's output list
        const resultsPath = path.join(job.jobDir, 'output', 'results.json');
        const savedResults = (await fs.pathExists(resultsPath))
          ? await fs.readJson(resultsPath)
          : null;

        const results = await renderJob(
          job.jobDir,
          format,
          null,
          null,
          { limit: rowIndex, resume: false }
        );

        // Restore results.json after preview
        if (savedResults !== null) {
          await fs.writeJson(resultsPath, savedResults, { spaces: 2 });
        }

        const target = results[rowIndex - 1];
        if (!target) throw new Error('Render produced no output.');

        const filePath = path.join(job.jobDir, 'output', target.file);
        setOutFile(filePath);
        setStatus('done');

        const { default: openBrowser } = await import('open');
        openBrowser(filePath).catch(() => {});
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 200);
    }

    run();
  }, []);

  if (status === 'working') {
    return (
      <Box marginY={1}>
        <Text color="gray">Rendering preview…</Text>
      </Box>
    );
  }
  if (status === 'error') return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green">✔ Preview rendered</Text>
      <Text color="cyan">  {outFile}</Text>
    </Box>
  );
}
