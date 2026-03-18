import React, { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { listJobs, getJobsDir } from '../utils/jobs.js';
import { renderJob } from '../utils/renderer.js';
import path from 'path';

export default function RunJob({ preselect, format = 'pdf' }) {
  const { exit } = useApp();
  const jobs = listJobs();
  const [phase, setPhase] = useState(preselect != null ? 'running' : 'select');
  const [progress, setProgress] = useState({ done: 0, total: 0, latest: null });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);

  const readyJobs = jobs.filter(j => j.recipientCount > 0);

  async function doRun(job) {
    setSelectedJob(job);
    setPhase('running');
    try {
      const res = await renderJob(
        job.jobDir,
        format,
        (done, total, latest) => setProgress({ done, total, latest })
      );
      setResults(res);
      setPhase('done');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (preselect == null) return;
    // preselect can be a job name (job001) or 1-based index
    const byName = jobs.find(j => j.jobId === preselect);
    const byIndex = /^\d+$/.test(preselect) ? jobs[parseInt(preselect, 10) - 1] : null;
    const job = byName ?? byIndex;
    if (!job) {
      setError(`Job "${preselect}" not found. Run "credcli list" to see available jobs.`);
      return;
    }
    if (job.recipientCount === 0) {
      setError(`Job ${job.jobId} has no recipients. Fill in ${path.join(job.jobDir, 'mailmerge.csv')} first.`);
      return;
    }
    doRun(job);
  }, []);

  function handleSelect({ value }) {
    doRun(readyJobs[value]);
  }

  if (error) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="red">✖ {error}</Text>
      </Box>
    );
  }

  if (phase === 'select') {
    if (readyJobs.length === 0) {
      return (
        <Box flexDirection="column" marginY={1}>
          <Text color="yellow">No jobs are ready to run.</Text>
          <Text>Run <Text color="cyan">credcli new</Text> to create a job, then fill in its mailmerge.csv.</Text>
        </Box>
      );
    }
    const items = readyJobs.map((j, i) => ({
      label: `${j.jobId}  —  ${j.templateName ?? 'unknown'}  (${j.recipientCount} recipient${j.recipientCount !== 1 ? 's' : ''})`,
      value: i,
    }));
    return (
      <Box flexDirection="column" marginY={1}>
        <Text bold color="cyan">Select a job to run:</Text>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>
    );
  }

  if (phase === 'running') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box gap={1}>
          <Text color="green"><Spinner type="dots" /></Text>
          <Text>Rendering {progress.total > 0 ? `${progress.done}/${progress.total}` : '…'}</Text>
        </Box>
        {progress.latest && (
          <Text color="gray">  ✔ {progress.latest.file}</Text>
        )}
      </Box>
    );
  }

  if (phase === 'done') {
    const outputDir = path.join(selectedJob.jobDir, 'output');
    setTimeout(() => exit(), 50);
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="green" bold>✔ Done! {results.length} credential{results.length !== 1 ? 's' : ''} generated</Text>
        <Box marginTop={1} flexDirection="column">
          {results.map(r => (
            <Text key={r.file} color="gray">  ✔ {r.file}</Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text>Output folder: <Text color="cyan">{outputDir}</Text></Text>
        </Box>
      </Box>
    );
  }

  return null;
}
