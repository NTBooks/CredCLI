import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs } from '../utils/jobs.js';

export default function OutputList({ jobArg }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError]   = useState(null);
  const [files, setFiles]   = useState([]);
  const [meta, setMeta]     = useState(null);

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli output <job>');
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

        const outDir = path.join(job.jobDir, 'output');
        setMeta({ jobId: job.jobId, outDir, csvPath: job.csvPath, jobDir: job.jobDir });

        if (!await fs.pathExists(outDir)) {
          setFiles([]);
          setStatus('done');
          setTimeout(() => exit(), 100);
          return;
        }

        const all = await fs.readdir(outDir);
        const outputFiles = all.filter(f => !f.startsWith('_tmp') && f !== 'results.json');
        const infos = await Promise.all(
          outputFiles.map(async f => {
            const fp   = path.join(outDir, f);
            const stat = await fs.stat(fp);
            return { name: f, path: fp, size: stat.size };
          })
        );

        setFiles(infos.sort((a, b) => a.name.localeCompare(b.name)));
        setStatus('done');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'working') return null;
  if (status === 'error')   return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  const fmt = n => n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)}MB`
    : `${Math.round(n / 1024)}KB`;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold>Output — {meta.jobId}</Text>
      <Text color="gray">  Folder: <Text color="cyan">{meta.outDir}</Text></Text>
      {files.length === 0 ? (
        <Box marginTop={1}>
          <Text color="yellow">No output files yet.</Text>
          <Text color="gray">  Run: <Text color="cyan">credcli run {meta.jobId}</Text></Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {files.map(f => (
            <Text key={f.name} color="gray">
              {'  '}<Text color="white">{f.name}</Text>{'  '}<Text dimColor>({fmt(f.size)})</Text>
            </Text>
          ))}
          <Box marginTop={1}>
            <Text dimColor>  {files.length} file{files.length !== 1 ? 's' : ''}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
