import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { getTokenPath } from '../utils/jobs.js';

export default function Register({ shortlink, workspaceDir = '.', showInfo = false }) {
  const { exit } = useApp();
  const [status, setStatus] = useState('working');
  const [info, setInfo]     = useState(null);
  const [error, setError]   = useState(null);

  useEffect(() => {
    // -i / --info: just read and display the existing token
    if (showInfo) {
      async function readToken() {
        try {
          const tokenPath = getTokenPath();
          if (!await fs.pathExists(tokenPath)) throw new Error(`No token.json found at ${tokenPath}. Run "credcli register <url>" first.`);
          const token = await fs.readJson(tokenPath);
          setInfo({ fromFile: true, ...token });
          setStatus('info');
        } catch (e) {
          setError(e.message);
          setStatus('error');
        }
        setTimeout(() => exit(), 100);
      }
      readToken();
      return;
    }

    if (!shortlink) {
      setError('Usage: credcli register <token-url> [workspace-dir]');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run() {
      try {
        const claimUrl = new URL(shortlink);
        claimUrl.searchParams.set('claim', 'true');
        const r = await fetch(claimUrl.toString(), { redirect: 'follow' });
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        const data = await r.json();
        if (!data.success || !data.jwt) throw new Error(data.message || 'Token claim failed');

        const tokenPath = getTokenPath();
        await fs.ensureDir(path.dirname(tokenPath));
        await fs.writeJson(tokenPath, {
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
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'working') {
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

  if (status === 'info') {
    const expired = info.expires && new Date(info.expires) < new Date();
    const expiresStr = info.expires
      ? new Date(info.expires).toLocaleString()
      : (info.expiresIn ? `${info.expiresIn}s from registration` : '—');
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="cyan" bold>Current token</Text>
        <Text>  Tenant:      <Text color="white">{info.tenant || '—'}</Text></Text>
        <Text>  Group:       <Text color="white">{info.groupname || '—'}</Text></Text>
        <Text>  Expires:     <Text color={expired ? 'red' : 'green'}>{expiresStr}{expired ? '  ⚠ expired' : ''}</Text></Text>
        <Text>  Webhook:     <Text color="gray">{info.webhookUrl || '—'}</Text></Text>
        <Text>  Registered:  <Text color="gray">{info.registeredAt ? new Date(info.registeredAt).toLocaleString() : '—'}</Text></Text>
        <Text color="gray">  File: <Text color="white">{getTokenPath()}</Text></Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>✔ Token registered</Text>
      <Text>  Tenant:   <Text color="cyan">{info.tenant || '—'}</Text></Text>
      <Text>  Group:    <Text color="cyan">{info.groupname || '—'}</Text></Text>
      <Text>  Expires:  <Text color="cyan">{info.expires ? new Date(info.expires).toLocaleString() : (info.expires_in ? `${info.expires_in}s` : '—')}</Text></Text>
      <Text color="gray">  Saved to <Text color="white">{getTokenPath()}</Text></Text>
    </Box>
  );
}
