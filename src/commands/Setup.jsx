import React, { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { BANNER } from '../banner.js';

export default function Setup({ onDone }) {
  const { exit } = useApp();
  const [url, setUrl]       = useState('');
  const [status, setStatus] = useState('prompt'); // 'prompt' | 'claiming' | 'done' | 'error'
  const [info, setInfo]     = useState(null);
  const [error, setError]   = useState(null);

  useInput((input, key) => {
    if (status !== 'prompt') return;

    if (key.return) {
      if (!url.trim()) return;
      claim(url.trim());
    } else if (key.backspace || key.delete) {
      setUrl(v => v.slice(0, -1));
    } else if (input) {
      setUrl(v => v + input);
    }
  });

  async function claim(shortlink) {
    setStatus('claiming');
    try {
      const claimUrl = new URL(shortlink);
      claimUrl.searchParams.set('claim', 'true');
      const r = await fetch(claimUrl.toString(), { redirect: 'follow' });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      const data = await r.json();
      if (!data.success || !data.jwt) throw new Error(data.message || 'Token claim failed');

      await fs.writeJson('token.json', {
        jwt:          data.jwt,
        webhookUrl:   data.webhookurl,
        tenant:       data.tenant,
        groupname:    data.groupname,
        expires:      data.expires,
        expiresIn:    data.expires_in,
        shortlink,
        registeredAt: new Date().toISOString(),
      }, { spaces: 2 });

      setInfo(data);
      setStatus('done');
      setTimeout(() => onDone ? onDone() : exit(), 1000);
    } catch (e) {
      setError(e.message);
      setStatus('error');
      setTimeout(() => exit(), 100);
    }
  }

  if (status === 'prompt') {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan">{BANNER}</Text>
        <Text color="gray">  Mail-merge credential & certificate generator  v0.1.0</Text>
        <Box marginTop={1} flexDirection="column">
          <Text bold>Paste your Chainletter login URL to get started:</Text>
          <Box marginTop={1}>
            <Text color="cyan">{'> '}</Text>
            <Text>{url || <Text color="gray">https://...</Text>}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  if (status === 'claiming') {
    return (
      <Box marginY={1}>
        <Text color="yellow">Claiming token…</Text>
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box marginY={1}>
        <Text color="red">✖ {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ Registered</Text>
      <Text>  Tenant:  <Text color="cyan">{info.tenant || '—'}</Text></Text>
      <Text>  Group:   <Text color="cyan">{info.groupname || '—'}</Text></Text>
      <Text color="gray">  Saved to <Text color="white">token.json</Text></Text>
    </Box>
  );
}
