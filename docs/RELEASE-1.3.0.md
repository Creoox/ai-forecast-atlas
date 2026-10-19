# AI Forecast Atlas 1.3.0 update

This release improves reading, navigation and search visibility. The scenario engine and its mathematics are unchanged. Source remains Business Source License 1.1; published data remains CC BY 4.0. Creoox AG, xeokit SDK and GitHub credits remain visible.

## Safe installation over an existing site

1. Back up the existing site to a non-public folder, including `_private/storage`, `_private/config`, `data`, `feeds`, `aim-config.php`, `.htaccess` and scheduler files. Confirm the copy completed before uploading.
2. Use the **update** ZIP. It excludes private storage and configuration, published data, feeds, cron launchers, `aim-config.php`, the root `.htaccess` and generated discovery pages. Never use the full first-install ZIP over a working site.
3. Merge the new root `.htaccess` rules from the full package into the existing file, preserving the hosting-specific PHP handler and any custom rules. The optional `mod_headers` sections require Apache. Keep the private-folder block and HTTPS redirect. The canonical redirect matches only the official www and legacy hosts, so independently hosted copies retain their own address. On an older IdeaWebServer installation, use only supported directives and configure response headers with the host; do not blindly replace its config.
4. Log in to Admin → Release and click **Refresh public pages**. This reads already-published data and rebuilds HTML, sitemap and AI reading files in small batches. It never publishes the working dataset, changes archived JSON/CSV, or sends a newsletter. If interrupted, click again; regeneration is safe to repeat.
5. Reload the dashboard, check `/api/health.php`, `/about/`, `/scenarios/`, `/measures/`, `/releases/`, `/sitemap.xml` and `/llms-full.txt`. Confirm AI-agent and Mailjet settings are still present. Check one old release and the newsletter setup.

Keep existing fingerprinted assets on the server during updates: an already-open browser tab may still reference them. Stable API filenames revalidate; content-addressed assets can be cached for a year. The single-file preview embeds its fonts and needs no Google Fonts connection.

## Search and external launch steps

- Verify ownership in Google Search Console and Bing Webmaster Tools, then submit `https://aiforecastatlas.com/sitemap.xml`. This requires the owner's authenticated account; indexing is controlled by each search engine and is not guaranteed by a software release.
- Point the existing `aimonitor.creoox.com` host at this installation or configure a permanent forwarding rule to `https://aiforecastatlas.com`, preserving paths where appropriate. The application redirect only applies to requests that reach this installation. Confirm HTTPS on both source hosts before relying on their redirects.
- Add a visible link on the Creoox and xeokit websites. Suggested copy: **AI Forecast Atlas — explore eight AI economy scenarios to 2035, with sourced weekly data.** The GitHub README already links to the live site and reading pages. A LinkedIn announcement should be reviewed and published by the account owner.
- Use the full descriptor **AI Forecast Atlas — AI economy scenarios**. Have a trademark professional check the reported ForecastAtlas name before filing; the code release does not establish trademark clearance.

## Chat capacity

The existing admin setting supports 1–8 concurrent answers. Retain 2 on a four-worker shared plan so chat does not starve the scheduler, newsletter or other sites. On an isolated Apache plan with documented spare PHP workers, raise it gradually (for example to 4), observe response time and busy responses, and keep the daily spend cap. A new serverless service is not required for this release. Moving chat would be a separate infrastructure and privacy change.

The current installation uses Hosting Biznes Apache, shared with other websites. [home.pl's published limits](https://pomoc.home.pl/baza-wiedzy/parametry-bezpieczenstwa-serwerow-home-pl) list four parallel CGI processes for Hosting Biznes (checked 19 October 2026). Increasing chat to four would leave no reserved capacity for other PHP work, so this release keeps the existing limit of two.

## Useful validation

- Unit tests, PHP 8.0 syntax, integration tests and the complete browser suite.
- 320 px phone at 150% text size; wide Auto sizing; expanded chart labels; menu keyboard use; light and dark themes.
- No-JavaScript reading pages, escaped malicious content, no unpublished data, current source links, dated sitemap and all crawler groups excluding `/api/`, `/admin/` and `/_private/`.
- On production, verify response headers and redirects and compare published-data hashes before and after. Fonts must load from the same origin and framed dashboard/chart views must continue to work.
