# Running the CredCLI Test Suite

The batch test (`test-all-commands.bat`) exercises every CLI command end-to-end: it generates 5 credentials, uploads them to a new Chainletter collection, blockchain-stamps the collection, and sends credential emails via SMTP.

## Prerequisites

- Node.js 18+
- A Chainletter account and a registered `token.json` in the project root
  (run `credcli register <your-chainletter-url>` if you don't have one)

## One-time setup

### 1. Create `testworkspace.json`

Copy the example and fill in your SMTP details:

```json
{
  "issuerName": "CredCLI Test Issuer",
  "smtp": {
    "host": "your-smtp-host.example.com",
    "port": 465,
    "user": "sender@example.com",
    "pass": "your-smtp-password",
    "fromAddress": "sender@example.com"
  }
}
```

> **Note:** `testworkspace.json` is gitignored — credentials will not be committed.
> Port 465 uses implicit SSL (TLS is applied automatically). For STARTTLS use port 587.

**Common SMTP providers:**

| Provider    | Host                                  | Port |
|-------------|---------------------------------------|------|
| SiteGround  | `gvam####.siteground.biz`             | 465  |
| SendGrid    | `smtp.sendgrid.net`                   | 587  |
| Amazon SES  | `email-smtp.us-east-1.amazonaws.com`  | 587  |
| Mailgun     | `smtp.mailgun.org`                    | 587  |
| Postmark    | `smtp.postmarkapp.com`                | 587  |

### 2. Build the CLI

```bat
npm run build
```

## Running the tests

```bat
test-all-commands.bat
```

All 5 test emails are sent to `test123@credcli.com` (defined in the batch file). Change that address if you want to receive the test emails yourself.

### Flags

| Flag | Effect |
|------|--------|
| `-d` | Delete the test job at the end (default: leave it in place) |

```bat
test-all-commands.bat -d
```

## What the test does

| Step | Command | Notes |
|------|---------|-------|
| 1 | `register -i` | Confirms token is valid |
| 2–5 | `workspace` | Backs up your workspace, seeds it from `testworkspace.json`, sets issuer + logo |
| 6 | `templates` | Lists available templates |
| 7 | `list` | Job list before test |
| 8 | — | Creates a 5-row test CSV (`test_sample_data.csv`) |
| 9 | `new` | Creates a new job |
| 10 | `csv` | Loads the test CSV into the job |
| 11 | `list` | Job list after CSV upload |
| 12 | `run --format png` | Renders 5 credentials via headless Chromium (~30 s) |
| 13 | `preview --row 1` | Renders a single preview |
| 14 | `output` | Lists output files |
| 15 | `assign` | Creates a new public Chainletter collection |
| 16 | `send` | Uploads credential files to Chainletter |
| 17 | `stamp` | Blockchain-stamps the collection |
| 18 | `email` | Generates `.eml` files and **sends them via SMTP** |
| 19 | `list` | Final job list |
| 20 | `delete` | Skipped unless `-d` flag is passed |

Your original workspace settings are restored unconditionally at the end, even if the test fails.

## Re-sending emails

The email step is idempotent. If you re-run `credcli email <jobId>` against an already-sent job, emails that were successfully delivered are skipped (a receipt file is stored in `mail_merge/.receipts/`). To force a re-send, delete that folder.

## Debugging SMTP

Set `DEBUG=true` in your environment to see the full SMTP conversation:

```bat
set DEBUG=true
test-all-commands.bat
```
