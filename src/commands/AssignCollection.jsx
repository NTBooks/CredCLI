import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs } from '../utils/jobs.js';

export default function AssignCollection({ jobArg, collectionId, network = 'private' }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError]   = useState(null);
  const [info, setInfo]     = useState(null);

  useEffect(() => {
    const resolvedNetwork = ['public', 'private'].includes(network) ? network : 'private';

    if (!jobArg || !collectionId) {
      setError('Usage: credcli assign <job> <collection-id> [--network public|private]');
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

        const jobMetaPath = path.join(job.jobDir, 'job.json');
        const meta = await fs.readJson(jobMetaPath);
        meta.chainletterCollection = { id: collectionId, name: collectionId, network: resolvedNetwork };
        await fs.writeJson(jobMetaPath, meta, { spaces: 2 });

        setInfo({ jobId: job.jobId, collectionId, network: resolvedNetwork });
        setStatus('done');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'working') return <Box marginY={1}><Text color="yellow">Assigning collection…</Text></Box>;
  if (status === 'error')   return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ Collection assigned</Text>
      <Text color="gray">  Job:        <Text color="white">{info.jobId}</Text></Text>
      <Text color="gray">  Collection: <Text color="cyan">{info.collectionId}</Text></Text>
      <Text color="gray">  Network:    <Text color="cyan">{info.network}</Text></Text>
      <Text color="gray">  Next:       <Text color="cyan">credcli send {info.jobId}</Text></Text>
    </Box>
  );
}
