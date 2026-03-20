import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import { listJobs } from '../utils/jobs.js';

export default function DeleteJob({ jobArg, yes = false }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError]   = useState(null);
  const [jobId, setJobId]   = useState(null);

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli delete <job>');
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

        if (!yes) {
          setError(`Pass --yes to confirm deletion of ${job.jobId} (${job.jobDir})`);
          setStatus('error');
          setTimeout(() => exit(), 100);
          return;
        }

        await fs.remove(job.jobDir);
        setJobId(job.jobId);
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

  return (
    <Box marginY={1}>
      <Text color="green">✔ Deleted {jobId}</Text>
    </Box>
  );
}
