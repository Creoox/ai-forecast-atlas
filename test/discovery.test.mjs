/* Generated public discovery pages: publication gate, provenance, escaping and safe rebuilds.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { createEngine } from '../engine/engine.mjs';
import { buildRelease, datasetFromEngine, fmt } from '../web/src/release-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portable = path.resolve(ROOT, '../runtime/php-8.0.30/php.exe');
const PHP = process.env.PHP_BINARY || (fs.existsSync(portable) ? portable : 'php');
const BASE = 'https://atlas.example.test/';
const write = (name, contents) => { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, contents); };
const digest = contents => crypto.createHash('sha256').update(contents).digest('hex');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-discovery-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['i18n', 'operator', 'newsletter', 'sources']) write(path.join(dir, '_private/config', name + '.json'), fs.readFileSync(path.join(ROOT, 'config', name + '.json')));
  write(path.join(dir, 'assets/methods.json'), fs.readFileSync(path.join(ROOT, 'config/methods.json')));
  write(path.join(dir, 'index.html'), '<!doctype html><html><head><!-- AIM:METADATA:START --><!-- AIM:METADATA:END --></head><body><main><h1>AI Forecast Atlas</h1><!-- AIM:SUMMARY:START --><p>Placeholder</p><!-- AIM:SUMMARY:END --></main></body></html>');
  write(path.join(dir, 'privacy.php'), '<?php // public privacy');
  write(path.join(dir, 'imprint.php'), '<?php // public imprint');
  const ds = datasetFromEngine(createEngine(), '2026-10-17');
  ds.anchors.AN1.quote = 'Source quote: </script><script>alert("injected")</script> & special <b>text</b>';
  ds.anchors.AN1.reviewed = '2026-10-19';
  const built = buildRelease({ createEngine, dataset: ds, previous: null, id: '2026-W42', base: true, siteUrl: BASE });
  const release = JSON.parse(built.files['release.json']);
  release.publishedAt = '2026-10-17T13:00:00+02:00';
  release.xwatch = [{ id: 'withdraw-me', title: 'WITHDRAW_THIS_SIGNAL', summary: 'A separately approved signal.', date: '2026-10-17', posts: [{ url: 'https://example.test/post', handle: 'example' }], refs: [] }];
  release.notes = 'Editorial note </script><script>alert("note")</script>';
  release.summary += ' </script><script>alert("summary")</script>';
  release.changes = [{ id: 'AN1', name: 'Big-4 capex', fromText: '$890B', toText: '$900B', src: 'Published lead source', url: 'https://example.test/lead', quote: 'The lead quote', reviewed: '2026-10-19', via: { panel: { members: [{ agent: 'Other agent', model: 'fixture', v: '920', w: 1, url: 'https://example.test/nonlead', title: 'Nonlead source' }] } } }];
  const releases = [];
  for (const id of ['2026-W42', '2026-W43']) {
    const r = { ...release, id, publishedAt: id === '2026-W42' ? release.publishedAt : '2026-10-23T13:00:00+02:00' };
    releases.unshift({ id, publishedAt: r.publishedAt, asOf: r.asOf ?? null, summary: r.summary, changes: r.changes.length, carryForward: !!r.carryForward, base: !!r.base, url: 'data/releases/' + id + '/' });
    for (const [name, value] of Object.entries(built.files)) write(path.join(dir, 'data/releases', id, name), name === 'release.json' ? JSON.stringify(r) : value);
    if (id === '2026-W43') for (const [name, value] of Object.entries(built.files)) write(path.join(dir, 'data/latest', name), name === 'release.json' ? JSON.stringify(r) : value);
  }
  write(path.join(dir, 'data/releases/index.json'), JSON.stringify({ schema: 'aimonitor.releases/1', releases }));
  write(path.join(dir, 'data/releases/2099-W01/release.json'), JSON.stringify({ id: '2099-W01', summary: 'UNINDEXED_CONTENT_MUST_NOT_APPEAR' }));
  write(path.join(dir, '_private/storage/working.php'), '<?php http_response_code(404); exit; ?>\n' + JSON.stringify({ unpublished: 'UNAPPROVED_PRIVATE_CONTENT' }));
  write(path.join(dir, 'data/site-config.js'), 'window.AIMONITOR_SITE={preserve:"runtime-config"};');
  write(path.join(dir, '_private/storage/settings.php'), '<?php http_response_code(404); exit; ?>\n' + JSON.stringify({ site: { url: BASE }, newsletter: { enabled: false } }));
  const run = code => {
    // Fail on unsuppressed PHP diagnostics regardless of CLI display/log settings.
    const script = `<?php\nerror_reporting(E_ALL); set_error_handler(function ($severity, $message, $file, $line) { if (!(error_reporting() & $severity)) return false; throw new ErrorException($message, 0, $severity, $file, $line); });\ndefine('AIM_ROOT', $argv[1]); define('AIM_PRIVATE', $argv[1].'/_private');\ntry { require $argv[2].'/server/_private/lib/bootstrap.php'; ${code} } catch (Throwable $e) { fwrite(STDERR, get_class($e).': '.$e->getMessage().' at '.$e->getFile().':'.$e->getLine()); exit(1); }`;
    write(path.join(dir, 'run.php'), script);
    const r = spawnSync(PHP, [path.join(dir, 'run.php'), dir, ROOT], { encoding: 'utf8', timeout: 45000 });
    assert.equal(r.error, undefined, r.error?.message);
    assert.equal(r.status, 0, r.stderr + '\n' + r.stdout);
    assert.equal(r.stderr, '', r.stderr);
    try { return JSON.parse(r.stdout); } catch { assert.fail('PHP returned non-JSON output: ' + r.stdout); }
  };
  const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
  return { dir, run, read, release, ds };
}

test('published pages are crawlable, escaped, sourced, canonical and rebuilt without changing data', t => {
  const { dir, run, read, release } = fixture(t);
  // Exercise discovery's malformed-index boundary without giving feed/withdrawal tests invalid publication data.
  const index = JSON.parse(read('data/releases/index.json'));
  index.releases.push({ id: '../private' });
  write(path.join(dir, 'data/releases/index.json'), JSON.stringify(index));
  const preserve = walk(path.join(dir, 'data')).concat(walk(path.join(dir, '_private/storage')));
  const hashes = new Map(preserve.map(f => [f, digest(fs.readFileSync(f))]));
  const first = run('echo aim_json_encode(aim_discovery_refresh(null, 1));');
  assert.equal(first.ok, true);
  assert.equal(first.processed, 1);
  assert.equal(first.complete, false);
  assert.equal(first.next, '2026-W42');
  const second = run(`echo aim_json_encode(aim_discovery_refresh('2026-W42', 1));`);
  assert.equal(second.complete, true);
  assert.equal(second.processed, 1);
  assert.equal(second.next, null);
  for (const [f, hash] of hashes) assert.equal(digest(fs.readFileSync(f)), hash, 'Rebuild changed preserved file: ' + f);
  const home = read('index.html');
  assert.equal((home.match(/<h1>/g) || []).length, 1);
  assert.match(home, /<h2 id="published-summary-title">Latest published findings/);
  assert.match(home, /<table>/);
  assert.match(home, /release 2026-W43/);
  assert.match(home, /&lt;script&gt;alert/);
  assert.doesNotMatch(home, /<script>alert/);
  assert.match(home, new RegExp(fmt('K', release.headline.scenarios.COMM.K[3]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const scripts = [...home.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
  const types = scripts[0]['@graph'].map(x => x['@type']);
  assert.deepEqual(types, ['Organization','WebSite','Dataset','WebPage']);
  assert.equal(scripts[0]['@graph'].find(x => x['@type'] === 'Dataset').version, '2026-W43');
  const scenarioDirs = fs.readdirSync(path.join(dir, 'scenarios'), { withFileTypes: true }).filter(e => e.isDirectory());
  assert.equal(scenarioDirs.length, 8);
  const metrics = JSON.parse(read('data/latest/metrics.json')).metrics;
  const measureDirs = fs.readdirSync(path.join(dir, 'measures'), { withFileTypes: true }).filter(e => e.isDirectory());
  assert.equal(measureDirs.length, Object.keys(metrics).length);
  const capex = read('measures/ai-capex/index.html');
  assert.match(capex, /Source quote: &lt;\/script&gt;&lt;script&gt;/);
  assert.match(capex, /Reviewed: 2026-10-19/);
  assert.match(capex, /Formula and assumptions/);
  assert.match(capex, /History and source notes/);
  const archive = read('releases/2026-W42/index.html');
  assert.match(archive, /<title>AI Forecast Atlas release 2026-W42/);
  assert.match(archive, /rel="canonical" href="https:\/\/atlas.example.test\/releases\/2026-W42\/"/);
  assert.match(archive, /"@type":"Report"/);
  assert.match(archive, /https:\/\/atlas.example.test\/data\/releases\/2026-W42\/dataset.json/);
  assert.match(archive, /<td><a href="https:\/\/example.test\/lead" rel="noopener">Published lead source<\/a>/);
  assert.equal(read('data/releases/2026-W42/index.html'), archive);
  const faq = read('faq/index.html');
  const faqSchema = JSON.parse(faq.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  const questions = faqSchema['@graph'].find(x => x['@type'] === 'FAQPage').mainEntity;
  assert.equal(questions.length, 15);
  for (const q of questions) assert.ok(faq.includes(q.name.replaceAll('&','&amp;').replaceAll('"','&quot;')), q.name);
  const robots = read('robots.txt');
  for (const bot of ['*','GPTBot','ClaudeBot','Google-Extended','CCBot','OAI-SearchBot','ChatGPT-User','Claude-SearchBot','PerplexityBot']) {
    const block = robots.split('User-agent: ' + bot + '\n')[1].split('\n\n')[0];
    for (const privatePath of ['/api/','/admin/','/_private/','/check.php']) assert.ok(block.includes('Disallow: ' + privatePath), bot + privatePath);
  }
  const sitemap = read('sitemap.xml');
  assert.equal((sitemap.match(/<url>/g) || []).length, (sitemap.match(/<lastmod>/g) || []).length);
  for (const p of ['about/', 'faq/', 'methodology/', 'scenarios/bubble-burst/', 'measures/ai-capex/', 'releases/2026-W42/','releases/2026-W43/']) assert.ok(sitemap.includes(BASE + p));
  assert.doesNotMatch(sitemap, /2099-W01|private|data\/releases\/2026-W42\//);
  const corpus = read('llms-full.txt');
  assert.match(corpus, /Formula and assumptions/);
  assert.match(corpus, /https:\/\/example.test\/lead/);
  assert.match(corpus, /release 2026-W42/);
  for (const f of walk(dir).filter(f => /\.(?:html|txt)$/.test(f))) assert.doesNotMatch(fs.readFileSync(f,'utf8'), /UNINDEXED_CONTENT_MUST_NOT_APPEAR|UNAPPROVED_PRIVATE_CONTENT/, f);
  const repeat = run('echo aim_json_encode(aim_discovery_refresh());');
  assert.equal(repeat.complete, true);
  assert.equal(read('index.html'), home, 'Rebuild must replace markers, not duplicate the summary');
});

test('withdrawal removes every generated copy of a published X-watch signal', t => {
  const { dir, run, read } = fixture(t);
  run('echo aim_json_encode(aim_discovery_refresh());');
  assert.match(read('llms-full.txt'), /WITHDRAW_THIS_SIGNAL/);
  const result = run(`echo aim_json_encode(['scrubbed'=>aim_xwatch_scrub('withdraw-me')]);`);
  assert.equal(result.scrubbed, 2);
  for (const f of walk(dir).filter(f => /\.(?:html|txt)$/.test(f))) assert.doesNotMatch(fs.readFileSync(f,'utf8'), /WITHDRAW_THIS_SIGNAL/, f);
  assert.deepEqual(JSON.parse(read('data/latest/release.json')).xwatch, []);
});

test('rebuild rejects unsafe cursors and unindexed latest data; nonfinite values have no numeric output', t => {
  const { dir, run, read } = fixture(t);
  const invalid = run(`echo aim_json_encode(aim_discovery_refresh('../_private'));`);
  assert.equal(invalid.ok, false);
  assert.equal(fs.existsSync(path.join(dir, 'about/index.html')), false);
  const numbers = run(`$b=aim_discovery_latest(); $b['release']['headline']['scenarios']['COMM']['K'][3]=INF; echo aim_json_encode(['bad'=>aim_discovery_value($b,'COMM','K','Q4 2030'),'text'=>aim_fmt('K',aim_discovery_value($b,'COMM','K','Q4 2030'))]);`);
  assert.equal(numbers.bad, null);
  assert.equal(numbers.text, '—');
  const escaped = run(`echo aim_json_encode(['schema'=>aim_discovery_jsonld(['text'=>'</script><script>alert(1)</script>']), 'source'=>aim_discovery_source(['src'=>'<img src=x onerror=alert(1)>','url'=>'javascript:alert(1)'])]);`);
  assert.equal((escaped.schema.match(/<\/script>/g) || []).length, 1);
  assert.doesNotMatch(escaped.schema, /<script>alert/);
  assert.doesNotMatch(escaped.source, /href=|<img/);
  run(`aim_discovery_write_release(['id'=>'2099-W01','summary'=>'UNINDEXED_CONTENT_MUST_NOT_APPEAR']); echo '{}';`);
  assert.equal(fs.existsSync(path.join(dir, 'releases/2099-W01/index.html')), false);
  const before = read('index.html');
  write(path.join(dir, 'data/latest/release.json'), JSON.stringify({ id: '2099-W01', summary: 'Unapproved latest' }));
  const missing = run('echo aim_json_encode(aim_discovery_refresh());');
  assert.equal(missing.ok, false);
  assert.equal(read('index.html'), before);
});

test('rebuild is nonblocking during publication and reports an incomplete indexed archive', t => {
  const { dir, run, read } = fixture(t);
  const home = read('index.html');
  const locked = run(`aim_mkdir(aim_storage('locks')); $fh=fopen(aim_storage('locks/publish.lock'),'c'); flock($fh,LOCK_EX); $r=aim_discovery_refresh(); flock($fh,LOCK_UN); fclose($fh); echo aim_json_encode($r);`);
  assert.equal(locked.ok, false);
  assert.match(locked.error, /running/);
  assert.equal(read('index.html'), home);
  fs.unlinkSync(path.join(dir, 'data/releases/2026-W42/release.json'));
  const missing = run('echo aim_json_encode(aim_discovery_refresh());');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /incomplete: 2026-W42/);
  assert.equal(missing.processed, 0);
});

test('schema uses validated operator identities and rebuild Origin checks use effective ports', t => {
  const { run } = fixture(t);
  const result = run(`
    $r=aim_discovery_latest()['release'];
    $original=aim_discovery_schema($r)['@graph'][0];
    aim_apply_settings_update(['site'=>['company'=>'Fixture Operator', 'company_url'=>'https://operator.example/', 'company_logo_url'=>'https://operator.example/logo.png', 'linkedin_url'=>'https://www.linkedin.com/company/fixture/', 'repo_url'=>'https://github.com/fixture/atlas']]);
    $custom=aim_discovery_schema($r)['@graph'][0];
    aim_apply_settings_update(['site'=>['company_logo_url'=>'javascript:alert(1)', 'linkedin_url'=>'https://unrelated.example/not-linkedin', 'company_url'=>'javascript:alert(1)']]);
    $unsafe=aim_discovery_schema($r)['@graph'][0];
    $origins=[];
    foreach (['https://atlas.example.test','https://ATLAS.EXAMPLE.TEST:443','http://atlas.example.test','https://atlas.example.test:444','null','','https://user@atlas.example.test','https://atlas.example.test/path'] as $o) { $_SERVER['HTTP_ORIGIN']=$o; $origins[]=aim_discovery_origin_ok(); }
    echo aim_json_encode(['original'=>$original,'custom'=>$custom,'unsafe'=>$unsafe,'origins'=>$origins]);
  `);
  assert.equal(result.original.logo, 'https://creoox.com/wp-content/uploads/2024/02/creoox_logo-01-300x76.png');
  assert.ok(result.original.sameAs.includes('https://www.linkedin.com/company/creoox/posts/?feedView=all'));
  assert.equal(result.custom.name, 'Fixture Operator');
  assert.equal(result.custom.logo, 'https://operator.example/logo.png');
  assert.equal(result.custom.url, 'https://operator.example/');
  assert.deepEqual(result.custom.sameAs, ['https://github.com/fixture/atlas','https://www.linkedin.com/company/fixture/']);
  assert.equal(result.unsafe.logo, undefined);
  assert.equal(result.unsafe.url, undefined);
  assert.deepEqual(result.unsafe.sameAs, ['https://github.com/fixture/atlas']);
  assert.deepEqual(result.origins, [true,true,false,false,false,false,false,false]);
});
