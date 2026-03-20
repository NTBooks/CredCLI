import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs, getTokenPath, checkTokenExpiry } from '../utils/jobs.js';

export default function SendToChainletter({ jobArg, yes, no }) {
  const { exit } = useApp();
  const [lines, setLines]       = useState([]);
  // status: 'working' | 'confirm' | 'done' | 'error'
  const [status, setStatus]     = useState('working');
  const [error, setError]       = useState(null);
  const [summary, setSummary]   = useState(null);
  const [confirmInfo, setConfirmInfo] = useState(null);
  const [pendingRun, setPendingRun]   = useState(null);

  function log(text, color = 'gray') {
    setLines(prev => [...prev, { text, color }]);
  }

  useInput((input) => {
    if (status !== 'confirm') return;
    if (input.toLowerCase() === 'y') {
      setStatus('working');
      pendingRun();
    } else {
      setStatus('error');
      setError('Cancelled.');
      setTimeout(() => exit(), 100);
    }
  });

  useEffect(() => {
    if (!jobArg) {
      setError('Usage: credcli send <job>');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run(skipConfirm = false) {
      try {
        // Load token
        const tokenPath = getTokenPath();
        if (!await fs.pathExists(tokenPath)) throw new Error('No token.json found. Run "credcli register <url>" first.');
        const token = await fs.readJson(tokenPath);
        if (!token.jwt || !token.webhookUrl) throw new Error('token.json is missing jwt or webhookUrl. Re-run "credcli register <url>".');

        const expiry = checkTokenExpiry(token);
        if (expiry.expired) throw new Error(expiry.message);

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

        // Only upload credential files (pdf/png) — exclude mail_merge/, .eml, results.json
        const files = (await fs.readdir(outDir)).filter(f => /\.(pdf|png)$/i.test(f));
        if (files.length === 0) throw new Error(`No PDF/PNG files in ${outDir}. Run "credcli run ${job.jobId}" first.`);

        // Confirmation gate before irreversible upload (skip with --yes / abort with --no)
        if (!skipConfirm && no) {
          throw new Error('Cancelled (--no).');
        }
        if (!skipConfirm && !yes) {
          setConfirmInfo({ count: files.length, collectionId: collection.id, network: collection.network || 'private', jobId: job.jobId });
          setPendingRun(() => () => run(true));
          setStatus('confirm');
          return;
        }

        log(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''} to collection "${collection.id}"…`);

        let done = 0;
        let skipped = 0;
        const fileHashes = { ...meta.chainletterFileHashes }; // preserve any existing hashes

        // Always upload a unique manifest so the collection has at least one new item
        // (the server won't create the collection properly if every file already exists)
        /* global __CREDCLI_VERSION__ */
        const credcliVersion = typeof __CREDCLI_VERSION__ !== 'undefined' ? __CREDCLI_VERSION__ : 'dev';
        const manifestFilename = `credcli-manifest-${Date.now()}.json`;
        const manifestContent = JSON.stringify({
          tool: 'credcli',
          version: credcliVersion,
          collectionId: collection.id,
          collectionName: collection.name ?? collection.id,
          jobId: job.jobId,
          fileCount: files.length,
          createdAt: new Date().toISOString(),
        }, null, 2);
        const manifestFormData = new FormData();
        manifestFormData.append('file', new Blob([manifestContent], { type: 'application/json' }), manifestFilename);
        const manifestResp = await fetch(token.webhookUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.jwt}`, 'group-id': collection.id },
          body: manifestFormData,
        });
        const manifestResult = await manifestResp.json();
        if (!manifestResult.success) {
          log(`  ⚠ manifest upload: ${manifestResult.message}`, 'yellow');
        } else {
          if (manifestResult.hash) fileHashes[manifestFilename] = manifestResult.hash;
          log(`  ✔ ${manifestFilename}  (manifest)`, 'green');
        }

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

          if (result.hash) fileHashes[filename] = result.hash;

          if (alreadyExists) {
            skipped++;
            log(`  ⟳ ${filename}  (already exists, skipped)`, 'yellow');
          } else {
            log(`  ✔ ${filename}${result.hash ? `  ${result.hash.slice(0, 12)}…` : ''}`, 'green');
          }
        }

        // Mark as sent and persist file hashes (claim links available after stamp via credcli stamp)
        meta.chainletterSent       = true;
        meta.chainletterSentAt     = new Date().toISOString();
        meta.chainletterFileHashes = fileHashes;
        meta.chainletterClaimLinks = {};
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

  if (status === 'confirm' && confirmInfo) return (
    <Box flexDirection="column" marginY={1}>
      <Text>About to upload <Text color="cyan" bold>{confirmInfo.count}</Text> file{confirmInfo.count !== 1 ? 's' : ''} to collection <Text color="cyan">"{confirmInfo.collectionId}"</Text> ({confirmInfo.network} network).</Text>
      <Text color="yellow">This cannot be undone. Blockchain stamp is permanent once "credcli stamp" is run.</Text>
      <Text color="white" marginTop={1}>Proceed? (y/N) </Text>
    </Box>
  );

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
