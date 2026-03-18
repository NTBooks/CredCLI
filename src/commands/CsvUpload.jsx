import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs } from '../utils/jobs.js';

export default function CsvUpload({ jobArg, csvFile }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError]   = useState(null);
  const [info, setInfo]     = useState(null);

  useEffect(() => {
    if (!jobArg || !csvFile) {
      setError('Usage: credcli csv <job> <file>');
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

        const srcPath = path.resolve(csvFile);
        if (!await fs.pathExists(srcPath)) throw new Error(`File not found: ${srcPath}`);

        const csv   = await fs.readFile(srcPath, 'utf8');
        const lines = csv.trim().split('\n').filter(Boolean);
        const recipientCount = Math.max(0, lines.length - 1);

        await fs.copy(srcPath, job.csvPath, { overwrite: true });
        setInfo({ job, recipientCount, dest: job.csvPath });
        setStatus('done');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'working') return <Box marginY={1}><Text color="yellow">Uploading CSV…</Text></Box>;
  if (status === 'error')   return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ CSV loaded — {info.recipientCount} recipient{info.recipientCount !== 1 ? 's' : ''}</Text>
      <Text color="gray">  Job:   <Text color="white">{info.job.jobId}</Text></Text>
      <Text color="gray">  File:  <Text color="white">{info.dest}</Text></Text>
      <Text color="gray">  Next:  <Text color="cyan">credcli run {info.job.jobId}</Text></Text>
    </Box>
  );
}
