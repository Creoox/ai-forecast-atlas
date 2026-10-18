# Architecture

```
            visitors                                   admin (browser)
               │                                             │
   index.html + assets/*.js  ──── reads ────►  data/latest/release.js (weekly data)
   (model runs in the browser)                               │
               │                                   admin/ → api/admin.php
   api/chat.php ── OpenAI / Anthropic / … ◄──┐               │  review, settings, newsletter
   api/feedback.php                          │               │  build release in the browser:
   api/subscribe|confirm|prefs|unsub.php ── Mailjet           │  engine.esm.js + release-core.js
   api/mcp.php (read-only data for AI tools) │               ▼
                                             │      _private/storage/staged/<week>
   cron-5min.php / cron-13.php (in /public_html) ─► _private/cron/run.php ─► aim_cron_tick()
        daily 06:00  collectors: OpenRouter, EIA, SEC EDGAR, Epoch AI ─► review queue
                     research panel (Mon–Thu): OpenAI, Anthropic, Gemini, Grok, DeepSeek ─► weighted median ─► review queue
                     X watch (Mon–Fri): Grok x_search ─► X watch queue ─► (approved) data/xwatch.json
        Friday 13:00 publish staged build (or carry the last release forward)
                     ─► data/releases/<week>/, data/latest/, feeds/, sitemap, status
                     ─► newsletter queue ─► Mailjet, 50 messages per call, across several runs
```

## Principles

- **One model, everywhere.** `engine/engine.mjs` is the only implementation of the model. The dashboard, the embed page, the admin release builder and `tools/release.mjs` all run it; the server never re-implements it. `createEngine()` returns independent instances; `applyData(dataset)` re-anchors the Q4 2026 starting values.
- **Releases are files.** A release is a set of static files (JSON, CSV, SVG) computed once and served as they are. The API is the file tree plus a small MCP endpoint. Deterministic: same engine + same dataset = byte-identical files.
- **Updates preserve operating data.** Use the generated `aimonitor-homepl-update-<version>.zip`, which excludes `_private/storage/`, `data/`, `feeds/` and host-specific routing files. The full installation package seeds a first release and must not overwrite a running site. Back up the live private storage and published data separately; a code checkout is not a backup of them. Operational retention rules still apply independently of application updates.
- **Reading preferences stay local.** Text size (100%, 125% or 150%), layout and theme are remembered in the same browser and device. The text-size preference is independent of layout presets and reset, so arranging panels does not shrink the text. No account, server write or tracking is involved; clearing site data removes the preferences and blocked storage leaves the controls usable for the current visit. Broadcast keeps its fixed recording composition.
- **Shared-hosting friendly.** PHP 8.0+, no database, no background processes, every request and scheduler run well under 60 seconds, work split into resumable steps. Only `mod_rewrite` rules in `.htaccess` so it works on home.pl's IdeaWebServer and on Apache.
- **Private by construction.** Keys and personal data live in `_private/storage`, written as PHP files that exit when requested over the web — safe even if a server ignores `.htaccess`. Subscriber addresses live in Mailjet; the server keeps a consent log and a local suppression list, and drops the recipient list after each send.
- **Human in the loop.** Collectors only propose. Values enter the public data after an admin approves them and a release is built (official-API values can optionally be approved automatically; AI research never is).
- **Every number traceable.** A value is approved with its source link, or — when an AI model gives it from its own knowledge — labelled “AI knowledge” with the model, date and explanation. It keeps its provenance all the way to the public files: source, link, supporting quote, further references, how it entered the data (official interface, the AI research panel with every agent's answer, desk research, manual entry), and the retrieval and review dates.
- **Many agents, one accountable value.** Each research question goes to every agent that is switched on. Answers are normalised (value, source page and quote, or AI knowledge with an explanation), outliers outside the plausible range are ignored, and the rest are combined by **weighted median**: the lowest answer at which half of the counted weight is reached. The published value is therefore one agent's real answer (the lead), and that agent's source supports it exactly; the other answers travel with the value (`via.panel`) with their weight, source and whether they agree within the tolerance. Answers without a source count with the knowledge factor (default 0.5). The reviewer can publish another agent's answer instead (“Use this answer”).
- **Signals are not data.** X watch items (posts on X found by Grok's `x_search`, labelled for credibility and impact) are reviewed like data but published separately (`data/xwatch.json`, the release's `xwatch` list, the newsletter section) and never change the model. Model outputs are explained by the formulas in `config/methods.json` (published as `assets/methods.json`), which the dashboard, the assistant and the MCP server all use.
- **The assistant knows the interface.** The build generates `assets/chat-guide.json` from the engine's scenario definitions and `config/methods.json`. Every normal chat request includes the compact scenario, feature and glossary overview, plus up to three relevant detailed entries selected by the question or explicit panel context. Short referential follow-ups can reuse the previous user question. PHP loads this trusted local file; visitor-supplied text only selects entries and cannot replace the guide. The single-file preview uses the same generated catalog and equivalent selection rules. Definitions and hypothetical scenario narratives stay separate from published observations and model figures; general knowledge keeps its `[AI]` label. No web search, new service or conversation storage is added.
- **Short, resumable scheduler runs.** Each step of the daily check is marked before it runs, so a run stopped by the host is retried at most twice instead of repeating all day. Research has one step per question and agent (`ask:AN4:gemini`) plus a `merge:AN4` step that waits for all of them. OpenAI research runs in background mode and Claude research as a message batch; both are started first and collected on later runs. Gemini, Grok and DeepSeek answer directly, at most one awaited answer per run (30 s). AI costs are booked before each call and corrected afterwards (xAI reports the exact cost), so budgets hold even when a run or a visitor's connection is cut.

## Server modules (`server/_private/lib`)

| File | Role |
|---|---|
| `util.php`, `settings.php`, `http.php`, `security.php` | files, settings (with secrets), HTTPS client, signed tokens, rate limits, Turnstile, admin login and CSRF |
| `llm.php` | provider adapters (OpenAI Responses incl. background mode, Anthropic Messages incl. message batches, Gemini generateContent with Google Search, xAI Responses with web and X search, OpenAI-compatible chat for DeepSeek and others), the five research agents with weights, roles, streaming, costs |
| `chat.php` | visitor chat (server-sent events with JSON fallback) with the evidence ledger for citations, panel explainers, a limit on concurrent answers; suggestions inbox |
| `mailjet.php`, `subscriptions.php`, `newsletter.php`, `i18n.php` | contacts, double opt-in, preferences, unsubscribe, composition in four languages, batched sending |
| `collectors.php`, `review.php` | daily data check (official interfaces; the AI research panel: questions, answer checks, weighted median) in resumable steps, review queue with every agent's answer, working dataset with provenance |
| `xwatch.php` | X watch: the Grok scan, validation of post links, review, publishing of `data/xwatch.json`, release window, pruning |
| `publish.php`, `feeds.php` | staging, Friday publishing, carry-forward, archive, release pages, feeds, sitemap, status |
| `cron.php` | the scheduler step |
| `admin_api.php`, `mcp.php` | admin API, signed ingest for automation, MCP server |

## Time

All schedules use Europe/Zurich time (CET/CEST). Release ids are ISO weeks of the publication date (`2026-W43`); a manual extra publication adds a suffix (`2026-W43.1`). If the server misses Friday, the release is caught up on the next run in the same week.

## Engine anchor roll-over (planned)

The model's "now" is Q4 2026. Weekly data re-anchor that quarter's starting values. From 2027 the anchor quarter must roll forward (engine v4): history extended with each quarter's reported data, calibration on the new last quarter, and observations after the anchor used to score which scenario reality is tracking. See [ROADMAP.md](ROADMAP.md).
