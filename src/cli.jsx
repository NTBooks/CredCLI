import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import meow from 'meow';
import fs from 'fs-extra';
import NewJob from './commands/NewJob.jsx';
import RunJob from './commands/RunJob.jsx';
import ListJobs from './commands/ListJobs.jsx';
import Setup from './commands/Setup.jsx';
import { BANNER } from './banner.js';

const cli = meow(`
  Usage
    $ credcli <command> [options]

  Commands
    new                    Create a new job (interactive)
    run [job]              Render credentials for a job
    list                   List all jobs
    serve                  Start the web UI (workspace folder set by tenant on login)
    register <url> [dir]   Store a Chainletter token in token.json for CLI use

  Options
    --template, -t  Template number or name (for "new")
    --format,   -f  Output format: pdf (default) or png
    --port,     -p  Port for the web server (default: 3037)
    --help          Show this help

  Examples
    $ credcli new
    $ credcli new --template 1
    $ credcli run job001
    $ credcli run job001 --format png
    $ credcli list
    $ credcli serve
    $ credcli serve --port 8080
`, {
  importMeta: import.meta,
  flags: {
    template: { type: 'string', shortFlag: 't' },
    format:   { type: 'string', shortFlag: 'f', default: 'pdf' },
    port:     { type: 'string', shortFlag: 'p', default: '3037' },
  },
});

function MainMenu({ tokenInfo, onLogout }) {
  const { exit } = useApp();
  const [view, setView] = useState('menu');

  const items = [
    { label: 'Create a new job', value: 'new' },
    { label: 'Run an existing job', value: 'run' },
    { label: 'List all jobs', value: 'list' },
    { label: 'Logout', value: 'logout' },
    { label: 'Exit', value: 'exit' },
  ];

  async function handleSelect({ value }) {
    if (value === 'exit') { exit(); return; }
    if (value === 'logout') {
      await fs.remove('token.json');
      onLogout?.();
      return;
    }
    setView(value);
  }

  if (view === 'new')  return <NewJob />;
  if (view === 'run')  return <RunJob format={cli.flags.format} />;
  if (view === 'list') return <ListJobs />;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="cyan">{BANNER}</Text>
      <Text color="gray">  Mail-merge credential & certificate generator  v0.1.0</Text>
      {tokenInfo && (
        <Text color="green">  ✔ Signed in as <Text bold>{tokenInfo.tenant}</Text>
          {tokenInfo.groupname ? <Text color="gray"> ({tokenInfo.groupname})</Text> : null}
        </Text>
      )}
      <Box marginTop={1} flexDirection="column">
        <Text bold>What would you like to do?</Text>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>
    </Box>
  );
}

function DefaultView() {
  const [view, setView] = useState('checking');
  const [tokenInfo, setTokenInfo] = useState(null);

  useEffect(() => {
    fs.readJson('token.json')
      .then(data => { setTokenInfo(data); setView('menu'); })
      .catch(() => setView('setup'));
  }, []);

  if (view === 'checking') return null;
  if (view === 'setup') return <Setup onDone={() => setView('menu')} />;
  return <MainMenu tokenInfo={tokenInfo} onLogout={() => { setTokenInfo(null); setView('setup'); }} />;
}

// Route based on command-line arguments
const [command, jobArg] = cli.input;

// `serve` bypasses ink entirely — Express keeps the process alive on its own
if (command === 'serve') {
  const { startServer } = await import('./serve.js');
  const port   = parseInt(cli.flags.port, 10) || 3037;
  console.log(`Starting CredCLI server…`);
  try {
    const { port: p, server } = await startServer(port);
    console.log(`\n✔  CredCLI server running`);
    console.log(`   URL:       http://localhost:${p}`);
    console.log(`   Login:     Paste a Chainletter token URL in the browser`);
    console.log(`\n   Press Ctrl+C to stop.\n`);

    // Keep the process alive — necessary when running as a linked/global command
    // (VS Code auto-attach or other debuggers can drain the event loop instead)
    process.stdin.resume();
    global.__credcliServer = server; // strong reference prevents GC
  } catch (err) {
    console.error(`✖  Failed to start server: ${err.message}`);
    process.exit(1);
  }
} else {
  let app;
  switch (command) {
    case 'new':
      app = <NewJob preselect={cli.flags.template} />;
      break;
    case 'run':
      app = <RunJob preselect={jobArg} format={cli.flags.format} />;
      break;
    case 'list':
      app = <ListJobs />;
      break;
    case 'register': {
      const { default: Register } = await import('./commands/Register.jsx');
      app = <Register shortlink={cli.input[1]} workspaceDir={cli.input[2] || '.'} />;
      break;
    }
    default:
      app = <DefaultView />;
  }

  render(
    <Box flexDirection="column">
      {app}
    </Box>
  );
}
