import React, { useEffect, useState } from "react";
import { Box, Text, useApp } from "ink";
import fs from "fs-extra";
import path from "path";
import { listJobs, getTokenPath, checkTokenExpiry } from "../utils/jobs.js";

export default function StampChainletter({ jobArg }) {
  const { exit } = useApp();
  const [status, setStatus] = useState("working");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!jobArg) {
      setError("Usage: credcli stamp <job>");
      setStatus("error");
      setTimeout(() => exit(), 100);
      return;
    }

    async function run() {
      try {
        // Load token
        const tokenPath = getTokenPath();
        if (!(await fs.pathExists(tokenPath)))
          throw new Error(
            'No token.json found. Run "credcli register <url>" first.',
          );
        const token = await fs.readJson(tokenPath);
        if (!token.jwt || !token.webhookUrl)
          throw new Error(
            'token.json is missing jwt or webhookUrl. Re-run "credcli register <url>".',
          );

        const expiry = checkTokenExpiry(token);
        if (expiry.expired) throw new Error(expiry.message);

        // Find job
        const jobs = listJobs();
        const job =
          jobs.find((j) => j.jobId === jobArg) ??
          (/^\d+$/.test(jobArg) ? jobs[parseInt(jobArg, 10) - 1] : null);
        if (!job)
          throw new Error(
            `Job "${jobArg}" not found. Run "credcli list" to see available jobs.`,
          );

        const jobMetaPath = path.join(job.jobDir, "job.json");
        const meta = await fs.readJson(jobMetaPath);
        if (!meta.chainletterCollection?.id) {
          throw new Error(
            `No Chainletter collection assigned to ${job.jobId}. Run "credcli assign ${job.jobId} <collection-id>" first.`,
          );
        }

        const r = await fetch(token.webhookUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token.jwt}`,
            "group-id": meta.chainletterCollection.id,
          },
        });
        const data = await r.json();
        if (!data.success)
          throw new Error(data.message || "Stamp request failed");

        meta.chainletterStamped = true;
        meta.chainletterStampedAt = new Date().toISOString();

        // Fetch claim links for the whole collection at once via export-links
        const claimLinks = {};
        const verificationLinks = {};
        try {
          const linksResp = await fetch(token.webhookUrl, {
            headers: {
              Authorization: `Bearer ${token.jwt}`,
              "group-id": meta.chainletterCollection.id,
              "export-links": "true",
            },
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
        } catch (e) {
          console.error(`[export-links] collection fetch error: ${e.message}`);
        }
        meta.chainletterClaimLinks = claimLinks;
        meta.chainletterVerificationLinks = verificationLinks;

        await fs.writeJson(jobMetaPath, meta, { spaces: 2 });

        setInfo({
          jobId: job.jobId,
          collectionId: meta.chainletterCollection.id,
          filesStamped: data.files_stamped,
          claimLinksCount: Object.keys(claimLinks).length,
          isPrivate: meta.chainletterCollection.network !== "public",
        });
        setStatus("done");
      } catch (e) {
        setError(e.message);
        setStatus("error");
      }
      setTimeout(() => exit(), 100);
    }

    run();
  }, []);

  if (status === "working")
    return (
      <Box marginY={1}>
        <Text color="yellow">Stamping collection…</Text>
      </Box>
    );
  if (status === "error")
    return (
      <Box marginY={1}>
        <Text color="red">✖ {error}</Text>
      </Box>
    );

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color="green" bold>
        ✔ Blockchain stamp submitted
      </Text>
      <Text color="gray">
        {" "}
        Job: <Text color="white">{info.jobId}</Text>
      </Text>
      <Text color="gray">
        {" "}
        Collection: <Text color="cyan">{info.collectionId}</Text>
      </Text>
      {info.filesStamped != null && (
        <Text color="gray">
          {" "}
          Files: <Text color="white">{info.filesStamped} stamped</Text>
        </Text>
      )}
      {info.claimLinksCount > 0 && (
        <Text color="gray">
          {" "}
          Claim links:{" "}
          <Text color="green">{info.claimLinksCount} captured</Text>
        </Text>
      )}
      {info.claimLinksCount === 0 && info.isPrivate && (
        <Text color="yellow">
          {" "}
          ⚠ Private collection — claim links are not available. Emails will not
          include claim URLs or QR codes.
        </Text>
      )}
      <Text color="gray">
        {" "}
        Next: <Text color="cyan">credcli email {info.jobId}</Text>
      </Text>
    </Box>
  );
}
