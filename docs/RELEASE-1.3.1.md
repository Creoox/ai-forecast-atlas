# AI Forecast Atlas 1.3.1 update

This update fixes large release uploads rejected by the hosting server with HTTP 503. Admin uploads small parts and uses gzip compression where supported. The completed upload must pass its checksum and the existing release-content checks before it can be staged. The final publish-and-newsletter confirmation appears only after the editor chooses **Publish now instead**.

## Install without losing settings or history

Follow [INSTALL-HOMEPL.md → Updating to a new version](INSTALL-HOMEPL.md#updating-to-a-new-version).

1. Back up the current installation outside the public website, including `_private/storage/`, `_private/config/`, `data/`, `feeds/`, `aim-config.php`, `.htaccess` and scheduler files. Confirm the backup completed.
2. Build with `node web/build.mjs`. Use **`dist/aimonitor-homepl-update-1.3.1.zip`**, not the full first-install ZIP. Upload its `aimonitor/` contents over the matching files in the existing site directory (on the current home.pl installation, `public_html/aimonitor/`). Merge folders; do not delete or replace the entire site directory.
3. Reload the admin page. Confirm version 1.3.1 and that existing AI-agent settings and historical releases remain present. No setup, API-key re-entry, scheduler replacement or root `.htaccess` change is needed when upgrading from 1.3.0.

The update package excludes private storage and configuration, published data, feeds, generated discovery pages, scheduler files, `aim-config.php` and the root `.htaccess`. Keep old fingerprinted assets for browser tabs that are already open. The transport fix changes `admin/admin.js`, `admin/index.php`, `_private/lib/admin_api.php`, `_private/lib/publish.php`, `_private/lib/cron.php` and `_private/lib/util.php`; upload the complete update package so the client and server versions match.

## Three-step editor check on the live site

Use a release you intend to queue for scheduled publication:

1. **Build:** open Admin → Release, choose the release id and click **Build**. The final **Yes, publish now** confirmation must remain hidden.
2. **Stage:** click **Stage** and wait for the upload progress to finish.
3. **Staged:** check that the same release id appears under **Staged**.

This check queues the build for the normal scheduled publication. It does not publish immediately or send a newsletter during staging. Immediate publication still requires **Publish now instead**, followed by **Yes, publish now**.

## Compression and failures

Health reports **PHP extension zlib** as a warning when gzip decoding is unavailable. Uploads fall back to uncompressed JSON when either PHP or the browser lacks compression support; they still use small requests. Failed commits remove their temporary parts, and daily housekeeping removes uploads abandoned for more than 24 hours. Errors identify the upload step and HTTP status without exposing file contents in the release log.

## Follow-up

The command-line publisher (`tools/release.mjs` → `api/ingest.php`) still sends a single large request and can meet the same hosting limit. Adapting it to the part/commit transport is separate follow-up work. This update changes Admin → Release only; the legacy staging action remains available for existing clients.
