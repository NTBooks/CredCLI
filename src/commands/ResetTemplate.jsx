import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { resetTemplate } from '../utils/jobs.js';

export default function ResetTemplate({ name }) {
  const { exit } = useApp();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!name?.trim()) {
      setError('Usage: credcli reset-template <filename>  (e.g. diploma_1200x900.html)');
      setTimeout(() => exit(), 100);
      return;
    }
    try {
      resetTemplate(name.trim());
      setResult(name.trim());
    } catch (e) {
      setError(e.message);
    }
    setTimeout(() => exit(), 100);
  }, []);

  if (error) return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;
  if (!result) return null;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ Template reset to original</Text>
      <Text color="gray">  File: <Text color="cyan">{result}</Text></Text>
    </Box>
  );
}
