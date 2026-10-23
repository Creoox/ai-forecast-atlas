# AI Forecast Atlas 1.3.2 update

This update fixes the remaining HTTP 500 error when staging or publishing a release on home.pl. Version 1.3.1 split uploads into parts, but the request wrapper enlarged each full part to about 262 KB, which the live host rejected before PHP ran. The smaller parts in 1.3.2 produce requests below 175 KB. Browser tests simulate a host that refuses requests of 192 KiB or more, covering compressed uploads and both uncompressed fallbacks.

## Install without losing settings or history

Follow [INSTALL-HOMEPL.md → Updating to a new version](INSTALL-HOMEPL.md#updating-to-a-new-version).

1. Back up the installation outside the public website, including `_private/storage/`, `_private/config/`, `data/`, `feeds/`, `aim-config.php`, `.htaccess` and scheduler files. Confirm the backup completed.
2. Build with `node web/build.mjs`. Upload the `aimonitor/` contents of **`dist/aimonitor-homepl-update-1.3.2.zip`** over the matching files in the existing site directory (`public_html/aimonitor/` on the current installation). Merge folders; do not delete or replace the entire directory, and do not use the full first-install ZIP.
3. Reload Admin and confirm version 1.3.2. Check that existing AI-agent settings and historical releases remain present. No setup, API-key re-entry, scheduler replacement or root `.htaccess` change is needed from 1.3.0 or 1.3.1. Use **Release → Refresh public pages** to refresh the homepage summary from already-published data; this does not publish working edits or send a newsletter.

The update package excludes private storage and configuration, published data, feeds, generated discovery pages, scheduler files, `aim-config.php` and the root `.htaccess`. Keep old fingerprinted assets for open browser tabs. The upload correction is in `admin/admin.js`; upload the complete update package to keep the client, server and version information consistent.

## Three-step editor check on the live site

Use a release you intend to queue for scheduled publication:

1. **Build:** open Admin → Release and click **Build**. The final **Yes, publish now** confirmation stays hidden.
2. **Stage:** click **Stage** and wait for the upload progress to finish.
3. **Staged:** check that the same release id appears under **Staged**.

Staging queues the build for normal scheduled publication. It does not publish immediately or send a newsletter at that moment. Immediate publication still requires **Publish now instead**, followed by **Yes, publish now**. Upload checksums, content validation and all admin security checks are unchanged.

## Follow-up

The command-line publisher (`tools/release.mjs` → `api/ingest.php`) still sends a single large request. Reusing the part/commit transport there remains separate follow-up work; this update fixes Admin → Release.
