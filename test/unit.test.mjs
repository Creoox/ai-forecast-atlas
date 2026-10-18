/* AI Forecast Atlas unit tests (node --test test/). No dependencies. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../engine/engine.mjs';
import * as RC from '../web/src/release-core.mjs';
import { buildChatGuide, selectChatGuide } from '../web/src/chat-guide.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chatGuide = () => buildChatGuide(createEngine(), JSON.parse(fs.readFileSync(path.join(ROOT, 'config/methods.json'), 'utf8')));
const guideIds = selection => selection.details.map(detail => detail.id);

test('chat guide keeps every preset scenario available, including Bubble bursts', () => {
  const E = createEngine(), guide = chatGuide();
  assert.equal(guide.schema, 'aimonitor.chat-guide/1');
  assert.deepEqual(guide.overview.scenarios.map(s => s.key).sort(), E.SCENARIOS.map(s => s.key).sort());
  for (const scenario of E.SCENARIOS) {
    const summary = guide.overview.scenarios.find(s => s.key === scenario.key);
    for (const field of ['name', 'short', 'thesis', 'first']) assert.deepEqual(summary[field], scenario[field], scenario.key + '.' + field);
  }
  assert.ok(guide.overview.features.some(f => /broadcast/i.test(f.title) && f.summary), 'Broadcast is discoverable without selecting its panel');
  assert.ok(guide.overview.glossary.some(g => /^capex$/i.test(g.term) && g.def), 'capex is available in the compact glossary');
  const selected = selectChatGuide(guide, 'What is Bubble Burst?');
  assert.ok(guideIds(selected).includes('scenario:BUST'));
  assert.match(JSON.stringify(selected.details), /Hype Implosion.*Credit Event/);
});

test('chat guide recognises singular and plural labels without substring matches', () => {
  const guide = chatGuide();
  for (const question of ['What is Bubble Burst?', 'Explain Bubble Bursts.', 'BUBBLE BURSTS?', 'What does Bubble Burst mean?']) {
    assert.ok(guideIds(selectChatGuide(guide, question)).includes('scenario:BUST'), question);
  }
  assert.ok(guideIds(selectChatGuide(guide, 'What is Broadcast?')).includes('panel:broadcast'));
  assert.deepEqual(guideIds(selectChatGuide(guide, 'Explain microbroadcasting.')), [], 'a word containing an alias is not the same feature');
});

test('chat guide answers joint questions and keeps a bounded set of relevant details', () => {
  const guide = chatGuide();
  const joint = guideIds(selectChatGuide(guide, 'Explain Bubble Burst and Broadcast.'));
  assert.ok(joint.includes('scenario:BUST') && joint.includes('panel:broadcast'));
  const many = selectChatGuide(guide, 'Explain Bubble Burst, Broadcast, capex, X watch and Tour.');
  assert.equal(many.details.length, 3);
  assert.equal(new Set(guideIds(many)).size, 3, 'one detail per topic');
  const panel = guideIds(selectChatGuide(guide, 'Explain Bubble Burst and capex.', 'broadcast'));
  assert.equal(panel[0], 'panel:broadcast', 'an explicitly opened panel takes priority');
  assert.ok(panel.includes('scenario:BUST') && panel.includes('glossary:capex'));
});

test('chat guide distinguishes the two Tours and explains Broadcast, capex and X watch', () => {
  const guide = chatGuide();
  const tour = selectChatGuide(guide, 'What does Tour do?');
  assert.ok(guideIds(tour).includes('panel:time') && guideIds(tour).includes('panel:guide'), 'scenario playback and the guided tutorial both explain bare Tour');
  const broadcast = JSON.stringify(selectChatGuide(guide, 'What is Broadcast?').details);
  assert.match(broadcast, /16:9/);
  assert.match(broadcast, /\bEsc(?:ape)?\b/i);
  assert.match(broadcast, /MP4/);
  assert.match(broadcast, /WebM/);
  const capex = selectChatGuide(guide, 'What is capex?');
  assert.ok(guideIds(capex).includes('glossary:capex'));
  assert.match(JSON.stringify(capex.details), /capital expenditure/i);
  const xwatch = selectChatGuide(guide, 'What is X watch?');
  assert.ok(guideIds(xwatch).includes('panel:xwatch'));
  assert.match(JSON.stringify(xwatch.details), /signals, not data/i);
});

test('chat guide carries a referential follow-up but does not invent unknown features', () => {
  const guide = chatGuide();
  assert.ok(guideIds(selectChatGuide(guide, 'How do I exit it?', '', 'What is Broadcast?')).includes('panel:broadcast'));
  const changedTopic = guideIds(selectChatGuide(guide, 'What is capex?', '', 'What is Broadcast?'));
  assert.ok(changedTopic.includes('glossary:capex') && !changedTopic.includes('panel:broadcast'));
  for (const question of ['What does quantum teleportation mode do?', 'What is xylophone?']) {
    const unknown = selectChatGuide(guide, question, '', 'What is Broadcast?');
    assert.deepEqual(unknown.details, [], question + ': unrelated questions must not inherit the previous feature');
    assert.equal(unknown.overview.scenarios.length, 8);
  }
  assert.deepEqual(selectChatGuide(guide, 'What is xylophone?', '../broadcast').details, [], 'an unknown panel id cannot supply a feature');
});

test('chat guide explains reading size and its browser-only persistence', () => {
  const guide = chatGuide();
  for (const question of ['How do I change text size?', 'The fonts are small; can I change font size?', 'How do I get larger text?']) {
    const selected = selectChatGuide(guide, question);
    assert.ok(guideIds(selected).includes('panel:layout'), question);
    const help = JSON.stringify(selected.details);
    assert.match(help, /100%.*125%.*150%/);
    assert.match(help, /do not sync between browsers or devices/);
    assert.match(help, /does not reset the scenario, theme or text size/);
  }
});

test('engine instances are independent and deterministic', () => {
  const a = createEngine(), b = createEngine();
  const s = a.SCENARIOS[0];
  const ra = a.simulate(s, null), rb = b.simulate(b.SCENARIOS[0], null);
  assert.deepEqual(ra.K, rb.K);
  a.applyData({ anchors: { AN5: { value: 8 } } });
  const ra2 = a.simulate(s, null), rb2 = b.simulate(b.SCENARIOS[0], null);
  assert.notDeepEqual(ra2.Pf, rb2.Pf, 'applyData changes only its own instance');
  assert.deepEqual(rb2.K, rb.K);
});

test('applyData is a no-op for the base dataset', () => {
  const E = createEngine();
  const ds = RC.datasetFromEngine(createEngine(), '2026-10-17');
  const before = E.simulate(E.SCENARIOS[1], null);
  const changes = E.applyData(ds);
  assert.equal(changes.length, 0);
  assert.deepEqual(E.simulate(E.SCENARIOS[1], null).R, before.R);
});

test('data-centre construction anchor sets the build share', () => {
  const E = createEngine();
  const ch = E.applyData({ anchors: { AN26: { value: 120 } } });
  assert.equal(ch.length, 1);
  assert.ok(Math.abs(E.anchorValues().AN26 - 120) < 1e-6);
});

test('release is deterministic and complete', () => {
  const ds = RC.datasetFromEngine(createEngine(), '2026-10-17');
  const a = RC.buildRelease({ createEngine, dataset: ds, previous: null, id: '2026-W42', base: true });
  const b = RC.buildRelease({ createEngine, dataset: ds, previous: null, id: '2026-W42', base: true });
  assert.deepEqual(Object.keys(a.files).sort(), Object.keys(b.files).sort());
  for (const k of Object.keys(a.files)) assert.equal(a.files[k], b.files[k], k);
  for (const s of ['COMM', 'BUST', 'BRKW', 'SPLT', 'PWR', 'BOOM', 'TRST', 'PLAT']) {
    assert.ok(a.files['series/' + s + '.csv'] && a.files['impacts/' + s + '.json']);
  }
  const rel = JSON.parse(a.files['release.json']);
  assert.equal(rel.schema, 'aimonitor.release/1');
  assert.equal(rel.headline.horizons[3], 'Q4 2030');
  assert.equal(rel.signposts.length, RC.SIGNPOSTS.length);
  assert.ok(a.files['charts/K.svg'].startsWith('<svg') && !/<script/i.test(a.files['charts/K.svg']));
});

test('changes and highlights against the previous release', () => {
  const ds = RC.datasetFromEngine(createEngine(), '2026-10-17');
  const prev = RC.buildRelease({ createEngine, dataset: ds, previous: null, id: '2026-W42', base: true });
  const ds2 = JSON.parse(JSON.stringify(ds));
  ds2.anchors.AN4.value = 6; ds2.anchors.AN4.v = '$6.00T';
  const next = RC.buildRelease({ createEngine, dataset: ds2, previous: { release: prev.release, dataset: ds }, id: '2026-W43' });
  assert.equal(next.release.changes.length, 1);
  assert.equal(next.release.changes[0].id, 'AN4');
  assert.match(next.release.summary, /1 starting value updated/);
});

test('ISO week ids', () => {
  assert.equal(RC.isoWeekId('2026-10-23'), '2026-W43');
  assert.equal(RC.isoWeekId('2027-01-01'), '2026-W53');
  assert.equal(RC.isoWeekId('2027-01-08'), '2027-W01');
});

test('measure dictionaries agree: release core, dashboard and PHP formats', () => {
  const app = fs.readFileSync(path.join(ROOT, 'web/src/app.js'), 'utf8');
  const met = app.slice(app.indexOf('const MET = {'), app.indexOf('function fmt('));
  const appKeys = [...met.matchAll(/^\s{2}(\w+): \{ n: '[^']*', f: '(\w+)'/gm)].map(m => [m[1], m[2]]);
  assert.ok(appKeys.length > 40);
  for (const [k, f] of appKeys) {
    assert.ok(RC.METRICS[k], 'release core lacks ' + k);
    assert.equal(RC.METRICS[k].f, f, 'format of ' + k);
  }
  const php = fs.readFileSync(path.join(ROOT, 'server/_private/lib/i18n.php'), 'utf8');
  for (const [k, f] of appKeys) assert.ok(php.includes("'" + k + "' => '" + f + "'"), 'PHP format of ' + k);
});

test('translations cover every measure, scenario and signpost', () => {
  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/i18n.json'), 'utf8'));
  for (const k of Object.keys(RC.METRICS)) for (const l of ['de', 'fr', 'pl']) assert.ok(i18n.metrics[k] && i18n.metrics[k][l], k + ' ' + l);
  for (const s of ['COMM', 'BUST', 'BRKW', 'SPLT', 'PWR', 'BOOM', 'TRST', 'PLAT']) assert.equal(i18n.scenarios[s].pl.length, 2);
  for (const sp of RC.SIGNPOSTS) assert.ok(i18n.signposts[sp.id] && i18n.signposts[sp.id].de, sp.id);
  for (const [k, v] of Object.entries(i18n.t)) for (const l of ['en', 'de', 'fr', 'pl']) assert.ok(typeof v[l] === 'string', k + ' ' + l);
});

test('newsletter categories reference real measures', () => {
  const nl = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/newsletter.json'), 'utf8'));
  for (const c of nl.categories) for (const k of c.metrics || []) assert.ok(RC.METRICS[k], c.id + ': ' + k);
});

test('methods.json explains every measure and every dashboard part', () => {
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/methods.json'), 'utf8'));
  const E = createEngine();
  for (const k of Object.keys(RC.METRICS)) {
    const m = M.metrics[k];
    assert.ok(m, 'methods.json lacks measure ' + k);
    assert.ok(m.definition && m.unit && m.group && M.groups[m.group], k + ': definition, unit and group');
    assert.ok((m.model && m.model.formula && m.model.formula.length && m.model.formula.every(l => l.length > 3)) || (m.history && m.history.method), k + ': formula or history method');
    assert.ok(m.history && m.history.method && Array.isArray(m.history.sources), k + ': history method and sources');
    for (const s of m.history.sources) assert.ok(/^https:\/\//.test(s.url) && s.title && s.publisher, k + ': source needs title, publisher and https link');
    if (m.anchor) assert.ok(E.ANCHORS.find(a => a.id === m.anchor && a.k === k), k + ': anchor ' + m.anchor + ' measures ' + k);
    for (const d of m.model.drivers || []) assert.ok(E.DK.includes(d), k + ': unknown driver ' + d);
    for (const x of m.model.inputs || []) assert.ok(RC.METRICS[x], k + ': unknown input ' + x);
  }
  /* every explainer id used in the page (data-panel, data-explain, data-explain-btn) plus the ones built in scripts */
  const tpl = fs.readFileSync(path.join(ROOT, 'web/src/template.html'), 'utf8');
  const ids = new Set([...tpl.matchAll(/data-(?:panel|explain|explain-btn)="([^"]+)"/g)].map(m => m[1]));
  for (const x of ['chat-ask', 'chat-suggest', 'subscribe', 'share', 'data', 'about', 'relbar', 'regime', 'guide', 'sources', 'kpis']) ids.add(x);
  assert.ok(ids.size >= 25, 'explainer ids found: ' + ids.size);
  for (const id of ids) {
    const P = M.panels[id];
    assert.ok(P, 'methods.json lacks panel ' + id);
    for (const f of ['title', 'oneLiner', 'what', 'whyItMatters', 'method']) assert.ok(typeof P[f] === 'string' && P[f].length > 3, id + '.' + f);
    assert.ok(Array.isArray(P.howToRead) && P.howToRead.length >= 1 && P.howToRead.every(x => x.length > 3), id + '.howToRead');
    assert.ok(Array.isArray(P.caveats) && P.caveats.length >= 1, id + '.caveats');
    for (const k of (P.sources && P.sources.metrics) || []) assert.ok(RC.METRICS[k], id + ': unknown measure ' + k);
  }
  for (const b of ['history', 'reported', 'survey', 'estimate', 'forecast', 'assumption', 'index', 'model']) assert.ok(M.badges[b] && M.badges[b].label && M.badges[b].icon && M.badges[b].meaning, 'badge ' + b);
  for (const a of E.ANCHORS) assert.ok(M.badges[a.status], 'no badge for status ' + a.status);
  assert.equal(M.events.length, E.HIST_EVENTS.length, 'one events entry per history event');
  E.HIST_EVENTS.forEach(([t, txt], i) => { assert.equal(M.events[i].t, t); assert.equal(M.events[i].text, txt); assert.ok(Array.isArray(M.events[i].sources)); });
  for (const s of E.SCENARIOS) assert.ok(M.scenarios[s.key] && M.scenarios[s.key].tilts, 'scenario ' + s.key);
  for (const d of E.DK) assert.ok(M.drivers[d] && M.drivers[d].affects.length, 'driver ' + d);
  for (const f of Object.keys(E.FEAT_NAMES)) assert.ok(M.impact.features[f], 'impact factor ' + f);
  assert.ok(M.glossary.length >= 25 && M.glossary.length <= 50, 'glossary size ' + M.glossary.length);
  assert.ok(M.tour.length >= 8 && M.tour.length <= 12, 'tour steps ' + M.tour.length);
  for (const st of M.tour) assert.ok(st.target && st.title && st.text, 'tour step');
  assert.ok(M.process.steps.length >= 4 && Object.keys(M.via).length >= 5);
  /* trademark rule: “Autodesk®” only as an adjective, never possessive */
  assert.ok(!/Autodesk®?['’]s/.test(JSON.stringify(M)), 'no possessive Autodesk');
});

test('the AI research panel record travels with a value into the release, unchanged', () => {
  const base = RC.datasetFromEngine(createEngine(), '2026-10-17');
  const via = { type: 'ai', name: 'AI research panel (4 of 5 agents answered)', model: 'OpenAI gpt-6.1-sol',
    panel: { rule: 'weighted median', asked: 5, answered: 4, agree: 0.82, tol: 0.1, lo: 5.38, hi: 5.6, members: [
      { agent: 'OpenAI', model: 'gpt-6.1-sol', w: 3, v: '$5.42T', value: 5.42, basis: 'source', url: 'https://example.com/nvda', title: 'Example Markets', agrees: true, lead: true },
      { agent: 'Anthropic', model: 'claude-sonnet-5-5', w: 3, v: '$5.40T', value: 5.4, basis: 'source', url: 'https://example.org/nvda', agrees: true },
      { agent: 'Google Gemini', model: 'gemini-3.8-flash', w: 2, v: '$5.6T', value: 5.6, basis: 'source', agrees: true },
      { agent: 'DeepSeek', model: 'deepseek-v4-pro', w: 1, v: '', value: null, basis: 'knowledge', none: 'No newer figure known' }] } };
  const mk = () => { const d = JSON.parse(JSON.stringify(base)); Object.assign(d.anchors.AN4, { value: 5.42, v: '$5.42T', via: JSON.parse(JSON.stringify(via)), reviewed: '2026-10-22' }); return d; };
  const ds2 = mk();
  const E = createEngine();
  E.applyData(ds2);
  ds2.anchors.AN4.via.panel.members[0].v = 'changed after applyData';   // the engine keeps its own copy
  const out = RC.datasetFromEngine(E, '2026-10-22').anchors.AN4;
  assert.deepEqual(out.via, via);
  const rel = RC.buildRelease({ createEngine, dataset: mk(), previous: { release: null, dataset: base }, id: '2026-W43' });
  const c = rel.release.changes.find(x => x.id === 'AN4');
  assert.ok(c, 'AN4 listed as a change');
  assert.deepEqual(c.via.panel, via.panel);
  assert.deepEqual(JSON.parse(rel.files['dataset.json']).anchors.AN4.via.panel.members[3], via.panel.members[3]);
});

test('X watch: the dashboard panel, its explainer and the chat citation pattern exist', () => {
  const tpl = fs.readFileSync(path.join(ROOT, 'web/src/template.html'), 'utf8');
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/methods.json'), 'utf8'));
  assert.ok(/data-panel="xwatch"/.test(tpl) && /id="xwlist"/.test(tpl), 'X watch panel in the template');
  assert.ok(M.panels.xwatch && /signals, not data/i.test(M.panels.xwatch.oneLiner + M.panels.xwatch.method), 'X watch explainer says: signals, not data');
  for (const t of ['AI research panel', 'X watch', 'weighted median']) assert.ok(M.glossary.some(g => g.term === t), 'glossary: ' + t);
  const site = fs.readFileSync(path.join(ROOT, 'web/src/site.js'), 'utf8');
  const m = /const CITE_RX = (\/.*\/g);/.exec(site); assert.ok(m, 'CITE_RX found');
  const rx = new Function('return ' + m[1])();
  const ids = []; 'See [X12], [AN1; X7] and [M:K] [AI] but not [X] or [XY1].'.replace(rx, (s, inner) => { ids.push(inner); return s; });
  assert.deepEqual(ids, ['X12', 'AN1; X7', 'M:K', 'AI']);
});

test('provenance survives applyData → datasetFromEngine and reaches the release changes', () => {
  const base = RC.datasetFromEngine(createEngine(), '2026-10-17');
  for (const a of createEngine().ANCHORS) assert.ok(a.via && a.via.type && a.reviewed === '2026-10-17', a.id + ' has base provenance');
  assert.ok(base.anchors.AN1.refs.length >= 1 && base.anchors.AN1.via.type === 'desk');
  const ds2 = JSON.parse(JSON.stringify(base));
  const prov = {
    quote: 'Nvidia closed at a $6.00 trillion market value.',
    refs: [{ title: 'Exchange data', url: 'https://example.com/nvda', publisher: 'Example', date: '2026-10-22' }],
    via: { type: 'ai', name: 'AI-assisted web research', model: 'openai gpt-6.1-sol', check: { agree: true, by: 'anthropic claude-haiku-5-5', url: 'https://example.com/check', note: 'Same figure.' } },
    reviewed: '2026-10-22', retrieved: '2026-10-21'
  };
  Object.assign(ds2.anchors.AN4, { value: 6, v: '$6.00T' }, prov);
  const E = createEngine();
  E.applyData(ds2);
  ds2.anchors.AN4.refs[0].title = 'changed after applyData';   // the engine keeps its own copy
  const out = RC.datasetFromEngine(E, '2026-10-22').anchors.AN4;
  for (const f of ['quote', 'via', 'reviewed', 'retrieved']) assert.deepEqual(out[f], prov[f], f);
  assert.equal(out.refs[0].title, 'Exchange data');
  const ch = RC.diffDatasets(base, ds2).find(c => c.id === 'AN4');
  assert.ok(ch, 'AN4 listed as a change');
  assert.equal(ch.quote, prov.quote); assert.equal(ch.via.type, 'ai'); assert.equal(ch.via.check.agree, true); assert.equal(ch.reviewed, '2026-10-22'); assert.ok(ch.refs.length === 1);
  const rel = RC.buildRelease({ createEngine, dataset: ds2, previous: { release: null, dataset: base }, id: '2026-W43' });
  const c2 = rel.release.changes.find(c => c.id === 'AN4');
  assert.equal(c2.via.model, 'openai gpt-6.1-sol');
  assert.equal(JSON.parse(rel.files['dataset.json']).anchors.AN4.quote, prov.quote);
});
