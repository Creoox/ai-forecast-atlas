# Notes for AI coding agents and reviewers

AI Forecast Atlas (https://aiforecastatlas.com) by Creoox AG is a weekly-updated scenario model of AI commoditization. It comes with open data, a newsletter, an AI assistant and an MCP server.

The code, model and design are licensed under the Business Source License 1.1 (see `LICENSE`) and the published data under CC BY 4.0. Human contributors should read `CONTRIBUTING.md` first.

## Layout

- `engine/engine.mjs` — the model. It runs in the browser and in Node, and model logic lives only here.
- `web/` — sources for the static front-end. `node web/build.mjs` builds the upload package `dist/homepl/aimonitor` and a single-file preview.
- `server/web/` — public PHP endpoints, the imprint and privacy pages, and the admin page (`server/web/admin/`).
- `server/_private/lib/` — the PHP modules: no framework and no Composer; `bootstrap.php` loads them.
  - `collectors.php` — daily data and the AI research panel.
  - `review.php` — the resumable daily steps and approvals.
  - `xwatch.php` — X watch.
  - `llm.php` — AI providers.
  - `security.php` — login, CSRF, rate limits and Turnstile.
- `server/_private/storage/` — runtime data on the live server: keys, subscribers and logs. Only `.gitkeep` belongs in git.
- `config/` — public configuration: texts, methods, sources, newsletter, and the operator's imprint data (`operator.json`).
- `test/` — three kinds of test:
  - unit tests (Node);
  - end-to-end tests: PHP's built-in server plus mocked AI, Mailjet and data services in `test/mock/mock.php`;
  - browser tests (Playwright, optional).
- `docs/` — the home.pl install guide, architecture, data API, AI providers and legal checklist.

## Commands

```
npm test                         # 13 unit checks (Node 20+)
node web/build.mjs --no-zip      # build
node test/integration.mjs        # 154 end-to-end checks (needs a PHP 8 CLI on PATH)
python3 test/ui/ui_test.py       # 103 browser checks (optional: Playwright + Chromium, run after the build)
find server test/mock -name '*.php' -print0 | xargs -0 -n1 php -l
```

CI (`.github/workflows/ci.yml`) runs the lint, unit, build and end-to-end steps on PHP 8.0 and 8.2.

## Hard constraints

### Hosting

- The site runs on shared PHP hosting (home.pl):
  - PHP 8.0 or newer;
  - no database, no Composer and no Node on the server;
  - about 60 seconds per request.
- Cron work runs in steps of at most about 50 seconds, and every step must be resumable.
- Do not use PHP 8.1+ features:
  - enums, `readonly`, the `never` type and pure intersection types;
  - `new` in initializers and first-class callable syntax `f(...)`;
  - `array_is_list`.
- Add no new npm or PHP dependencies without the maintainer's approval.

### Secrets and storage

- Secrets live only in `server/_private/storage` on the server, entered through the admin page. This covers AI keys, Mailjet, Turnstile and the admin password hash.
- Secrets never appear in the repository, in public files, in API responses or in logs.
- Storage files are PHP files that exit when requested over the web. Always use `aim_store_read` / `aim_store_write` / `aim_store_update`.

### Admin actions

Every admin action that changes something needs all of the following:
- POST;
- the signed admin cookie;
- the `X-AIM-CSRF` header;
- the site's own origin.

### Untrusted text

Text from AI models, web pages and X posts is untrusted:
- Escape it on output:
  - in PHP with `aim_h`;
  - in the admin page with `h()` (text nodes);
  - on the site with `escHtml`.
- Accept only http(s) links (`aim_url_ok`).
- Accept only finite numbers.
- Never let such text trigger an action.

### Publishing and AI providers

- Nothing reaches the public site without the editor's approval. This covers data values and X watch items.
- The published value of the research panel is always one agent's real answer, with that agent's own source.
- The visitor chat must never be sent to DeepSeek. `aim_role('chat')` and `aim_spec` enforce this.
- Research questions sent to AI providers contain no personal data.

### Personal data

- Personal data is limited to three things: newsletter subscribers (kept in Mailjet), the consent log and the suppression list.
- The application stores no IP addresses, only a keyed hash that changes every month.
- `server/web/privacy.php` must describe what the code actually does.

### Sources

Every published number carries one of two things:
- a source: link, quote and review date;
- the "AI knowledge" label, with the model, the date and an explanation.

### Licence and trademarks

- Keep the licence headers (`Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE).`).
- Write "Autodesk®" only as an adjective ("Autodesk® software"), never in possessive form, and use no logos.
- Keep the non-affiliation notice.

### Git

- Never force-push and never rewrite published history.
- Changes reach `main` through pull requests.

## Review guidelines

### P0 — blocks the merge

- A secret or personal data committed to the repository or exposed by the site.
- HTML or script injection from AI, web or X content.
- Admin actions that work without POST, cookie, CSRF header or same origin.
- Storage readable over the web.
- Anything published without the editor's approval.
- The visitor chat reaching DeepSeek.
- PHP 8.1+ code.

### P1 — should be fixed before the merge

- Wrong maths in the research panel. The rules are:
  - the weighted median is the lowest answer at which the cumulative weight reaches half of the total;
  - answers without a usable source count with the knowledge factor (default 0.5);
  - the agreement band is `tolerance × max(|value|, 0.1 × max(|min|, |max|))`;
  - the disagreement flag is raised when the spread exceeds 2 × band.
- Lost or duplicated data in the daily steps: locks, retries, resume, the budget cap.
- X watch items published or kept against these rules:
  - approval is required;
  - "Withdraw" also removes the item from releases, release pages and feeds;
  - unreviewed items are kept 14 days, rejected 45 days, approved 400 days;
  - the public list follows `keep_days`.
- A privacy notice that does not match the code.
- New logic without a test.

### P2 — minor

Out-of-date docs, accessibility and wording.

### Do not flag

- The design choices listed under "Hard constraints".
- Model names and prices in the provider catalogue. They were checked against the providers' documentation in October 2026; flag them only if you have verified that one is wrong.
