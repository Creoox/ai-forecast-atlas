# Published pages and discovery files

The server generates readable HTML from **already published releases**. It does not run or copy the model equations into PHP. The JavaScript engine and release builder remain the only calculation path; PHP uses the existing release headline values, series, signposts and impact scores, with the same display formatter used by newsletters.

The generated output includes:

- the latest release summary in the homepage, with a native HTML disclosure for the eight-scenario comparison;
- eight `/scenarios/<name>/` pages and a scenario index;
- a `/measures/<name>/` page for every measure in the published dictionary, plus an index;
- `/releases/<release-id>/` pages and a release index;
- `/about/`, `/faq/` with 15 questions, and `/methodology/`;
- canonical and social metadata, Organization, WebSite and versioned Dataset schemas, FAQPage on the FAQ, and Report on releases;
- a sitemap with modification dates, named search/training crawler groups with the same private-path exclusions, `llms.txt` and a streamed `llms-full.txt` corpus.

Every generated page includes the release citation, publication date, data date, engine version and licence information. Measure pages preserve the released starting value's source, quote, review date, derivation and provenance. Explanations and formulas come from the shipped public `assets/methods.json`; no working dataset, candidate, staged bundle or AI response is used. Organization links use operator settings. Creoox's logo and LinkedIn URLs were verified on its public homepage on 19 October 2026; they are metadata only, not remotely loaded images in the visitor interface. Custom operators can set their own values. Non-http(s) values and non-LinkedIn hosts for the LinkedIn field are omitted from the schema.

## Publishing and rebuilding

`aim_discovery_on_publish($release)` runs after publication writes the archive, latest files and release index, while the existing publish lock is held. It refreshes current pages and the newly published release. An archive ID must be valid and present in `data/releases/index.json` before the generator will create a release page.

The admin Release view's **Refresh public pages** action calls the existing authenticated admin endpoint with:

```text
POST /api/admin.php?a=regenerate_public_pages
X-AIM-CSRF: <current session token>
Origin: https://aiforecastatlas.com

{"cursor":null,"limit":10}
```

It uses the normal signed admin cookie, POST-only check and CSRF validation, and explicitly requires an Origin header matching the configured site's scheme, host and effective port. It sends no emails and does not approve or publish data. Response fields are:

```json
{"ok":true,"release":"2026-W43","processed":10,"ids":["..."],"next":"2026-W42","complete":false}
```

The ID and count in this example are illustrative. Pass the returned `next` as `cursor` until `complete` is true. A completed batch returns `next: null`. The batch limit is clamped to 1–30 archived releases, with a 25-second cutoff between releases. If a publish or another rebuild owns the lock, the action immediately asks the caller to retry. An incomplete indexed archive returns an error instead of inventing its content. Current-page generation and sitemap/text-index updates run each batch; the full-text archive is streamed to avoid growing PHP memory with history.

The same helper is available to local build/maintenance code as `aim_discovery_refresh(?string $after = null, int $limit = 20): array`. It is not a public unauthenticated endpoint.

## Safe updates and withdrawals

A fresh installation can include the generated base-release pages. A program-update ZIP must exclude generated snapshots: `scenarios/`, `measures/`, `releases/`, `about/`, `faq/`, `methodology/`, `llms.txt`, `llms-full.txt`, `sitemap.xml` and `robots.txt`, as well as all existing runtime-preservation exclusions (`data/`, `feeds/`, private storage/configuration and deployment-specific routing).

The update homepage should contain the generic summary placeholder, never the build machine's base-release findings. After uploading program files, the administrator runs Refresh public pages against the live approved archive. The renderer replaces the contents between `<!-- AIM:SUMMARY:START -->` / `<!-- AIM:SUMMARY:END -->` and the head's `<!-- AIM:METADATA:START -->` / `<!-- AIM:METADATA:END -->` markers. Keep these markers in the template.

A rebuild changes derived HTML/text/discovery files only. It refreshes the established `data/releases/<id>/index.html` page and gives it a canonical URL under `/releases/<id>/`; JSON, CSV, SVG, release.js, the release index, public runtime configuration, settings, subscribers, queues and approval state are not rewritten.

X-watch withdrawal is a separate existing authorized redaction operation. Its hook refreshes both release HTML locations, each generated release's `index.txt`, the release index page and `llms-full.txt`, so withdrawn material cannot survive in a newly added copy.

## Verification

`node --test test/discovery.test.mjs` uses temporary fixtures produced by the existing JavaScript release builder and PHP 8.0 or newer. It requires PHP on PATH (or `PHP_BINARY`). It has no network calls. It verifies approved-only rendering, exact display values, source provenance, hostile-text and JSON-LD escaping, nonfinite values, stable canonical URLs, all scenario/measure pages, schemas, robots restrictions, complete sitemap dates, resumable batches, preservation hashes, busy-lock behavior, incomplete archives and withdrawal from every generated copy.
