#!/usr/bin/env node
/* AI Forecast Atlas — build and stage a weekly release from any computer or from GitHub Actions (optional).
   It does what the admin page's "Build the release" button does: read the approved working dataset from the
   site, run the model for all eight scenarios, and upload the files as the staged release for the next Friday.

   node tools/release.mjs --site https://aiforecastatlas.com/ --secret <ingest secret from Admin → Settings>
   Options: --dry-run (write the files to ./release-out/<id>/ instead of uploading), --id 2026-W43

   The request is signed with HMAC-SHA256 over "<unix time>.<action>.<body>"; the server accepts it for 10 minutes.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SITE = String(arg('--site', process.env.AIM_SITE || '')).replace(/\/?$/, '/');
const SECRET = String(arg('--secret', process.env.AIM_INGEST_SECRET || ''));
const DRY = process.argv.includes('--dry-run');
if (!/^https?:\/\//.test(SITE) || SECRET.length < 32) { console.error('Usage: node tools/release.mjs --site https://aiforecastatlas.com/ --secret <ingest secret>'); process.exit(2); }

async function signed(action, body) {
  const raw = body ? JSON.stringify(body) : '';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = 'sha256=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + action + '.' + raw).digest('hex');
  const r = await fetch(SITE + 'api/ingest.php?a=' + action, { method: body ? 'POST' : 'GET', headers: { 'X-AIM-Time': ts, 'X-AIM-Signature': sig, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? raw : undefined });
  const j = await r.json().catch(() => ({ ok: false, error: { message: 'HTTP ' + r.status } }));
  if (!j.ok) throw new Error((j.error && j.error.message) || 'request failed');
  return j;
}

const { createEngine } = await import(pathToFileURL(path.join(ROOT, 'engine/engine.mjs')).href);
const RC = await import(pathToFileURL(path.join(ROOT, 'web/src/release-core.mjs')).href);
const st = await signed('state');
const id = arg('--id', st.nextId);
const t0 = Date.now();
const { release, files } = RC.buildRelease({ createEngine, dataset: st.working, previous: st.latest ? { release: st.latest, dataset: st.published } : null, id, siteUrl: SITE });
console.log('Release ' + id + ': ' + release.changes.length + ' change(s), ' + Object.keys(files).length + ' files, ' + (Date.now() - t0) + ' ms');
console.log(release.summary);
if (DRY) {
  const out = path.join(process.cwd(), 'release-out', id);
  for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(out, p)), { recursive: true }); fs.writeFileSync(path.join(out, p), c); }
  console.log('Dry run: files written to ' + out);
} else {
  const enc = {}; for (const [p, c] of Object.entries(files)) enc[p] = Buffer.from(c, 'utf8').toString('base64');
  const r = await signed('stage', { id, files: enc });
  console.log('Staged ' + r.id + ' (' + r.files + ' files). It goes live with the next scheduled release (' + st.nextRelease + ').');
}
