import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import { getTokenPath, checkTokenExpiry } from '../utils/jobs.js';

export default function ListCollections() {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [error, setError] = useState(null);
  const [collections, setCollections] = useState([]);

  useEffect(() => {
    async function run() {
      try {
        const tokenPath = getTokenPath();
        if (!await fs.pathExists(tokenPath))
          throw new Error('No token.json found. Run "credcli register <url>" first.');
        const token = await fs.readJson(tokenPath);
        if (!token.jwt || !token.webhookUrl)
          throw new Error('token.json is missing jwt or webhookUrl. Re-run "credcli register <url>".');

        const expiry = checkTokenExpiry(token);
        if (expiry.expired) throw new Error(expiry.message);

        const r = await fetch(token.webhookUrl, {
          headers: { Authorization: `Bearer ${token.jwt}` },
        });
        const data = await r.json();

        // Chainletter returns collections in various shapes; normalise what we can
        const list = Array.isArray(data) ? data
          : Array.isArray(data.groups) ? data.groups
          : Array.isArray(data.collections) ? data.collections
          : [];

        setCollections(list);
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

  if (status === 'error') return (
    <Box marginY={1}><Text color="red">✖ {error}</Text></Box>
  );

  if (collections.length === 0) return (
    <Box marginY={1}><Text color="yellow">No collections found on this account.</Text></Box>
  );

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>Collections ({collections.length})</Text>
      {collections.map((c, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text color="white">  {c.id ?? c.group_id ?? c.name ?? `Collection ${i + 1}`}</Text>
          {c.name && c.id && c.name !== c.id && (
            <Text color="gray">    Name: {c.name}</Text>
          )}
          {c.network && (
            <Text color="gray">    Network: <Text color={c.network === 'public' ? 'green' : 'yellow'}>{c.network}</Text></Text>
          )}
          {c.file_count != null && (
            <Text color="gray">    Files: {c.file_count}</Text>
          )}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color="gray">Use the ID with: <Text color="cyan">credcli assign {'<job>'} {'<id>'}</Text></Text>
      </Box>
    </Box>
  );
}
