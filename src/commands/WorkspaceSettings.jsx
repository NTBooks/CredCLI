import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { getWorkspace } from '../utils/jobs.js';

// Reads an image file and returns a base64 data URL
async function imageToDataUrl(filePath) {
  const abs = path.resolve(filePath);
  if (!await fs.pathExists(abs)) throw new Error(`File not found: ${abs}`);
  const buf = await fs.readFile(abs);
  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.svg' ? 'image/svg+xml'
    : ext === '.png' ? 'image/png'
    : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
    : ext === '.gif' ? 'image/gif'
    : ext === '.webp' ? 'image/webp'
    : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export default function WorkspaceSettings({ issuer, logoFile, showOnly }) {
  const { exit } = useApp();
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function run() {
      const wsPath = path.join(getWorkspace(), 'workspace.json');
      let cfg = {};
      try { cfg = await fs.readJson(wsPath); } catch {}

      // Show-only mode (no flags)
      if (showOnly) {
        setResult({ show: true, cfg });
        return;
      }

      // Apply changes
      if (issuer !== undefined) cfg.issuerName = issuer;
      if (logoFile !== undefined) {
        if (logoFile === '') {
          cfg.logo = '';
        } else {
          cfg.logo = await imageToDataUrl(logoFile);
        }
      }

      await fs.ensureDir(path.dirname(wsPath));
      await fs.writeJson(wsPath, cfg, { spaces: 2 });
      setResult({ saved: true, cfg });
    }
    run().catch(e => setResult({ error: e.message }));
  }, []);

  useEffect(() => {
    if (result) setTimeout(() => exit(), 50);
  }, [result]);

  if (!result) return null;

  if (result.error) {
    return <Box marginY={1}><Text color="red">✖ {result.error}</Text></Box>;
  }

  const { cfg } = result;

  return (
    <Box flexDirection="column" marginY={1}>
      {result.saved && <Text color="green">✔ Workspace settings saved</Text>}
      <Box flexDirection="column" marginTop={result.saved ? 1 : 0}>
        <Text color="gray">  Workspace: <Text color="cyan">{getWorkspace()}</Text></Text>
        <Text color="gray">  Issuer:    <Text color="white">{cfg.issuerName || '(not set)'}</Text></Text>
        <Text color="gray">  Logo:      <Text color="white">{cfg.logo ? (cfg.logo.startsWith('data:') ? `data URL (${Math.round(cfg.logo.length / 1024)} KB)` : cfg.logo) : '(not set)'}</Text></Text>
      </Box>
      {result.show && (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">  Set with:</Text>
          <Text color="gray">    <Text color="cyan">credcli workspace --issuer "Acme University"</Text></Text>
          <Text color="gray">    <Text color="cyan">credcli workspace --logo ./logo.png</Text></Text>
          <Text color="gray">    <Text color="cyan">credcli workspace --logo ""</Text>  (clear logo)</Text>
        </Box>
      )}
    </Box>
  );
}
