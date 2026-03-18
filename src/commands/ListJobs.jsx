import React from 'react';
import { Box, Text, useApp } from 'ink';
import { listJobs, getJobsDir } from '../utils/jobs.js';

export default function ListJobs() {
  const { exit } = useApp();
  const jobs = listJobs();

  setTimeout(() => exit(), 50);

  if (jobs.length === 0) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">No jobs found in {getJobsDir()}</Text>
        <Text>Run <Text color="cyan">credcli new</Text> to create your first job.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">Jobs in {getJobsDir()}:</Text>
      <Box marginTop={1} flexDirection="column">
        {jobs.map((job, i) => (
          <Box key={job.jobId} gap={2}>
            <Text color="yellow">{String(i + 1).padStart(2, ' ')}.</Text>
            <Text bold>{job.jobId}</Text>
            <Text color="cyan">{job.templateName ?? 'unknown'}</Text>
            <Text color={job.recipientCount > 0 ? 'green' : 'gray'}>
              {job.recipientCount > 0
                ? `${job.recipientCount} recipient${job.recipientCount !== 1 ? 's' : ''}`
                : 'empty — fill in mailmerge.csv'}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
