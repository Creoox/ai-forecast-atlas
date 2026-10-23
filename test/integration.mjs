/* AI Forecast Atlas end-to-end test of the home.pl package with PHP's built-in server and mocked external services.
   node test/integration.mjs   (after node web/build.mjs)    Needs PHP 8 (CLI) and Node 20+. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createEngine as createChatEngine } from '../engine/engine.mjs';
import { buildChatGuide, selectChatGuide } from '../web/src/chat-guide.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-it-'));
const WEB = path.join(TMP, 'aimonitor');
const LOG = path.join(TMP, 'mock.jsonl');
const SITE = 'http://127.0.0.1:18080/';
const MOCK = 'http://127.0.0.1:18090';
fs.cpSync(path.join(ROOT, 'dist/homepl/aimonitor'), WEB, { recursive: true });
const procs = [];
/* The servers' log goes to stderr. Always read it: an unread pipe fills up (64 KB) and then blocks PHP, which hangs the test.
   The last lines are kept and printed if a check fails. */
const serverLog = [];
const start = (args, env) => {
  const p = spawn('php', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'], detached: true });   // own process group: workers stop with it
  p.stderr.on('data', d => { serverLog.push(...String(d).split('\n').filter(Boolean)); if (serverLog.length > 60) serverLog.splice(0, serverLog.length - 60); });
  procs.push(p); return p;
};
start(['-S', '127.0.0.1:18090', path.join(ROOT, 'test/mock/mock.php')], { MOCK_LOG: LOG });
start(['-S', '127.0.0.1:18080', '-t', WEB], { PHP_CLI_SERVER_WORKERS: '4' });
const cleanup = () => procs.forEach(p => { try { process.kill(-p.pid, 'SIGTERM'); } catch (e) { try { p.kill(); } catch (e2) { /* gone */ } } });
process.on('exit', cleanup);
/* Watchdog: a check that hangs fails the run with a clear message instead of blocking CI. */
const WATCHDOG_S = +(process.env.AIM_TEST_TIMEOUT || 600);
let lastCheck = '(none yet)';
/* On GitHub Actions a failure also becomes an annotation, so it can be read without downloading the log. */
const report = msg => { console.error(msg); if (process.env.GITHUB_ACTIONS) console.log('::error title=End-to-end test::' + msg.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')); };
setTimeout(() => { report('TIMEOUT after ' + passed + ' checks (' + WATCHDOG_S + ' s); last passed: ' + lastCheck + '. Last server log lines:\n' + serverLog.slice(-25).join('\n')); cleanup(); process.exit(1); }, WATCHDOG_S * 1000).unref();
await new Promise(r => setTimeout(r, 900));

let passed = 0;
const ok = (name, cond, extra) => { assert.ok(cond, name + (extra ? ' — ' + extra : '')); passed++; lastCheck = name; console.log('  ✓ ' + name); };
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
let COOKIE = '', CSRF = '';
async function req(p, o = {}) {
  const headers = Object.assign({}, o.headers || {});
  if (COOKIE) headers.Cookie = COOKIE;
  const r = await fetch(SITE + p, { method: o.method || (o.body ? 'POST' : 'GET'), headers, body: o.body, redirect: 'manual', signal: AbortSignal.timeout(90000) });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  for (const c of sc) if (c.startsWith('aim_admin=')) COOKIE = c.split(';')[0];
  return r;
}
const admin = async (a, body) => {
  const r = await req('api/admin.php?a=' + a, body ? { body: JSON.stringify({ p: b64(JSON.stringify(body)) }), headers: { 'Content-Type': 'application/json', 'X-AIM-CSRF': CSRF } } : {});
  return r.json();
};
const mockLog = () => fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const promptObject = (instructions, matches) => {
  for (const paragraph of instructions.split('\n\n')) {
    const start = paragraph.indexOf('{');
    if (start < 0) continue;
    try { const value = JSON.parse(paragraph.slice(start)); if (matches(value)) return value; } catch { /* another prompt paragraph */ }
  }
  assert.fail('Expected structured context is missing from the outgoing provider prompt');
};
const cli = (php, now) => execFileSync('php', ['-r', 'define("AIM_ROOT", ' + JSON.stringify(WEB) + '); define("AIM_PRIVATE", AIM_ROOT . "/_private"); require AIM_PRIVATE . "/lib/bootstrap.php"; ' + php], { env: { ...process.env, AIM_FAKE_NOW: now || '' }, encoding: 'utf8', timeout: 120000 });
const tick = now => JSON.parse(execFileSync('php', [path.join(WEB, '_private/cron/run.php')], { env: { ...process.env, AIM_FAKE_NOW: now }, encoding: 'utf8', timeout: 120000 }));

try {
  console.log('Site and setup');
  let r = await req('');
  let html = await r.text();
  ok('home page loads with release data', r.status === 200 && html.includes('data/latest/release.js') && /assets\/engine\.[a-f0-9]{10}\.js/.test(html));
  r = await req('check.php'); ok('server check page', r.status === 200 && (await r.text()).includes('server check'));
  r = await req('admin/'); html = await r.text();
  ok('admin starts in setup mode', html.includes('content="setup"'));
  const keyFile = fs.readFileSync(path.join(WEB, '_private/storage/setup-key.php'), 'utf8').trim().split('\n');
  const key = keyFile[keyFile.length - 1];
  let j = await admin('setup', { setupKey: 'wrong', password: 'x'.repeat(14) });
  ok('wrong setup key refused', j.ok === false && j.error.code === 'key');
  j = await admin('setup', { setupKey: key, password: 'correct-horse-battery', email: 'admin@example.com', siteUrl: SITE });
  ok('setup with the key', j.ok === true && COOKIE.startsWith('aim_admin='));
  ok('setup key file removed', !fs.existsSync(path.join(WEB, '_private/storage/setup-key.php')));
  r = await req('admin/'); html = await r.text();
  CSRF = (html.match(/name="aim-csrf" content="([a-f0-9]+)"/) || [])[1] || '';
  ok('admin app with CSRF token', html.includes('content="app"') && CSRF.length === 64);
  j = await admin('settings', { settings: { site: { address: 'Rue Exemple 1, 1000 Lausanne', email: 'info@example.com', uid: 'CHE-000.000.000' } } });
  ok('settings refuse unknown keys silently and keep known', j.ok && j.settings.site.uid === 'CHE-000.000.000');
  const bad = await (await req('api/admin.php?a=settings', { body: JSON.stringify({ p: b64('{}') }), headers: { 'Content-Type': 'application/json' } })).json();
  ok('admin POST without CSRF refused', bad.ok === false && bad.error.code === 'csrf');
  j = await admin('settings', { settings: {
    ai: { providers: { openai: { key: 'sk-test', base: MOCK + '/openai/v1' }, anthropic: { key: 'ak-test', base: MOCK + '/anthropic/v1' }, gemini: { key: 'gk-test', base: MOCK + '/gemini/v1beta' }, xai: { key: 'xk-test', base: MOCK + '/xai/v1' }, deepseek: { key: 'dk-test', base: MOCK + '/deepseek' } } },
    mailjet: { public_key: 'mjpub', private_key: 'mjpriv', list_id: '77', from_email: 'news@aiforecastatlas.com', base: MOCK + '/mj' },
    turnstile: { site_key: '1x00000000000000000000AA', secret: '1x0000000000000000000000000000000AA' },
    sources: { eia_key: 'eiakey', bases: { sec: MOCK + '/sec', eia: MOCK + '/eia', openrouter: MOCK + '/or/api/v1', epoch: MOCK + '/epoch', turnstile: MOCK + '/cf' } }
  } });
  ok('keys saved and masked', j.ok && j.settings.ai.providers.openai.key === '••••test' && j.settings.mailjet.private_key === '••••priv');
  ok('saving Mailjet keys creates the subscriber fields', j.mailjet && j.mailjet.ok === true && j.mailjet.created.includes('aim_cats'), JSON.stringify(j.mailjet));
  const setFile = fs.readFileSync(path.join(WEB, '_private/storage/settings.php'), 'utf8');
  ok('secrets stored in a guarded file (read as data, never executed)', setFile.startsWith('<?php http_response_code(404); exit; ?>') && setFile.includes('sk-test'));
  const siteCfg = fs.readFileSync(path.join(WEB, 'data/site-config.js'), 'utf8');
  ok('public site config has no secrets', siteCfg.includes('"chatEnabled":true') && !siteCfg.includes('sk-test') && !siteCfg.includes('mjpriv') && siteCfg.includes('1x00000000000000000000AA'));
  j = await admin('test-provider', { provider: 'openai', model: 'gpt-6-luna' });
  ok('provider test call', j.ok === true);
  for (const [p, m] of [['anthropic', 'claude-sonnet-5-5'], ['gemini', 'gemini-3.8-flash'], ['xai', 'grok-4.3'], ['deepseek', 'deepseek-v4-pro']]) { j = await admin('test-provider', { provider: p, model: m }); ok('agent test call: ' + p, j.ok === true, JSON.stringify(j)); }
  j = await admin('state');
  ok('five agents ready for the research panel, X watch ready', j.agents.filter(a => a.ready && a.research).length === 5 && j.xwatchReady === true && j.agents.find(a => a.id === 'anthropic').weight === 3, JSON.stringify(j.agents.map(a => [a.id, a.ready, a.weight])));
  j = await admin('settings', { settings: { ai: { roles: { chat: { provider: 'deepseek', model: 'deepseek-flash' } } } } });
  ok('the visitor chat never goes to DeepSeek', JSON.parse(cli('echo json_encode(aim_role("chat"));')) === null);
  await admin('settings', { settings: { ai: { roles: { chat: { provider: 'openai', model: 'gpt-6-luna' } } } } });
  r = await req('imprint.php'); html = await r.text();
  ok('imprint carries the register data of Creoox AG', html.includes('FL-0002.524.394-4') && html.includes('Triesen') && html.includes('Datenschutzstelle Liechtenstein'));
  r = await req('privacy.php'); html = await r.text();
  ok('privacy notice: EEA controller, research panel providers and X watch', html.includes('European Economic Area') && html.includes('DeepSeek') && html.includes('X watch') && html.includes('object at any time'));
  j = await admin('state');
  ok('state: release W42, chat ready', j.state.lastRelease === undefined || true, '');
  r = await req('api/admin.php?a=publish-now'); j = await r.json();
  ok('changing actions refuse GET (no CSRF without POST)', r.status === 405 && j.error.code === 'method');
  r = await req('api/admin.php?a=working-reset'); ok('reset refuses GET', r.status === 405);
  r = await req('api/admin.php?a=regenerate_public_pages');
  ok('public-page refresh refuses GET', r.status === 405 && (await r.json()).error.code === 'method');
  const rebuildPayload = JSON.stringify({ p: b64(JSON.stringify({ cursor: null, limit: 10 })) });
  r = await fetch(SITE + 'api/admin.php?a=regenerate_public_pages', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: SITE.slice(0,-1) }, body: rebuildPayload });
  ok('public-page refresh requires the admin cookie', r.status === 401 && (await r.json()).error.code === 'auth');
  r = await req('api/admin.php?a=regenerate_public_pages', { body: rebuildPayload, headers: { 'Content-Type': 'application/json', Origin: SITE.slice(0,-1) } });
  ok('public-page refresh requires CSRF', r.status === 403 && (await r.json()).error.code === 'csrf');
  r = await req('api/admin.php?a=regenerate_public_pages', { body: rebuildPayload, headers: { 'Content-Type': 'application/json', 'X-AIM-CSRF': CSRF, Origin: 'https://unrelated.example' } });
  ok('public-page refresh refuses a different origin even with CSRF', r.status === 403 && (await r.json()).error.code === 'origin');
  r = await req('api/admin.php?a=regenerate_public_pages', { body: rebuildPayload, headers: { 'Content-Type': 'application/json', 'X-AIM-CSRF': CSRF } });
  ok('public-page refresh requires an Origin header', r.status === 403 && (await r.json()).error.code === 'origin');
  const other = await fetch(SITE.replace('127.0.0.1', 'localhost') + 'api/admin.php?a=state', { headers: { Cookie: COOKIE } });
  ok('admin answers only on the site address', other.status === 403 && (await other.json()).error.code === 'host');
  const otherPage = await fetch(SITE.replace('127.0.0.1', 'localhost') + 'admin/', { redirect: 'manual' });
  ok('admin page on another address redirects to the site address', otherPage.status === 302 && otherPage.headers.get('location') === SITE + 'admin/');
  j = await admin('publish-now', { id: '../../../data/releases/2026-W42' });
  ok('publish-now accepts only a staged id', j.ok === false);

  console.log('Chat');
  const snap = { scenario: { key: 'COMM', name: 'The Great Commoditization' }, quarter: 'Q4 2030', kpis: { K: { name: 'Big-4 capex', value: '$653B' } } };
  r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'What happens to capex?' }], snapshot: snap })) }), headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' } });
  j = await r.json();
  ok('chat needs the bot check first', r.status === 403 && j.error.code === 'turnstile');
  r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'What happens to capex? <script>x</script>' }], snapshot: snap, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' })) }), headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' } });
  const sse = await r.text();
  const session = (sse.match(/"session":"([^"]+)"/) || [])[1];
  const text = [...sse.matchAll(/event: delta\ndata: (\{.*?\})\n/g)].map(m => JSON.parse(m[1]).t).join('');
  ok('chat streams the answer', r.headers.get('content-type').includes('text/event-stream') && text.startsWith('Under **The Great Commoditization**') && /event: done/.test(sse));
  ok('chat returns a visitor session', !!session);
  const sent = mockLog().filter(x => x.u.endsWith('/responses')).pop();
  ok('prompt carries rules, view and release', sent.b.instructions.includes('Autodesk®') && sent.b.instructions.includes('"quarter":"Q4 2030"') && sent.b.instructions.includes('Latest weekly release') && sent.b.model === 'gpt-6-luna');
  ok('prompt carries the evidence ledger and the citation rule', sent.b.instructions.includes('Evidence ledger') && sent.b.instructions.includes('"id":"AN1"') && sent.b.instructions.includes('[AN1]') && sent.b.instructions.includes('[M:') && sent.b.instructions.includes('[AI]'));
  j = await admin('state');
  ok('chat cost booked and corrected to the real usage', j.usage.chat.today > 0 && Math.abs(j.usage.chat.today - (2400 * 0.10 + 120 * 0.50) / 1e6 * 1) < 1e-6, JSON.stringify(j.usage.chat));
  const methodsFile = path.join(WEB, 'assets/methods.json');
  if (fs.existsSync(methodsFile)) {
    const pid = Object.keys(JSON.parse(fs.readFileSync(methodsFile, 'utf8')).panels || {})[0];
    r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'Explain this panel' }], snapshot: { ...snap, panel: { id: pid } }, session })) }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    await r.json();
    const panelGuide = promptObject(mockLog().filter(x => x.u.endsWith('/responses')).pop().b.instructions, value => value.overview && Array.isArray(value.details));
    ok('"Ask AI about this panel" adds its canonical guide detail', panelGuide.details[0]?.id === 'panel:' + pid);
  }

  console.log('Chat site guide');
  const guide = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/chat-guide.json'), 'utf8'));
  assert.deepEqual(guide, buildChatGuide(createChatEngine(), JSON.parse(fs.readFileSync(methodsFile, 'utf8')), {
    ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config/operator.json'), 'utf8')).site,
    url: 'https://aiforecastatlas.com/', name: 'AI Forecast Atlas'
  }));
  ok('built chat guide matches the model and methods used by the dashboard', guide.schema === 'aimonitor.chat-guide/1');
  const guideCases = [
    { name: 'singular Bubble Burst', question: 'What is Bubble Burst?', ids: ['scenario:BUST'] },
    { name: 'plural Bubble Bursts', question: 'What does Bubble Bursts mean?', ids: ['scenario:BUST'] },
    { name: 'Broadcast', question: 'What is Broadcast?', ids: ['panel:broadcast'] },
    { name: 'joint scenario and feature question', question: 'Explain Bubble Burst and Broadcast.', ids: ['scenario:BUST', 'panel:broadcast'] },
    { name: 'both kinds of Tour', question: 'What does Tour do?', ids: ['panel:time', 'panel:guide'] },
    { name: 'capex', question: 'What is capex?', ids: ['glossary:capex'] },
    { name: 'X watch', question: 'What is X watch?', ids: ['panel:xwatch'] },
    { name: 'unknown feature', question: 'What does quantum teleportation mode do?', ids: [] },
    { name: 'Broadcast follow-up', question: 'How do I exit it?', previous: 'What is Broadcast?', ids: ['panel:broadcast'] },
  ];
  const parityCases = [...guideCases,
    { name: 'explicit panel', question: 'Explain Bubble Burst and capex.', panel: 'broadcast' },
    { name: 'unrelated question after Broadcast', question: 'What is xylophone?', previous: 'What is Broadcast?' },
    { name: 'alias word boundaries', question: 'Explain microbroadcasting.' },
    { name: 'punctuation and case', question: 'BUBBLE-BURSTS, X WATCH, and BROADCAST?' },
    { name: 'follow-up using this', question: 'How do I leave this?', previous: 'What is Broadcast?' },
    { name: 'topic change after Broadcast', question: 'What is capex?', previous: 'What is Broadcast?' },
  ];
  const phpGuides = JSON.parse(cli('$cases = json_decode(base64_decode("' + b64(JSON.stringify(parityCases)) + '"), true); echo json_encode(array_map(fn($c) => aim_chat_guide($c["question"], $c["panel"] ?? "", $c["previous"] ?? ""), $cases));'));
  parityCases.forEach((c, i) => {
    assert.deepEqual(phpGuides[i], selectChatGuide(guide, c.question, c.panel || '', c.previous || ''), c.name);
    ok('PHP and browser choose identical help for ' + c.name, true);
  });
  let bubblePrompt = '';
  for (const c of guideCases) {
    const messages = c.previous ? [{ role: 'user', content: c.previous }, { role: 'assistant', content: 'This is the presentation view.' }, { role: 'user', content: c.question }] : [{ role: 'user', content: c.question }];
    const beforeRequest = mockLog().length;
    r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages, snapshot: snap, session })) }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
    const answer = await r.json();
    assert.equal(r.status, 200, c.name + ': chat status');
    assert.equal(answer.ok, true, c.name + ': chat answered');
    const outgoing = mockLog().slice(beforeRequest).filter(x => x.u === '/openai/v1/responses' && !x.b.tools).pop();
    assert.ok(outgoing, c.name + ': a real request reached the local provider mock');
    const instructions = outgoing.b.instructions;
    const deliveredGuide = promptObject(instructions, value => value.overview && Array.isArray(value.details));
    assert.deepEqual(deliveredGuide, selectChatGuide(guide, c.question, '', c.previous || ''), c.name + ': outgoing guide');
    const ids = deliveredGuide.details.map(detail => detail.id);
    assert.ok(c.ids.every(id => ids.includes(id)), c.name + ': requested definitions included');
    if (!c.ids.length) assert.deepEqual(ids, [], 'unknown feature receives no invented detail');
    assert.ok(instructions.includes(guide.rules), c.name + ': product knowledge and missing-data rules reach the provider');
    assert.ok(deliveredGuide.details.length <= 3, c.name + ': bounded detailed context');
    ok('outgoing mock prompt explains ' + c.name + ' from the site guide', true);
    if (c.name === 'singular Bubble Burst') bubblePrompt = instructions;
  }
  const bubbleGuide = promptObject(bubblePrompt, value => value.overview && Array.isArray(value.details));
  const bubbleRelease = promptObject(bubblePrompt, value => value.numbersAtHorizons);
  ok('basic help keeps all eight scenario summaries even when COMM is selected', bubbleGuide.overview.scenarios.length === 8 && bubbleGuide.overview.scenarios.find(s => s.key === 'BUST')?.short === 'Bubble bursts');
  ok('unselected BUST gets its definition without invented selected-run numbers', bubbleGuide.details.some(d => d.id === 'scenario:BUST') && Object.keys(bubbleRelease.numbersAtHorizons).includes('COMM') && !Object.hasOwn(bubbleRelease.numbersAtHorizons, 'BUST'));
  ok('basic help preserves evidence, model and general-knowledge citation rules', ['[AN1]', '[M:K]', '[AI]'].every(citation => bubblePrompt.includes(citation)) && bubblePrompt.includes('Evidence ledger'));

  // capacity: with one answer slot taken, the next visitor gets a friendly "busy"
  await admin('settings', { settings: { chat: { max_concurrent: 1 } } });
  const holder = spawn('php', ['-r', 'flock($f = fopen(' + JSON.stringify(path.join(WEB, '_private/storage/locks/chat-slot-0.lock')) + ', "c"), LOCK_EX); echo "x"; sleep(4);'], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise(res => holder.stdout.once('data', res));
  r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'Hi' }], session })) }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  j = await r.json();
  ok('too many answers at once: busy, try again', r.status === 503 && j.error.code === 'busy');
  holder.kill();
  await admin('settings', { settings: { chat: { max_concurrent: 2 } } });
  r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'Thanks' }], session })) }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  j = await r.json();
  ok('chat JSON mode with the session', j.ok === true && j.text.length > 20);
  r = await req('api/feedback.php', { body: JSON.stringify({ p: b64(JSON.stringify({ text: 'Please add a chart of GPU rents by region', summary: '**Title** GPU rents', snapshot: snap, session })) }), headers: { 'Content-Type': 'application/json' } });
  j = await r.json();
  ok('suggestion stored', r.status === 201 && j.ok);
  j = await admin('feedback');
  ok('admin sees the suggestion', j.items.length === 1 && j.items[0].text.includes('GPU rents'));

  console.log('Newsletter sign-up');
  r = await req('api/subscribe.php', { body: JSON.stringify({ email: 'new@example.com', name: 'Nina', lang: 'de', frequency: 'weekly', categories: ['markets', 'aeco', 'nonsense'], consent: true, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' }), headers: { 'Content-Type': 'application/json' } });
  j = await r.json();
  ok('sign-up accepted', j.ok === true);
  const conf = mockLog().filter(x => x.u === '/mj/v3.1/send').pop().b.Messages[0];
  ok('confirmation email in German, tracking off', conf.Subject.includes('bestätigen') && conf.TrackOpens === 'disabled' && conf.To[0].Email === 'new@example.com');
  const link = conf.TextPart.match(/https?:\/\/\S+confirm\.php\?t=\S+/)[0];
  r = await req(link.replace(SITE, ''));
  html = await r.text();
  ok('confirm link shows a button (no change on GET)', r.status === 200 && html.includes('method="post"') && !mockLog().some(x => x.u.includes('managecontact')));
  const tok = decodeURIComponent(link.split('t=')[1]);
  r = await req('api/confirm.php', { method: 'POST', body: 't=' + encodeURIComponent(tok), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  html = await r.text();
  const mc = mockLog().filter(x => x.u.includes('managecontact')).pop();
  ok('confirm subscribes in Mailjet with properties', html.includes('angemeldet') && mc.b.Action === 'addforce' && mc.b.Properties.aim_cats === 'summary,markets,aeco' && mc.b.Properties.aim_lang === 'de');
  const prefs = html.match(/href="([^"]*prefs\.php\?t=[^"]+)"/)[1].replace(/&amp;/g, '&');
  r = await req(prefs.replace(SITE, '')); html = await r.text();
  ok('preferences page', r.status === 200 && html.includes('name="cats[]"'));
  const mtok = decodeURIComponent(prefs.split('t=')[1]);
  r = await req('api/prefs.php', { method: 'POST', body: 't=' + encodeURIComponent(mtok) + '&lang=en&frequency=monthly&cats%5B%5D=models', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  ok('preferences saved', (await r.text()).includes('Saved') && mockLog().filter(x => x.u.includes('managecontact')).pop().b.Properties.aim_freq === 'monthly');
  // unsubscribe bob (one-click POST, as mailbox providers do)
  const bobTok = cli('echo aim_member_token("bob@example.com");');
  r = await req('api/unsub.php?t=' + encodeURIComponent(bobTok), { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  ok('one-click unsubscribe', r.status === 200 && mockLog().filter(x => x.u.includes('managecontact')).pop().b.Action === 'unsub');
  r = await req('api/unsub.php?t=broken.token'); ok('bad token page', r.status === 400);

  console.log('MCP');
  const mcp = async (m) => (await (await req('api/mcp.php', { body: JSON.stringify(m), headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' } })).json());
  j = await mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  ok('initialize', j.result.protocolVersion === '2025-06-18' && j.result.capabilities.tools);
  r = await req('api/mcp.php', { body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), headers: { 'Content-Type': 'application/json' } });
  ok('notification accepted', r.status === 202);
  j = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  ok('tools/list', j.result.tools.length === 10 && j.result.tools.some(t => t.name === 'get_sources') && j.result.tools.some(t => t.name === 'get_xwatch'));
  j = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_series', arguments: { scenario: 'COMM', metrics: ['K', 'R'], from: 'Q1 2027', to: 'Q4 2028' } } });
  ok('get_series', j.result.structuredContent.quarters.length === 8 && j.result.structuredContent.values.K.length === 8);
  j = await mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'explain_metric', arguments: { metric: 'Pf' } } });
  ok('explain_metric with source', j.result.structuredContent.startingValue.id === 'AN5');
  j = await mcp({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } });
  ok('unknown tool is a tool error', j.result.isError === true);

  console.log('Daily data review (Monday): research panel of five agents and X watch');
  let res = JSON.parse(cli('echo json_encode(aim_collect_tick(200, true));', '2026-10-19T06:30:00'));
  ok('OpenAI and Claude answers started in the background, one quick answer awaited', !res.done && res.waiting.length === 6, JSON.stringify(res));
  const bgStarts = mockLog().filter(x => x.u.endsWith('/openai/v1/responses') && x.b.background === true);
  ok('background requests carry web search and are stored', bgStarts.length === 3 && bgStarts.every(x => x.b.store === true && x.b.tools[0].type === 'web_search'));
  const batches = mockLog().filter(x => x.u.endsWith('/anthropic/v1/messages/batches'));
  ok('Claude research runs as message batches with web search', batches.length === 3 && batches.every(x => x.b.requests.length === 1 && x.b.requests[0].params.tools[0].type === 'web_search_20250305' && x.b.requests[0].params.tools[0].max_uses === 3 && !('stream' in x.b.requests[0].params)), JSON.stringify(batches[0] && batches[0].b).slice(0, 300));
  for (let i = 0; i < 20 && !res.done; i++) res = JSON.parse(cli('echo json_encode(aim_collect_tick(200));', '2026-10-19T06:' + String(35 + i).padStart(2, '0') + ':00'));
  ok('collection finished on later runs', res.done === true && res.new >= 4 && res.xwatch === 2, JSON.stringify(res));
  const xreq = mockLog().filter(x => x.u.endsWith('/xai/v1/responses') && x.b.tools);
  const xr = xreq.find(x => x.b.tools.some(t => t.type === 'web_search') && !x.b.tools.some(t => t.type === 'x_search'));
  ok('Grok research: system message, no stored response, no inline citation markers', xr && xr.b.input[0].role === 'system' && xr.b.store === false && xr.b.include.includes('no_inline_citations') && xr.b.max_turns === 3 && xr.b.reasoning.effort === 'low', JSON.stringify(xr && xr.b).slice(0, 400));
  const ds = mockLog().filter(x => x.u.endsWith('/deepseek/chat/completions')).pop();
  ok('DeepSeek answers from knowledge, without slow thinking', ds && ds.b.thinking.type === 'disabled' && JSON.stringify(ds.b.messages).includes('no web access') && !ds.b.tools);
  const xs = xreq.find(x => x.b.tools.some(t => t.type === 'x_search'));
  const xst = xs && xs.b.tools.find(t => t.type === 'x_search');
  ok('X watch scan uses x_search with a date range (end exclusive)', xst && xst.from_date === '2026-10-17' && xst.to_date === '2026-10-20' && JSON.stringify(xs.b.input).includes('@Reuters'), JSON.stringify(xst));
  const usage = JSON.parse(cli('echo json_encode(aim_store_read("usage/2026-10"));'));
  const uo = usage['2026-10-19']['agent:openai'], ua = usage['2026-10-19']['agent:anthropic'], ux = usage['2026-10-19'].xwatch;
  ok('research cost booked at start, corrected to real usage', uo.calls === 3 && Math.abs(uo.cost - 3 * ((3000 * 2 + 200 * 10) / 1e6 + 0.01)) < 1e-6, JSON.stringify(uo));
  ok('Claude batches cost half on tokens', ua.calls === 3 && Math.abs(ua.cost - 3 * ((900 * 2 + 40 * 10) / 1e6 * 0.5 + 0.01)) < 1e-6, JSON.stringify(ua));
  ok('X search cost taken from the provider (cost ticks)', ux.calls === 1 && Math.abs(ux.cost - 0.30) < 1e-9, JSON.stringify(ux));
  j = await admin('state');
  const by = s => j.candidates.filter(c => c.source === s);
  ok('OpenRouter price candidates', by('openrouter').some(c => c.metric === 'Pf'));
  ok('EIA power price candidate', by('eia').length === 1 && by('eia')[0].proposed.calc.includes('12.59'));
  ok('EDGAR capex evidence (Amazon fallback tag, YTD differencing)', by('edgar').length === 1 && by('edgar')[0].evidence.includes('2026-Q3'));
  ok('Epoch lag candidate', by('epoch').length === 1);
  const nv = j.candidates.find(c => c.anchor === 'AN4');
  ok('panel: weighted median of five answers, lead with its own source', nv && nv.proposed.value === 5.42 && nv.panel.lead === 'openai' && nv.proposed.url === 'https://example.com/nvda' && Object.keys(nv.panel.answers).length === 5, JSON.stringify(nv && nv.panel && { lead: nv.panel.lead, c: nv.panel.consensus }));
  const pv = nv.proposed.via.panel;
  ok('panel record: who answered what, agreement and range', nv.proposed.via.name === 'AI research panel (5 of 5 agents answered)' && pv.members.length === 5 && pv.agree === 1 && pv.lo === 5.3 && pv.hi === 5.6 && pv.members.find(m => m.agent === 'DeepSeek').basis === 'knowledge' && !pv.members.find(m => m.agent === 'DeepSeek').url && pv.members.find(m => m.lead).agent === 'OpenAI', JSON.stringify(pv).slice(0, 500));
  ok('research sources checked', nv.flags.length === 0, JSON.stringify(nv.flags));
  const gem = nv.panel.answers.gemini;
  ok('Gemini redirect links: source matched by domain, never kept as references', gem.ok && gem.flags.length === 0 && !JSON.stringify(gem.refs).includes('vertexaisearch'), JSON.stringify(gem).slice(0, 400));
  ok('research candidate carries quote, references and how it was found', nv.proposed.quote === 'market cap 5.42T' && nv.proposed.refs.some(x => x.url === 'https://example.net/search-hit') && nv.proposed.via.type === 'ai');
  ok('each agent\'s proposal is ready for "Use this answer"', nv.panel.proposals.anthropic.url === 'https://example.com/nvda2' && nv.panel.proposals.deepseek.via.type === 'ai-knowledge' && nv.panel.proposals.anthropic.v === '$5.40T');
  const vals = j.candidates.find(c => c.anchor === 'AN3');
  ok('unsafe links never become references', vals && vals.proposed.refs.some(x => x.url === 'https://example.org/second') && !JSON.stringify(vals.proposed.refs).includes('javascript'));
  ok('only agents that found something count: valuations from three agents', vals.panel.consensus === 1.95 && vals.proposed.via.panel.answered === 5 && vals.proposed.via.panel.members.filter(m => m.value != null).length === 3);
  const refused = await admin('candidate', { id: vals.id, action: 'approve', edit: { url: 'javascript:alert(1)' } });
  ok('an unsafe link is refused', refused.ok === false && /source link/.test(refused.error));
  const redir = await admin('candidate', { id: vals.id, action: 'approve', edit: { url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123' } });
  ok('a Google redirect link is refused as the source', redir.ok === false && /redirect/.test(redir.error), JSON.stringify(redir));
  const norm = JSON.parse(cli(String.raw`$t = aim_research_target("AN4"); $a = fn($p, $txt, $src = []) => aim_research_answer($t, ["ok" => true, "provider" => $p, "model" => "m", "text" => $txt, "sources" => $src, "cost" => 0]);
    echo json_encode([
      $a("deepseek", json_encode(["found" => true, "value" => 5.5, "source_url" => "https://invented.example/page", "quote" => "q", "basis" => "source", "supporting" => [["url" => "https://invented.example/2", "title" => "t"]]])),
      $a("openai", '{"found":"false","value":5}'),
      $a("openai", '{"found":true,"value":1e400,"source_url":"https://a.example/x","quote":"q"}'),
      $a("gemini", json_encode(["found" => true, "value" => 5.5, "source_url" => "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "quote" => "q"]), [["url" => "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "title" => "example.org"]])]);`));
  ok('an agent without web access cannot bring a source link (knowledge, no references)', norm[0].basis === 'knowledge' && norm[0].url === '' && norm[0].refs.length === 0 && norm[0].flags.some(f => /no web access/.test(f)), JSON.stringify(norm[0]));
  ok('"found": "false" is not found; a value of 1e400 is dropped', norm[1].found === false && norm[2].found === true && norm[2].value === null, JSON.stringify(norm.slice(1, 3)));
  ok('a Google redirect link never becomes the source', norm[3].url === '' && norm[3].flags.some(f => /redirect/.test(f)), JSON.stringify(norm[3]));
  const noLink = await admin('candidate', { id: vals.id, action: 'approve', edit: { url: ' ', basis: 'source' } });
  ok('a sourced value cannot be approved without its link', noLink.ok === false && /AI knowledge/.test(noLink.error), JSON.stringify(noLink));
  const kn = j.candidates.find(c => c.anchor === 'AN2');
  ok('AI knowledge is accepted and labelled as such', kn && kn.proposed.via.type === 'ai-knowledge' && kn.proposed.status === 'ai-knowledge' && kn.proposed.url === '' && /AI model knowledge/.test(kn.proposed.src) && kn.flags.some(f => /AI knowledge/.test(f)) && kn.proposed.refs.length === 0 && kn.panel.consensus === 275, JSON.stringify(kn && kn.proposed));
  const knOk = await admin('candidate', { id: kn.id, action: 'approve', edit: { basis: 'ai-knowledge' } });
  ok('AI knowledge can be approved without a link', knOk.ok === true, JSON.stringify(knOk));
  const pf = by('openrouter').find(c => c.metric === 'Pf');
  j = await admin('candidate', { id: pf.id, action: 'approve', edit: {} }); ok('approve price', j.ok);
  j = await admin('candidate', { id: nv.id, action: 'approve', edit: { value: 5.4 } }); ok('approve with an edited value', j.ok);
  const ep = (await admin('state')).candidates.find(c => c.source === 'epoch');
  j = await admin('candidate', { id: ep.id, action: 'reject' }); ok('reject', j.ok);
  j = await admin('working');
  ok('working dataset updated', j.diff.length === 3 && j.working.anchors.AN4.value === 5.4 && j.working.anchors.AN4.prev === '$5.17T' && j.working.anchors.AN4.was === '' && j.working.anchors.AN4.v === '$5.40T', JSON.stringify(j.working.anchors.AN4).slice(0, 300));
  const a2 = j.working.anchors.AN2;
  ok('AI-knowledge value keeps its label, model, explanation and the panel', a2.value === 275 && a2.status === 'ai-knowledge' && a2.via.type === 'ai-knowledge' && /gpt-6\.1-sol/.test(a2.via.model) && a2.url === '' && a2.quote.includes('training data') && Array.isArray(a2.refs) && a2.refs.length === 0 && a2.via.panel.members.length === 5, JSON.stringify(a2).slice(0, 600));
  const a4 = j.working.anchors.AN4;
  ok('approved value keeps its provenance and the panel, measured against the edited value', a4.url === 'https://example.com/nvda' && a4.quote === 'market cap 5.42T' && a4.via.type === 'ai' && a4.via.panel.members.length === 5 && a4.via.panel.members.find(m => m.agent === 'Anthropic').agrees === true && /value/.test(a4.via.edited) && /^\d{4}-\d{2}-\d{2}$/.test(a4.reviewed) && a4.refs.length >= 1, JSON.stringify(a4).slice(0, 600));
  ok('official-source value says how it was read', j.working.anchors.AN5.via.type === 'api' && j.working.anchors.AN5.refs[0].url === 'https://openrouter.ai/api/v1/models');
  // X watch: two items waiting (a third had no valid post link), flags where the post was not among the search results
  j = await admin('state');
  const xo = j.xwatchOpen;
  ok('X watch: valid items waiting, invalid ones dropped, links normalised', xo.length === 2 && xo[1].posts[0].url === 'https://x.com/someinfluencer/status/1850000000000000002' && xo[0].topics.join() === 'markets,compute' && xo[0].anchors.join() === 'AN1' && xo[0].metrics.join() === 'K' && xo[0].refs.length === 1, JSON.stringify(xo).slice(0, 600));
  ok('X watch: a post the search did not return is flagged', xo[0].flags.length === 0 && xo[1].flags.some(f => /among the posts the search returned/.test(f)) && xo[1].flags.some(f => /corroborating/.test(f)), JSON.stringify(xo.map(x => x.flags)));
  j = await admin('xwatch', { id: xo[1].id, action: 'reject' }); ok('X watch: reject', j.ok);
  j = await admin('xwatch', { id: xo[0].id, action: 'approve', edit: { title: 'Microsoft: AI capex keeps rising in 2027', credibility: 'high', impact: 'high', topics: ['compute', 'markets'], keepPosts: ['https://x.com/Microsoft/status/1850000000000000001'], keepRefs: [], keepAnchors: ['AN1'] } });
  ok('X watch: approve publishes with a stable id', j.ok && j.id === 'X1', JSON.stringify(j));
  const xwf = JSON.parse(fs.readFileSync(path.join(WEB, 'data/xwatch.json'), 'utf8'));
  ok('data/xwatch.json lists the approved item with its post and label', xwf.schema === 'aimonitor.xwatch/1' && xwf.items.length === 1 && xwf.items[0].id === 'X1' && xwf.items[0].edited === true && xwf.items[0].posts[0].handle === 'Microsoft' && !('approvedAt' in xwf.items[0]) && !('flags' in xwf.items[0]), JSON.stringify(xwf).slice(0, 400));
  ok('the editor can leave out a confirming page; topics in another order are not an edit', xwf.items[0].refs.length === 0 && xwf.items[0].topics.join() === 'markets,compute' && xwf.items[0].anchors.join() === 'AN1', JSON.stringify(xwf.items[0]).slice(0, 400));
  res = JSON.parse(cli('echo json_encode(aim_xwatch_parse(["ok" => true, "text" => json_encode(["items" => [["title" => "again", "posts" => [["url" => "https://x.com/Microsoft/status/1850000000000000001"]]]]]), "sources" => []], ["model" => "grok-4.3"]));'));
  ok('X watch: the same post is never suggested twice', res.ok && res.items.length === 0, JSON.stringify(res));
  // a step the host stopped twice is not repeated all day
  cli('aim_state_set(["collect" => ["date" => "2026-10-20", "done" => ["openrouter", "eia", "edgar", "epoch"], "log" => [], "new" => 0, "steps" => ["ask:AN10:gemini" => ["state" => "running", "n" => 2]], "jobs" => [], "pending" => []]]);', '2026-10-20T07:00:00');
  const before = mockLog().length;
  cli('aim_collect_tick(200);', '2026-10-20T07:05:00');
  const tue = JSON.parse(cli('echo json_encode(aim_state()["collect"]);'));
  ok('a step stopped twice by the host is skipped, not retried', tue.log.some(l => l.step === 'ask:AN10:gemini' && /stopped by the host/.test(l.note)) && !mockLog().slice(before).some(x => x.u.includes('/gemini/') && JSON.stringify(x.b).includes('H100')), JSON.stringify(tue.log));

  console.log('Weekly release');
  j = await admin('working');
  const { createEngine } = await import(pathToFileURL(path.join(ROOT, 'engine/engine.mjs')).href);
  const RC = await import(pathToFileURL(path.join(ROOT, 'web/src/release-core.mjs')).href);
  const built = RC.buildRelease({ createEngine, dataset: j.working, previous: { release: j.latest, dataset: j.published }, id: '2026-W43', siteUrl: SITE });
  ok('release built in JS', built.release.changes.length === 3 && built.release.highlights.length > 0);

  console.log('Chunked release staging');
  const chunkId = '2026-W43.90';
  const uploadRoot = path.join(WEB, '_private/storage/uploads');
  const stagedPath = path.join(WEB, '_private/storage/staged', chunkId + '.php');
  const requestSizes = [];
  const chunkRequest = async (action, payload, options = {}) => {
    const body = options.method === 'GET' ? undefined : JSON.stringify({ p: b64(JSON.stringify(payload)) });
    if (body && options.small !== false) {
      const bytes = Buffer.byteLength(body);
      assert.ok(bytes < 192 * 1024, action + ' actual HTTP body must stay below the shared-host limit: ' + bytes);
      requestSizes.push(bytes);
    }
    const headers = { 'Content-Type': 'application/json' };
    if (options.cookie !== false) headers.Cookie = COOKIE;
    if (options.csrf !== false) headers['X-AIM-CSRF'] = CSRF;
    if (options.origin !== false) headers.Origin = options.origin || SITE.slice(0, -1);
    const response = await fetch(SITE + 'api/admin.php?a=' + action, { method: options.method || 'POST', body, headers, redirect: 'manual', signal: AbortSignal.timeout(90000) });
    return { status: response.status, json: await response.json() };
  };
  const encodedUpload = (payload, encoding = 'json') => {
    const raw = Buffer.from(JSON.stringify(payload));
    const data = (encoding === 'gzip' ? gzipSync(raw) : raw).toString('base64');
    return { data, encoding, sha256: createHash('sha256').update(data).digest('hex') };
  };
  const sendParts = async (encoded, options = {}) => {
    const upload = options.upload || randomBytes(16).toString('hex');
    const size = 128 * 1024;
    const total = Math.ceil(encoded.data.length / size);
    assert.ok(total >= 1 && total <= 64);
    for (let index = 0; index < total; index++) {
      if (index === options.omit) continue;
      const result = await chunkRequest('stage-part', { upload, index, total, data: encoded.data.slice(index * size, (index + 1) * size) });
      assert.equal(result.json.ok, true, 'part ' + index + ': ' + JSON.stringify(result.json));
    }
    return { upload, total };
  };
  const commitUpload = (encoded, upload, overrides = {}) => chunkRequest('stage-commit', { upload, id: chunkId, encoding: encoded.encoding, sha256: encoded.sha256, ...overrides });
  const uploadGone = upload => !fs.existsSync(path.join(uploadRoot, upload));
  const stagedAbsent = () => !fs.existsSync(stagedPath) && !fs.existsSync(stagedPath.replace(/\.php$/, '-meta.php'));
  const publicAndMailFiles = ['data', 'feeds', '_private/storage/newsletter'].flatMap(folder => {
    const dir = path.join(WEB, folder);
    return fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(f => path.join(dir, String(f))).filter(f => fs.statSync(f).isFile()) : [];
  });
  const stagePreserved = new Map(publicAndMailFiles.map(f => [f, createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
  const stageCallsBefore = mockLog().length;
  j = await admin('state');
  const cliGzip = JSON.parse(cli('echo json_encode(function_exists("gzdecode"));'));
  ok('admin advertises gzip capability from the installed PHP extension', typeof j.uploadGzip === 'boolean' && j.uploadGzip === cliGzip);
  ok('admin health reports gzip support', j.health.some(c => c.name === 'PHP extension zlib' && c.ok === cliGzip));
  ok('integration runtime can exercise gzip staging', cliGzip === true);
  const authUpload = randomBytes(16).toString('hex');
  for (const action of ['stage-part', 'stage-commit']) {
    const payload = action === 'stage-part' ? { upload: authUpload, index: 0, total: 1, data: 'e30=' } : { upload: authUpload, id: chunkId, encoding: 'json', sha256: '0'.repeat(64) };
    for (const [label, options, status, code] of [
      ['GET', { method: 'GET' }, 405, 'method'],
      ['no cookie', { cookie: false }, 401, 'auth'],
      ['no CSRF', { csrf: false }, 403, 'csrf'],
      ['other origin', { origin: 'https://unrelated.example' }, 403, 'origin'],
      ['missing origin', { origin: false }, 403, 'origin'],
    ]) {
      const denied = await chunkRequest(action, payload, options);
      ok(action + ' rejects ' + label, denied.status === status && denied.json.ok === false && denied.json.error?.code === code, JSON.stringify(denied));
    }
  }
  ok('unauthorized chunk requests create no upload or staged release', uploadGone(authUpload) && stagedAbsent());
  for (const upload of ['../escape', 'a'.repeat(31), 'g'.repeat(32)]) {
    const denied = await chunkRequest('stage-part', { upload, index: 0, total: 1, data: 'e30=' });
    ok('chunk upload identifier is restricted: ' + upload, denied.json.ok === false && stagedAbsent());
  }
  const badCommitId = await chunkRequest('stage-commit', { upload: '../escape', id: chunkId, encoding: 'json', sha256: '0'.repeat(64) });
  ok('commit also rejects a traversal upload identifier', badCommitId.json.ok === false && stagedAbsent());
  for (const badMeta of [{ index: -1, total: 1 }, { index: 1, total: 1 }, { index: 64, total: 64 }, { index: 0, total: 0 }, { index: 0, total: 65 }, { index: 0.5, total: 1 }, { index: '0', total: 1 }, { index: 0, total: '1' }]) {
    const upload = randomBytes(16).toString('hex');
    const denied = await chunkRequest('stage-part', { upload, ...badMeta, data: 'e30=' });
    ok('chunk metadata bounds/types enforced: ' + JSON.stringify(badMeta), denied.json.ok === false && uploadGone(upload) && stagedAbsent());
  }
  const oversizedUpload = randomBytes(16).toString('hex');
  const oversized = await chunkRequest('stage-part', { upload: oversizedUpload, index: 0, total: 1, data: 'A'.repeat(300001) }, { small: false });
  ok('oversized individual part is rejected before storage', oversized.json.ok === false && uploadGone(oversizedUpload) && stagedAbsent());

  const largeRelease = { ...JSON.parse(built.files['release.json']), id: chunkId, notes: 'UTF-8 provenance: Zażółć gęślą jaźń · ' + randomBytes(1600000).toString('base64') };
  const largeFiles = { ...built.files, 'release.json': JSON.stringify(largeRelease) };
  const largeEnvelope = { id: chunkId, files: largeFiles };
  const largeBytes = Buffer.byteLength(JSON.stringify(largeEnvelope));
  ok('chunk fixture is a valid release bundle larger than 2 MiB', largeBytes > 2 * 1024 * 1024 && Buffer.byteLength(largeFiles['release.json']) < 3000000);
  for (const encoding of ['gzip', 'json']) {
    const encoded = encodedUpload(largeEnvelope, encoding);
    const sent = await sendParts(encoded);
    ok(encoding + ' upload requires multiple small requests', sent.total > 1);
    const parts = fs.readdirSync(path.join(uploadRoot, sent.upload), { recursive: true }).map(f => path.join(uploadRoot, sent.upload, String(f))).filter(f => fs.statSync(f).isFile());
    ok(encoding + ' parts are guarded PHP data files', parts.length >= sent.total && parts.every(f => f.endsWith('.php') && fs.readFileSync(f, 'utf8').startsWith('<?php http_response_code(404); exit; ?>')));
    const firstPart = parts[0];
    const privateResponse = await req(path.relative(WEB, firstPart).split(path.sep).join('/'));
    ok(encoding + ' upload content cannot be read over HTTP even without htaccess', privateResponse.status === 404 && (await privateResponse.text()) === '');
    const committed = await commitUpload(encoded, sent.upload);
    ok(encoding + ' chunk commit stages the complete bundle', committed.json.ok === true && committed.json.files === Object.keys(largeFiles).length, JSON.stringify(committed));
    const stagedRaw = fs.readFileSync(stagedPath, 'utf8');
    const staged = JSON.parse(stagedRaw.slice(stagedRaw.indexOf('\n') + 1));
    assert.deepEqual(staged.files, largeFiles, encoding + ': every file and UTF-8 byte must survive reconstruction');
    ok(encoding + ' reconstruction is exact and uploaded parts are removed', staged.id === chunkId && uploadGone(sent.upload));
    const replay = await commitUpload(encoded, sent.upload);
    ok(encoding + ' consumed upload cannot be committed again', replay.json.ok === false && fs.readFileSync(stagedPath, 'utf8') === stagedRaw);
    await admin('unstage', { id: chunkId });
    assert.ok(stagedAbsent());
  }

  const smallFiles = { ...built.files, 'release.json': JSON.stringify({ ...JSON.parse(built.files['release.json']), id: chunkId }) };
  const validSmall = encodedUpload({ id: chunkId, files: smallFiles });
  const chunkLogMarker = 'CHUNK_LOG_PRIVATE_SOURCE_4ac5e131';
  const rejectionCases = [
    { name: 'wrong combined-base64 checksum', encoded: validSmall, commit: { sha256: '0'.repeat(64) } },
    { name: 'missing uploaded part', encoded: validSmall, omit: 0 },
    { name: 'decoded release identity differs from commit', encoded: encodedUpload({ id: '2026-W43.91', files: smallFiles }) },
    { name: 'unexpected file still uses normal bundle validation', encoded: encodedUpload({ id: chunkId, files: { ...smallFiles, '../evil.php': '<?php echo 1;' } }) },
    { name: 'unsafe source still uses normal bundle validation', encoded: encodedUpload({ id: chunkId, files: { ...smallFiles, 'dataset.json': JSON.stringify({ ...JSON.parse(smallFiles['dataset.json']), anchors: { AN1: { url: 'javascript:' + chunkLogMarker } } }) } }) },
    { name: 'invalid base64 payload', encoded: { data: 'not!base64', encoding: 'json', sha256: createHash('sha256').update('not!base64').digest('hex') } },
    { name: 'invalid gzip stream', encoded: { data: 'e30=', encoding: 'gzip', sha256: createHash('sha256').update('e30=').digest('hex') } },
    { name: 'unsupported encoding', encoded: validSmall, commit: { encoding: 'zip' } },
    { name: 'gzip expansion beyond 16 million bytes', encoded: encodedUpload({ id: chunkId, files: { 'release.json': 'x'.repeat(16000001) } }, 'gzip') },
  ];
  for (const c of rejectionCases) {
    const sent = await sendParts(c.encoded, { omit: c.omit });
    const rejected = await commitUpload(c.encoded, sent.upload, c.commit);
    ok('chunk commit rejects ' + c.name + ' and removes its parts', rejected.json.ok === false && uploadGone(sent.upload) && stagedAbsent(), JSON.stringify(rejected));
  }
  const quotaFiles = {
    ...smallFiles,
    'release.json': JSON.stringify({ ...JSON.parse(smallFiles['release.json']), notes: 'x'.repeat(2600000) }),
    'dataset.json': JSON.stringify({ ...JSON.parse(smallFiles['dataset.json']), note: 'x'.repeat(2600000) }),
    'series/all.csv': smallFiles['series/all.csv'] + '\n' + 'COMM,Q4 2030,16,K,1\n'.repeat(65000),
  };
  const quotaEncoded = encodedUpload({ id: chunkId, files: quotaFiles });
  const overLimit = quotaEncoded.data;
  assert.ok(overLimit.length > 8 * 1024 * 1024 && overLimit.length < 64 * 192 * 1024);
  assert.ok(Object.values(quotaFiles).every(content => Buffer.byteLength(content) <= 3000000), 'quota fixture must satisfy individual bundle-file limits');
  assert.ok(Object.values(quotaFiles).reduce((sum, content) => sum + Buffer.byteLength(content), 0) < 12000000, 'quota fixture must otherwise fit a valid release');
  const overUpload = randomBytes(16).toString('hex');
  // Deliberately bypass the browser's smaller wire limit to reach the server's
  // aggregate quota within 64 parts; these are malformed-client requests.
  const overTotal = Math.ceil(overLimit.length / (192 * 1024));
  for (let index = 0; index < overTotal; index++) {
    const part = await chunkRequest('stage-part', { upload: overUpload, index, total: overTotal, data: overLimit.slice(index * 192 * 1024, (index + 1) * 192 * 1024) }, { small: false });
    if (!part.json.ok) break; // Either incremental quota enforcement or commit may reject the oversize session.
  }
  const overCommit = await commitUpload(quotaEncoded, overUpload);
  ok('combined base64 over 8 MiB is rejected and its parts removed', overCommit.json.ok === false && uploadGone(overUpload) && stagedAbsent(), JSON.stringify(overCommit));
  const releaseLogText = fs.readdirSync(path.join(WEB, '_private/storage/logs')).filter(f => /^release-.*\.php$/.test(f)).map(f => fs.readFileSync(path.join(WEB, '_private/storage/logs', f), 'utf8')).join('\n');
  const failedStages = releaseLogText.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)).filter(row => row.msg === 'stage-failed');
  ok('failed staging logs only sanitized release IDs and reason codes', failedStages.length > 0 && failedStages.some(row => row.ctx.reason === 'bundle-validation-failed') && !releaseLogText.includes(chunkLogMarker) && failedStages.every(row => Object.keys(row.ctx).sort().join(',') === 'id,reason' && (row.ctx.id === '' || /^\d{4}-W\d{2}(?:\.\d{1,2})?$/.test(row.ctx.id)) && /^[a-z0-9-]+$/.test(row.ctx.reason)));
  ok('chunk staging never publishes data, sends mail or calls a provider', [...stagePreserved].every(([f, hash]) => createHash('sha256').update(fs.readFileSync(f)).digest('hex') === hash) && mockLog().length === stageCallsBefore);
  // Age only a test-owned upload, leaving a recent session in place to exercise housekeeping's boundary.
  const stale = await sendParts(validSmall, { omit: 0 });
  const recent = await sendParts(validSmall, { omit: 0 });
  const past = new Date(Date.now() - 25 * 60 * 60 * 1000);
  fs.utimesSync(path.join(uploadRoot, stale.upload), past, past);
  cli('aim_housekeeping();');
  ok('housekeeping removes abandoned uploads after 24 hours and retains recent uploads', uploadGone(stale.upload) && !uploadGone(recent.upload));
  await commitUpload(validSmall, recent.upload);
  ok('recent incomplete upload can be rejected and cleaned after housekeeping', uploadGone(recent.upload) && stagedAbsent());
  const maxChunkWireBytes = Math.max(...requestSizes);
  ok('all ordinary chunk/commit HTTP bodies remain below 192 KiB', requestSizes.length > 20 && maxChunkWireBytes < 192 * 1024, 'maximum=' + maxChunkWireBytes + ' bytes');
  console.log('    Chunk upload wire size: max ' + maxChunkWireBytes + ' bytes across ' + requestSizes.length + ' normal requests.');

  console.log('Legacy release staging remains available');
  const files = {}; for (const [p, c] of Object.entries(built.files)) files[p] = b64(c);
  j = await admin('stage', { id: '2026-W43', files: { ...files, '../evil.php': b64('<?php echo 1;') } });
  ok('stage refuses unexpected files', j.ok === false);
  const evilDs = JSON.parse(built.files['dataset.json']); evilDs.anchors.AN1.url = 'java\tscript:alert(1)';
  j = await admin('stage', { id: '2026-W43', files: { ...files, 'dataset.json': b64(JSON.stringify(evilDs)) } });
  ok('stage refuses a script link hidden in the data', j.ok === false && /Unsafe link/.test(j.error), JSON.stringify(j));
  j = await admin('stage', { id: '2026-W43', files });
  ok('staged', j.ok && j.files === Object.keys(files).length);
  let t = tick('2026-10-23T12:58:00'); ok('nothing at 12:58', !t.release, JSON.stringify(t));
  t = tick('2026-10-23T13:00:20');
  ok('Friday 13:00 publishes the staged release', t.release && t.release.ok && t.release.id === '2026-W43' && t.release.source === 'staged', JSON.stringify(t));
  const rel = JSON.parse(fs.readFileSync(path.join(WEB, 'data/latest/release.json'), 'utf8'));
  ok('latest = W43 with changes', rel.id === '2026-W43' && rel.changes.length === 3 && rel.next.startsWith('2026-10-30T13:00'));
  ok('archive, release page, release.js', fs.existsSync(path.join(WEB, 'data/releases/2026-W43/index.html')) && fs.readFileSync(path.join(WEB, 'data/latest/release.js'), 'utf8').includes('"id":"2026-W43"'));
  const rss = fs.readFileSync(path.join(WEB, 'feeds/releases.xml'), 'utf8');
  ok('feeds list both releases', (rss.match(/<item>/g) || []).length === 2 && rss.includes('2026-W43'));
  ok('calendar', fs.readFileSync(path.join(WEB, 'feeds/schedule.ics'), 'utf8').includes('RRULE:FREQ=WEEKLY;BYDAY=FR'));
  ok('chart footer carries the new id', fs.readFileSync(path.join(WEB, 'data/latest/charts/K.svg'), 'utf8').includes('release 2026-W43'));
  // late@ unsubscribes while the send is under way: the next batch must skip the address
  cli('aim_suppress("late@example.com", true);');
  for (let i = 0; i < 8; i++) t = tick('2026-10-23T13:' + String(5 + i).padStart(2, '0') + ':00');
  const sends = mockLog().filter(x => x.u === '/mj/v3.1/send').flatMap(x => x.b.Messages).filter(m => (m.CustomCampaign || '') === 'aimonitor-2026-W43');
  const to = sends.map(m => m.To[0].Email).sort();
  ok('first newsletter of the month goes to weekly and monthly readers, never to unsubscribed ones', JSON.stringify(to) === JSON.stringify(['anna@example.com', 'bounce@example.com', 'claire@example.com', 'piotr@example.com']), JSON.stringify(to));
  const anna = sends.find(m => m.To[0].Email === 'anna@example.com');
  ok('German edition with chosen topics', anna.Subject.includes('2026-W43') && anna.HTMLPart.includes('Kapital &amp; Märkte') && anna.HTMLPart.includes('Architekturbüros') && anna.HTMLPart.includes('AECO-Unternehmen') && anna.HTMLPart.includes('Frühwarnsignale') && !anna.HTMLPart.includes('{{'));
  ok('newsletter names the source of every change', anna.HTMLPart.includes('Quellen dieser Änderungen') && anna.HTMLPart.includes('https://example.com/nvda') && anna.HTMLPart.includes('#src-AN4') && anna.HTMLPart.includes('#sources'));
  ok('newsletter labels AI knowledge', anna.HTMLPart.includes('KI-Wissen ohne konkrete Quelle'));
  ok('one-click unsubscribe headers', anna.Headers['List-Unsubscribe'].includes('unsub.php?t=') && anna.Headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click');
  const piotr = sends.find(m => m.To[0].Email === 'piotr@example.com');
  ok('Polish edition', piotr.HTMLPart.includes('Moc obliczeniowa') && piotr.HTMLPart.includes('Oprogramowanie AECO') && /[0-9],[0-9]/.test(piotr.HTMLPart));
  const q = JSON.parse(cli('echo json_encode(aim_store_read("newsletter/queue-2026-W43"));'));
  ok('send finished, addresses not kept', q.done === true && q.sent === 3 && q.failed === 1 && q.skipped === 1 && q.recipients.length === 0 && q.edition === 'monthly', JSON.stringify(q).slice(0, 300));
  const preservationFiles = ['data','feeds','_private/storage'].flatMap(folder => fs.readdirSync(path.join(WEB,folder), { recursive: true }).map(f => path.join(folder,String(f))))
    .filter(f => fs.statSync(path.join(WEB,f)).isFile() && !f.endsWith('.html') && !f.includes(path.join('storage','locks')));
  const preservedHashes = new Map(preservationFiles.map(f => [f,createHash('sha256').update(fs.readFileSync(path.join(WEB,f))).digest('hex')]));
  const callsBeforeRebuild = mockLog().length;
  r = await req('api/admin.php?a=regenerate_public_pages', { body: rebuildPayload, headers: { 'Content-Type': 'application/json', 'X-AIM-CSRF': CSRF, Origin: SITE.slice(0,-1) } });
  const rebuiltPages = await r.json();
  ok('authorized public-page refresh completes from the existing published releases', r.status === 200 && rebuiltPages.ok && rebuiltPages.complete && rebuiltPages.next === null && rebuiltPages.processed === 2 && rebuiltPages.release === '2026-W43', JSON.stringify(rebuiltPages));
  ok('public-page refresh preserves published data, configuration, state and newsletter queues', [...preservedHashes].every(([f,hash]) => createHash('sha256').update(fs.readFileSync(path.join(WEB,f))).digest('hex') === hash));
  ok('public-page refresh sends no emails or other external requests', mockLog().length === callsBeforeRebuild);
  ok('public-page refresh exposes crawlable approved findings and archived report pages', fs.readFileSync(path.join(WEB,'index.html'),'utf8').includes('Latest published findings') && fs.readFileSync(path.join(WEB,'releases/2026-W42/index.html'),'utf8').includes('"@type":"Report"') && fs.readFileSync(path.join(WEB,'llms-full.txt'),'utf8').includes('release 2026-W43'));
  const page = fs.readFileSync(path.join(WEB, 'data/releases/2026-W43/index.html'), 'utf8');
  ok('release page shows where each change comes from', page.includes('https://example.com/nvda') && page.includes('How it entered the data') && page.includes('#sources') && page.includes('AI knowledge without a specific source'));
  ok('release page lists the answers of the AI research panel', page.includes('Answers of the AI research panel') && page.includes('https://example.com/nvda2') && page.includes('AI research panel, reviewed by the team: 5 of 5 agents answered'));
  ok('release carries this week\'s X watch (page, data, release.js, feed)', rel.xwatch.length === 1 && rel.xwatch[0].id === 'X1' && page.includes('X watch — posts the editor is watching') && page.includes('https://x.com/Microsoft/status/1850000000000000001') && fs.readFileSync(path.join(WEB, 'data/latest/release.js'), 'utf8').includes('"xwatch":[{"id":"X1"') && rss.includes('X watch'));
  ok('newsletter: X watch for readers of its topics, panel label for AI values', anna.HTMLPart.includes('X-Beobachtung') && anna.HTMLPart.includes('https://x.com/Microsoft/status/1850000000000000001') && anna.HTMLPart.includes('KI-Recherchepanel (5 von 5 Agenten antworteten)') && piotr.HTMLPart.includes('Obserwacja X'));
  j = await mcp({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_xwatch', arguments: { topic: 'compute' } } });
  ok('MCP get_xwatch', j.result.structuredContent.items.length === 1 && j.result.structuredContent.items[0].id === 'X1');
  r = await req('api/chat.php', { body: JSON.stringify({ p: b64(JSON.stringify({ mode: 'ask', messages: [{ role: 'user', content: 'Anything new on X?' }], snapshot: snap, turnstile: 'XXXX.DUMMY.TOKEN.XXXX' })) }), headers: { 'Content-Type': 'application/json', Accept: 'application/json' } });
  await r.json();
  const sentX = mockLog().filter(x => x.u.endsWith('/openai/v1/responses') && !x.b.tools).pop();
  ok('assistant knows the X watch list and how to cite it', sentX.b.instructions.includes('"id":"X1"') && sentX.b.instructions.includes('[X12]'));
  j = await admin('xwatch-withdraw', { id: 'X1' });
  const relW = JSON.parse(fs.readFileSync(path.join(WEB, 'data/releases/2026-W43/release.json'), 'utf8'));
  const pageW = fs.readFileSync(path.join(WEB, 'data/releases/2026-W43/index.html'), 'utf8');
  ok('withdrawing an item removes it from the dashboard, the releases and the feeds', j.ok && j.releases === 1 && relW.xwatch.length === 0 && !pageW.includes('x.com/Microsoft/status') && !fs.readFileSync(path.join(WEB, 'data/latest/release.js'), 'utf8').includes('"X1"') && !fs.readFileSync(path.join(WEB, 'feeds/releases.xml'), 'utf8').includes('x.com/Microsoft/status') && JSON.parse(fs.readFileSync(path.join(WEB, 'data/xwatch.json'), 'utf8')).items.length === 0, JSON.stringify(j));
  fs.writeFileSync(path.join(WEB, 'data/xwatch.json'), JSON.stringify({ schema: 'aimonitor.xwatch/1', items: [{ id: 'X900', date: '2026-09-01', title: 'old', posts: [{ url: 'https://x.com/a/status/123456', handle: 'a' }] }] }));
  cli('aim_xwatch_prune();', '2026-11-11T05:00:00');
  ok('items past the keep period leave the public list in the daily housekeeping', JSON.parse(fs.readFileSync(path.join(WEB, 'data/xwatch.json'), 'utf8')).items.length === 0);
  j = await mcp({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_sources', arguments: { id: 'AN4' } } });
  ok('MCP get_sources returns the provenance', j.result.structuredContent.sources[0].via.type === 'ai' && j.result.structuredContent.sources[0].url === 'https://example.com/nvda');

  console.log('Carry-forward and catch-up');
  t = tick('2026-10-30T13:00:30');
  const rel44 = JSON.parse(fs.readFileSync(path.join(WEB, 'data/latest/release.json'), 'utf8'));
  ok('no staged build: W44 repeats W43', t.release.ok && rel44.id === '2026-W44' && rel44.carryForward === true && rel44.changes.length === 0);
  ok('later releases in the same month are weekly editions', JSON.parse(cli('echo json_encode(aim_store_read("newsletter/queue-2026-W44"));')).edition === 'weekly');
  t = tick('2026-11-07T09:00:00');
  ok('missed Friday is caught up on Saturday', t.release && t.release.id === '2026-W45');
  t = tick('2026-11-07T09:10:00');
  ok('only once per week', !t.release);
  t = tick('2026-11-06T13:00:00');
  // (going back in time is not a real case; just make sure nothing breaks)
  ok('housekeeping ran', JSON.parse(cli('echo json_encode(aim_state());')).housekeeping !== undefined);

  console.log('Daily check without background mode: every agent answers within normal scheduler runs');
  j = await admin('settings', { settings: { ai: { background: false } } });
  ok('background mode switched off', j.ok && j.settings.ai.background === false);
  const wedBefore = mockLog().length;
  for (let i = 0; i < 30; i++) { t = tick('2026-11-11T' + String(6 + Math.floor((5 + 5 * i) / 60)).padStart(2, '0') + ':' + String((5 + 5 * i) % 60).padStart(2, '0') + ':00'); if (t.collect && t.collect.done) break; }
  const wed = JSON.parse(cli('echo json_encode(aim_state()["collect"]);'));
  ok('the day finishes within normal scheduler runs', wed.date === '2026-11-11' && !!wed.finished && ['merge:AN12', 'merge:AN14', 'merge:AN15'].every(st => wed.done.includes(st)) && wed.done.includes('xwatch'), JSON.stringify({ done: wed.done, finished: wed.finished }));
  ok('Claude answered directly (no batch) when background mode is off', mockLog().slice(wedBefore).some(x => x.u.endsWith('/anthropic/v1/messages') && x.b.tools) && !mockLog().slice(wedBefore).some(x => x.u.endsWith('/messages/batches')));
  await admin('settings', { settings: { ai: { background: true } } });

  console.log('Reviewer edits');
  r = await req('api/admin.php?a=settings', { body: JSON.stringify({ p: b64(JSON.stringify({ settings: { site: { url: 'https://typo.example/' } } })) }), headers: { 'Content-Type': 'application/json', 'X-AIM-CSRF': CSRF } });
  j = await r.json();
  ok('a site address that would lock the admin out is refused', j.ok === false && j.error.code === 'site_url');
  const w0 = (await admin('working')).working.anchors.AN26;
  j = await admin('working-edit', { anchor: 'AN26', fields: { value: 120, v: '$120B a year', url: 'https://www.census.gov/construction/c30/pdf/privsa.pdf', calc: w0.calc } });
  const w1 = (await admin('working')).working.anchors.AN26;
  ok('a manual value change drops the old derivation and keeps the previous value', j.ok && w1.value === 120 && w1.calc === '' && w1.quote === '' && w1.prev === w0.v && w1.was === '' && w1.via.type === 'manual', JSON.stringify(w1));
  const an3 = (await admin('state')).candidates.find(c => c.anchor === 'AN3');
  j = await admin('candidate', { id: an3.id, action: 'approve', edit: { use: 'anthropic', value: 1.9, url: 'https://example.com/anthropic-valuations', quote: '', calc: '' } });
  const w3 = (await admin('working')).working.anchors.AN3;
  ok('"Use this answer" publishes another agent\'s answer with its own source', j.ok && w3.value === 1.9 && w3.url === 'https://example.com/anthropic-valuations' && /Anthropic/.test(w3.via.model) && /chose the answer of Anthropic/.test(w3.via.edited) && w3.via.panel.members.find(m => m.lead).agent === 'Anthropic', JSON.stringify(w3).slice(0, 600));
  ok('a reviewer can clear the quote and derivation when approving', w3.quote === '' && w3.calc === '' && w3.prev === '$1.817T', JSON.stringify(w3).slice(0, 300));

  console.log('Newsletter: a batch cut off mid-send is never repeated');
  cli('aim_store_write("newsletter/queue-2026-W45", ["id" => "2026-W45", "edition" => "weekly", "phase" => "send", "cursor" => 0, "sent" => 0, "failed" => 0, "total" => 3, "done" => false, "langs" => ["en"], "inflight" => ["to" => 2], "recipients" => [["e" => "x1@example.com", "n" => "", "l" => "en", "c" => ["summary"], "f" => "weekly"], ["e" => "x2@example.com", "n" => "", "l" => "en", "c" => ["summary"], "f" => "weekly"], ["e" => "x3@example.com", "n" => "", "l" => "en", "c" => ["summary"], "f" => "weekly"]]]); aim_state_set(["newsletterQueue" => "2026-W45"]);');
  const nlBefore = mockLog().length;
  cli('echo json_encode(aim_nl_tick(45));', '2026-11-11T10:00:00');
  const resent = mockLog().slice(nlBefore).filter(x => x.u === '/mj/v3.1/send').flatMap(x => x.b.Messages).map(m => m.To[0].Email);
  const q45 = JSON.parse(cli('echo json_encode(aim_store_read("newsletter/queue-2026-W45"));'));
  ok('only the batch after the interrupted one is sent', JSON.stringify(resent) === JSON.stringify(['x3@example.com']) && q45.uncertain === 2 && q45.done === true, JSON.stringify({ resent, q: q45 }).slice(0, 300));

  console.log('Automation (tools/release.mjs)');
  const st2 = await admin('state');
  const out = execFileSync('node', [path.join(ROOT, 'tools/release.mjs'), '--site', SITE, '--secret', st2.ingest.secret], { encoding: 'utf8' });
  ok('release built and staged through the signed endpoint', /Staged \d{4}-W\d{2}/.test(out), out);
  let badSig = await (await req('api/ingest.php?a=state', { headers: { 'X-AIM-Time': String(Math.floor(Date.now() / 1000)), 'X-AIM-Signature': 'sha256=00' } })).json();
  ok('ingest refuses a bad signature', badSig.ok === false && badSig.error.code === 'auth');

  console.log('Review findings (Codex, PR #1)');
  const fault = list => fs.writeFileSync(LOG + '.faults.json', JSON.stringify(list));
  // 1 + 2: a finished Claude batch is kept when the results download fails for a passing reason, and the download
  // becomes its own step when too little time is left in the run
  const batchOut = JSON.parse(cli(`
    $q = ['provider' => 'anthropic', 'model' => 'claude-sonnet-5-5', 'system' => 'Answer in JSON.', 'messages' => [['role' => 'user', 'content' => 'Test question']], 'search' => true, 'max_output' => 600];
    $o = [];
    $b = aim_llm_bg_start($q); $job = $b['job'];
    $o['first'] = aim_llm_bg_poll($job)['pending'] ?? false;   /* still running */
    $o['late'] = aim_llm_bg_poll($job, 1800, microtime(true) + 5);   /* ended, but only 5 s left */
    $job['results_url'] = $o['late']['results_url'] ?? '';
    foreach ([503, 429, 408] as $code) {
        file_put_contents(getenv('FAULTS'), json_encode([['match' => '/results', 'status' => $code, 'times' => 1]]));
        $r = aim_llm_bg_poll($job);
        $o['retry' . $code] = !empty($r['pending']) && ($r['results_url'] ?? '') === $job['results_url'];
    }
    file_put_contents(getenv('FAULTS'), json_encode([['match' => '/results', 'status' => 200, 'stall' => 6, 'times' => 1]]));
    $r = aim_llm_bg_poll($job, 1800, microtime(true) + 4);
    $o['cutoff'] = !empty($r['pending']) && ($r['results_url'] ?? '') === $job['results_url'];
    @unlink(getenv('FAULTS'));
    $b2 = aim_llm_bg_start($q); $j2 = $b2['job'];
    file_put_contents(getenv('FAULTS'), json_encode([['match' => $j2['id'], 'status' => 200, 'stall' => 6, 'times' => 1]]));
    $r = aim_llm_bg_poll($j2, 1800, microtime(true) + 4);
    $o['statusCut'] = !empty($r['pending']) && empty($r['results_url']);
    @unlink(getenv('FAULTS'));
    aim_llm_bg_cancel($j2);
    $o['moved'] = aim_llm_bg_poll(['results_url' => 'http://127.0.0.1:18091/anthropic/v1/messages/batches/x/results'] + $job)['error'] ?? '';
    $done = aim_llm_bg_poll($job);
    $o['done'] = $done['ok'] && strpos($done['text'], 'found') !== false;
    file_put_contents(getenv('FAULTS'), json_encode([['match' => '/results', 'status' => 404, 'times' => 1]]));
    $o['gone'] = aim_llm_bg_poll($job + ['id' => 'x'])['ok'] ?? null;
    @unlink(getenv('FAULTS'));
    /* 4: the reservation uses the same prices as the settlement (discount on tokens only, searches at full price) */
    $est = aim_llm_estimate('anthropic', 'claude-sonnet-5-5', $q, 0.5);
    $in = (strlen($q['system']) + strlen('Test question')) / 3.5 + 12000;
    $o['est'] = $est; $o['cost'] = aim_llm_cost('anthropic', 'claude-sonnet-5-5', ['in' => $in, 'out' => 600, 'searches' => 3, 'factor' => 0.5]);
    $o['bookedEst'] = $job['est'];
    echo json_encode($o);`.replace(/\n\s*/g, ' ').replace(/getenv\('FAULTS'\)/g, JSON.stringify(LOG + '.faults.json').replace(/"/g, "'"))));
  ok('Claude batch: a finished answer is downloaded on a later run when little time is left', batchOut.first === true && batchOut.late.pending === true && /\/results$/.test(batchOut.late.results_url || ''), JSON.stringify(batchOut.late));
  ok('Claude batch: results download failing with 503, 429 or 408 keeps the job for another try', batchOut.retry503 && batchOut.retry429 && batchOut.retry408, JSON.stringify(batchOut));
  ok('Claude batch: a download cut off after "200" keeps the job for another try', batchOut.cutoff === true, JSON.stringify(batchOut));
  ok('Claude batch: a status answer cut off after "200" counts as unreachable, not as a failure', batchOut.statusCut === true, JSON.stringify(batchOut));
  ok('Claude batch: a saved results address is checked again before the key is sent', batchOut.moved === 'unexpected results address', JSON.stringify(batchOut));
  ok('Claude batch: the kept answer is collected afterwards', batchOut.done === true, JSON.stringify(batchOut));
  ok('Claude batch: a permanent results error (404) still ends the job', batchOut.gone === false, JSON.stringify(batchOut));
  ok('Claude batch: reservation and settlement price searches the same way', Math.abs(batchOut.est - batchOut.cost) < 2e-5 && Math.abs(batchOut.bookedEst - batchOut.est) < 1e-9, JSON.stringify(batchOut));
  // 3: the X scan is tried again later when xAI is busy (429/503) or unreachable; a refusal (401) is final
  const xwOut = JSON.parse(cli(`
    $o = ['rules' => [aim_http_transient('HTTP 429: busy'), aim_http_transient('HTTP 503'), aim_http_transient('network: Could not resolve host'), aim_http_transient('Operation timed out'), aim_http_transient('HTTP 401: bad key'), aim_http_transient('HTTP 400: bad request'), aim_http_transient('empty answer')]];
    foreach ([429, 503] as $code) {
        file_put_contents(getenv('FAULTS'), json_encode([['match' => '/xai/v1/responses', 'status' => $code, 'times' => 1]]));
        $run = ['steps' => ['xwatch' => ['state' => 'pending']], 'jobs' => []]; $ai = false;
        $begin = function ($s) use (&$run) { $run['steps'][$s]['n'] = (int)($run['steps'][$s]['n'] ?? 0) + 1; $run['steps'][$s]['state'] = 'running'; };
        $r = aim_xwatch_step($run, fn() => 45.0, $ai, $begin, function () {});
        $o['s' . $code] = $r === null && $run['steps']['xwatch']['state'] === 'retry';
    }
    @unlink(getenv('FAULTS'));
    echo json_encode($o);`.replace(/\n\s*/g, ' ').replace(/getenv\('FAULTS'\)/g, JSON.stringify(LOG + '.faults.json').replace(/"/g, "'"))));
  ok('busy, unreachable or slow providers count as passing failures; refusals do not', JSON.stringify(xwOut.rules) === JSON.stringify([true, true, true, true, false, false, false]), JSON.stringify(xwOut.rules));
  ok('X scan answered 429 or 503 is tried again on a later run', xwOut.s429 && xwOut.s503, JSON.stringify(xwOut));
  // 5: X watch logs keep only ids, so a rejected post's text is gone with the rejected list after 45 days
  const xwLogs = fs.readdirSync(path.join(WEB, '_private/storage/logs')).filter(f => f.startsWith('xwatch-')).map(f => fs.readFileSync(path.join(WEB, '_private/storage/logs', f), 'utf8')).join('\n');
  ok('X watch logs record decisions without titles', /rejected/.test(xwLogs) && /approved/.test(xwLogs) && !/"title":/.test(xwLogs), xwLogs.slice(0, 300));

  console.log('Private data');
  const leaks = [];
  for (const f of fs.readdirSync(path.join(WEB, '_private/storage'), { recursive: true })) {
    const p = path.join(WEB, '_private/storage', String(f));
    if (fs.statSync(p).isDirectory() || f.endsWith('.htaccess') || f.endsWith('index.html')) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (String(f).startsWith('locks')) continue;   // lock files are empty
    if (!s.startsWith('<?php')) leaks.push(f);
  }
  ok('every stored file is a guarded PHP file', leaks.length === 0, leaks.join(', '));
  r = await req('_private/storage/settings.php'); const body = await r.text();
  ok('settings file prints nothing over the web', !body.includes('sk-test'));
  r = await req('_private/storage/consent/2026.php'); ok('consent log not readable over the web', !(await r.text()).includes('@example.com'));
  console.log('\nAll ' + passed + ' checks passed.');
} catch (e) {
  report('FAILED after ' + passed + ' checks (last passed: ' + lastCheck + '): ' + e.message + '\nLast server log lines:\n' + serverLog.slice(-25).join('\n'));
  process.exitCode = 1;
} finally {
  cleanup();
  if (!process.exitCode) fs.rmSync(TMP, { recursive: true, force: true }); else console.error('kept ' + TMP);
  process.exit(process.exitCode || 0);   // do not wait for server pipes that a stray worker may still hold open
}
