import React from 'react';
import { Box, Text, useApp } from 'ink';
import { listTemplates, getTemplatesDir } from '../utils/jobs.js';

export default function ListTemplates() {
  const { exit } = useApp();
  const templates = listTemplates();

  setTimeout(() => exit(), 50);

  if (templates.length === 0) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Text color="yellow">No templates found in {getTemplatesDir()}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="cyan">Available templates (use number with --template N):</Text>
      <Box marginTop={1} flexDirection="column">
        {templates.map((t, i) => (
          <Box key={t.file} flexDirection="column" marginBottom={1}>
            <Box gap={2}>
              <Text color="yellow" bold>{String(i + 1).padStart(2, ' ')}.</Text>
              <Text bold>{t.name}</Text>
              <Text color="gray">{t.width}×{t.height}</Text>
              {t.description ? <Text color="gray">— {t.description}</Text> : null}
            </Box>
            <Box marginLeft={5}>
              <Text color="cyan">fields: </Text>
              <Text>{t.fields.join(', ')}</Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
