# CredCLI — Agent Skill Guide

CredCLI is a mail-merge credential generator. It takes an HTML template, a CSV of recipients, renders one PDF (or PNG) per row using a headless browser, then uploads and blockchain-stamps them via Chainletter.

> **Claude Code note:** This file is the agent guide for this project. CLAUDE.md at the root is auto-loaded by Claude Code; reference this file explicitly when needed.

---

## Prerequisites

A `token.json` must exist in the working directory before any job commands work.

```bash
credcli register <shortlink-url>   # e.g. https://server.chainletter.io/jwt/abc123
credcli register -i                # verify the token is valid and show expiry
```

`token.json` stores: `jwt`, `webhookUrl`, `tenant`, `groupname`, `expires`.
All job data lives under `.data/{tenant}/` — the tenant comes from the token.

---

## Setting Workspace Identity (Issuer Name + Logo)

`{{WorkspaceIssuer}}` and `{{WorkspaceLogo}}` are auto-injected into every rendered credential. Set them once per workspace:

```bash
credcli workspace                              # show current values
credcli workspace --issuer "Acme University"   # set issuer name
credcli workspace --logo ./logo.png            # set logo (PNG/JPG/SVG → embedded base64 data URL)
credcli workspace --logo ""                    # clear logo
credcli workspace --smtp-host mail.example.com --smtp-port 465 --smtp-secure
credcli workspace --smtp-user you@example.com --smtp-pass secret
credcli workspace --smtp-from "No Reply <noreply@example.com>"
credcli workspace --test you@example.com       # send test email to verify SMTP
```

The values are stored in `.data/{tenant}/workspace.json`. They can also be set via the web UI under **Workspace Settings**.

---

## Full Diploma / Certificate Workflow (100 students)

```bash
# ── STEP 1: Authenticate ─────────────────────────────────────────────────────
credcli register https://server.chainletter.io/jwt/abc123

# ── STEP 2: Create credentials ───────────────────────────────────────────────
credcli templates                          # discover templates and their CSV columns
credcli new --template 4                   # create job  (template 4 = Diploma)
credcli csv job001 students.csv            # load recipient CSV
credcli run job001 --format pdf            # render one PDF per row
credcli output job001                      # verify output file paths

# ── STEP 3: Upload to Chainletter ────────────────────────────────────────────
credcli assign job001 <collection-id>      # link job to a collection
# credcli assign job001 <collection-id> --network public   ← for public IPFS
credcli send job001                        # upload all PDFs

# ── STEP 4: Blockchain-stamp ─────────────────────────────────────────────────
credcli stamp job001

# ── STEP 5: Generate claim emails ────────────────────────────────────────────
credcli email job001 --email-template credential-claim-email_600x900.html
```

---

## Discovering Template Fields

Always run `credcli templates` before creating a job. It prints each template's number, name, dimensions, and the exact field names required in the CSV header row.

Example output:
```
 1. Achievement Badge            600×600  — Digital achievement badge with level indicator
    fields: FullName, CourseName, Institution, Issuer, IssueDate, CredentialID, ...

 4. Diploma                      1200×900 — Traditional academic diploma with seal and signatures
    fields: FullName, Title, Institution, Issuer, Major, CourseName, GPA, Hours,
            IssueDate, ExpirationDate, CredentialID, Achievement, Signature,
            Location, Notes, QRUrl, VerificationURL, WorkspaceLogo, WorkspaceIssuer
```

`WorkspaceLogo` and `WorkspaceIssuer` are injected automatically — you don't need to include them in your CSV.

---

## Built-in Templates (package defaults)

| # | Name | Size | Key Fields |
|---|------|------|------------|
| 1 | Achievement Badge | 600×600 | FullName, CourseName, IssueDate, CredentialID, BadgeLevel |
| 2 | Certificate of Achievement | 1200×900 | FullName, Title, CourseName, IssueDate, CredentialID |
| 3 | Course Completion Certificate | 1200×900 | FullName, CourseName, IssueDate, CredentialID, Hours, GPA |
| 4 | Diploma | 1200×900 | FullName, Title, Institution, Major, IssueDate, CredentialID |
| 5 | Transcript | 1200×1600 | FullName, Institution, GPA, Major, IssueDate |
| 6 | Credential Claim Email | 600×900 | FullName, Email, Title, VerificationURL *(type: email)* |

---

## CSV Format

```
FullName,Title,Institution,Major,IssueDate,CredentialID
Jane Smith,Bachelor of Science,State University,Computer Science,2026-06-01,CRED-0001
Alex Jones,Bachelor of Arts,State University,History,2026-06-01,CRED-0002
```

Rules:
- First row is the **header** — column names must **exactly match** the template's `fields` (case-sensitive)
- One row per credential; blank rows are skipped
- `{{FieldName}}` placeholders in the HTML are replaced by the matching column value
- Extra columns in the CSV are ignored; missing columns render as empty string
- Use `credcli csv job001 file.csv` to copy-and-validate the file into the job, or write/overwrite `.data/{tenant}/jobs/job001/mailmerge.csv` directly

---

## Reading Job State

After creating a job, `job.json` is the source of truth for its template fields and metadata:

```
.data/{tenant}/jobs/job001/
  job.json          ← templateName, fields[], width, height, chainletterCollection
  mailmerge.csv     ← header row + recipients (empty header-only file on creation)
  template.html     ← copy of the template at job-creation time
  output/
    Jane_Smith_CRED-0001.pdf    ← one file per recipient after "run"
    results.json                ← [{name, file, row}] array
    mail_merge/                 ← created by "email" command
      Jane_Smith_CRED-0001.eml
      all_recipients.mbox
      mail_merge_manifest.csv
```

Reading `mailmerge.csv` after `credcli new` gives you the exact column headers required — the file is created with the header row and no data rows.

---

## Command Reference

| Command | Purpose | Key flags |
|---------|---------|-----------|
| `credcli register <url>` | Claim Chainletter token | |
| `credcli register -i` | Show current token info | `-i` |
| `credcli workspace` | Show issuer name, logo, SMTP config | |
| `credcli workspace --issuer <name>` | Set issuer name | `--issuer` |
| `credcli workspace --logo <file>` | Set logo from image file | `--logo` |
| `credcli workspace --smtp-host <h> --smtp-port <p> --smtp-secure` | Set SMTP server | `--smtp-host`, `--smtp-port`, `--smtp-secure` |
| `credcli workspace --smtp-user <u> --smtp-pass <p>` | Set SMTP credentials | `--smtp-user`, `--smtp-pass` |
| `credcli workspace --smtp-from <addr>` | Set from address | `--smtp-from` |
| `credcli workspace --test <email>` | Send test email | `--test` |
| `credcli templates` | List templates + their fields | |
| `credcli new --template N` | Create job (non-interactive) | `--template N` (1-indexed) |
| `credcli list` | List existing jobs + recipient counts | |
| `credcli csv <job> <file>` | Load CSV into job | |
| `credcli run <job>` | Render all credentials to PDF/PNG | `--format pdf\|png` |
| `credcli output <job>` | Print absolute paths of output files | |
| `credcli assign <job> <id>` | Link job to Chainletter collection | `--network public\|private` |
| `credcli send <job>` | Upload output files to Chainletter | |
| `credcli stamp <job>` | Blockchain-stamp the collection | |
| `credcli email <job>` | Generate .eml + mbox for all recipients | `--email-template <file>` |
| `credcli serve` | Start web UI | `--port N` |

---

## Error Handling

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No token registered` | `token.json` missing or wrong directory | `credcli register <url>` |
| `Invalid template number` | `--template N` out of range | `credcli templates` to see valid range |
| Credentials render blank | CSV columns don't match template fields | Check `credcli templates` for exact field names |
| `409 Conflict` on send | File already uploaded (deduplication) | Safe to ignore — skipped count is reported |
| `401 Unauthorized` on send/stamp | Token expired | `credcli register <url>` with a fresh shortlink |

---

## Adding a Custom Template

1. Write an HTML file to `.data/{tenant}/templates/`
2. Add metadata near the top:
   ```html
   <!--CREDCLI:{"name":"My Diploma","width":1200,"height":900,
                "fields":["FullName","Programme","IssueDate","CredentialID"]}-->
   ```
3. Use `{{FieldName}}` placeholders in the HTML body
4. Run `credcli templates` — your template appears immediately
5. `credcli new --template N` where N is its number

`credcli serve` provides a browser-based template editor with live preview if visual editing is needed.

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PERSIST` | Override the `.data/` root directory (useful in containers) |
| `PORT` | Default port for `credcli serve` (overridden by `--port`) |
