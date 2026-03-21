import fs from 'fs-extra';
import path from 'path';

/**
 * Fetch claim links and verification links for a Chainletter collection.
 * @returns {{ claimLinks: Record<string,string>, verificationLinks: Record<string,string> }}
 */
export async function fetchClaimLinks(webhookUrl, collectionId, jwt) {
  const claimLinks = {};
  const verificationLinks = {};
  const linksResp = await fetch(webhookUrl, {
    headers: { Authorization: `Bearer ${jwt}`, 'group-id': collectionId, 'export-links': 'true' },
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
  return { claimLinks, verificationLinks };
}

/**
 * Stamp a Chainletter collection (blockchain postmark) and fetch resulting claim links.
 * @returns {{ filesStamped: number|null, claimLinks: Record<string,string>, verificationLinks: Record<string,string> }}
 */
export async function stampCollection(webhookUrl, collectionId, jwt, network = 'private') {
  const r = await fetch(webhookUrl, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${jwt}`, 'group-id': collectionId, network },
  });
  const data = await r.json();
  if (!data.success) throw new Error(data.message || 'Stamp request failed');

  let claimLinks = {};
  let verificationLinks = {};
  try {
    ({ claimLinks, verificationLinks } = await fetchClaimLinks(webhookUrl, collectionId, jwt));
  } catch (e) {
    console.error(`[export-links] collection fetch error: ${e.message}`);
  }

  return { filesStamped: data.files_stamped ?? null, claimLinks, verificationLinks };
}

/**
 * Upload credential files (PDF/PNG) from outputDir to a Chainletter collection.
 * Includes a unique manifest file to ensure the collection is created on the server.
 *
 * @param {function({ filename: string, hash: string|null, skipped: boolean, success: boolean, message?: string, manifest?: boolean })} onProgress
 * @returns {{ fileHashes: Record<string,string>, done: number, skipped: number }}
 */
export async function uploadFilesToCollection(webhookUrl, collectionId, jwt, network = 'private', outputDir, collectionName = null, onProgress = null) {
  /* global __CREDCLI_VERSION__ */
  const credcliVersion = typeof __CREDCLI_VERSION__ !== 'undefined' ? __CREDCLI_VERSION__ : 'dev';
  const files = (await fs.readdir(outputDir)).filter(f => /\.(pdf|png)$/i.test(f));
  if (files.length === 0) throw new Error(`No PDF/PNG files in ${outputDir}.`);

  const fileHashes = {};

  // Always upload a unique manifest so the collection is created even if all credential files already exist
  const manifestFilename = `credcli-manifest-${Date.now()}.json`;
  const manifestContent = JSON.stringify({
    tool: 'credcli',
    version: credcliVersion,
    collectionId,
    collectionName: collectionName ?? collectionId,
    jobId: path.basename(path.dirname(outputDir)),
    fileCount: files.length,
    createdAt: new Date().toISOString(),
  }, null, 2);
  const manifestFormData = new FormData();
  manifestFormData.append('file', new Blob([manifestContent], { type: 'application/json' }), manifestFilename);
  const manifestResp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'group-id': collectionId },
    body: manifestFormData,
  });
  const manifestResult = await manifestResp.json();
  if (manifestResult.hash) fileHashes[manifestFilename] = manifestResult.hash;
  if (onProgress) onProgress({ filename: manifestFilename, hash: manifestResult.hash ?? null, skipped: false, success: manifestResult.success, message: manifestResult.message, manifest: true });

  let done = 0;
  let skipped = 0;
  for (const filename of files) {
    const filePath = path.join(outputDir, filename);
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : 'application/pdf';
    const fileBuffer = await fs.readFile(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], { type: mime }), filename);
    const r = await fetch(webhookUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'group-id': collectionId, network },
      body: formData,
    });
    const result = await r.json();
    done++;

    const alreadyExists = !result.success && /already exists/i.test(result.message || '');
    if (!result.success && !alreadyExists) throw new Error(`Upload failed for ${filename}: ${result.message}`);
    if (result.hash) fileHashes[filename] = result.hash;
    if (alreadyExists) skipped++;
    if (onProgress) onProgress({ filename, hash: result.hash ?? null, skipped: alreadyExists, success: result.success || alreadyExists, done, total: files.length });
  }

  return { fileHashes, done, skipped };
}
