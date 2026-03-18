import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import { startServer } from '../serve.js';

export default function ServeCommand({ port = 3037 }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('starting'); // 'starting' | 'running' | 'error'
  const [info, setInfo]     = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    startServer(parseInt(port, 10))
      .then(({ port: p }) => {
        setInfo({ port: p });
        setStatus('running');
        // Keep process alive — don't call exit()
      })
      .catch(err => {
        setError(err.message);
        setStatus('error');
        setTimeout(() => exit(), 100);
      });
  }, []);

  if (status === 'starting') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">Starting CredCLI server…</Text>
        <Text color="gray">  Port:      <Text color="cyan">{port}</Text></Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="red">✖ Failed to start server: {error}</Text>
      </Box>
    );
  }

  // running
  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ CredCLI server running</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>  URL:       <Text color="cyan" bold>http://localhost:{info.port}</Text></Text>
        <Text color="gray">  Paste a Chainletter token URL in the browser to log in.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Press </Text><Text bold>Ctrl+C</Text><Text color="gray"> to stop.</Text>
      </Box>
    </Box>
  );
}
