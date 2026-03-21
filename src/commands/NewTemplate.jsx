import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { createTemplate } from '../utils/jobs.js';

export default function NewTemplate({ name, width, height }) {
  const { exit } = useApp();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!name?.trim()) {
      setError('Usage: credcli new-template "<name>" [--width N] [--height N]');
      setTimeout(() => exit(), 100);
      return;
    }
    try {
      const tmpl = createTemplate(name.trim(), width ?? 1200, height ?? 900);
      setResult(tmpl);
    } catch (e) {
      setError(e.message);
    }
    setTimeout(() => exit(), 100);
  }, []);

  if (error) return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;
  if (!result) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ Template created</Text>
      <Text color="gray">  File: <Text color="cyan">{result.filename}</Text></Text>
      <Text color="gray">  Size: <Text color="white">{result.width}×{result.height}</Text></Text>
      <Text color="gray">  Next: edit the HTML, then <Text color="cyan">credcli new</Text> to create a job from it</Text>
    </Box>
  );
}
