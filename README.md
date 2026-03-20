# @credcli/cli

Mail-merge credential & certificate generator — PDF/PNG output via Playwright, blockchain-stamped via Chainletter.

## Install

```bash
npm install -g @credcli/cli
```

Or run without installing:

```bash
npx @credcli/cli <command>
```

> First run downloads Chromium (~130 MB) for headless rendering.

## Quick start

```bash
# Claim your Chainletter workspace token
credcli register https://chain.lt/abc123

# Set your organization name and logo
credcli workspace --issuer "Acme University" --logo logo.png

# Create a job and load recipients
credcli new --template 3
credcli csv job001 recipients.csv

# Render PDFs
credcli run job001 --format pdf

# Upload, stamp on-chain, generate emails
credcli assign job001 spring-2026
credcli send job001 --yes
credcli stamp job001
credcli email job001
```

## Commands

| Command | Description |
|---|---|
| `register <url>` | Claim a Chainletter token from a shortlink. Use `-i` to inspect the current token. |
| `workspace` | Set issuer name (`--issuer`) and logo (`--logo`) |
| `new` | Create a credential job and pick a template |
| `templates` | List available templates with dimensions and CSV fields |
| `csv <job> <file>` | Load a recipient CSV into a job |
| `run [job]` | Render credentials via headless Chromium (`--format pdf\|png`) |
| `list` | Show all jobs with template, recipient count, and output count |
| `output <job>` | List generated files for a job |
| `assign <job> <id>` | Link a job to a Chainletter collection (`--network private\|public`) |
| `send <job>` | Upload credentials to Chainletter and store claim links |
| `stamp <job>` | Blockchain-stamp the collection (immutable) |
| `email <job>` | Generate .eml files, MBOX archive, and manifest CSV |
| `serve` | Start the web UI at `localhost:3037` |
| `help` | Show usage. `-c` writes CLAUDE.md; `-s` writes SKILL.md |

## Built-in templates

- Badge (800×800)
- Certificate of Achievement (1200×900)
- Course Completion (1200×900)
- Diploma (1200×900)
- Transcript (1200×1600, 12 course rows)
- Email template (600×900)

Custom HTML templates are supported — any `{{Placeholder}}` in your HTML becomes a CSV column.

## CSV fields

`FullName` `FName` `LName` `Email` `Title` `Achievement` `BadgeLevel` `CredentialID` `Institution` `Issuer` `Signature` `Location` `IssueDate` `ExpirationDate` `CourseName` `Major` `GPA` `Hours` `QRUrl` `VerificationURL` + `Course1–12 Name/Grade/Credits/Semester`

## Requirements

- Node.js >= 18
- A [Chainletter](https://credcli.com) account for blockchain stamping and credential hosting

## License

MIT
