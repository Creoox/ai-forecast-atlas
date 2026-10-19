/* Visitor-chat identity, links and common questions. No build or provider request required.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createEngine } from '../engine/engine.mjs';
import { buildChatGuide, selectChatGuide } from '../web/src/chat-guide.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const operator = JSON.parse(read('config/operator.json'));
const methods = JSON.parse(read('config/methods.json'));
const engine = createEngine();
const guide = buildChatGuide(engine, methods, operator.site);
const PHP = process.env.PHP_BINARY || 'php';
const phpAvailable = spawnSync(PHP, ['-v'], { encoding: 'utf8' }).status === 0;
const phpTest = (name, run) => test(name, { skip: !phpAvailable && 'PHP CLI unavailable; set PHP_BINARY to run the PHP context checks' }, run);
const aboutPrefix = 'About this site and its operator — authoritative public configuration (JSON): ';
const parseAbout = prompt => JSON.parse(prompt.split('\n').find(line => line.startsWith(aboutPrefix)).slice(aboutPrefix.length));

// Load the real widget without starting its DOM boot. The narrow seam exposes private prompt helpers to this test only.
function widget(runtimeAbout) {
  const window = { AICX_UI: { engine, metrics: { K: { n: 'Big-4 hyperscaler capex' } }, state: { key: 'COMM', name: 'The Great Commoditization', quarter: 'Q4 2030' }, snapshot: () => ({ scenario: { key: 'COMM' }, quarter: 'Q4 2030' }) },
    AIMONITOR_CHAT_GUIDE: guide, AIMONITOR_selectChatGuide: selectChatGuide, AIMONITOR_METHODS: methods,
    AIMONITOR_SITE: runtimeAbout ? { chatAbout: runtimeAbout } : {} };
  const context = vm.createContext({ window, document: { readyState: 'loading', addEventListener() {} }, URL, console });
  vm.runInContext(read('web/src/site.js').replace(/\}\)\(\);\s*$/, 'window.__chatTest = { rulesText, suggestions, CHAT };\n})();'), context);
  return window;
}

function php(code, settings = {}, op = operator) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aim-chat-about-'));
  try {
    for (const dir of ['_private/config', '_private/storage', 'assets', 'data/latest']) fs.mkdirSync(path.join(tmp, dir), { recursive: true });
    for (const name of ['i18n', 'newsletter']) fs.copyFileSync(path.join(ROOT, 'config', name + '.json'), path.join(tmp, '_private/config', name + '.json'));
    fs.writeFileSync(path.join(tmp, '_private/config/operator.json'), JSON.stringify(op));
    fs.writeFileSync(path.join(tmp, 'assets/chat-guide.json'), JSON.stringify(guide));
    fs.writeFileSync(path.join(tmp, 'data/latest/release.json'), JSON.stringify({ id: '2026-W42', summary: 'Base release' }));
    fs.writeFileSync(path.join(tmp, 'data/latest/dataset.json'), JSON.stringify({ anchors: { AN1: { name: 'Big-4 capex', v: '$900B/yr', period: 'Q4 2026', url: 'https://example.com/source' } } }));
    fs.writeFileSync(path.join(tmp, 'data/latest/metrics.json'), JSON.stringify({ metrics: { K: { name: 'Big-4 capex', unit: '$B/yr' } } }));
    const source = '$input = json_decode(stream_get_contents(STDIN), true); define("AIM_ROOT", $input["tmp"]); define("AIM_PRIVATE", AIM_ROOT . "/_private"); '
      + 'foreach (["util", "settings", "i18n", "llm", "chat", "subscriptions", "newsletter"] as $lib) require $input["root"] . "/server/_private/lib/" . $lib . ".php"; '
      + 'aim_store_write("settings", $input["settings"]); ' + code;
    const result = spawnSync(PHP, ['-d', 'display_errors=stderr', '-d', 'error_reporting=-1', '-r', source], { input: JSON.stringify({ root: ROOT, tmp, settings }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, '', 'PHP diagnostics: ' + result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    assert.equal(path.dirname(tmp), path.resolve(os.tmpdir()));
    assert.ok(path.basename(tmp).startsWith('aim-chat-about-'));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const questions = [
  ['How can I contact Creoox?', 'panel:about', /contact@creoox\.com/],
  ['What is the website address of Creoox?', 'panel:about', /https:\/\/creoox\.com/],
  ['Who made this site?', 'panel:about', /Triesen/],
  ['What licence covers the code and data?', 'panel:about', /Business Source License 1\.1/],
  ['How should I cite this?', 'panel:about', /name the release used/],
  ['How do I subscribe?', 'panel:subscribe', /confirm the email/],
  ['How do I unsubscribe?', 'panel:subscribe', /link is personal/],
  ['Is this a forecast?', null, /scenario model, not a forecast/],
  ['Where does the data come from?', null, /evidence ledger/i],
  ['What does the chat cost me?', 'panel:chat-ask', /does not charge visitors/],
];

test('all basic visitor questions and the initial suggestion receive authoritative identity in preview chat', () => {
  const w = widget();
  for (const [question, id, expected] of questions) {
    w.__chatTest.CHAT.turns.ask = [{ role: 'user', content: question }];
    const prompt = w.__chatTest.rulesText();
    assert.deepEqual(parseAbout(prompt), guide.about, question);
    assert.match(prompt, expected, question);
    if (id) assert.ok(selectChatGuide(guide, question).details.some(d => d.id === id), question);
  }
  assert.ok(w.__chatTest.suggestions().includes('Who is behind AI Forecast Atlas?'));
  assert.equal(guide.about.operator.registeredAddress, operator.site.address);
  assert.equal(guide.about.operator.teamLocation, 'Lausanne, Switzerland');
  assert.equal(guide.about.operator.phone, '+41 76 278 5998');
});

test('contact aliases and Bubble Burst/Broadcast help remain available', () => {
  for (const question of ['What is the contact to Creoox?', 'How can I contact you?', 'Who is behind this?', 'Can I get an email to the team?', 'Company phone address imprint privacy GitHub source code partnership press hire']) {
    assert.ok(selectChatGuide(guide, question).details.some(d => d.id === 'panel:about'), question);
  }
  assert.ok(selectChatGuide(guide, 'What is Bubble Burst?').details.some(d => d.id === 'scenario:BUST'));
  assert.ok(selectChatGuide(guide, 'How do I use Broadcast?').details.some(d => d.id === 'panel:broadcast'));
  assert.ok(selectChatGuide(guide, 'How do I exit it?', '', 'How do I use Broadcast?').details.some(d => d.id === 'panel:broadcast'));
});

test('real chat renderer links only trusted http(s) addresses and keeps evidence citations', () => {
  const render = widget().AICX_SITE.renderMarkdown;
  for (const url of Object.values(guide.about.links)) assert.match(render('[Open](' + url + ')'), /<a href="https?:\/\//, url);
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://creoox.com.evil.example', 'https://creoox.com@evil.example', 'https://creoox.com/unverified', 'https://evil.example', 'https://creoox.com/"onclick="alert(1)']) {
    assert.doesNotMatch(render('[Untrusted](' + url + ')'), /<a\b|<script\b|<img\b| onclick=/, url);
  }
  const unsafeLabel = render('[<img src=x onerror=alert(1)>](https://creoox.com)');
  assert.match(unsafeLabel, /&lt;img/); assert.doesNotMatch(unsafeLabel, /<img/);
  const citations = render('$900B [AN1]; a model path [M:K]; background [AI]; signal [X12].');
  assert.match(citations, /data-prov="an:AN1"/);
  assert.match(citations, /data-prov="meth:K"/);
  assert.match(citations, /class="cite ai"/);
  assert.match(citations, /class="cite x"/);
});

test('runtime operator links replace the preview allowlist and suggestion mode includes identity', () => {
  const about = buildChatGuide(engine, methods, { company: 'Example operator', company_url: 'https://example.org', url: 'https://example.org/atlas/' }).about;
  const w = widget(about);
  assert.match(w.AICX_SITE.renderMarkdown('[Company](https://example.org)'), /<a href=/);
  assert.doesNotMatch(w.AICX_SITE.renderMarkdown('[Old operator](https://creoox.com)'), /<a href=/);
  w.__chatTest.CHAT.mode = 'suggest';
  assert.deepEqual(parseAbout(w.__chatTest.rulesText()), about);
});

phpTest('PHP requests carry the same About facts for ten basic questions, with JS/PHP selection parity', () => {
  const queries = [...questions.map(q => q[0]), 'What is Bubble Burst?', 'How do I use Broadcast?'];
  const code = '$out = []; foreach (' + JSON.stringify(queries) + ' as $q) $out[] = ["guide" => aim_chat_guide($q), "prompt" => aim_chat_system("ask", ["scenario" => ["key" => "COMM"]], [], [["role" => "user", "content" => $q]])]; echo aim_json_encode($out);';
  const contexts = php(code);
  for (let i = 0; i < queries.length; i++) {
    assert.deepEqual(parseAbout(contexts[i].prompt), guide.about, queries[i]);
    assert.deepEqual(contexts[i].guide, selectChatGuide(guide, queries[i]), queries[i]);
    assert.doesNotMatch(contexts[i].prompt, /never write web addresses yourself|never write URLs/);
    assert.match(contexts[i].prompt, /only exception for writing web addresses/);
    if (i < questions.length) assert.match(contexts[i].prompt, questions[i][2], queries[i]);
  }
});

phpTest('live public context follows settings, excludes secrets and cannot be replaced by a visitor snapshot', () => {
  const result = php('echo aim_json_encode(["public" => aim_public_config(), "prompt" => aim_chat_system("suggest", ["operator" => ["email" => "fake@evil.example"]], [])]);', {
    site: { company: 'Example Ltd', company_url: 'https://example.org', url: 'https://example.org/atlas/', email: 'team@example.org', address: 'Example address', team_location: 'Example team location' },
    secret: 'NEVER-PUBLISH-SECRET', ai: { providers: { openai: { key: 'NEVER-PUBLISH-KEY' } } }, admin: { password_hash: 'NEVER-PUBLISH-HASH' },
  });
  const about = parseAbout(result.prompt);
  assert.equal(about.operator.name, 'Example Ltd');
  assert.equal(about.operator.email, 'team@example.org');
  assert.equal(about.links.imprint, 'https://example.org/atlas/imprint.php');
  assert.deepEqual(result.public.chatAbout, about);
  assert.doesNotMatch(JSON.stringify(result), /NEVER-PUBLISH/);
});

phpTest('legacy operator config gains only known Creoox facts; a renamed operator and explicit blanks keep control', () => {
  const old = structuredClone(operator);
  for (const key of ['company_url', 'company_logo_url', 'linkedin_url', 'team_location', 'xeokit_url']) delete old.site[key];
  assert.deepEqual(php('echo aim_json_encode(aim_chat_about());', {}, old), guide.about);
  const legacySite = php('echo aim_json_encode(aim_settings()["site"]);', {}, old);
  assert.equal(legacySite.company_logo_url, operator.site.company_logo_url);
  assert.equal(legacySite.linkedin_url, operator.site.linkedin_url);
  const changedSite = php('aim_apply_settings_update(["site" => ["company" => "Other operator"]]); echo aim_json_encode(aim_settings()["site"]);', {}, old);
  assert.equal(changedSite.company_logo_url, '');
  assert.equal(changedSite.linkedin_url, '');
  const customSaved = php('echo aim_json_encode(aim_settings()["site"]);', { site: { company: 'Other operator' } }, old);
  assert.equal(customSaved.company_logo_url, '');
  assert.equal(customSaved.linkedin_url, '');
  const blankMetadata = php('echo aim_json_encode(aim_settings()["site"]);', { site: { company_logo_url: '', linkedin_url: '' } }, old);
  assert.equal(blankMetadata.company_logo_url, '');
  assert.equal(blankMetadata.linkedin_url, '');
  const renamed = php('aim_apply_settings_update(["site" => ["company" => "Other operator"]]); echo aim_json_encode(aim_chat_about());', {}, old);
  assert.equal(renamed.operator.teamLocation, '');
  assert.equal(renamed.links.company, undefined);
  assert.equal(renamed.links.xeokit, undefined);
  const cleared = php('echo aim_json_encode(aim_chat_about());', { site: { company_url: '', team_location: '', xeokit_url: '' } }, old);
  assert.equal(cleared.links.company, undefined);
  assert.equal(cleared.operator.teamLocation, '');
});

phpTest('non-web and credential-bearing operator links are omitted in both PHP and preview contexts', () => {
  const site = { ...operator.site, url: 'javascript:alert(1)', company_url: 'https://user:password@example.com', repo_url: 'data:text/html,bad', xeokit_url: 'https://example.com\\@evil.example' };
  const fromPhp = php('echo aim_json_encode(aim_chat_about());', { site });
  assert.deepEqual(fromPhp, buildChatGuide(engine, methods, site).about);
  assert.deepEqual(Object.keys(fromPhp.links), ['dataLicence']);
});

phpTest('visitor provider and fallback still reject DeepSeek', () => {
  const result = php('echo aim_json_encode([aim_role("chat"), aim_spec("deepseek:deepseek-v4-pro"), aim_spec("openrouter:deepseek/model")]);', { ai: { providers: { deepseek: { key: 'test' }, openrouter: { key: 'test' } }, roles: { chat: { provider: 'deepseek', model: 'deepseek-v4-pro' } } } });
  assert.deepEqual(result, [null, null, null]);
});

phpTest('newsletter HTML and plain text show escaped operator contact without sending mail', () => {
  const result = php('echo aim_json_encode(aim_nl_compose(["id" => "2026-W42", "publishedAt" => "2026-10-18T12:00:00+02:00", "base" => true, "changes" => []], "en", [], "weekly"));', { site: { company: 'Example <img src=x onerror=alert(1)>', email: 'contact@example.org', phone: '+41 00 000 0000' } });
  assert.match(result[1], /contact@example\.org/);
  assert.match(result[2], /contact@example\.org/);
  assert.match(result[1], /Example &lt;img/);
  assert.doesNotMatch(result[1], /<img src=x/);
  assert.match(result[1], /\{\{UNSUB\}\}/);
});
