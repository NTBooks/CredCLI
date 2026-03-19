import React, { useEffect, useState } from 'react';
import { Box, Text, useApp } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs, getTokenPath } from '../utils/jobs.js';

export default function SendToChainletter({ jobArg }) {
  const { exit } = useApp();
  const [lines, setLines]       = useState([]);
  const [status, setStatus]     = useState('working');
  const [error, setError]       = useState(null);
  const [summary, setSummary]   = useState(null);

  function log(text, color = 'gray') {
    setLines(prev => [...prev, { text, color }]);
  }

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli send <job>');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run() {
      try {
        // Load token
        const tokenPath = getTokenPath();
        if (!await fs.pathExists(tokenPath)) throw new Error('No token.json found. Run "credcli register <url>" first.');
        const token = await fs.readJson(tokenPath);
        if (!token.jwt || !token.webhookUrl) throw new Error('token.json is missing jwt or webhookUrl. Re-run "credcli register <url>".');

        // Find job
        const jobs = listJobs();
        const job  = jobs.find(j => j.jobId === jobArg)
                  ?? (/^\d+$/.test(jobArg) ? jobs[parseInt(jobArg, 10) - 1] : null);
        if (!job) throw new Error(`Job "${jobArg}" not found. Run "credcli list" to see available jobs.`);

        // Check collection assigned
        const jobMetaPath = path.join(job.jobDir, 'job.json');
        const meta = await fs.readJson(jobMetaPath);
        if (!meta.chainletterCollection?.id) {
          throw new Error(`No Chainletter collection assigned to ${job.jobId}. Run "credcli assign ${job.jobId} <collection-id>" first.`);
        }

        const collection = meta.chainletterCollection;
        const outDir = path.join(job.jobDir, 'output');
        if (!await fs.pathExists(outDir)) throw new Error(`Output folder not found. Run "credcli run ${job.jobId}" first.`);

        const files = (await fs.readdir(outDir)).filter(f => !f.startsWith('_tmp') && f !== 'results.json');
        if (files.length === 0) throw new Error(`No output files in ${outDir}. Run "credcli run ${job.jobId}" first.`);

        log(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''} to collection "${collection.id}"…`);

        let done = 0;
        let skipped = 0;
        for (const filename of files) {
          const filePath  = path.join(outDir, filename);
          const ext       = path.extname(filename).toLowerCase();
          const mime      = ext === '.png' ? 'image/png' : 'application/pdf';
          const fileBuffer = await fs.readFile(filePath);

          const formData = new FormData();
          formData.append('file', new Blob([fileBuffer], { type: mime }), filename);

          const r = await fetch(token.webhookUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.jwt}`, 'group-id': collection.id },
            body: formData,
          });
          const result = await r.json();
          done++;

          const alreadyExists = !result.success && /already exists/i.test(result.message || '');
          if (!result.success && !alreadyExists) throw new Error(`Upload failed for ${filename}: ${result.message}`);

          if (alreadyExists) {
            skipped++;
            log(`  ⟳ ${filename}  (already exists, skipped)`, 'yellow');
          } else {
            log(`  ✔ ${filename}${result.hash ? `  ${result.hash.slice(0, 12)}…` : ''}`, 'green');
          }
        }

        // Fetch claim links for all uploaded files from Chainletter
        const claimLinks = {};
        try {
          const serverBase = new URL(token.webhookUrl).origin;
          const linksResp = await fetch(token.webhookUrl, {
            headers: { Authorization: `Bearer ${token.jwt}`, 'group-id': collection.id, 'export-links': 'true' },
          });
          const filesData = await linksResp.json();
          const filesList = Array.isArray(filesData) ? filesData : (filesData.files ?? filesData.data ?? []);
          for (const f of filesList) {
            const name = f.name || f.filename || '';
            const link = f.link || f.url || f.claim_link || f.download_link
              || (f.hash ? `${serverBase}/view/${f.hash}` : null);
            if (name && link) claimLinks[name] = link;
          }
        } catch {}

        // Mark as sent and persist claim links
        meta.chainletterSent       = true;
        meta.chainletterSentAt     = new Date().toISOString();
        meta.chainletterClaimLinks = claimLinks;
        await fs.writeJson(jobMetaPath, meta, { spaces: 2 });

        setSummary({ total: files.length, skipped, collectionId: collection.id, jobId: job.jobId });
        setStatus('done');
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === 'error') return <Box marginY={1}><Text color="red">✖ {error}</Text></Box>;

  return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((l, i) => <Text key={i} color={l.color}>{l.text}</Text>)}
      {status === 'done' && summary && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>✔ Sent {summary.total - summary.skipped} file{summary.total - summary.skipped !== 1 ? 's' : ''} to Chainletter</Text>
          {summary.skipped > 0 && <Text color="yellow">  {summary.skipped} skipped (already existed)</Text>}
          <Text color="gray">  Collection: <Text color="cyan">{summary.collectionId}</Text></Text>
          <Text color="gray">  Next:       <Text color="cyan">credcli stamp {summary.jobId}</Text></Text>
        </Box>
      )}
    </Box>
  );
}
