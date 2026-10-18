#!/usr/bin/env node
/* AI Forecast Atlas build.
     node web/build.mjs            → dist/homepl/aimonitor (upload this folder), dist/homepl/cron (launchers),
                                     dist/artifact/ai-monitor.html (single-file preview), dist/aimonitor-homepl-<version>.zip
   Options: --site https://aiforecastatlas.com/   --no-zip   --no-php (skip the PHP publish step)
   No npm dependencies. PHP 8 (CLI) is used once to publish the base release with the same code the server runs.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEngine } from '../engine/engine.mjs';
import { buildChatGuide } from './src/chat-guide.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes(k);
const SITE = String(arg('--site', 'https://aiforecastatlas.com/')).replace(/\/?$/, '/');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const rd = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const wr = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
function copyDir(src, dst, skip) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip && skip(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d, skip); else fs.copyFileSync(s, d);
  }
}

/* ---------- sources ---------- */
const template = rd('web/src/template.html');
const engineEsm = rd('engine/engine.mjs');
const releaseCore = rd('web/src/release-core.mjs');
const appJs = rd('web/src/app.js');
const siteJs = rd('web/src/site.js');
const guideJs = rd('web/src/guide.js');
/* explanations, formulas and source notes (CC BY 4.0): one file feeds the dashboard, the assistant, the MCP server and the data API */
const methods = JSON.parse(rd('config/methods.json'));
const methodsJson = JSON.stringify(methods);
const methodsJs = '/* AI Forecast Atlas — explanations, formulas and source notes (CC BY 4.0). Generated from config/methods.json. */\nwindow.AIMONITOR_METHODS = ' + methodsJson.replace(/<\/(script)/gi, '<\\/$1') + ';\n';
const chatGuide = buildChatGuide(createEngine(), methods);
const chatGuideJson = JSON.stringify(chatGuide);
const chatGuideClassic = rd('web/src/chat-guide.mjs').replace(/^export (?=function (?:buildChatGuide|selectChatGuide)\()/gm, '');
if (/^export /m.test(chatGuideClassic)) throw new Error('chat guide: export left in the classic build');
const chatGuideJs = '(function () {\n' + chatGuideClassic + '\nwindow.AIMONITOR_CHAT_GUIDE = '
  + chatGuideJson.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  + ';\nwindow.AIMONITOR_selectChatGuide = selectChatGuide;\n})();\n';
const newsletter = JSON.parse(rd('config/newsletter.json'));
const engineClassic = '/* AI Forecast Atlas engine (browser build of engine/engine.mjs). Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */\n(function () {\n'
  + engineEsm.replace(/^export function createEngine\(/m, 'function createEngine(').replace(/^export const AICX = createEngine\(\);\s*$/m, '').replace(/^export default AICX;\s*$/m, '')
  + '\nwindow.AICX = createEngine();\nwindow.AICX_createEngine = createEngine;\n})();\n';
if (/^export /m.test(engineClassic)) throw new Error('engine: export left in the classic build');
const NL_PUBLIC = { languages: newsletter.languages, frequencies: newsletter.frequencies, categories: newsletter.categories.map(c => ({ id: c.id, always: !!c.always, label: c.label, desc: c.desc })) };

/* template split: head part (title, links, style) and body */
const styleEnd = template.indexOf('</style>') + '</style>'.length;
const scriptsAt = template.indexOf('<script>\n/*__CONFIG__*/');
if (styleEnd < 10 || scriptsAt < 0) throw new Error('template markers not found');
const headPart = template.slice(0, styleEnd);
const bodyPart = template.slice(styleEnd, scriptsAt).trim();
const RESET = ':root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}img{max-width:100%}[hidden]{display:none!important}';

/* ---------- 1. site for home.pl ---------- */
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'homepl', 'aimonitor');
fs.rmSync(path.join(DIST, 'homepl'), { recursive: true, force: true });
copyDir(path.join(ROOT, 'server/web'), OUT);
copyDir(path.join(ROOT, 'server/_private'), path.join(OUT, '_private'), n => n === 'storage');
fs.mkdirSync(path.join(OUT, '_private/config'), { recursive: true });   // git keeps no empty folders: a fresh clone has none
for (const f of ['newsletter.json', 'i18n.json', 'sources.json', 'operator.json']) fs.copyFileSync(path.join(ROOT, 'config', f), path.join(OUT, '_private/config', f));
copyDir(path.join(ROOT, 'server/cron'), path.join(DIST, 'homepl', 'cron'));

const assets = { 'engine.js': engineClassic, 'engine.esm.js': engineEsm, 'release-core.js': releaseCore, 'app.js': appJs, 'site.js': siteJs, 'guide.js': guideJs, 'methods.js': methodsJs, 'methods.json': JSON.stringify(methods, null, 1) + '\n', 'chat-guide.js': chatGuideJs, 'chat-guide.json': chatGuideJson + '\n' };
const ver = {};
for (const [n, s] of Object.entries(assets)) { wr(path.join(OUT, 'assets', n), s); ver[n] = hash(s); }
const desc = 'Weekly scenario monitor of AI commoditization: capex, revenue, token prices, compute, energy and work, 2023–2035. Eight scenarios, open data, by Creoox AG.';
const jsonld = { '@context': 'https://schema.org', '@type': 'Dataset', name: 'AI Forecast Atlas — AI Commoditization Monitor', description: desc, url: SITE, license: 'https://creativecommons.org/licenses/by/4.0/', isAccessibleForFree: true,
  creator: { '@type': 'Organization', name: 'Creoox AG', url: 'https://creoox.com' }, temporalCoverage: '2023-01-01/2035-12-31', keywords: ['AI', 'commoditization', 'scenarios', 'capex', 'token prices', 'data centres', 'AECO'],
  distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: SITE + 'data/latest/series/all.csv' }, { '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: SITE + 'data/latest/release.json' }] };
const siteCfg = { mode: 'site', siteUrl: SITE, apiBase: 'api/', version: VERSION, buildDate: BUILD_DATE, defaultTheme: 'dark', newsletter: NL_PUBLIC };
const head = headPart
  .replace('<title>AI Commoditization Monitor</title>', '<title>AI Forecast Atlas — AI Commoditization Monitor</title>')
  .replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
  .replace('<!--__HEAD__-->', [
    '<meta name="description" content="' + desc + '">',
    '<link rel="canonical" href="' + SITE + '">',
    '<meta property="og:type" content="website"><meta property="og:site_name" content="AI Forecast Atlas"><meta property="og:title" content="AI Forecast Atlas — AI Commoditization Monitor">',
    '<meta property="og:description" content="' + desc + '"><meta property="og:url" content="' + SITE + '"><meta property="og:image" content="' + SITE + 'og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="theme-color" content="#0b0b0c">',
    '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
    '<link rel="alternate" type="application/rss+xml" title="AI Forecast Atlas weekly releases" href="feeds/releases.xml">',
    '<link rel="alternate" type="application/atom+xml" title="AI Forecast Atlas weekly releases (Atom)" href="feeds/releases-atom.xml">',
    '<link rel="alternate" type="application/feed+json" title="AI Forecast Atlas weekly releases (JSON Feed)" href="feeds/releases.json">',
    '<script type="application/ld+json">' + JSON.stringify(jsonld) + '</script>'
  ].join('\n'))
  .replace('<style>', '<style>\n' + RESET + '\n');
const index = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + head + '\n</head>\n<body>\n' + bodyPart + '\n'
  + '<noscript><p style="padding:16px">AI Forecast Atlas needs JavaScript. The data is also available as files: <a href="data/latest/release.json">latest release</a>, <a href="data/latest/series/all.csv">all series (CSV)</a>.</p></noscript>\n'
  + '<script>window.AIMONITOR = ' + JSON.stringify(siteCfg) + ';</script>\n'
  + '<script>(function(){var h=Math.floor(Date.now()/36e5);document.write(\'<script src="data/site-config.js?h=\'+h+\'"><\\/script><script src="data/latest/release.js?h=\'+h+\'"><\\/script>\');})();</script>\n'
  + '<script src="assets/methods.js?v=' + ver['methods.js'] + '"></script>\n'
  + '<script src="assets/chat-guide.js?v=' + ver['chat-guide.js'] + '"></script>\n'
  + '<script src="assets/engine.js?v=' + ver['engine.js'] + '"></script>\n<script src="assets/app.js?v=' + ver['app.js'] + '"></script>\n<script src="assets/site.js?v=' + ver['site.js'] + '"></script>\n<script src="assets/guide.js?v=' + ver['guide.js'] + '"></script>\n</body>\n</html>\n';
wr(path.join(OUT, 'index.html'), index);
wr(path.join(OUT, 'embed/index.html'), rd('web/src/embed.html'));
for (const f of ['favicon.svg', 'og.png']) if (fs.existsSync(path.join(ROOT, 'web/static', f))) fs.copyFileSync(path.join(ROOT, 'web/static', f), path.join(OUT, f));
wr(path.join(OUT, 'robots.txt'), rd('web/static/robots.txt').replaceAll('{{SITE}}', SITE));
wr(path.join(OUT, 'llms.txt'), rd('web/static/llms.txt').replaceAll('{{SITE}}', SITE));
wr(path.join(OUT, 'openapi.json'), JSON.stringify(openapi(SITE), null, 1) + '\n');
wr(path.join(OUT, 'data/site-config.js'), 'window.AIMONITOR_SITE = ' + JSON.stringify({ siteUrl: SITE, company: 'Creoox AG', chatEnabled: false, newsletterEnabled: false, chatProviderLabel: 'OpenAI', turnstileSiteKey: '', privacyUrl: 'privacy.php', imprintUrl: 'imprint.php' }) + ';\n');
for (const d of ['feeds', 'data/latest', 'data/releases']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
// empty storage, protected twice
const storage = path.join(OUT, '_private/storage');
fs.mkdirSync(storage, { recursive: true });
wr(path.join(storage, '.htaccess'), 'RewriteEngine On\nRewriteRule .* - [F]\n');
wr(path.join(storage, 'index.html'), '<!doctype html><title>Not here</title>\n');

/* base release, computed here with the same release core the admin page uses, published with the server's PHP */
const RC = await import(pathToFileURL(path.join(ROOT, 'web/src/release-core.mjs')).href);
const baseDs = RC.datasetFromEngine(createEngine(), '2026-10-17');
const baseId = RC.isoWeekId('2026-10-17');
const base = RC.buildRelease({ createEngine, dataset: baseDs, previous: null, id: baseId, base: true, siteUrl: SITE });
const staged = path.join(storage, 'staged', baseId);
for (const [p, c] of Object.entries(base.files)) wr(path.join(staged, p), c);
if (!flag('--no-php')) {
  const php = 'define("AIM_ROOT", ' + JSON.stringify(OUT) + '); define("AIM_PRIVATE", ' + JSON.stringify(path.join(OUT, '_private')) + '); define("AIM_SETTINGS_OVERRIDE", ["site" => ["url" => ' + JSON.stringify(SITE) + ']]);'
    + ' require AIM_PRIVATE . "/lib/bootstrap.php"; $r = aim_publish(' + JSON.stringify(baseId) + ', "staged", null, "build"); aim_write_site_config(); echo json_encode($r);';
  const res = execFileSync('php', ['-d', 'display_errors=stderr', '-r', php], { encoding: 'utf8' });
  if (!/"ok":true/.test(res)) throw new Error('PHP publish failed: ' + res);
  // ship clean storage: no state, logs, secrets or staged files
  for (const e of fs.readdirSync(storage)) if (!['.htaccess', 'index.html'].includes(e)) fs.rmSync(path.join(storage, e), { recursive: true, force: true });
  wr(path.join(OUT, 'data/site-config.js'), 'window.AIMONITOR_SITE = ' + JSON.stringify({ siteUrl: SITE, company: 'Creoox AG', chatEnabled: false, newsletterEnabled: false, chatProviderLabel: 'OpenAI', turnstileSiteKey: '', privacyUrl: 'privacy.php', imprintUrl: 'imprint.php' }) + ';\n');
}
/* X watch list (posts on X the editor approved; the server rewrites it on every approval): ship an empty one so the
   dashboard never asks for a missing file. The update zip leaves data/ alone, so a live list is never overwritten. */
const XW_FILE = path.join(OUT, 'data/xwatch.json');
if (!fs.existsSync(XW_FILE)) wr(XW_FILE, JSON.stringify({ schema: 'aimonitor.xwatch/1', updated: null, about: 'Posts on X that the editor is watching. Signals, not data: they do not change the model.', items: [] }, null, 1) + '\n');
const fileCount = n => { let c = 0; for (const e of fs.readdirSync(n, { withFileTypes: true })) c += e.isDirectory() ? fileCount(path.join(n, e.name)) : 1; return c; };
console.log('site     dist/homepl/aimonitor  (' + fileCount(OUT) + ' files, base release ' + baseId + ')');

/* ---------- 2. single-file preview (claude.ai artifact) ---------- */
const artCfg = { mode: 'artifact', siteUrl: SITE, version: VERSION, buildDate: BUILD_DATE, newsletter: NL_PUBLIC };
const artifact = template
  .replace('<!--__HEAD__-->', '')
  .replace('/*__CONFIG__*/', () => 'window.AIMONITOR = ' + JSON.stringify(artCfg) + ';\n' + methodsJs + chatGuideJs)
  .replace('/*__ENGINE__*/', () => engineClassic)
  .replace('/*__APP__*/', () => appJs)
  .replace('/*__SITE__*/', () => siteJs)
  .replace('/*__GUIDE__*/', () => guideJs);
wr(path.join(DIST, 'artifact', 'ai-monitor.html'), artifact);
console.log('preview  dist/artifact/ai-monitor.html (' + Math.round(artifact.length / 1024) + ' KB)');

/* ---------- 3. zip for upload ---------- */
if (!flag('--no-zip')) {
  const zipName = 'aimonitor-homepl-' + VERSION + '.zip';
  const py = 'import os,sys,zipfile\nroot=sys.argv[1]; out=sys.argv[2]\nwith zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as z:\n  for base in ["aimonitor","cron"]:\n    for d,_,fs in os.walk(os.path.join(root,base)):\n      for f in sorted(fs):\n        p=os.path.join(d,f); z.write(p, os.path.relpath(p, root))\n  for extra in sys.argv[3:]:\n    z.write(extra, os.path.basename(extra))\n';
  const extras = ['docs/INSTALL-HOMEPL.html', 'docs/INSTALL-HOMEPL.md', 'LICENSE', 'LICENSE-DATA.md'].map(p => path.join(ROOT, p)).filter(p => fs.existsSync(p));
  const pyUpd = py.replace('for f in sorted(fs):', 'for f in sorted(fs):\n        rel=os.path.relpath(os.path.join(d,f), root).replace(os.sep, "/")\n        if rel.startswith(("aimonitor/data/","aimonitor/feeds/","aimonitor/_private/storage/")) or rel in ("aimonitor/sitemap.xml","aimonitor/robots.txt","aimonitor/.htaccess"): continue');
  const updName = 'aimonitor-homepl-update-' + VERSION + '.zip';
  try {
    execFileSync('python3', ['-c', py, path.join(DIST, 'homepl'), path.join(DIST, zipName), ...extras]); console.log('zip      dist/' + zipName + ' (' + Math.round(fs.statSync(path.join(DIST, zipName)).size / 1024) + ' KB) — first installation');
    execFileSync('python3', ['-c', pyUpd, path.join(DIST, 'homepl'), path.join(DIST, updName), ...extras]); console.log('zip      dist/' + updName + ' (' + Math.round(fs.statSync(path.join(DIST, updName)).size / 1024) + ' KB) — updates: no data, feeds, storage or .htaccess');
  }
  catch (e) { console.log('zip      skipped (python3 not found): zip the folders dist/homepl/aimonitor and dist/homepl/cron yourself'); }
}

/* ---------- OpenAPI description of the public data ---------- */
function openapi(site) {
  const scn = { name: 'scenario', in: 'path', required: true, schema: { type: 'string', enum: ['COMM', 'BUST', 'BRKW', 'SPLT', 'PWR', 'BOOM', 'TRST', 'PLAT'] } };
  const rel = { name: 'release', in: 'path', required: true, schema: { type: 'string', pattern: '^\\d{4}-W\\d{2}(\\.\\d{1,2})?$' }, description: 'Release id, e.g. 2026-W43' };
  const json = d => ({ description: d, content: { 'application/json': { schema: { type: 'object' } } } });
  const csv = d => ({ description: d, content: { 'text/csv': { schema: { type: 'string' } } } });
  return {
    openapi: '3.1.0',
    info: { title: 'AI Forecast Atlas open data', version: VERSION, description: 'Weekly releases of the AI Forecast Atlas scenario model (Creoox AG). Static files, updated every Friday at 13:00 Swiss time. Licence: CC BY 4.0 — credit “AI Forecast Atlas by Creoox AG” and the release id.', license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }, contact: { name: 'Creoox AG', url: 'https://creoox.com' } },
    servers: [{ url: site.replace(/\/$/, '') }],
    paths: {
      '/data/latest/release.json': { get: { summary: 'Latest release summary', responses: { 200: json('Release: changes, headline numbers, signposts, impacts, and the X watch items approved that week (xwatch)') } } },
      '/data/latest/dataset.json': { get: { summary: 'Starting values (Q4 2026 anchors) with sources', responses: { 200: json('Dataset') } } },
      '/assets/methods.json': { get: { summary: 'Explanations behind the dashboard: panels, every measure\'s definition, history sources and model formula, scenarios, drivers, glossary, and how data are verified (incl. the "AI knowledge" label)', responses: { 200: json('Methods') } } },
      '/data/latest/metrics.json': { get: { summary: 'Measure dictionary', responses: { 200: json('Measures with names and units') } } },
      '/data/latest/scenarios.json': { get: { summary: 'Scenarios and drivers', responses: { 200: json('Scenarios') } } },
      '/data/latest/series/all.csv': { get: { summary: 'All scenarios and measures, quarterly (long format)', responses: { 200: csv('scenario,quarter,t,metric,value') } } },
      '/data/latest/series/{scenario}.json': { get: { summary: 'One scenario, all measures (JSON)', parameters: [scn], responses: { 200: json('Series') } } },
      '/data/latest/series/{scenario}.csv': { get: { summary: 'One scenario, all measures (CSV)', parameters: [scn], responses: { 200: csv('quarter,t,<measure keys>') } } },
      '/data/latest/impacts/{scenario}.json': { get: { summary: 'Impact scores by group and year', parameters: [scn], responses: { 200: json('Impacts') } } },
      '/data/latest/charts/{metric}.svg': { get: { summary: 'Chart image of one measure, all scenarios', parameters: [{ name: 'metric', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'SVG', content: { 'image/svg+xml': {} } } } } },
      '/data/xwatch.json': { get: { summary: 'X watch: posts on X the editor is watching, newest first (about 30 days) — signals with post links, credibility and impact labels, not data; they never change the model', responses: { 200: json('X watch list (schema aimonitor.xwatch/1)') } } },
      '/data/releases/index.json': { get: { summary: 'List of all releases', responses: { 200: json('Releases') } } },
      '/data/releases/{release}/release.json': { get: { summary: 'A past release (every latest/ file exists per release)', parameters: [rel], responses: { 200: json('Release') } } },
      '/feeds/releases.xml': { get: { summary: 'RSS feed', responses: { 200: { description: 'RSS 2.0', content: { 'application/rss+xml': {} } } } } },
      '/feeds/releases.json': { get: { summary: 'JSON Feed', responses: { 200: json('JSON Feed 1.1') } } },
      '/feeds/schedule.ics': { get: { summary: 'Release calendar', responses: { 200: { description: 'iCalendar', content: { 'text/calendar': {} } } } } },
      '/api/mcp.php': { post: { summary: 'MCP server (JSON-RPC 2.0, Streamable HTTP, read-only)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { 200: json('JSON-RPC response'), 202: { description: 'Notification accepted' } } } }
    }
  };
}
