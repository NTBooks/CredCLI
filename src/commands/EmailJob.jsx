import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import fs from 'fs-extra';
import path from 'path';
import { listJobs, getTemplatesDir, listTemplates, parseTemplateMeta, getTokenPath, checkTokenExpiry } from '../utils/jobs.js';
import { generateMailMergeFolder } from '../utils/renderer.js';

export default function EmailJob({ jobArg, emailTemplate, yes }) {
  const { exit } = useApp();
  const [lines, setLines] = useState([]);
  // status: 'working' | 'confirm' | 'done' | 'error'
  const [status, setStatus] = useState('working');
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  // Captured state for the deferred run after confirmation
  const [pendingRun, setPendingRun] = useState(null);
  const [confirmIsPrivate, setConfirmIsPrivate] = useState(false);

  function log(text, color = 'gray') {
    setLines(prev => [...prev, { text, color }]);
  }

  // Handle y/N confirmation when claim links are missing
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
      setError('Usage: credcli email <job> [--email-template <file>]');
      setStatus('error');
      setTimeout(() => exit(), 100);
      return;
    }

    async function run(skipClaimCheck = false) {
      try {
        const jobs = listJobs();
        const job = jobs.find(j => j.jobId === jobArg)
                 ?? (/^\d+$/.test(jobArg) ? jobs[parseInt(jobArg, 10) - 1] : null);
        if (!job) throw new Error(`Job "${jobArg}" not found. Run "credcli list" to see available jobs.`);

        const outputDir = path.join(job.jobDir, 'output');
        const resultsPath = path.join(outputDir, 'results.json');
        if (!await fs.pathExists(resultsPath)) {
          throw new Error(`No results.json found. Run "credcli run ${jobArg}" first.`);
        }
        const results = await fs.readJson(resultsPath);

        // Resolve email template path
        const templates = listTemplates();
        const emailTemplates = templates.filter(t => t.type === 'email');

        let emailTemplatePath;
        if (emailTemplate) {
          emailTemplatePath = path.join(getTemplatesDir(), path.basename(emailTemplate));
        } else if (emailTemplates.length > 0) {
          emailTemplatePath = emailTemplates[0].path;
        } else {
          throw new Error('No email templates found in your workspace templates folder.');
        }

        if (!await fs.pathExists(emailTemplatePath)) {
          throw new Error(`Email template not found: ${emailTemplatePath}`);
        }

        const emailTemplateHtml = fs.readFileSync(emailTemplatePath, 'utf8');
        const emailTemplateMeta = parseTemplateMeta(emailTemplatePath) ?? {};
        const templateName = path.basename(emailTemplatePath);

        log(`Template: ${templateName}`);
        log(`Recipients: ${results.length}`);

        // Load stored claim links (populated by "credcli stamp")
        const jobMetaPath = path.join(job.jobDir, 'job.json');
        let claimLinks = {};
        let verificationLinks = {};
        let jobMeta = {};
        try {
          jobMeta = await fs.readJson(jobMetaPath);
          claimLinks = jobMeta.chainletterClaimLinks ?? {};
          verificationLinks = jobMeta.chainletterVerificationLinks ?? {};
        } catch {}

        // If job is stamped but links are missing, fetch for the whole group at once
        if (jobMeta.chainletterStamped && Object.keys(claimLinks).length === 0) {
          try {
            const tokenPath = getTokenPath();
            if (await fs.pathExists(tokenPath)) {
              const token = await fs.readJson(tokenPath);
              const expiry = checkTokenExpiry(token);
              if (!expiry.expired && token.jwt && token.webhookUrl) {
                const groupId = jobMeta.chainletterCollection?.id;
                log(`Fetching claim links for group ${groupId}…`);
                const linksResp = await fetch(token.webhookUrl, {
                  headers: { Authorization: `Bearer ${token.jwt}`, 'group-id': groupId, 'export-links': 'true' },
                });
                const linksData = await linksResp.json();
                const permalinks = linksData.export_data?.permalinks ?? [];
                for (const { filename, shorturl, url, cid } of permalinks) {
                  const link = shorturl ?? url;
                  if (filename && link) {
                    claimLinks[filename] = link;
                    if (cid) verificationLinks[filename] = `${new URL(link).origin}/pverify/${cid}`;
                  }
                }
                if (Object.keys(claimLinks).length > 0) {
                  jobMeta.chainletterClaimLinks = claimLinks;
                  jobMeta.chainletterVerificationLinks = verificationLinks;
                  await fs.writeJson(jobMetaPath, jobMeta, { spaces: 2 });
                  log(`  ✔ ${Object.keys(claimLinks).length} claim link(s) fetched`, 'green');
                }
              }
            }
          } catch {}
        }

        // Warn if job was sent but no claim links were captured
        if (!skipClaimCheck && !yes && jobMeta.chainletterSent && Object.keys(claimLinks).length === 0) {
          setConfirmIsPrivate(jobMeta.chainletterCollection?.network !== 'public');
          setPendingRun(() => () => run(true));
          setStatus('confirm');
          return;
        }

        await generateMailMergeFolder(outputDir, results, emailTemplateHtml, emailTemplateMeta, claimLinks, (event) => {
          if (event.type === 'mail_merge_file') log(`  ✔ ${event.file}`, 'green');
          else if (event.type === 'mail_merge_done') setSummary({ count: event.count, outputDir });
        }, verificationLinks);

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

  if (status === 'confirm') return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((l, i) => <Text key={i} color={l.color}>{l.text}</Text>)}
      <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
        <Text color="yellow" bold>⚠  No claim links found</Text>
        {confirmIsPrivate ? (
          <>
            <Text color="yellow">   This collection is <Text bold>private</Text> — claim links cannot be generated.</Text>
            <Text color="yellow">   Emails will be generated without claim URLs or QR codes.</Text>
            <Text color="gray">   To get claim links, reassign to a public collection and re-send.</Text>
          </>
        ) : (
          <>
            <Text color="yellow">   This job was sent to Chainletter but no verification URLs were captured.</Text>
            <Text color="yellow">   Emails will be generated without claim links or QR codes.</Text>
            <Text color="gray">   Run "credcli send {jobArg}" again to retry fetching claim links.</Text>
          </>
        )}
      </Box>
      <Text color="white" marginTop={1}>Continue anyway? (y/N) </Text>
    </Box>
  );

  return (
    <Box flexDirection="column" marginY={1}>
      {lines.map((l, i) => <Text key={i} color={l.color}>{l.text}</Text>)}
      {summary && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="green" bold>✔ {summary.count} email{summary.count !== 1 ? 's' : ''} generated</Text>
          <Text color="gray">  Folder: <Text color="cyan">{summary.outputDir}/mail_merge/</Text></Text>
        </Box>
      )}
    </Box>
  );
}
