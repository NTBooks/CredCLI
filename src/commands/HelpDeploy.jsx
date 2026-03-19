import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

export default function HelpDeploy({ deployAs }) {
  const { exit } = useApp();
  const [result, setResult] = useState(null);

  useEffect(() => {
    async function deploy() {
      const targetFile = deployAs === 'claude' ? 'CLAUDE.md' : 'SKILL.MD';
      const targetPath = path.join(process.cwd(), targetFile);
      const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'SKILL.MD');

      if (await fs.pathExists(targetPath)) {
        setResult({ skipped: true, file: targetFile, targetPath });
      } else {
        await fs.copy(sourcePath, targetPath);
        setResult({ skipped: false, file: targetFile, targetPath });
      }
    }
    deploy().catch(e => setResult({ error: e.message }));
  }, []);

  useEffect(() => {
    if (result) setTimeout(() => exit(), 50);
  }, [result]);

  if (!result) return null;

  if (result.error) {
    return (
      <Box marginY={1}>
        <Text color="red">✖ Error: {result.error}</Text>
      </Box>
    );
  }

  if (result.skipped) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">⚠  {result.file} already exists — not overwriting.</Text>
        <Text color="gray">   Delete it first if you want to refresh: <Text color="cyan">rm {result.file}</Text></Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green">✔ {result.file} written to {process.cwd()}</Text>
      {result.file === 'CLAUDE.md'
        ? <Text color="gray">  Claude Code will auto-load this on next session start.</Text>
        : <Text color="gray">  Reference with: credcli help -s</Text>
      }
    </Box>
  );
}
