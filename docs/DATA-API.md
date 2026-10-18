# Open data and API

Everything is published as static files under **https://aiforecastatlas.com/**, refreshed every Friday at 13:00 Swiss time. Licence **CC BY 4.0** — credit “AI Forecast Atlas by Creoox AG”, the release id and a link. Machine-readable description: [`/openapi.json`](https://aiforecastatlas.com/openapi.json); short guide for language models: [`/llms.txt`](https://aiforecastatlas.com/llms.txt).

## Files of a release

Each release exists twice: under `data/releases/<id>/` (permanent) and under `data/latest/` (the newest).

| File | Contents |
|---|---|
| `release.json` | summary, `changes` (starting values that changed, each with its source, link, quote, references and how it entered the data), `highlights` and `moves` (how Q4 2030 values moved), `headline` (key measures per scenario at Q4 2026/2027/2028/2030/2035), `regimes`, `signposts` (first quarter each warning threshold is crossed), `impacts2030`, `sectors`, `autoEvents`, `evidence`, `xwatch` (up to 20 X watch items approved since the previous release — see below) |
| `dataset.json` | the 26 starting values (Q4 2026) with their full provenance — see below |
| `series/all.csv` | long format: `scenario,quarter,t,metric,value` for all scenarios, measures and quarters 2023–2035 |
| `series/<SCN>.csv` / `.json` | one scenario, one column per measure |
| `impacts/<SCN>.json` | impact scores (−100 … +100 vs Q4 2026) for 37 business groups and regions, Q4 of each year 2027–2035 |
| `metrics.json`, `scenarios.json` | measure dictionary (names, units, groups) and scenarios with drivers |
| `charts/<metric>.svg` | chart image, all eight scenarios, with direct labels and credit line |
| `datapackage.json` | Frictionless Data descriptor of the CSV files |

### Provenance of every starting value

Each entry of `dataset.json` → `anchors` (ids `AN1` … `AN26`) carries:

| Field | Meaning |
|---|---|
| `value`, `v` | the number in model units, and as displayed |
| `status` | `reported` (published figure), `survey` (from a published survey), `estimate` (derived from published figures), `forecast` (a publisher's forecast), `ai-knowledge` (given by an AI model from its own knowledge, without a specific source), `assumption`, or `index` (a model construct) |
| `period`, `scope` | what the number covers |
| `src`, `url` | the source (publisher, title, date) and the link to it |
| `quote` | the supporting sentence from that source, when the value came from research |
| `refs` | further references `[{title, url}]` — pages that confirm it, or the exact data endpoints read |
| `calc` | how the value was derived (the formula or steps) |
| `via` | how it entered the data: `{type, name, model?, panel?, check?, edited?}` with type `api` (read automatically from an official data interface), `ai` (AI research — the lead model is named), `ai-knowledge` (an AI model's own knowledge or observation without a specific source — the model, the date and its explanation are kept; `url` is empty), `desk` (desk research, checked against the cited source), `manual`, `assumption` or `model`. `panel` lists every agent of the AI research panel (see below); `check` is the single second opinion used by version 1.0; `edited` says what the reviewer changed |
| `retrieved`, `reviewed` | when the source was read, and when a person approved the value |
| `prev` | the previous display value |

Nothing enters `dataset.json` without a person approving it. An approved value has a source link — or, if an AI model gave it from its own knowledge, it is marked `ai-knowledge` so that users can weigh it accordingly.

### The AI research panel (`via.panel`)

Research questions go to up to five AI agents (OpenAI, Anthropic Claude, Google Gemini, xAI Grok, DeepSeek). Their numeric answers are combined by **weighted median**; the published value is one agent's real answer (the lead), so its `src`, `url` and `quote` support it exactly. `via.panel` records all of them:

```json
"panel": { "rule": "weighted median", "asked": 5, "answered": 5, "agree": 1, "tol": 0.1, "lo": 5.3, "hi": 5.6,
  "members": [
    { "agent": "OpenAI", "model": "gpt-6.1-sol", "w": 3, "v": "$5.42T", "value": 5.42, "basis": "source", "url": "https://…", "title": "…", "agrees": true, "lead": true },
    { "agent": "DeepSeek", "model": "deepseek-v4-pro", "w": 1, "v": "$5.30T", "value": 5.3, "basis": "knowledge", "note": "…", "agrees": true } ] }
```

`w` is the weight the editor set (0–10; 0 = shown, not counted); answers with `basis: "knowledge"` count with a factor (default 0.5). `agrees` means within ±`tol` of the published value; `agree` is the share of the counted weight that agrees. A member with `none` answered that it found nothing newer.

## X watch (`data/xwatch.json`)

Posts on X that the editor is watching — found by Grok (xAI) with its X search, labelled for credibility and impact, approved by a person. **Signals, not data: they never change the model.** The file is rewritten when an item is approved or withdrawn and daily as items pass the keep period (about 30 days). A withdrawn item is also removed from the releases that listed it.

```json
{ "schema": "aimonitor.xwatch/1", "updated": "…", "items": [ { "id": "X12", "date": "2026-10-19",
  "title": "…", "summary": "…", "why": "…", "topics": ["markets"], "metrics": ["K"], "anchors": ["AN1"], "direction": "up",
  "credibility": "high", "credNote": "…", "impact": "high", "impactNote": "…",
  "posts": [ { "url": "https://x.com/<handle>/status/<id>", "handle": "…", "name": "…", "kind": "official", "posted": "2026-10-18" } ],
  "refs": [ { "title": "…", "url": "https://…" } ], "via": { "type": "x", "name": "Grok X search, reviewed by the editor", "model": "xAI grok-4.3" },
  "reviewed": "2026-10-19" } ] }
```

`credibility`: high · medium · low · unverified. `impact` (reach on X): high · medium · low. `kind` of the account: official · executive · journalist · media · analyst · researcher · influencer · other. The texts are CC BY 4.0; the posts belong to their authors.

### Methods: explanations and formulas

[`/assets/methods.json`](https://aiforecastatlas.com/assets/methods.json) holds the explanations shown on the dashboard (CC BY 4.0): what every panel shows and how to read it, every measure's definition, how its history 2023–2026 was compiled (with sources), the model formula behind its scenario paths, the scenarios and their drivers, a glossary, and how data is verified.

Scenario keys: `COMM` The Great Commoditization · `BUST` Hype Implosion & Credit Event · `BRKW` Frontier Breakaway · `SPLT` Sovereign Splinternet · `PWR` The Power Wall · `BOOM` Agentic Productivity Boom · `TRST` Trust Shock · `PLAT` Commodity Models, Concentrated Platforms.

History until Q4 2026 is identical in all scenarios; later values are scenario paths, not forecasts.

## Index, feeds and calendar

- `data/releases/index.json` — every release with date, summary and number of changes.
- `feeds/releases.xml` (RSS 2.0), `feeds/releases-atom.xml` (Atom), `feeds/releases.json` (JSON Feed 1.1).
- `feeds/schedule.ics` — the Friday 13:00 release as a recurring calendar event.
- `data/status.json` — last daily check, next release, latest official observations.
- `data/xwatch.json` — the current X watch list (above).

## Embedding

- Live chart: `<iframe src="https://aiforecastatlas.com/embed/?m=K" width="640" height="380" style="border:0"></iframe>` — parameters `m` (measure key), `s` (comma-separated scenarios), `theme=dark`, `title`.
- Image: `https://aiforecastatlas.com/data/latest/charts/K.svg`.
- The whole dashboard: any dashboard address with `embed=1`, e.g. `https://aiforecastatlas.com/?embed=1&s=PWR`.
- Deep links: `?s=COMM&t=2030Q4&lens=aeco&focus=phase&theme=light&layout=charts`.
- Sources: `#sources` opens the "Sources & methods" view; `#src-AN12` opens it at one starting value.
- X watch: `#x-X12` scrolls to one X watch item and highlights it.

## MCP server (for AI assistants)

`POST https://aiforecastatlas.com/api/mcp.php` — Model Context Protocol over Streamable HTTP (JSON responses), read-only, no key. Tools: `list_metrics`, `list_scenarios`, `list_releases`, `get_release`, `get_series`, `explain_metric` (definition, history sources, model formula, starting value), `get_sources` (every starting value with its provenance and panel answers), `get_xwatch` (the X watch list, optionally by topic), `get_signposts`, `get_impacts`.

```json
{ "mcpServers": { "ai-forecast-atlas": { "type": "http", "url": "https://aiforecastatlas.com/api/mcp.php" } } }
```

## Run the model yourself

```js
import { createEngine } from './engine.esm.js';      // download from /assets/engine.esm.js
const E = createEngine();
E.applyData(await (await fetch('https://aiforecastatlas.com/data/latest/dataset.json')).json());
const run = E.simulate(E.SCENARIOS[0]);                // or tilt drivers: E.simulate(s, { offsets: { energy: 10 } })
console.log(E.qLabel(31), run.K[31]);                  // Big-4 capex in Q4 2030, $B a year
```
