# AI Forecast Atlas 1.3.3 update

This update addresses “Upload part 1: Bad upload id” on home.pl. Version 1.3.2 kept requests below the host's HTTP error threshold, but larger raw JSON bodies still failed decoding on the live host. Admin now sends each part as a standard multipart file upload. The small commit request, checksum, content validation, guarded storage and admin security checks remain unchanged. The server requires PHP file uploads to be enabled and a writable temporary upload directory.

**Live verification, 23 October 2026:** the multipart error exposed the underlying hosting fault: the isolated site's PHP `/tmp` folder was missing. The code update alone did not repair that hosting configuration. Creating `public_html/aimonitor/tmp` with owner-only permissions and denied HTTP access restored both large JSON requests and multipart uploads. The complete 55-file release 2026-W44 then appeared under **Staged**. Preserve this runtime folder on later updates; see [PHP temporary storage](INSTALL-HOMEPL.md#php-temporary-storage-on-an-isolated-site).

## Install without losing settings or history

Follow [INSTALL-HOMEPL.md → Updating to a new version](INSTALL-HOMEPL.md#updating-to-a-new-version).

1. Back up the installation outside the public website, including `_private/storage/`, `_private/config/`, `data/`, `feeds/`, `aim-config.php`, `.htaccess` and scheduler files. Confirm the backup completed.
2. Build with `node web/build.mjs`. Upload the `aimonitor/` contents of **`dist/aimonitor-homepl-update-1.3.3.zip`** over the matching files in the existing site directory (`public_html/aimonitor/` on the current installation). Merge folders; do not delete the site directory and do not use the full first-install ZIP.
3. Reload Admin and confirm version 1.3.3. Check that existing AI-agent settings and historical releases remain present. No setup, API-key re-entry, scheduler replacement or root `.htaccess` change is needed when updating from 1.3.0–1.3.2.

The update package excludes private storage and configuration, published data, feeds, generated discovery pages, scheduler files, `aim-config.php` and the root `.htaccess`. Keep old fingerprinted assets for open browser tabs. The upload fix changes `admin/admin.js` and `_private/lib/admin_api.php`; upload the complete update package so client and server agree.

## Three-step editor check on the live site

Use a release you intend to queue for scheduled publication:

1. **Build:** open Admin → Release and click **Build**. The final **Yes, publish now** confirmation stays hidden.
2. **Stage:** click **Stage** and wait for the upload progress to finish.
3. **Staged:** check that the same release id appears under **Staged**.

Staging queues the build for normal scheduled publication and its newsletter. It does not publish immediately or send an email at that moment. Immediate publication still requires **Publish now instead**, followed by **Yes, publish now**.

## Follow-up

The command-line publisher (`tools/release.mjs` → `api/ingest.php`) still sends a single large request. Reusing the part/commit transport there remains separate follow-up work; this update fixes Admin → Release.
