---
name: chainletter-api
description: Write code that uses the Chainletter Webhook API. Use when implementing file uploads to IPFS, blockchain stamping, JWT token exchange, SSE event streaming, or any integration with the Chainletter credential server.
license: MIT
metadata:
  author: CredCLI
  version: "0.1.0"
  tags: chainletter, ipfs, jwt, webhook
---

# Chainletter Webhook API

## Overview

Chainletter is a credential-stamping service. Each deployment has its own subdomain server (e.g. `https://pinproxyvmox.chainletter.io`). The API base is always `{server}/api/v1/` but the webhook endpoints are at `{server}/webhook/{apikey}`.

The server URL is always derived from the token shortlink the user provides.

## Token / Session Flow

### 1. Claiming a shortlink (login)

Given a shortlink URL like `https://pinproxyvmox.chainletter.io/jwt/vfNkAKckJ4Q`:

```js
const claimUrl = new URL(shortlink);
claimUrl.searchParams.set('claim', 'true');
const r = await fetch(claimUrl.toString(), { redirect: 'follow' });
const data = await r.json();
// data = { success, jwt, webhookurl, tenant, groupname, expires, expires_in }
```

The `jwt` field is the bearer token for subsequent API calls.
The `webhookurl` is the full webhook URL: `https://{server}/webhook/{apikey}`.

### 2. Using the JWT

```js
const headers = {
  'Authorization': `Bearer ${jwt}`,
  'Content-Type': 'application/json',
};
```

### 3. Stored in token.json (CLI) or session (web)

**token.json** (workspace root, created by `credcli register`):
```json
{
  "jwt": "...",
  "webhookUrl": "https://server/webhook/apikey",
  "tenant": "tenant-name",
  "groupname": "group-name",
  "expires": "2026-04-17T00:00:00.000Z",
  "expiresIn": 2592000,
  "shortlink": "https://server/jwt/tokenId",
  "registeredAt": "2026-03-17T00:00:00.000Z"
}
```

---

## API Endpoints

All endpoints are on `{webhookUrl}` which expands to `/webhook/{apikey}`.

### Authentication

All webhook endpoints require **either**:
- `secret-key: {secret}` header (for traditional API key auth)
- `Authorization: Bearer {jwt}` header (for JWT-based auth from shortlink claim)

### GET Webhook Status

```
HEAD {webhookUrl}
Headers: secret-key, [group-id], [network: public|private|all|none]
Response Headers: X-Credits, X-Group-Enabled, X-Group-Exists, X-Total-Files, X-Total-Size
```

### Upload File

```
POST {webhookUrl}
Headers: secret-key, group-id (required), [network], [stamp-immediately]
Body: multipart/form-data with file field
Response: { success, message, hash, name, size, network, group_id }
```

Or register a hash without uploading:
```json
{ "hash": "QmCIDv0...", "name": "file.pdf", "size": 12345, "mimetype": "application/pdf" }
```

### List Files or Groups

```
GET {webhookUrl}
Headers: secret-key, [group-id], [hash], [network], [show-deleted], [export-links]
```
- No group-id: returns list of groups
- With group-id: returns files in group
- With hash: returns verification data for that file

### Delete File

```
DELETE {webhookUrl}
Headers: secret-key, group-id (required)
Body: { "file_hash": "Qm..." }
```

### Stamp Collection (blockchain postmark)

```
PATCH {webhookUrl}
Headers: secret-key, group-id (required), [network]
Response: { success, message, files_stamped }
```

### Exchange API Key for JWT Shortlink

```
POST {webhookUrl}/jwt
Headers: secret-key (required)
Body: { "groupname": "my-group" }
Response: { success, message, token, shortlink, expires_in, groupname }
```

The `shortlink` can be shared with users to grant them access.

### Server-Sent Events (real-time)

```
GET {webhookUrl}/events/stream
Headers: secret-key
```

Events: `file.uploaded`, `file.deleted`, `collection.stamped`, `collection.stamp_failed`, `group.created`, `webhook.enabled`, `webhook.disabled`

```js
const es = new EventSource(`${webhookUrl}/events/stream?secret-key=${secret}`);
es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  console.log(event.type, event.data);
};
```

### Signed Upload URL (client-side upload to Pinata)

```
GET {webhookUrl}/upload-link
Headers: secret-key
Query: expires, filename, group_id, max_file_size, allow_mime_types, keyvalues
Response: { url, network, expires_in }
```

### Signed Download URL

```
GET {webhookUrl}/download-link
Headers: secret-key, cidv1 (required)
Query/Headers: expires, img-width, img-height, img-fit
Response: { url, expires_in }
```

---

## Error Responses

All errors follow: `{ "success": false, "message": "string" }`

| Code | Meaning |
|------|---------|
| 401  | Missing/invalid authentication |
| 400  | Bad request |
| 404  | Resource not found |
| 409  | File already exists |
| 429  | Rate limit exceeded (60 req/min) |
| 408  | Request timeout |

---

## Reading token.json in Node.js

```js
import fs from 'fs-extra';
import path from 'path';

async function getChainletterSession(workspaceDir = '.') {
  const tokenPath = path.resolve(workspaceDir, 'token.json');
  if (!await fs.pathExists(tokenPath)) throw new Error('No token registered. Run: credcli register <url>');
  const token = await fs.readJson(tokenPath);
  if (token.expires && Date.now() > new Date(token.expires).getTime()) {
    throw new Error('Token has expired. Run: credcli register <url>');
  }
  return token; // { jwt, webhookUrl, tenant, groupname, expires }
}
```

## Extracting apikey from webhookUrl

```js
function getApiKey(webhookUrl) {
  const url = new URL(webhookUrl);
  return url.pathname.split('/').pop(); // /webhook/{apikey} → apikey
}
```
