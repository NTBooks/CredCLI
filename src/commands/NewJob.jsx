import React, { useState } from 'react';
import { Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import { listTemplates, createJob } from '../utils/jobs.js';
import { generateEmptyCSV } from '../utils/csv.js';
import path from 'path';

export default function NewJob({ preselect }) {
  const { exit } = useApp();
  const templates = listTemplates();
  const [phase, setPhase] = useState(preselect != null ? 'creating' : 'select');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const items = templates.map((t, i) => ({
    label: `${t.name}  (${t.width}×${t.height})  — ${t.description}`,
    value: i,
  }));

  async function doCreate(templateIndex) {
    const template = templates[templateIndex];
    try {
      const { jobId, jobDir } = await createJob(template);
      const csvPath = path.join(jobDir, 'mailmerge.csv');
      generateEmptyCSV(template.fields, csvPath);
      setResult({ jobId, jobDir, csvPath, template });
    } catch (e) {
      setError(e.message);
    }
  }

  // Auto-create when preselect is provided (agent/CLI flag mode)
  React.useEffect(() => {
    if (preselect != null) {
      const idx = parseInt(preselect, 10) - 1;
      if (idx >= 0 && idx < templates.length) {
        doCreate(idx);
      } else {
        setError(`Invalid template number: ${preselect}. Choose 1–${templates.length}.`);
      }
    }
  }, []);

  function handleSelect({ value }) {
    setPhase('creating');
    doCreate(value);
  }

  if (error) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="red">✖ Error: {error}</Text>
      </Box>
    );
  }

  if (phase === 'select') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text bold color="cyan">Select a template:</Text>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box marginY={1}>
        <Text color="yellow">Creating job…</Text>
      </Box>
    );
  }

  // Done
  setTimeout(() => exit(), 50);
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green">✔ Job created: <Text bold>{result.jobId}</Text></Text>
      <Text color="green">✔ Template:    <Text bold>{result.template.name}</Text></Text>
      <Text color="green">✔ Mail merge:  <Text bold>{result.csvPath}</Text></Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Next steps:</Text>
        <Text>  1. Open <Text color="cyan">{result.csvPath}</Text> and fill in recipients</Text>
        <Text>  2. Run <Text color="cyan">credcli run {result.jobId}</Text> to generate credentials</Text>
      </Box>
    </Box>
  );
}
