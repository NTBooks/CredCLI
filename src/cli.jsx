import 'dotenv/config';
import { render, Box } from 'ink';
import meow from 'meow';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import NewJob from './commands/NewJob.jsx';
import RunJob from './commands/RunJob.jsx';
import ListJobs from './commands/ListJobs.jsx';
import { BANNER } from './banner.js';
import { initTenantWorkspace, getTokenPath } from './utils/jobs.js';

const cli = meow(`
  Usage
    $ credcli                    Start the web UI (same as "serve")
    $ credcli <command> [options]

  Commands
    (no command)                 Start the web UI server
    serve                        Start the web UI server
    help                         Show this help
    register <url> [dir]         Claim a Chainletter token and save to token.json
    register -i                  Show info about the current token
    workspace                    Show current issuer name and logo
    workspace --issuer <name>    Set the workspace issuer name
    workspace --logo <file>      Set the workspace logo (PNG/JPG/SVG → embedded base64)
    workspace --logo ""          Clear the workspace logo
    templates                    List available templates with their required CSV fields
    new                          Create a new job (interactive)
    new --template N             Create a new job from template N (non-interactive)
    run [job]                    Render credentials for a job
    list                         List all jobs
    csv <job> <file>             Set the recipient CSV for a job
    output <job>                 List output files for a job (with full paths)
    assign <job> <collection>    Assign a Chainletter collection ID to a job
                               Use --network public|private (default: private)
    send <job>                   Upload output files to the assigned Chainletter collection
    stamp <job>                  Blockchain-stamp the Chainletter collection
    email <job>                  Generate .eml files for a job's output (run after stamp)
                               Use --email-template <file> to pick a template

  Options
    --template,        -t  Template number or name (for "new")
    --format,          -f  Output format: pdf (default) or png (for "run")
    --port,            -p  Port for the web server (default: 3037)
    --info,            -i  Show current token info (for "register")
    --issuer               Issuer / organisation name (for "workspace")
    --logo                 Path to logo image file (for "workspace")
    --email-template       Email template filename (for "email")
    --help          Show this help

  Agent / AI setup
    help -c         Write CLAUDE.md to the current directory (Claude Code auto-loads it)
    help -s         Write SKILL.MD to the current directory (agent reference guide)
                    Neither command overwrites an existing file.

  Examples
    $ credcli register https://chainletter.io/jwt/abc123
    $ credcli new --template 1
    $ credcli csv job001 ./recipients.csv
    $ credcli run job001 --format png
    $ credcli output job001
    $ credcli assign job001 my-collection-id
    $ credcli assign job001 my-collection-id --network public
    $ credcli send job001
    $ credcli stamp job001
    $ credcli serve --port 8080

  ─────────────────────────────────────────────────────────────────────────────
  AI Agent Guide
  ─────────────────────────────────────────────────────────────────────────────

  Full end-to-end workflow (no browser required):

    credcli register <url>          → saves token.json in current directory
    credcli workspace               → show current issuer name and logo
    credcli workspace --issuer "Acme University"  → set issuer name
    credcli workspace --logo ./logo.png           → set logo (embedded as base64)
    credcli workspace --logo ""                   → clear logo
    credcli templates               → lists templates (1-indexed) with their required CSV fields
    credcli new --template 1        → creates jobs/job001/ with empty mailmerge.csv
    credcli csv job001 data.csv     → loads recipient rows into job001
    credcli run job001              → renders credentials → jobs/job001/output/
    credcli output job001           → prints absolute paths of every output file
    credcli assign job001 <id>      → links job to a Chainletter collection
    credcli send job001             → uploads output files to Chainletter
    credcli stamp job001            → blockchain-postmarks the collection
    credcli email job001            → generate .eml claim emails for recipients

  File locations (CLI and serve mode share the same layout):

    ./token.json                              Chainletter credentials (created by "register")
    ./.data/{tenant}/jobs/job001/job.json     Job metadata: template name, fields, dimensions
    ./.data/{tenant}/jobs/job001/mailmerge.csv  Recipient data — one row per credential
    ./.data/{tenant}/jobs/job001/template.html  HTML template (auto-copied when job is created)
    ./.data/{tenant}/jobs/job001/output/      Generated PDFs / PNGs appear here after "run"
    ./.data/{tenant}/templates/               Workspace templates (seeded from package on first run)

    {tenant} comes from the Chainletter token, e.g. "yourname.chainletter.io"

  How to write the CSV directly (instead of using "csv" command):

    The first row must be a header with the field names from the template.
    All subsequent rows are recipients. Example:

      FullName,CourseName,IssueDate,CredentialID
      Jane Smith,Machine Learning,2026-03-18,CRED-001
      Alex Jones,Data Science,2026-03-18,CRED-002

    Write or overwrite .data/{tenant}/jobs/job001/mailmerge.csv then run
    "credcli run job001".

  How to add a custom template:

    Templates live in .data/{tenant}/templates/. To add one:

      1. Write an HTML file to the templates directory.
      2. Add a metadata comment near the top of the HTML:
           <!--CREDCLI:{"name":"My Certificate","width":1200,"height":900,
                        "fields":["FullName","CourseName","IssueDate"]}-->
      3. Use {{FieldName}} placeholders anywhere in the HTML body.
         {{WorkspaceLogo}} and {{WorkspaceIssuer}} are injected automatically
         from workspace settings.
      4. Run "credcli new" — your template will appear in the list.

    Tip: "credcli serve" provides a browser-based template editor with live
    preview and field chip insertion, which is easier for initial design.
`, {
  importMeta: import.meta,
  flags: {
    template: { type: 'string',  shortFlag: 't' },
    format:   { type: 'string',  shortFlag: 'f', default: 'pdf' },
    port:     { type: 'string',  shortFlag: 'p', default: '3037' },
    info:     { type: 'boolean', shortFlag: 'i', default: false },
    network:       { type: 'string',  shortFlag: 'n', default: 'private' },
    emailTemplate: { type: 'string' },
    claude:        { type: 'boolean', shortFlag: 'c', default: false },
    skill:         { type: 'boolean', shortFlag: 's', default: false },
    issuer: { type: 'string' },
    logo:   { type: 'string' },
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
      await fs.remove(getTokenPath());
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

// Warn when running ephemerally via npx (Playwright re-downloads Chromium every run)
if (fileURLToPath(import.meta.url).includes('_npx')) {
  console.warn(
    '\n⚠  Running via npx (ephemeral). Playwright will re-download Chromium (~130 MB) on every run.' +
    '\n   For fast repeated use: pnpm add -g credcli\n'
  );
}

// Route based on command-line arguments
const [command, jobArg] = cli.input;

// For all commands that touch jobs/templates, initialise the tenant workspace
// from token.json so paths mirror the web server's .data/{tenant}/ layout.
// `serve` manages its own workspace per-session; `register` creates the token.
if (command !== 'serve' && command !== 'register') {
  try {
    const token = await fs.readJson(getTokenPath());
    if (token?.tenant) await initTenantWorkspace(token.tenant);
  } catch { /* no token yet — individual commands will surface the error */ }
}

// `serve` (and bare invocation) bypasses ink entirely — Express keeps the process alive on its own
if (command === 'serve' || !command) {
  if (!command) {
    // Print the logo for bare `credcli` invocation
    console.log('\n' + BANNER);
    console.log('  Mail-merge credential & certificate generator\n');
  }
  const { startServer } = await import('./serve.js');
  const port   = parseInt(cli.flags.port, 10) || parseInt(process.env.PORT, 10) || 3037;
  if (command) console.log(`Starting CredCLI server…`);
  try {
    const { port: p, server } = await startServer(port);
    console.log(`✔  CredCLI server running`);
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
    case 'workspace': {
      const { default: WorkspaceSettings } = await import('./commands/WorkspaceSettings.jsx');
      const hasFlags = cli.flags.issuer !== undefined || cli.flags.logo !== undefined;
      app = <WorkspaceSettings
        issuer={cli.flags.issuer}
        logoFile={cli.flags.logo}
        showOnly={!hasFlags}
      />;
      break;
    }
    case 'templates': {
      const { default: ListTemplates } = await import('./commands/ListTemplates.jsx');
      app = <ListTemplates />;
      break;
    }
    case 'register': {
      const { default: Register } = await import('./commands/Register.jsx');
      app = <Register shortlink={cli.input[1]} workspaceDir={cli.input[2] || '.'} showInfo={cli.flags.info} />;
      break;
    }
    case 'csv': {
      const { default: CsvUpload } = await import('./commands/CsvUpload.jsx');
      app = <CsvUpload jobArg={cli.input[1]} csvFile={cli.input[2]} />;
      break;
    }
    case 'output': {
      const { default: OutputList } = await import('./commands/OutputList.jsx');
      app = <OutputList jobArg={cli.input[1]} />;
      break;
    }
    case 'assign': {
      const { default: AssignCollection } = await import('./commands/AssignCollection.jsx');
      app = <AssignCollection jobArg={cli.input[1]} collectionId={cli.input[2]} network={cli.flags.network} />;
      break;
    }
    case 'send': {
      const { default: SendToChainletter } = await import('./commands/SendToChainletter.jsx');
      app = <SendToChainletter jobArg={cli.input[1]} />;
      break;
    }
    case 'stamp': {
      const { default: StampChainletter } = await import('./commands/StampChainletter.jsx');
      app = <StampChainletter jobArg={cli.input[1]} />;
      break;
    }
    case 'email': {
      const { default: EmailJob } = await import('./commands/EmailJob.jsx');
      app = <EmailJob jobArg={cli.input[1]} emailTemplate={cli.flags.emailTemplate} />;
      break;
    }
    case 'help': {
      if (!cli.flags.claude && !cli.flags.skill) {
        cli.showHelp(0);
        break;
      }
      const { default: HelpDeploy } = await import('./commands/HelpDeploy.jsx');
      app = <HelpDeploy deployAs={cli.flags.claude ? 'claude' : 'skill'} />;
      break;
    }
  }

  render(
    <Box flexDirection="column">
      {app}
    </Box>
  );
}
