# CredCLI

A mail-merge credential and certificate generator. Fills HTML templates with data from CSV files and renders them as HTML or PNG via Playwright.

## Requirements

- Node.js >= 18
- pnpm (or npm)

## Installation

```bash
pnpm install
pnpm run build
```

To use globally:

```bash
npm link
```

## Commands

### `list`

List all available HTML templates in the `templates/` directory.

```bash
credcli list
```

### `generate`

Generate a single credential from a template with inline flag values.

```bash
credcli generate --template Diploma-1200x900.html --out output/diploma.html \
  --FullName "Jane Smith" --Title "Bachelor of Science" \
  --Institution "State University" --IssueDate "2024-05-15"
```

Add `--format png` to render a PNG screenshot via Playwright:

```bash
credcli generate --template Diploma-1200x900.html --format png \
  --FullName "Jane Smith"
```

### `generate-csv`

Bulk-generate credentials from a CSV file (one output per row).

```bash
credcli generate-csv --template Diploma-1200x900.html --csv students.csv --out output/
```

Use `--filter` to process only matching rows:

```bash
credcli generate-csv --template Diploma-1200x900.html --csv students.csv \
  --filter "Major=Computer Science"
```

Use regex filters with `/pattern/`:

```bash
credcli generate-csv --template Diploma-1200x900.html --csv students.csv \
  --filter "GPA=/^3\.[5-9]/"
```

### `newjob`

Create a new job CSV file interactively, or with flags:

```bash
# Interactive
credcli newjob

# With flags
credcli newjob --job jobs/batch1.csv --template Diploma-1200x900.html \
  --headers "FName,LName,FullName,Title,Institution,IssueDate"
```

### `runjob`

Run a job CSV file (a structured batch file with a template header row):

```bash
credcli runjob --file jobs/batch1.csv --out output/
credcli runjob --file jobs/batch1.csv --out output/ --format png
```

**Job CSV format:**

```
templateId,Diploma-1200x900.html
FName,LName,FullName,Title,Institution,IssueDate
Jane,Smith,Jane Smith,Bachelor of Science,State University,2024-05-15
```

### `render`

Render an existing HTML file to PNG using Playwright:

```bash
credcli render --file output/diploma.html --out output/diploma.png
credcli render --file output/diploma.html --out output/diploma.png --width 1200 --height 900
```

### `placeholders`

List all supported template placeholders:

```bash
credcli placeholders
```

## Template Placeholders

Templates use `{{ PlaceholderName }}` syntax. Supported placeholders:

| Placeholder | Description |
|---|---|
| `FName` | First name |
| `LName` | Last name |
| `FullName` | Full name |
| `Title` | Degree or credential title |
| `CredentialID` | Unique credential identifier |
| `Institution` | Issuing institution |
| `Issuer` | Issuer name |
| `IssueDate` | Date of issue |
| `ExpirationDate` | Expiration date |
| `CourseName` | Course name |
| `GPA` | GPA |
| `Major` | Field of study |
| `Hours` | Credit hours |
| `Level` | Level (e.g. Undergraduate) |
| `Description` | Custom description |
| `BadgeLevel` | Badge level |
| `Achievement` | Achievement label |
| `QRUrl` | URL encoded in QR code |
| `QRCodeDataURL` | Auto-generated QR code image (data URL) |
| `VerificationURL` | Credential verification URL |
| `LogoSrc` | Logo image source (data URL or path) |
| `Signature` | Signature name or image |
| `Location` | Location |
| `Notes` | Additional notes |

Unrecognized placeholders are replaced with an empty string.

## Included Templates

- `Badge-800x800.html` — Square badge
- `CertificateOfAchievement-1200x900.html` — Certificate of achievement
- `CourseCompletionCertificate-1200x900.html` — Course completion certificate
- `Diploma-1200x900.html` — Academic diploma
- `Transcript-1200x900.html` — Academic transcript

## Logo

Place a `logo.png` file in the `user_files/` directory to embed your own logo in generated credentials. If absent, a placeholder logo is used.

## License

MIT
