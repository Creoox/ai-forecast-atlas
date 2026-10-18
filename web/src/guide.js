/* AI Forecast Atlas — guidance and provenance layer.
   Guided tour, panel explainers, provenance popovers on every number, the Sources & methods view, glossary tooltips
   and explain mode. Words come from methods.json (window.AIMONITOR_METHODS); numbers come from the engine through
   window.AICX_UI, so an explanation can never show a different number than the chart. Runs after app.js and site.js.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
(function () {
'use strict';
const UI = window.AICX_UI;
if (!UI) return;
const SITE = window.AICX_SITE || null;
const M = window.AIMONITOR_METHODS || { panels: {}, metrics: {}, badges: {}, glossary: [], tour: [], events: [], process: { steps: [] }, via: {}, groups: {}, scenarios: {}, drivers: {} };
const E = UI.engine;
const DATA = window.AIMONITOR_DATA || null;
const REL = (DATA && DATA.release) || null;
const CFG = (SITE && SITE.config) || window.AIMONITOR || {};
const IS_SITE = CFG.mode === 'site';
const SITE_URL = String(CFG.siteUrl || 'https://aiforecastatlas.com/').replace(/\/?$/, '/');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NOW = E.NOW_I;

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function btn(txt, cls, fn) { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
/* only web, mail and in-page links are ever rendered as links, whatever the data say */
function safeHref(u) {
  u = String(u || '');
  if (/^#[\w.~-]*$/.test(u)) return u;
  try { const x = new URL(u, 'https://aimonitor.invalid/'); if (!/^(https?|mailto):$/.test(x.protocol)) return null; return x.origin === 'https://aimonitor.invalid' ? u : x.href; } catch (e) { return null; }
}
function ext(url, txt) {
  const href = safeHref(url);
  if (!href) return el('span', '', txt || '');
  const a = el('a', '', txt || url); a.href = href; if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener'; } return a;
}
function load(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
const ANCH = () => E.ANCHORS;
const anchorById = id => ANCH().find(a => a.id === id) || null;
const anchorFor = k => ANCH().find(a => a.k === k) || null;
const MET = () => UI.metrics;
const mName = k => (M.metrics[k] && MET()[k] ? MET()[k].n : (MET()[k] ? MET()[k].n : k));
const shortAnchor = a => { let n = String(a.name || a.id).split(/ \(|, /)[0]; if (n.length > 30) n = n.slice(0, 29) + '…'; return n; };
function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function dateTxt(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(d)); if (!m) return String(d);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1];
  return (m[3] ? +m[3] + ' ' : '') + mon + ' ' + m[1];
}
const qOf = i => E.qLabel(i);
const ktLabel = t => (t % 1 ? 'mid-' + Math.floor(t) : String(t));

/* ---------- icons (12×12 or 16×16 paths; decorative, labels always carry the meaning) ---------- */
const PATHS = {
  info: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 8 2.6zM7.2 7h1.6v4.5H7.2zm0-2.7h1.6v1.6H7.2z',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.6a4.9 4.9 0 1 1 0 9.8 4.9 4.9 0 0 1 0-9.8zM7.3 4.5h1.4v3.2l2.2 1.3-.7 1.2-2.9-1.7z',
  check: 'M6.2 11.8L2.3 7.9l1.2-1.2 2.7 2.7 6.3-6.3 1.2 1.2z',
  survey: 'M2 13.5h2.6V8H2zm4.7 0h2.6V2.5H6.7zm4.7 0H14V5.5h-2.6z',
  approx: 'M2 6c1.7-1.6 3.5-1.6 6 0s4.3 1.6 6 0v1.8c-1.7 1.6-3.5 1.6-6 0S3.7 6.2 2 7.8zm0 4c1.7-1.6 3.5-1.6 6 0s4.3 1.6 6 0v1.8c-1.7 1.6-3.5 1.6-6 0s-4.3-1.6-6 0z',
  forecast: 'M3.6 12.6l6.6-6.6H6V4.4h7v7h-1.6V7.2l-6.6 6.6z',
  diamond: 'M8 1.4L14.6 8 8 14.6 1.4 8zm0 2.3L3.7 8 8 12.3 12.3 8z',
  grid: 'M2 2h5v5H2zm7 0h5v5H9zM2 9h5v5H2zm7 0h5v5H9z',
  fx: 'M10.2 1.8c-1.7 0-2.6.9-2.9 2.6l-.3 1.2H5.4v1.6h1.3l-1 5c-.1.6-.4.9-.9.9h-.9v1.6h.9c1.5 0 2.4-.8 2.7-2.4l1-5.1h1.9V5.6H8.6l.2-.9c.1-.6.4-.9 1-.9h.9V1.8zm1.1 6.1l1.3 1.9-1.6 2.4h1.6l.9-1.4.9 1.4H16l-1.6-2.4 1.3-1.9h-1.6l-.6.9-.6-.9z',
  close: 'M3.1 2L8 6.9 12.9 2 14 3.1 9.1 8 14 12.9 12.9 14 8 9.1 3.1 14 2 12.9 6.9 8 2 3.1z',
  guide: 'M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm2.9 4.1l-1.7 4.1-4.1 1.7 1.7-4.1zM8 7.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
  book: 'M2 2.5h4.6c.6 0 1.1.3 1.4.7.3-.4.8-.7 1.4-.7H14v10.5H9.4c-.6 0-1 .4-1 1h-.8c0-.6-.4-1-1-1H2zm1.6 1.6v7.3h3c.5 0 .9.1 1.2.3V4.9c0-.4-.4-.8-.8-.8zm8.8 0H9c-.4 0-.8.4-.8.8v6.8c.3-.2.7-.3 1.2-.3h3z',
  extl: 'M9 2h5v5h-1.6V4.7L7.6 9.5 6.5 8.4l4.8-4.8H9zM2 4h5v1.6H3.6v6.8h6.8V9H12v5H2z',
  spark: 'M8 1l1.7 5.3L15 8l-5.3 1.7L8 15l-1.7-5.3L1 8l5.3-1.7z'
};
function svg(name, cls) { return '<svg class="' + (cls || 'ico') + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="' + PATHS[name] + '"/></svg>'; }

/* ---------- badges: icon + label (never colour alone) ---------- */
function badgeKind(status) { return M.badges[status] ? status : status === 'history' ? 'history' : 'estimate'; }
function badge(kind, extra) {
  const b = M.badges[kind] || M.badges.estimate || { label: kind, icon: 'info', tone: 'muted', meaning: '' };
  const s = el('span', 'bdg t-' + (b.tone || 'muted'));
  s.innerHTML = svg(b.icon || 'info', 'bi');
  s.append(document.createTextNode(b.label + (extra ? ' · ' + extra : '')));
  if (b.meaning) s.title = b.meaning;
  return s;
}

/* ---------- what kind of number is this? ---------- */
function typeOf(k, i) {
  if (i > NOW) return 'model';
  const an = anchorFor(k);
  if (i === NOW && an) return badgeKind(an.status);
  const h = E.HIST[k];
  if (h && h.kind === 'idx') return an && an.status === 'assumption' ? 'assumption' : 'index';
  return 'history';
}
/* where a history value sits relative to the dated points */
function histContext(k, i) {
  const h = E.HIST[k]; if (!h) return null;
  const t = E.tAt(i), pts = h.pts;
  if (h.from && t < h.from - 1e-9) return { none: true };
  const exact = pts.find(p => Math.abs(p[0] - t) < 1e-9);
  if (exact) return { exact: true, p: exact };
  for (let j = 0; j < pts.length - 1; j++) if (t > pts[j][0] && t < pts[j + 1][0]) return { a: pts[j], b: pts[j + 1], log: !!h.log };
  return { held: t < pts[0][0] ? pts[0] : pts[pts.length - 1] };
}

/* ---------- glossary ---------- */
const GLOSS = (M.glossary || []).slice().sort((a, b) => b.term.length - a.term.length).map(g => ({ g, rx: new RegExp('(^|[^\\w-])(' + g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\w-])', /[A-Z]/.test(g.term) ? '' : 'i') }));
const SKIP = 'a, button, code, pre, summary, label, table, .gl, script, style, input, textarea, select, svg, .cite, .achip, .bdg, h1, h2, h3, h4, .kpi, canvas, .codebox';
function glossify(root, max) {
  if (!root || !GLOSS.length) return;
  const used = new Set(); let n = 0; max = max || 6;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => (t.nodeValue.trim().length > 2 && !(t.parentElement && t.parentElement.closest(SKIP)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let node of nodes) {
    for (const { g, rx } of GLOSS) {
      if (n >= max) return;
      if (used.has(g.term) || !node || !node.parentNode) continue;
      const m = rx.exec(node.nodeValue); if (!m) continue;
      const start = m.index + m[1].length, end = start + m[2].length;
      const after = node.splitText(end); const mid = node.splitText(start);
      const span = el('span', 'gl', mid.nodeValue); span.tabIndex = 0; span.setAttribute('role', 'button'); span.dataset.term = g.term; span.setAttribute('aria-describedby', 'gtip');
      mid.parentNode.replaceChild(span, mid);
      used.add(g.term); n++;
      node = after;
    }
  }
}
let gtip = null, gtipFor = null;
function showGloss(span, sticky) {
  const g = (M.glossary || []).find(x => x.term === span.dataset.term); if (!g) return;
  if (!gtip) { gtip = el('div', 'gtip'); gtip.id = 'gtip'; gtip.setAttribute('role', 'tooltip'); document.body.append(gtip); }
  gtip.innerHTML = ''; gtip.append(el('b', '', g.term), document.createTextNode(' — ' + g.def));
  gtip.hidden = false; gtipFor = span; gtip.dataset.sticky = sticky ? '1' : '';
  const r = span.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 24);
  gtip.style.width = w + 'px';
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  gtip.style.left = left + 'px';
  const h = gtip.offsetHeight; const top = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
  gtip.style.top = top + 'px';
}
function hideGloss() { if (gtip && !gtip.hidden) { gtip.hidden = true; gtipFor = null; return true; } return false; }
document.addEventListener('mouseover', e => { const s = e.target.closest && e.target.closest('.gl'); if (s) showGloss(s); });
document.addEventListener('mouseout', e => { const s = e.target.closest && e.target.closest('.gl'); if (s && gtip && !gtip.dataset.sticky) hideGloss(); });
document.addEventListener('focusin', e => { const s = e.target.closest && e.target.closest('.gl'); if (s) showGloss(s); else if (gtip && !gtip.hidden && !gtip.dataset.sticky) hideGloss(); });
document.addEventListener('click', e => {
  const s = e.target.closest && e.target.closest('.gl');
  if (s) { e.preventDefault(); if (gtipFor === s && gtip.dataset.sticky) hideGloss(); else showGloss(s, true); return; }
  if (gtip && !gtip.hidden && gtip.dataset.sticky && !gtip.contains(e.target)) hideGloss();
});
document.addEventListener('keydown', e => { const s = e.target.closest && e.target.closest('.gl'); if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showGloss(s, true); } });

/* ---------- small building blocks shared by popovers, explainers and the sources view ---------- */
function sec(title, cls) { const s = el('section', 'gsec' + (cls ? ' ' + cls : '')); s.append(el('h3', '', title)); return s; }
function ulOf(items) { const u = el('ul', 'gul'); items.filter(Boolean).forEach(t => u.append(typeof t === 'string' ? el('li', '', t) : t)); return u; }
function formulaBlock(lines) { const p = el('pre', 'fx'); p.textContent = (Array.isArray(lines) ? lines : [lines]).join('\n'); p.tabIndex = 0; p.setAttribute('aria-label', 'Formula'); return p; }
function srcItem(s) {
  const li = el('li', 'srci');
  if (s.url) li.append(ext(s.url, s.title || s.url)); else li.append(el('span', '', s.title || ''));
  const meta = [s.publisher, dateTxt(s.date)].filter(Boolean).join(' · ');
  if (meta) li.append(el('span', 'meta', ' — ' + meta));
  if (s.covers) li.append(el('span', 'cov', 'Covers: ' + s.covers));
  if (s.note) li.append(el('span', 'cov', s.note));
  return li;
}
function anchorChip(a, label) {
  const b = el('button', 'achip'); b.type = 'button'; b.dataset.prov = 'an:' + a.id; b.title = 'Provenance of ' + a.id + ' · ' + a.name;
  b.append(el('b', '', a.id), document.createTextNode(' ' + (label || shortAnchor(a)))); return b;
}
function metricChip(k) { const b = el('button', 'achip m'); b.type = 'button'; b.dataset.prov = 'm:' + k; b.title = 'Where ' + mName(k) + ' comes from'; b.innerHTML = svg('fx', 'bi'); b.append(document.createTextNode(mName(k))); return b; }
function viaText(v) {
  if (!v) return '';
  let t = String(v.name || (M.via[v.type] || v.type || ''));
  const valEdited = typeof v.edited === 'string' && /value/.test(v.edited);
  if (v.model) t += (v.panel ? (valEdited ? ' · source from: ' : ' · lead answer: ') : ' · ') + v.model;
  return t;
}
/* AI research panel: every agent's answer behind a value, with its weight, its source (or "AI knowledge") and
   whether it agrees with the published value (the weighted median). Built from via.panel; any field may be missing. */
const NUMF = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 4 });
function panelBlock(v) {
  const pi = UI.panelInfo ? UI.panelInfo(v) : null; if (!pi) return null;
  const box = el('div', 'apanel'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'AI research panel: the answer of every agent');
  const head = el('p', 'aph'); head.append(el('b', '', 'AI research panel'));
  const bits = [pi.answered + ' of ' + pi.asked + ' agent' + (pi.asked === 1 ? '' : 's') + ' answered'];
  if (pi.valued) bits.push(pi.agreeN + ' of ' + pi.valued + ' agree' + (pi.tol ? ' within ±' + Math.round(pi.tol * 100) + '%' : '') + (pi.share != null ? ' (' + Math.round(pi.share * 100) + '% of the weight)' : ''));
  if (pi.lo != null && pi.hi != null) bits.push(pi.lo === pi.hi ? 'all at ' + NUMF.format(pi.lo) : 'range ' + NUMF.format(Math.min(pi.lo, pi.hi)) + '–' + NUMF.format(Math.max(pi.lo, pi.hi)));
  head.append(document.createTextNode(' · ' + bits.join(' · ')));
  box.append(head);
  const ul = el('ul', 'pmem');
  pi.members.forEach(m => {
    const li = el('li', m.lead === true ? 'lead' : '');
    const who = el('span', 'pm-a', String(m.agent || 'AI agent')); if (m.model) who.append(el('small', '', ' ' + String(m.model)));
    li.append(who);
    const w = pi.num(m.w);
    if (w != null) { const ws = el('span', 'pm-w', 'weight ' + w + (w === 0 ? ' (not counted)' : '')); ws.title = 'Weight set by the editor, 0–10'; li.append(ws); }
    const val = pi.num(m.value);
    if (val != null || m.v) li.append(el('span', 'pm-v', String(m.v || NUMF.format(val))));
    else li.append(el('span', 'pm-none', m.none ? String(m.none) : 'no newer figure'));
    if (val != null && typeof m.agrees === 'boolean') li.append(el('span', m.agrees ? 'pm-ok' : 'pm-no', m.agrees ? '✓ agrees' : '≠ differs'));
    if (m.lead === true) li.append(el('span', 'pm-lead', /value/.test(String(v.edited || '')) ? '★ source of the published value' : '★ lead answer'));
    const s = el('span', 'pm-s');
    if (m.basis === 'knowledge') { s.append(badge('ai-knowledge')); if (m.note) s.append(el('span', 'cov', String(m.note))); }
    else if (m.url && safeHref(m.url) && /^https?:/i.test(safeHref(m.url))) s.append(ext(m.url, String(m.title || host(m.url) || 'source')));
    else if (m.title) s.append(document.createTextNode(String(m.title)));
    if (s.childNodes.length) li.append(s);
    ul.append(li);
  });
  if (ul.childNodes.length) box.append(ul);
  box.append(el('p', 'meta', 'The published value is the ' + pi.rule + ' of the answers, using the weights the editor sets (answers from model knowledge count less). The lead answer’s source is shown above; a person approved the value.'));
  if (typeof v.edited === 'string' && v.edited) box.append(el('p', 'meta', v.edited.replace(/\.?$/, '.')));   // what the reviewer changed or chose
  return box;
}
function checkLine(c) {
  if (!c) return null;
  const p = el('p', 'chk ' + (c.agree ? 'ok' : 'no'));
  p.append(el('b', '', c.agree ? 'Second opinion agrees' : 'Second opinion disagrees'), document.createTextNode((c.by ? ' (' + c.by + ')' : '') + (c.note ? ': ' + c.note : '')));
  if (c.url) { p.append(document.createTextNode(' ')); p.append(ext(c.url, 'its source')); }
  return p;
}
/* full provenance block of one starting value */
function anchorBlock(a, opts) {
  opts = opts || {};
  const box = el('div', 'anb');
  const head = el('div', 'anh'); head.append(badge(badgeKind(a.status)), el('span', 'anv', a.v || ''), el('span', 'meta', a.period || ''));
  box.append(head);
  if (a.scope) box.append(el('p', 'scope', 'Scope: ' + a.scope));
  const s = el('p', 'srcl'); s.append(el('b', '', 'Source: '));
  if (a.url) s.append(ext(a.url, a.src || a.url)); else s.append(document.createTextNode(a.src || '—'));
  box.append(s);
  if (a.calc) { box.append(el('p', 'lbl2', 'How it was derived')); box.append(el('p', 'calc', a.calc)); }
  const isK = a.via && a.via.type === 'ai-knowledge';
  if (a.quote && isK) { box.append(el('p', 'lbl2', 'The model’s explanation')); box.append(el('p', 'calc', a.quote)); }
  else if (a.quote) { const q = el('blockquote', 'quote', '“' + a.quote + '”'); box.append(q); }
  if (a.refs && a.refs.length) { box.append(el('p', 'lbl2', 'Further references')); const u = el('ul', 'gul'); a.refs.forEach(r => u.append(srcItem(r))); box.append(u); }
  const v = a.via;
  if (v) {
    const p = el('p', 'via'); p.append(el('b', '', 'Obtained: '), document.createTextNode(viaText(v)));
    if (v.type && M.via[v.type] && v.name !== M.via[v.type]) p.title = M.via[v.type];
    box.append(p);
    if (v.type === 'ai-knowledge') box.append(el('p', 'meta', 'No specific published source: ' + (M.badges['ai-knowledge'] ? M.badges['ai-knowledge'].meaning : 'treat it as an informed estimate.')));
    const pb = panelBlock(v); if (pb) box.append(pb);
    const c = checkLine(v.check); if (c) box.append(c);
  }
  const dates = [a.retrieved ? 'retrieved ' + dateTxt(a.retrieved) : '', a.reviewed ? 'reviewed ' + dateTxt(a.reviewed) : ''].filter(Boolean).join(' · ');
  if (dates) box.append(el('p', 'meta', dates.charAt(0).toUpperCase() + dates.slice(1)));
  if (a.prev) box.append(el('p', 'meta', 'Previous value: ' + a.prev));
  else if (a.was) box.append(el('p', 'meta', 'Before the latest model revision (v2): ' + a.was));
  if (!opts.noUse && MET()[a.k]) { const u = el('p', 'meta'); u.append(document.createTextNode('Feeds the measure ')); u.append(metricChip(a.k)); box.append(u); }
  return box;
}
function metricMethod(k, opts) {
  opts = opts || {};
  const m = M.metrics[k]; const box = el('div', 'mm');
  if (!m) { box.append(el('p', '', 'No method note for this measure.')); return box; }
  if (!opts.noDef) box.append(el('p', 'def', m.definition + (m.unit ? ' Unit: ' + m.unit + '.' : '')));
  if (!opts.noModel && m.model) {
    box.append(el('p', 'lbl2', 'Model formula (2027–2035)'));
    box.append(formulaBlock(m.model.formula));
    if (m.model.explanation) box.append(el('p', 'expl', m.model.explanation));
    const chips = el('p', 'chips2');
    (m.model.drivers || []).forEach(d => { const D = E.DRIVERS.find(x => x.k === d); if (D) { const c = el('span', 'dchip', D.name); c.title = D.desc; chips.append(c); } });
    if (chips.childNodes.length) { box.append(el('p', 'lbl2', 'Drivers')); box.append(chips); }
    const ins = el('p', 'chips2'); (m.model.inputs || []).forEach(x => { if (MET()[x]) ins.append(metricChip(x)); });
    if (ins.childNodes.length) { box.append(el('p', 'lbl2', 'Uses')); box.append(ins); }
  }
  if (!opts.noHist && m.history) {
    box.append(el('p', 'lbl2', 'History (2023 – Q4 2026)'));
    box.append(el('p', 'expl', m.history.method));
    if (m.history.sources && m.history.sources.length) { const u = el('ul', 'gul'); m.history.sources.forEach(s => u.append(srcItem(s))); box.append(u); }
    const a = m.anchor && anchorById(m.anchor); if (a) { const p = el('p', 'meta'); p.append(document.createTextNode('Q4 2026 starting value: ')); p.append(anchorChip(a)); box.append(p); }
  }
  if (m.caveats && m.caveats.length && !opts.noCaveats) { box.append(el('p', 'lbl2', 'Caveats')); box.append(ulOf(m.caveats)); }
  return box;
}

/* ---------- provenance popover ---------- */
let prov = null, provTrigger = null, provOpenedAt = 0;
function provEl() {
  if (prov) return prov;
  prov = el('div', 'prov'); prov.id = 'prov'; prov.hidden = true; prov.setAttribute('role', 'dialog'); prov.setAttribute('aria-modal', 'false'); prov.setAttribute('aria-labelledby', 'provT');
  document.body.append(prov);
  prov.addEventListener('keydown', e => { if (e.key === 'Tab') trapIn(prov, e); });
  document.addEventListener('pointerdown', e => { if (prov && !prov.hidden && !prov.contains(e.target) && !(provTrigger && provTrigger.contains(e.target)) && !(gtip && gtip.contains(e.target))) closeProv(false); }, true);
  return prov;
}
function trapIn(box, e) {
  const f = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', box).filter(n => n.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1], i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); first.focus(); }
}
function closeProv(restore) {
  if (!prov || prov.hidden) return false;
  prov.hidden = true;
  if (restore !== false && provTrigger && provTrigger.isConnected && provTrigger.focus) provTrigger.focus();
  provTrigger = null;
  return true;
}
function placeProv(anchorEl, pt) {
  const p = prov, vw = window.innerWidth, vh = window.innerHeight;
  p.classList.toggle('sheet', vw <= 640);
  if (vw <= 640) { p.style.left = ''; p.style.top = ''; return; }
  const w = Math.min(400, vw - 24); p.style.width = w + 'px';
  let x, y; const h = Math.min(p.scrollHeight, vh * 0.8, 640);
  if (anchorEl && anchorEl.getBoundingClientRect) {
    const r = anchorEl.getBoundingClientRect();
    x = r.left; y = r.bottom + 6;
    if (y + h > vh - 8) {
      // below does not fit: try above, then beside the anchor, so the card never hides what it explains
      const side = Math.min(Math.max(8, r.top), vh - h - 8);
      if (r.top - h - 6 >= 8) y = r.top - h - 6;
      else if (r.right + 8 + w <= vw - 12) { x = r.right + 8; y = side; }
      else if (r.left - 8 - w >= 12) { x = r.left - 8 - w; y = side; }
      else y = Math.max(8, vh - h - 8);
    }
  } else if (pt) { x = pt.x + 12; y = pt.y + 12; if (y + h > vh - 8) y = Math.max(8, pt.y - h - 12); if (x + w > vw - 8) x = pt.x - w - 12; }
  else { x = (vw - w) / 2; y = Math.max(8, (vh - h) / 2); }
  p.style.left = Math.max(12, Math.min(vw - w - 12, x)) + 'px';
  p.style.top = Math.max(8, Math.min(vh - 60, y)) + 'px';
}
function openProvBox(title, kicker, build, anchorEl, pt) {
  const p = provEl();
  closeProv(false);
  p.innerHTML = '';
  const head = el('div', 'provh');
  const tt = el('div', 'tt'); if (kicker) tt.append(el('span', 'kick', kicker));
  const h = el('h2', '', title); h.id = 'provT'; h.tabIndex = -1; tt.append(h);
  const x = el('button', 'x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = svg('close'); x.addEventListener('click', () => closeProv());
  head.append(tt, x);
  const body = el('div', 'provb');
  p.append(head, body);
  build(body);
  glossify(body, 4);
  p.hidden = false; provTrigger = anchorEl && anchorEl.focus ? anchorEl : (document.activeElement !== document.body ? document.activeElement : null); provOpenedAt = Date.now();
  placeProv(anchorEl, pt);
  p.scrollTop = 0;
  setTimeout(() => h.focus({ preventScroll: true }), 0);
}
function provFoot(body, items) {
  const f = el('div', 'provf');
  items.forEach(([txt, fn, primary]) => f.append(btn(txt, primary ? 'primary' : '', fn)));
  body.append(f);
}
function askAbout(text, panel) { const S = window.AICX_SITE; closeProv(false); if (S && S.openChat) S.openChat(text, panel ? { panel } : null); }

/* metric k at quarter i for scenario key */
function openMetric(k, anchorEl, opts) {
  opts = opts || {};
  const st = UI.state, key = opts.key || st.key, i = opts.i != null ? opts.i : UI.ci();
  const runs = UI.runs(); const run = runs[key] || runs[st.key];
  const v = run && run[k] ? run[k][i] : NaN;
  const type = typeOf(k, i);
  const scnName = key === st.key ? st.name : (UI.scenarios().find(s => s.key === key) || {}).name || key;
  openProvBox(mName(k), type === 'model' ? 'Model output · ' + qOf(i) : 'History · ' + qOf(i), b => {
    const top = el('div', 'pvv'); top.append(el('span', 'big', UI.fmt(k, v)), badge(type));
    b.append(top);
    b.append(el('p', 'meta', (i > NOW ? scnName + ' · ' : '') + qOf(i) + (M.metrics[k] && M.metrics[k].unit ? ' · ' + M.metrics[k].unit : '')));
    const m = M.metrics[k] || null;
    if (type === 'model') {
      b.append(el('p', 'lead', 'Computed by the scenario model for “' + scnName + '”. Formula:'));
      if (m) { b.append(formulaBlock(m.model.formula)); if (m.model.explanation) b.append(el('p', 'expl', m.model.explanation)); }
      const drv = (m && m.model.drivers) || [];
      if (drv.length && run && run.drivers) {
        b.append(el('p', 'lbl2', 'Drivers in this run at ' + qOf(i) + ' (today in brackets)'));
        const t = el('table', 'mini'); const tb = el('tbody');
        drv.forEach(d => { const D = E.DRIVERS.find(x => x.k === d); if (!D) return; const tr = el('tr'); tr.append(el('td', '', D.name), el('td', 'num', run.drivers[d][i].toFixed(2) + ' (' + E.BASE[d].toFixed(2) + ')')); tr.title = D.desc + ' 0 = ' + D.lo + ', 1 = ' + D.hi + '.'; tb.append(tr); });
        t.append(tb); b.append(t);
      }
      const ins = el('p', 'chips2'); ((m && m.model.inputs) || []).forEach(x => { if (MET()[x]) ins.append(metricChip(x)); });
      if (ins.childNodes.length) { b.append(el('p', 'lbl2', 'Uses these measures')); b.append(ins); }
      const a = anchorFor(k); if (a) { const p = el('p', 'meta'); p.append(document.createTextNode('Starts from the Q4 2026 value ')); p.append(anchorChip(a)); b.append(p); }
    } else {
      const a = anchorFor(k);
      if (i === NOW && a) { b.append(el('p', 'lead', 'Q4 2026 starting value from the evidence ledger:')); b.append(anchorBlock(a, { noUse: true })); }
      else {
        const hc = histContext(k, i);
        if (hc) {
          const pl = p => qOf(E.idxOf(p[0])) + ' (' + UI.fmt(k, p[1]) + ')';
          b.append(el('p', 'lead', hc.none ? 'No comparable data for this quarter; the series starts later.' : hc.exact ? 'A dated data point.' : hc.a ? 'Between dated points: interpolated ' + (hc.log ? 'on a log scale ' : '') + 'from ' + pl(hc.a) + ' to ' + pl(hc.b) + '.' : 'Held at ' + pl(hc.held) + '.'));
        } else if (m) { b.append(el('p', 'lead', 'Derived from other history series:')); b.append(formulaBlock(m.model.formula.slice(0, 1))); }
        if (m) { b.append(el('p', 'expl', m.history.method)); if (m.history.sources && m.history.sources.length) { const u = el('ul', 'gul'); m.history.sources.forEach(s => u.append(srcItem(s))); b.append(u); } }
        if (a) { const p = el('p', 'meta'); p.append(document.createTextNode('Q4 2026 starting value: ')); p.append(anchorChip(a)); b.append(p); }
        if (E.HIST[k]) {
          const pts = E.HIST[k].pts.filter(p => p[0] >= 2023 && p[0] <= E.NOW_T);
          const d = el('details', 'pts'); d.append(el('summary', '', 'Dated points used (' + pts.length + ')'));
          d.append(el('p', 'meta', pts.map(p => qOf(E.idxOf(p[0])) + ': ' + UI.fmt(k, p[1])).join(' · ')));
          b.append(d);
        }
      }
    }
    if (m && m.caveats && m.caveats.length) { b.append(el('p', 'lbl2', 'Caveats')); b.append(ulOf(m.caveats)); }
    provFoot(b, [['Ask AI about this', () => askAbout('Explain “' + mName(k) + '” at ' + qOf(i) + (i > NOW ? ' in ' + scnName : '') + ': what it means and how it is computed. [M:' + k + ']'), true], ['Full method', () => { closeProv(false); openSources({ tab: 'methods', metric: k }); }]]);
  }, anchorEl, opts.pt);
}
function openAnchor(id, anchorEl) {
  const a = anchorById(id); if (!a) return;
  openProvBox(a.name, a.id + ' · starting value', b => {
    b.append(anchorBlock(a));
    provFoot(b, [['Ask AI about this', () => askAbout('What is ' + a.id + ' (' + a.name + ') based on, and how reliable is it? [' + a.id + ']'), true], ['All sources', () => { closeProv(false); openSources({ tab: 'sources', anchor: a.id }); }]]);
  }, anchorEl);
}
function openImpact(j, anchorEl, opts) {
  opts = opts || {};
  const row = E.IMPACT_ROWS[j]; if (!row) return;
  const st = UI.state, i0 = opts.i != null ? opts.i : UI.ci(), i = i0 <= NOW ? E.idxOf(2030.75) : i0;
  const run = UI.runs()[st.key]; if (!run) return;
  const imp = UI.impactsOf(st.key); const score = imp.rows[j][i];
  const F = E.features(run, i);
  openProvBox(row.n, 'Impact score · ' + qOf(i), b => {
    const top = el('div', 'pvv'); top.append(el('span', 'big ' + (score >= 0 ? 'up' : 'dn'), (score >= 0 ? '+' : '−') + Math.abs(Math.round(score))), badge('model'));
    b.append(top);
    b.append(el('p', 'meta', row.g + ' · ' + st.name + ' · ' + qOf(i) + (i0 <= NOW ? ' (the cursor is in history, so Q4 2030 is shown)' : '') + ' · −100…+100 versus Q4 2026'));
    b.append(formulaBlock([M.impact ? M.impact.formula : 'score = 100 × tanh(Σ weight × factor ÷ 1.6)']));
    const parts = Object.keys(row.w).map(k => ({ k, w: row.w[k], f: F[k], c: row.w[k] * F[k] })).sort((x, y) => Math.abs(y.c) - Math.abs(x.c));
    const sum = parts.reduce((s, p) => s + p.c, 0);
    const t = el('table', 'mini'); const th = el('thead'); const hr = el('tr');
    ['Factor', 'Weight', 'Factor now', 'Effect'].forEach((x, n) => hr.append(el('th', n ? 'num' : '', x))); th.append(hr); t.append(th);
    const tb = el('tbody');
    parts.forEach(p => { const tr = el('tr'); const nm = el('td', '', E.FEAT_NAMES[p.k] || p.k); if (M.impact && M.impact.features && M.impact.features[p.k]) nm.title = M.impact.features[p.k]; tr.append(nm, el('td', 'num', (p.w > 0 ? '+' : '') + p.w.toFixed(2)), el('td', 'num', (p.f >= 0 ? '+' : '') + p.f.toFixed(2)), el('td', 'num ' + (p.c >= 0 ? 'up' : 'dn'), (p.c >= 0 ? '+' : '') + p.c.toFixed(2))); tb.append(tr); });
    const tr = el('tr', 'sum'); tr.append(el('td', '', 'Sum → 100 × tanh(sum ÷ 1.6)'), el('td'), el('td'), el('td', 'num', (sum >= 0 ? '+' : '') + sum.toFixed(2) + ' → ' + Math.round(score))); tb.append(tr);
    t.append(tb); const wrap = el('div', 'tscroll'); wrap.append(t); b.append(wrap);
    b.append(el('p', 'expl', 'Factors are changes since Q4 2026, scaled to comparable sizes (hover a factor for its definition). Weights are hand-set judgements for this row, not estimates from data.'));
    provFoot(b, [['Ask AI about this', () => askAbout('Why does “' + row.n + '” score ' + Math.round(score) + ' at ' + qOf(i) + ' in ' + st.name + '?', 'heat'), true], ['About the impact matrix', () => { closeProv(false); openExplainer('heat'); }]]);
  }, anchorEl, opts.pt);
}
function openSign(j, anchorEl) {
  const s = UI.signs[j]; if (!s) return;
  const st = UI.state, run = UI.runs()[st.key], c = UI.ci();
  const val = i => (s.fn ? s.fn(run, i) : run[s.k][i]);
  const hit = v => (s.op === '<' ? v < s.v : v > s.v);
  let first = null; for (let i = NOW + 1; i < E.NQ; i++) if (hit(val(i))) { first = i; break; }
  const k = s.k || 'K';
  openProvBox(s.n, 'Early-warning signpost', b => {
    const v = val(c);
    const top = el('div', 'pvv'); top.append(el('span', 'big', s.f ? s.f(v) : UI.fmt(k, v)), badge(c > NOW ? 'model' : typeOf(k, c)));
    b.append(top);
    b.append(el('p', 'meta', st.name + ' · ' + qOf(c)));
    b.append(el('p', 'lbl2', 'Rule'));
    b.append(formulaBlock([(s.fn ? 'Big-4 capex ÷ capex a year earlier − 1' : mName(k)) + ' ' + s.op + ' ' + (s.fn ? '0%' : UI.fmt(k, s.v))]));
    b.append(el('p', 'expl', (hit(v) ? 'Crossed at the cursor. ' : 'Not crossed at the cursor. ') + (hit(val(NOW)) ? 'Already crossed in Q4 2026.' : first != null ? 'This run first crosses it in ' + qOf(first) + '.' : 'This run never crosses it before 2036.') + ' Risk level: ' + (s.risk === 2 ? 'serious' : s.risk === 1 ? 'watch' : 'structural shift') + '.'));
    b.append(el('p', 'lbl2', 'The measure')); const p = el('p', 'chips2'); p.append(metricChip(k)); b.append(p);
    provFoot(b, [['Ask AI about this', () => askAbout('What would it mean if “' + s.n + '” were triggered, and when does that happen in ' + st.name + '?', 'signs'), true]]);
  }, anchorEl);
}
function openLane(id, anchorEl) {
  const L = UI.lanes.find(x => x.id === id); if (!L) return;
  const c = UI.ci(), st = UI.state, run = UI.runs()[st.key];
  openProvBox(L.t, 'Timeline lane · ' + qOf(c), b => {
    b.append(el('p', 'meta', L.u + (L.ill ? ' · illustrative' : '') + ' · ' + st.name));
    L.s.forEach((S, n) => {
      const card = el('div', 'lcard');
      const h = el('div', 'pvv'); const name = el('span', 'nm', S.n + (n ? '' : ' (bold line)')); h.append(name, el('span', 'big sm', UI.fmt(S.k, run[S.k][c])), badge(typeOf(S.k, c)));
      card.append(h);
      const m = M.metrics[S.k];
      if (m) card.append(el('p', 'expl', m.definition));
      if (m && c > NOW) card.append(formulaBlock(m.model.formula.slice(0, 2)));
      const ch = el('p', 'chips2'); ch.append(metricChip(S.k)); const a = anchorFor(S.k); if (a) ch.append(anchorChip(a)); card.append(ch);
      b.append(card);
    });
    (L.thr || []).forEach(t => b.append(el('p', 'meta', 'Threshold line: ' + t.n.toLowerCase() + ' at ' + UI.fmt(L.s[0].k, t.v) + '.')));
    if (L.mark) b.append(el('p', 'meta', 'Diamond: ' + L.mark.n + ' (' + UI.fmt(L.s[0].k, L.mark.v) + ') — outside projection for comparison.'));
    provFoot(b, [['How to read the timelines', () => { closeProv(false); openExplainer('lanes'); }]]);
  }, anchorEl);
}
function openDriver(k, anchorEl) {
  const D = E.DRIVERS.find(x => x.k === k); if (!D) return;
  const st = UI.state, run = UI.runs()[st.key], c = UI.ci();
  openProvBox(D.name, 'Driver · 0 = ' + D.lo + ', 1 = ' + D.hi, b => {
    const top = el('div', 'pvv'); top.append(el('span', 'big', run.drivers[k][c].toFixed(2)), badge('assumption', 'scenario input')); b.append(top);
    b.append(el('p', 'expl', D.desc));
    b.append(el('p', 'meta', 'Today (Q4 2026): ' + E.BASE[k].toFixed(2) + ' · at ' + qOf(c) + ' in ' + st.name + ': ' + run.drivers[k][c].toFixed(2)));
    const t = el('table', 'mini'); const tb = el('tbody'); const tr = el('tr'); tr.append(el('th', '', 'Scenario path')); E.KT.forEach(x => tr.append(el('th', 'num', ktLabel(x)))); tb.append(tr);
    const scn = E.SCENARIOS.find(s => s.key === (st.key === 'CUST' ? (st.custom && st.custom.base) : st.key));
    if (scn) { const r2 = el('tr'); r2.append(el('td', '', scn.short)); scn.d[k].forEach(v => r2.append(el('td', 'num', v.toFixed(2)))); tb.append(r2); }
    t.append(tb); b.append(t);
    const aff = (M.drivers && M.drivers[k] && M.drivers[k].affects) || [];
    if (aff.length) { b.append(el('p', 'lbl2', 'Enters the equations of')); const p = el('p', 'chips2'); aff.forEach(x => { if (MET()[x]) p.append(metricChip(x)); }); b.append(p); }
    provFoot(b, [['About the drivers', () => { closeProv(false); openExplainer('drivers'); }]]);
  }, anchorEl);
}
function openMethodPop(k, anchorEl) {
  if (!M.metrics[k] || !MET()[k]) return;
  openProvBox(mName(k), 'How it is computed', b => {
    b.append(metricMethod(k));
    provFoot(b, [['See it at the cursor', () => openMetric(k, anchorEl), true], ['All methods', () => { closeProv(false); openSources({ tab: 'methods', metric: k }); }]]);
  }, anchorEl);
}
/* data-prov specs: m:K | m:K|s:COMM | meth:K | an:AN1 | imp:12 | imp:12|i:30 | sign:3 | lane:capex | drv:energy */
function openSpec(spec, anchorEl, pt) {
  const parts = {}; String(spec).split('|').forEach(x => { const i = x.indexOf(':'); if (i > 0) parts[x.slice(0, i)] = x.slice(i + 1); });
  if (parts.m) openMetric(parts.m, anchorEl, { key: parts.s, i: parts.i != null ? +parts.i : undefined, pt });
  else if (parts.meth) openMethodPop(parts.meth, anchorEl);
  else if (parts.an) openAnchor(parts.an, anchorEl);
  else if (parts.imp != null) openImpact(+parts.imp, anchorEl, { i: parts.i != null ? +parts.i : undefined, pt });
  else if (parts.sign != null) openSign(+parts.sign, anchorEl);
  else if (parts.lane) openLane(parts.lane, anchorEl);
  else if (parts.drv) openDriver(parts.drv, anchorEl);
}
document.addEventListener('click', e => {
  const t = e.target.closest && e.target.closest('[data-prov]');
  if (!t) return;
  const a = e.target.closest('a[href]'); if (a && !a.dataset.prov) return;   // links inside rows keep working
  e.preventDefault(); e.stopPropagation();
  openSpec(t.dataset.prov, t);
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target; if (!t || !t.dataset || !t.dataset.prov || t.tagName === 'BUTTON') return;
  e.preventDefault(); e.stopPropagation(); openSpec(t.dataset.prov, t);
});
document.addEventListener('aicx:heat', e => { const d = e.detail || {}; openImpact(d.row, null, { i: d.i, pt: { x: d.x, y: d.y } }); });

/* ---------- explainer drawer ---------- */
let xpl = null, xplId = null, xplTrigger = null, xplTimer = 0, xplOpenedAt = 0;
function xplEl() {
  if (xpl) return xpl;
  xpl = el('aside', 'xpl'); xpl.id = 'xpl'; xpl.hidden = true; xpl.setAttribute('role', 'dialog'); xpl.setAttribute('aria-modal', 'false'); xpl.setAttribute('aria-labelledby', 'xplT');
  document.body.append(xpl);
  return xpl;
}
function closeExplainer(restore) {
  if (!xpl || xpl.hidden) return false;
  xpl.hidden = true; clearInterval(xplTimer); document.body.classList.remove('xpl-open');
  if (restore !== false && xplTrigger && xplTrigger.isConnected && xplTrigger.focus) xplTrigger.focus();
  xplTrigger = null; xplId = null;
  return true;
}
function panelMetrics(P) { return ((P.sources && P.sources.metrics) || []).filter(k => MET()[k] && M.metrics[k]); }
function panelAnchors(P, mets) {
  const ids = new Set();
  const list = (P.sources && P.sources.anchors) || [];
  if (list.indexOf('*') >= 0) ANCH().forEach(a => ids.add(a.id));
  list.forEach(id => { if (anchorById(id)) ids.add(id); });
  mets.forEach(k => { const a = anchorFor(k); if (a) ids.add(a.id); });
  return [...ids].map(anchorById).filter(Boolean);
}
function ctxLine() { const st = UI.state; return 'Now showing: ' + st.name + ' · ' + st.quarter; }
function openExplainer(id, trigger) {
  const P = M.panels[id]; if (!P) return;
  const x = xplEl();
  closeProv(false);
  x.innerHTML = '';
  const head = el('div', 'xplh');
  const tt = el('div', 'tt'); tt.append(el('span', 'kick', 'Explainer'));
  const h = el('h2', '', P.title); h.id = 'xplT'; h.tabIndex = -1; tt.append(h);
  const cl = el('button', 'x'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close the explainer'); cl.innerHTML = svg('close'); cl.addEventListener('click', () => closeExplainer());
  head.append(tt, cl);
  const nav = el('nav', 'xpln'); nav.setAttribute('aria-label', 'Sections');
  const body = el('div', 'xplb');
  x.append(head, nav, body);
  const one = el('p', 'one', P.oneLiner); body.append(one);
  const ctx = el('p', 'ctx', ctxLine()); body.append(ctx);
  const sections = [];
  const add = (key, title, fill) => { const s = sec(title); s.id = 'xs-' + key; fill(s); body.append(s); sections.push([key, title]); };
  add('overview', 'Overview', s => { s.append(el('p', '', P.what)); if (P.whyItMatters) { const w = el('p', 'why'); w.append(el('b', '', 'Why it matters. '), document.createTextNode(P.whyItMatters)); s.append(w); } });
  if (P.howToRead && P.howToRead.length) add('read', 'How to read', s => s.append(ulOf(P.howToRead)));
  if (P.parts) add('parts', 'Tabs', s => { const dl = el('dl', 'gdl'); Object.entries(P.parts).forEach(([k, v]) => { dl.append(el('dt', '', (UI.lens.find(L => L.id === k) || {}).n || k), el('dd', '', v)); }); s.append(dl); });
  const mets = panelMetrics(P);
  add('method', 'Method & formula', s => {
    s.append(el('p', '', P.method));
    if (id === 'heat' && M.impact) { s.append(formulaBlock([M.impact.formula])); s.append(el('p', 'expl', M.impact.explanation)); const d = el('details', 'mm2'); d.append(el('summary', '', 'Factor definitions')); const dl = el('dl', 'gdl'); Object.entries(M.impact.features).forEach(([k, v]) => dl.append(el('dt', '', E.FEAT_NAMES[k] || k), el('dd', '', v))); d.append(dl); s.append(d); }
    if (id === 'pools' && M.pools) { s.append(formulaBlock(M.pools.formula)); s.append(el('p', 'expl', M.pools.explanation)); }
    if (id === 'drivers') { const dl = el('dl', 'gdl'); E.DRIVERS.forEach(D => { const dt = el('dt'); const b2 = el('button', 'lnk', D.name); b2.type = 'button'; b2.dataset.prov = 'drv:' + D.k; dt.append(b2); dl.append(dt, el('dd', '', D.desc + ' (0 = ' + D.lo + ', 1 = ' + D.hi + '; today ' + E.BASE[D.k].toFixed(2) + ')')); }); s.append(dl); }
    if (id === 'shocks') { const dl = el('dl', 'gdl'); E.SHOCKS.forEach(S2 => dl.append(el('dt', '', S2.name + ' · ' + qOf(E.idxOf(S2.t))), el('dd', '', S2.desc))); s.append(dl); }
    if (id === 'signs') s.append(ulOf(UI.signs.map((g, j) => { const li = el('li'); const b2 = el('button', 'lnk', g.n); b2.type = 'button'; b2.dataset.prov = 'sign:' + j; li.append(b2); return li; })));
    if (id === 'scenarios') { const dl = el('dl', 'gdl'); E.SCENARIOS.forEach(S2 => dl.append(el('dt', '', S2.key + ' · ' + S2.name), el('dd', '', ((M.scenarios[S2.key] || {}).tilts || '') ))); s.append(dl); }
    if (mets.length) {
      s.append(el('p', 'lbl2', mets.length > 1 ? 'Measures in this panel (tap to open the formula)' : 'The measure'));
      mets.forEach((k, n) => { const d = el('details', 'mm2'); if (mets.length === 1 || (n === 0 && mets.length <= 3)) d.open = true; const sm = el('summary'); sm.append(el('span', '', mName(k))); sm.append(el('span', 'u', M.metrics[k].unit)); d.append(sm); d.append(metricMethod(k, { noCaveats: true })); s.append(d); });
    }
  });
  const ans = panelAnchors(P, mets);
  const evid = id === 'lens' ? Object.entries(E.SECTOR_EVIDENCE) : [];
  if (ans.length || evid.length || id === 'events') add('sources', 'Sources', s => {
    if (ans.length) {
      s.append(el('p', 'lbl2', 'Starting values (evidence ledger)'));
      const u = el('ul', 'gul an');
      ans.forEach(a => { const li = el('li'); li.append(anchorChip(a)); li.append(badge(badgeKind(a.status))); if (a.url) li.append(ext(a.url, a.src)); else li.append(el('span', 'meta', a.src)); u.append(li); });
      s.append(u);
    }
    evid.forEach(([sec2, items]) => { s.append(el('p', 'lbl2', 'Evidence · ' + ((UI.lens.find(L => L.id === sec2) || {}).n || sec2))); const u = el('ul', 'gul'); items.forEach(it => { const li = el('li'); li.append(document.createTextNode(it.t + ' — ')); li.append(ext(it.url, it.src)); u.append(li); }); s.append(u); });
    if (id === 'events') { const u = el('ul', 'gul'); (M.events || []).forEach(ev => { const li = el('li'); li.append(el('span', 'meta', qOf(E.idxOf(ev.t)) + ' · '), document.createTextNode(ev.text + ' ')); (ev.sources || []).forEach(sr => { if (sr.url) li.append(ext(sr.url, '↗ ' + (sr.publisher || host(sr.url)))); }); u.append(li); }); s.append(u); }
    const hs = []; const seen = new Set(); mets.forEach(k => (M.metrics[k].history.sources || []).forEach(sr => { if (sr.url && !seen.has(sr.url)) { seen.add(sr.url); hs.push(sr); } }));
    if (hs.length) { s.append(el('p', 'lbl2', 'History sources')); const u = el('ul', 'gul'); hs.slice(0, 14).forEach(sr => u.append(srcItem(sr))); s.append(u); if (hs.length > 14) s.append(el('p', 'meta', '…and ' + (hs.length - 14) + ' more in Sources & methods.')); }
  });
  if (P.caveats && P.caveats.length) add('caveats', 'Caveats', s => s.append(ulOf(P.caveats)));
  sections.forEach(([k, t]) => { const a = el('a', '', t); a.href = '#xs-' + k; a.addEventListener('click', e => { e.preventDefault(); const tgt = $('#xs-' + k, body); if (tgt) tgt.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); }); nav.append(a); });
  const foot = el('div', 'xplf');
  const chatOk = !!(window.AICX_SITE && window.AICX_SITE.config && window.AICX_SITE.config.chatEnabled !== false && document.getElementById('chatFab'));
  if (chatOk && id.indexOf('chat') !== 0) foot.append(btn('Ask AI about this', 'primary', () => { const st = UI.state; closeExplainer(false); window.AICX_SITE.openChat('Explain the “' + P.title + '” panel for ' + st.name + ' at ' + st.quarter + ': what does it show and what should I watch?', { panel: id }); }));
  foot.append(btn('All sources & methods', '', () => openSources({ tab: id === 'ledger' ? 'sources' : 'methods' })));
  x.append(foot);
  glossify(body, 8);
  x.hidden = false; document.body.classList.add('xpl-open');
  xplId = id; xplTrigger = trigger || (document.activeElement !== document.body ? document.activeElement : null); xplOpenedAt = Date.now();
  body.scrollTop = 0;
  clearInterval(xplTimer); xplTimer = setInterval(() => { if (!xpl.hidden) { const t2 = ctxLine(); if (ctx.textContent !== t2) ctx.textContent = t2; } }, 600);
  setTimeout(() => h.focus({ preventScroll: true }), 0);
}

/* ---------- Sources & methods view ---------- */
function allSources() {
  /* one list of every source with what it supports and its type */
  const out = []; const add = (s, sup, type) => { if (!s || !s.url) return; out.push({ title: s.title || s.src || s.url, url: s.url, publisher: s.publisher || host(s.url), date: s.date || '', sup, type }); };
  ANCH().forEach(a => {
    const t = badgeKind(a.status);
    if (a.url) add({ title: a.src, url: a.url }, a.id + ' · ' + shortAnchor(a), t);
    (a.refs || []).forEach(r => add(r, a.id + ' · ' + shortAnchor(a), t));
  });
  Object.entries(M.metrics || {}).forEach(([k, m]) => (m.history.sources || []).forEach(s => add(s, 'history of ' + mName(k), 'history')));
  Object.entries(E.SECTOR_EVIDENCE).forEach(([sec2, items]) => items.forEach(it => add({ title: it.t, url: it.url, publisher: it.src }, 'sector evidence · ' + ((UI.lens.find(L => L.id === sec2) || {}).n || sec2), 'evidence')));
  (M.events || []).forEach(ev => (ev.sources || []).forEach(s => add(s, 'event · ' + qOf(E.idxOf(ev.t)), 'event')));
  (UI.footerSources || []).forEach(([t, u]) => add({ title: t, url: u }, 'core sources', 'core'));
  /* merge duplicates: same URL → one entry listing everything it supports */
  const by = new Map();
  out.forEach(s => { const k = s.url.replace(/\/$/, ''); const cur = by.get(k); if (!cur) by.set(k, Object.assign({}, s, { sups: [s.sup], types: new Set([s.type]) })); else { if (cur.sups.indexOf(s.sup) < 0) cur.sups.push(s.sup); cur.types.add(s.type); if (!cur.date && s.date) cur.date = s.date; if (cur.publisher === host(cur.url) && s.publisher !== host(s.url)) cur.publisher = s.publisher; } });
  return [...by.values()];
}
const FILTERS = [['all', 'All'], ['reported', 'Reported'], ['survey', 'Survey'], ['estimate', 'Estimate'], ['forecast', 'Forecast'], ['assumption', 'Assumption'], ['ai-knowledge', 'AI knowledge'], ['index', 'Model index'], ['history', 'History'], ['evidence', 'Sector evidence'], ['event', 'Events']];
let srcState = { tab: 'sources', filter: 'all', q: '' };
function openSources(opts) {
  opts = opts || {};
  const S = window.AICX_SITE; if (!S || !S.openDialog) return;
  closeProv(false); hideMenu();
  srcState = { tab: opts.tab || 'sources', filter: 'all', q: '' };
  S.openDialog('sources', 'Sources & methods', pb => {
    pb.classList.add('srcv');
    pb.append(el('p', 'lead', 'Every number on AI Forecast Atlas is either dated public data with a source, or a model output with a formula. This view lists all of it. Data, charts and texts: CC BY 4.0.'));
    const tabs = el('div', 'stabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Sources and methods');
    const panes = {};
    const TABS = [['sources', 'Sources'], ['methods', 'Methods'], ['scenarios', 'Scenarios & drivers'], ['verify', 'How we verify'], ['changes', 'This week’s changes']];
    TABS.forEach(([k, t]) => {
      const b2 = el('button', 'stab', t); b2.type = 'button'; b2.setAttribute('role', 'tab'); b2.id = 'stab-' + k; b2.setAttribute('aria-controls', 'spane-' + k); b2.dataset.k = k;
      b2.addEventListener('click', () => show(k, true)); tabs.append(b2);
      const p = el('div', 'spane'); p.id = 'spane-' + k; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b2.id); p.tabIndex = 0; p.hidden = true; panes[k] = p;
    });
    tabs.addEventListener('keydown', e => {
      const ks = TABS.map(t => t[0]); const i = ks.indexOf(srcState.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ks[(i + (e.key === 'ArrowRight' ? 1 : ks.length - 1)) % ks.length]; show(n, true); $('#stab-' + n).focus(); }
      if (e.key === 'Home') { e.preventDefault(); show(ks[0], true); $('#stab-' + ks[0]).focus(); }
      if (e.key === 'End') { e.preventDefault(); show(ks[ks.length - 1], true); $('#stab-' + ks[ks.length - 1]).focus(); }
    });
    pb.append(tabs); Object.values(panes).forEach(p => pb.append(p));
    const built = {};
    function show(k) {
      srcState.tab = k;
      TABS.forEach(([t]) => { const b2 = $('#stab-' + t); const on = t === k; b2.setAttribute('aria-selected', String(on)); b2.tabIndex = on ? 0 : -1; panes[t].hidden = !on; });
      if (!built[k]) { built[k] = true; ({ sources: buildSourcesTab, methods: buildMethodsTab, scenarios: buildScnTab, verify: buildVerifyTab, changes: buildChangesTab })[k](panes[k]); glossify(panes[k], 10); }
    }
    show(srcState.tab);
    if (opts.anchor) setTimeout(() => focusAnchorRow(opts.anchor), 30);
    if (opts.metric) setTimeout(() => { const d = $('#method-' + opts.metric); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); const s2 = d.querySelector('summary'); if (s2) s2.focus({ preventScroll: true }); } }, 30);
  }, { wide: true, onClose: () => { if (/^#(sources|src-|method-|verify)/.test(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ } } });
}
function focusAnchorRow(id) {
  const r = $('#src-row-' + id); if (!r) return;
  const d = r.querySelector('details'); if (d) d.open = true;
  r.classList.add('hit'); r.scrollIntoView({ block: 'center' });
  const s = r.querySelector('summary'); if (s) s.focus({ preventScroll: true });
}
function buildSourcesTab(p) {
  const bar = el('div', 'sbar');
  const q = el('input'); q.type = 'search'; q.placeholder = 'Search sources, publishers, measures…'; q.setAttribute('aria-label', 'Search sources');
  const chips = el('div', 'fchips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter by type');
  FILTERS.forEach(([k, t]) => { const b2 = el('button', 'fchip', t); b2.type = 'button'; b2.dataset.f = k; b2.setAttribute('aria-pressed', String(k === 'all')); b2.addEventListener('click', () => { srcState.filter = k; chips.querySelectorAll('.fchip').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.f === k))); apply(); }); chips.append(b2); });
  bar.append(q, chips); p.append(bar);
  const count = el('p', 'meta'); count.setAttribute('aria-live', 'polite'); p.append(count);
  /* starting values */
  const h1 = el('h3', '', 'Starting values (evidence ledger, Q4 2026)'); p.append(h1);
  const list = el('div', 'anlist');
  ANCH().forEach(a => {
    const row = el('div', 'anrow'); row.id = 'src-row-' + a.id; row.dataset.an = a.id; row.dataset.type = badgeKind(a.status);
    row.dataset.text = (a.id + ' ' + a.name + ' ' + (a.src || '') + ' ' + (a.calc || '') + ' ' + (a.refs || []).map(r => r.title + ' ' + (r.publisher || '')).join(' ')).toLowerCase();
    const d = el('details'); const sm = el('summary');
    sm.append(el('b', 'aid', a.id), el('span', 'anm', a.name), el('span', 'anv', a.v || ''), badge(badgeKind(a.status)));
    d.append(sm);
    const links = el('p', 'srcl');
    if (a.url) links.append(ext(a.url, a.src)); else links.append(document.createTextNode(a.src || '—'));
    (a.refs || []).forEach(r => { links.append(document.createTextNode(' · ')); links.append(ext(r.url, r.title)); });
    row.append(d, links);
    d.addEventListener('toggle', () => { if (d.open && !d.dataset.built) { d.dataset.built = '1'; d.append(anchorBlock(a)); } });
    list.append(row);
  });
  p.append(list);
  /* every source by publisher */
  const h2 = el('h3', '', 'All sources by publisher'); p.append(h2);
  const srcs = allSources();
  const groups = new Map(); srcs.forEach(s => { const g = s.publisher || host(s.url) || 'Other'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); });
  const gl = el('div', 'pubs');
  [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).forEach(([g, items]) => {
    const box = el('div', 'pub'); box.append(el('h4', '', g + ' · ' + items.length));
    const u = el('ul', 'gul');
    items.forEach(s => {
      const li = el('li', 'srci'); li.dataset.types = [...s.types].join(' '); li.dataset.text = (s.title + ' ' + g + ' ' + s.sups.join(' ')).toLowerCase();
      li.append(ext(s.url, s.title)); if (s.date) li.append(el('span', 'meta', ' — ' + dateTxt(s.date)));
      li.append(el('span', 'cov', 'Supports: ' + s.sups.join('; ')));
      u.append(li);
    });
    box.append(u); gl.append(box);
  });
  p.append(gl);
  /* the daily check (site only) */
  const obs = el('div'); p.append(obs);
  if (IS_SITE) fetch('data/status.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(st => {
    if (!st || !st.observations || !st.observations.length) return;
    obs.append(el('h3', '', 'Latest daily check of official sources' + (st.lastCheck ? ' · ' + dateTxt(String(st.lastCheck).slice(0, 10)) : '')));
    const u = el('ul', 'gul'); st.observations.forEach(o => { const li = el('li'); li.append(el('b', '', mName(o.metric) + ': '), document.createTextNode(String(o.text || o.value) + ' — ' + (o.source || '') + (o.date ? ' (' + o.date + ')' : ''))); if (o.detail) li.append(el('span', 'cov', o.detail)); u.append(li); });
    obs.append(u, el('p', 'meta', 'Observations from the official APIs; they reach the dashboard only after review in a weekly release.'));
  }).catch(() => { /* optional */ });
  function apply() {
    const term = srcState.q.trim().toLowerCase(), f = srcState.filter;
    let n1 = 0, n2 = 0;
    list.querySelectorAll('.anrow').forEach(r => { const ok = (!term || r.dataset.text.indexOf(term) >= 0) && (f === 'all' || r.dataset.type === f); r.hidden = !ok; if (ok) n1++; });
    gl.querySelectorAll('.pub').forEach(box => { let any = false; box.querySelectorAll('li').forEach(li => { const ok = (!term || li.dataset.text.indexOf(term) >= 0) && (f === 'all' || li.dataset.types.split(' ').indexOf(f) >= 0); li.hidden = !ok; if (ok) { any = true; n2++; } }); box.hidden = !any; });
    h1.hidden = !n1; count.textContent = n1 + ' starting value' + (n1 === 1 ? '' : 's') + ' · ' + n2 + ' source' + (n2 === 1 ? '' : 's') + ' from ' + gl.querySelectorAll('.pub:not([hidden])').length + ' publishers';
  }
  q.addEventListener('input', () => { srcState.q = q.value; apply(); });
  apply();
}
function buildMethodsTab(p) {
  const q = el('input'); q.type = 'search'; q.placeholder = 'Search measures and formulas…'; q.setAttribute('aria-label', 'Search methods'); p.append(q);
  const conv = el('details', 'mm2'); conv.append(el('summary', '', 'How to read the formulas')); conv.append(ulOf(M.conventions || [])); p.append(conv);
  const groups = M.groups || {};
  Object.keys(groups).forEach(g => {
    const ks = Object.keys(M.metrics).filter(k => M.metrics[k].group === g && MET()[k]); if (!ks.length) return;
    const h = el('h3', '', groups[g]); p.append(h);
    ks.forEach(k => {
      const m = M.metrics[k];
      const d = el('details', 'mm2 mdef'); d.id = 'method-' + k; d.dataset.text = (k + ' ' + mName(k) + ' ' + m.definition + ' ' + m.model.formula.join(' ')).toLowerCase();
      const sm = el('summary'); sm.append(el('span', '', mName(k)), el('span', 'u', m.unit)); if (m.anchor) sm.append(el('span', 'aid', m.anchor)); d.append(sm);
      d.addEventListener('toggle', () => { if (d.open && !d.dataset.built) { d.dataset.built = '1'; d.append(metricMethod(k)); glossify(d, 3); } });
      p.append(d);
    });
  });
  const extra = [['Impact scores', () => { const b = el('div'); b.append(formulaBlock([M.impact.formula]), el('p', 'expl', M.impact.explanation)); const dl = el('dl', 'gdl'); Object.entries(M.impact.features).forEach(([k, v]) => dl.append(el('dt', '', E.FEAT_NAMES[k] || k), el('dd', '', v))); b.append(dl); return b; }],
    ['Value migration', () => { const b = el('div'); b.append(formulaBlock(M.pools.formula), el('p', 'expl', M.pools.explanation)); return b; }],
    ['Market regimes', () => el('p', 'expl', M.panels.regime.method)],
    ['Sector mappings', () => el('p', 'expl', M.panels.lens.method)]];
  p.append(el('h3', '', 'Composite readings'));
  extra.forEach(([t, mk]) => { const d = el('details', 'mm2'); d.append(el('summary', '', t)); d.addEventListener('toggle', () => { if (d.open && !d.dataset.built) { d.dataset.built = '1'; d.append(mk()); } }); p.append(d); });
  p.append(el('p', 'meta', 'The engine code (assets/engine.esm.js, Business Source License 1.1) is authoritative; these notes describe it in simplified notation.'));
  q.addEventListener('input', () => { const t = q.value.trim().toLowerCase(); p.querySelectorAll('.mdef').forEach(d => { d.hidden = !!t && d.dataset.text.indexOf(t) < 0; }); });
}
function buildScnTab(p) {
  p.append(el('p', 'expl', 'All scenarios share one model and the same starting values. They differ in how fourteen drivers move from today (Q4 2026) to 2035, plus a few one-off events in each story.'));
  const grid = el('div', 'scards');
  const sc = UI.scenarios();
  E.SCENARIOS.forEach(S2 => {
    const c = el('div', 'scard'); const col = (sc.find(x => x.key === S2.key) || {}).color || S2.color;
    const h = el('h4'); const sw = el('i', 'sw'); sw.style.background = col; h.append(sw, document.createTextNode(S2.key + ' · ' + S2.name)); c.append(h);
    c.append(el('p', 'expl', S2.thesis));
    if (M.scenarios[S2.key]) { const t = el('p', 'meta'); t.append(el('b', '', 'Main tilts: '), document.createTextNode(M.scenarios[S2.key].tilts)); c.append(t); }
    c.append(el('p', 'lbl2', 'First signs')); c.append(ulOf(S2.first));
    grid.append(c);
  });
  p.append(grid);
  const h = el('h3', '', 'Driver paths (0 = low end, 1 = high end)'); p.append(h);
  const seg = el('div', 'seg2'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Year');
  const wrap = el('div', 'tscroll'); let kt = 2;
  E.KT.forEach((t, j) => { const b2 = el('button', '', ktLabel(t)); b2.type = 'button'; b2.setAttribute('aria-pressed', String(j === kt)); b2.addEventListener('click', () => { kt = j; seg.querySelectorAll('button').forEach((x, n) => x.setAttribute('aria-pressed', String(n === j))); draw(); }); seg.append(b2); });
  p.append(seg, wrap);
  function draw() {
    wrap.innerHTML = '';
    const t = el('table', 'dtab'); const th = el('thead'); const tr = el('tr'); tr.append(el('th', '', 'Driver'), el('th', 'num', 'Today'));
    E.SCENARIOS.forEach(S2 => { const c2 = el('th', 'num', S2.key); c2.title = S2.name; tr.append(c2); }); th.append(tr); t.append(th);
    const tb = el('tbody');
    E.DRIVERS.forEach(D => {
      const r = el('tr'); const n = el('td'); const b3 = el('button', 'lnk', D.name); b3.type = 'button'; b3.dataset.prov = 'drv:' + D.k; b3.title = D.desc; n.append(b3, el('small', '', D.lo + ' → ' + D.hi)); r.append(n);
      const cell = v => { const td = el('td', 'num'); const bar = el('i', 'bar'); bar.style.width = Math.round(v * 100) + '%'; td.append(bar, el('span', '', v.toFixed(2))); return td; };
      r.append(cell(E.BASE[D.k]));
      E.SCENARIOS.forEach(S2 => { const v = S2.d[D.k][kt]; const td = cell(v); const dlt = v - E.BASE[D.k]; if (Math.abs(dlt) >= 0.15) td.classList.add(dlt > 0 ? 'hi' : 'lo'); r.append(td); });
      tb.append(r);
    });
    t.append(tb); wrap.append(t);
    wrap.append(el('p', 'meta', 'Shaded cells differ from today by 0.15 or more (▲ darker = higher, lighter = lower); the number is always shown.'));
  }
  draw();
}
function buildVerifyTab(p) {
  const pr = M.process || {};
  if (pr.summary) p.append(el('p', 'lead', pr.summary));
  const ol = el('ol', 'steps'); (pr.steps || []).forEach(s => { const li = el('li'); li.append(el('b', '', s.title + '. '), document.createTextNode(s.text)); ol.append(li); }); p.append(ol);
  if (pr.aiRules && pr.aiRules.length) { p.append(el('h3', '', 'What AI research must deliver')); p.append(ulOf(pr.aiRules)); }
  p.append(el('h3', '', 'Labels on every number'));
  const dl = el('dl', 'gdl bl'); Object.entries(M.badges).forEach(([k, b]) => { const dt = el('dt'); dt.append(badge(k)); dl.append(dt, el('dd', '', b.meaning)); }); p.append(dl);
  p.append(el('h3', '', 'How a value was obtained'));
  const dl2 = el('dl', 'gdl'); Object.entries(M.via || {}).forEach(([k, v]) => dl2.append(el('dt', '', ({ desk: 'Desk research', api: 'Official API', ai: 'AI research panel', 'ai-knowledge': 'AI knowledge', manual: 'Team edit', assumption: 'Assumption', model: 'Model construct' })[k] || k), el('dd', '', v))); p.append(dl2);
  const last = el('p', 'meta'); last.append(document.createTextNode('Every release stays online unchanged at data/releases/<id>/; the files carry the source and provenance of each starting value (dataset.json).'));
  p.append(last);
}
function buildChangesTab(p) {
  if (!REL) { p.append(el('p', 'expl', 'This preview has no weekly release. On aiforecastatlas.com this tab lists the starting values that changed in the latest Friday release, each with its source, how it was obtained and when it was reviewed.')); return; }
  p.append(el('p', 'lead', 'Release ' + REL.id + (REL.publishedAt ? ', published ' + dateTxt(String(REL.publishedAt).slice(0, 10)) : '') + '. ' + (REL.summary || '')));
  const ch = REL.changes || [];
  if (!ch.length) { p.append(el('p', 'expl', REL.carryForward ? 'No new release was built this week: starting values and all scenario paths are unchanged.' : 'No starting values changed in this release.')); return; }
  ch.forEach(c => {
    const card = el('div', 'chg');
    const h = el('div', 'pvv'); h.append(el('b', 'aid', c.id), el('span', 'nm', c.name || c.id)); if (c.status) h.append(badge(badgeKind(c.status))); card.append(h);
    card.append(el('p', 'mv', (c.fromText || '—') + '  →  ' + (c.toText || '')));
    const s = el('p', 'srcl'); s.append(el('b', '', 'Source: ')); if (c.url) s.append(ext(c.url, c.src || c.url)); else s.append(document.createTextNode(c.src || '—')); card.append(s);
    if (c.quote) card.append(el('blockquote', 'quote', '“' + c.quote + '”'));
    if (c.via) { const v = el('p', 'via'); v.append(el('b', '', 'Obtained: '), document.createTextNode(viaText(c.via))); card.append(v); const pb = panelBlock(c.via); if (pb) card.append(pb); const ck = checkLine(c.via.check); if (ck) card.append(ck); }
    if (c.refs && c.refs.length) { const u = el('ul', 'gul'); c.refs.forEach(r => u.append(srcItem(r))); card.append(u); }
    if (c.reviewed) card.append(el('p', 'meta', 'Reviewed ' + dateTxt(c.reviewed)));
    p.append(card);
  });
}

/* ---------- guided tour ---------- */
const TOUR = { on: false, i: 0, steps: [], els: null, prev: null, raf: 0 };
function visible(sel) { const n = $(sel); if (!n) return null; if (n.hidden || n.closest('[hidden]')) return null; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? n : null; }
function startTour() {
  hideMenu(); closeProv(false); closeExplainer(false); hideHint(true);
  const S = window.AICX_SITE; if (S && S.closeDialog) while (S.closeDialog()) { /* close all */ }
  if (S && S.closeChat) S.closeChat();
  TOUR.steps = (M.tour || []).filter(s => visible(s.target));
  if (!TOUR.steps.length) return;
  TOUR.on = true; TOUR.prev = document.activeElement;
  if (!TOUR.els) {
    const block = el('div', 'tour-block'); const hole = el('div', 'tour-hole'); hole.setAttribute('aria-hidden', 'true');
    const card = el('div', 'tour-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tourT'); card.setAttribute('aria-describedby', 'tourX');
    const kick = el('span', 'kick'); const h = el('h2', '', ''); h.id = 'tourT'; h.tabIndex = -1; const tx = el('p', '', ''); tx.id = 'tourX';
    const dots = el('div', 'dots'); dots.setAttribute('aria-hidden', 'true');
    const acts = el('div', 'acts');
    const skip = btn('Skip', '', () => endTour(false)); const back = btn('Back', '', () => goTour(TOUR.i - 1)); const next = btn('Next', 'primary', () => goTour(TOUR.i + 1));
    acts.append(skip, el('span', 'sp'), back, next);
    card.append(kick, h, tx, dots, acts);
    card.addEventListener('keydown', e => {
      if (e.key === 'Tab') trapIn(card, e);
      else if (e.key === 'ArrowRight') { e.preventDefault(); goTour(TOUR.i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTour(TOUR.i - 1); }
    });
    block.addEventListener('click', e => { e.preventDefault(); });
    document.body.append(block, hole, card);
    TOUR.els = { block, hole, card, kick, h, tx, dots, back, next, skip };
    window.addEventListener('resize', () => { if (TOUR.on) placeTour(); });
    window.addEventListener('scroll', () => { if (TOUR.on) { cancelAnimationFrame(TOUR.raf); TOUR.raf = requestAnimationFrame(placeTour); } }, { passive: true });
  }
  Object.values(TOUR.els).forEach(n => { if (n.classList && /tour-(block|hole|card)/.test(n.className)) n.hidden = false; });
  document.body.classList.add('touring');
  goTour(0);
}
function goTour(i) {
  if (i < 0) return;
  if (i >= TOUR.steps.length) { endTour(true); return; }
  TOUR.i = i;
  const s = TOUR.steps[i], T = TOUR.els;
  T.kick.textContent = 'Step ' + (i + 1) + ' of ' + TOUR.steps.length;
  T.h.textContent = s.title; T.tx.textContent = s.text;
  T.dots.innerHTML = ''; TOUR.steps.forEach((x, j) => T.dots.append(el('i', j === i ? 'on' : '')));
  T.back.disabled = i === 0; T.next.textContent = i === TOUR.steps.length - 1 ? 'Finish' : 'Next';
  T.skip.textContent = i === TOUR.steps.length - 1 ? 'Close' : 'Skip';
  const tgt = $(s.target);
  const hdr = document.getElementById('cmd'), sticky = hdr && getComputedStyle(hdr).position === 'sticky';
  const fixedish = tgt && ((sticky && tgt.closest('#cmd')) || getComputedStyle(tgt).position === 'fixed');
  if (tgt && !fixedish) {
    const r = tgt.getBoundingClientRect(), vh = window.innerHeight;
    const top = (sticky ? hdr.offsetHeight : 0) + 12;
    if (r.top < top || r.bottom > vh - 200 || r.height > vh - top - 220) {
      const y = window.scrollY + r.top - top - (r.height < vh * 0.4 ? (vh - top - r.height) * 0.25 : 0);
      window.scrollTo({ top: Math.max(0, y), behavior: REDUCED ? 'auto' : 'smooth' });
    }
  }
  placeTour(); setTimeout(placeTour, REDUCED ? 0 : 420);
  setTimeout(() => T.h.focus({ preventScroll: true }), 0);
}
function placeTour() {
  if (!TOUR.on) return;
  const s = TOUR.steps[TOUR.i], T = TOUR.els, tgt = $(s.target); if (!tgt) return;
  const vw = window.innerWidth, vh = window.innerHeight, pad = 6;
  const r = tgt.getBoundingClientRect();
  const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
  const left = Math.max(4, r.left - pad), right = Math.min(vw - 4, r.right + pad);
  Object.assign(T.hole.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
  const c = T.card; const phone = vw <= 640; c.classList.toggle('sheet', phone);
  if (phone) { c.style.left = ''; c.style.top = ''; return; }
  const w = Math.min(360, vw - 32); c.style.width = w + 'px';
  const ch = c.offsetHeight;
  let y = bottom + 12, x = Math.min(Math.max(16, left), vw - w - 16);
  if (y + ch > vh - 12) { y = top - ch - 12; }
  if (y < 12) { y = Math.max(12, Math.min(vh - ch - 12, top + 12)); x = right + 12 + w < vw ? right + 12 : Math.max(16, left - w - 12); if (x + w > vw - 12) x = vw - w - 16; }
  c.style.left = x + 'px'; c.style.top = y + 'px';
}
function endTour(done) {
  if (!TOUR.on) return false;
  TOUR.on = false; document.body.classList.remove('touring');
  if (location.hash === '#tour') try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
  const T = TOUR.els; [T.block, T.hole, T.card].forEach(n => { n.hidden = true; });
  store('aimonitor.guide.v1', { seen: true, done: !!done, at: Date.now() });
  if (done) UI.toast('Tour finished. Reopen it any time from Guide; every panel has an ⓘ for details.');
  const f = TOUR.prev; if (f && f.isConnected && f.focus) f.focus(); else { const g = $('#bHelp'); if (g) g.focus(); }
  return true;
}

/* first-visit hint (non-blocking) */
let hint = null;
function showHint() {
  if (load('aimonitor.guide.v1') || document.body.classList.contains('embed') || TOUR.on) return;
  if (document.querySelector('.overlay:not([hidden])') || (location.hash && location.hash.length > 1)) return;
  if ((prov && !prov.hidden) || (xpl && !xpl.hidden)) { setTimeout(showHint, 4000); return; }
  hint = el('div', 'tour-hint'); hint.setAttribute('role', 'region'); hint.setAttribute('aria-label', 'Welcome');
  hint.append(el('b', '', 'New here?'), el('p', '', 'Take the 60-second tour: what each part shows, and how to check where every number comes from.'));
  const acts = el('div', 'acts');
  acts.append(btn('Take the tour', 'primary', () => { hideHint(true); startTour(); }), btn('Not now', '', () => hideHint(true)));
  hint.append(acts); document.body.append(hint);
}
function hideHint(remember) { if (hint) { hint.remove(); hint = null; } if (remember && !load('aimonitor.guide.v1')) store('aimonitor.guide.v1', { seen: true, done: false, at: Date.now() }); }

/* ---------- explain mode ---------- */
let explainOn = !!load('aimonitor.explain');
function addExplainLines() {
  $$('[data-panel]').forEach(pn => {
    const id = pn.dataset.panel, P = M.panels[id]; if (!P) return;
    const ph = [...pn.children].find(n => n.classList && n.classList.contains('ph')); if (!ph || ph.nextElementSibling && ph.nextElementSibling.classList.contains('xp')) return;
    const x = el('p', 'xp'); x.append(document.createTextNode(P.oneLiner + ' '));
    const more = el('button', 'lnk', 'How to read ›'); more.type = 'button'; more.addEventListener('click', () => openExplainer(id, more)); x.append(more);
    ph.after(x);
  });
}
function setExplain(on) { explainOn = !!on; store('aimonitor.explain', explainOn || null); document.body.classList.toggle('explain', explainOn); if (explainOn) addExplainLines(); syncMenu(); }

/* ---------- Guide menu ---------- */
let gmenu = null;
function hideMenu() { if (gmenu && !gmenu.hidden) { gmenu.hidden = true; const b = $('#bHelp'); if (b) b.setAttribute('aria-expanded', 'false'); return true; } return false; }
function syncMenu() { if (gmenu) { const t = gmenu.querySelector('[data-k="explain"]'); if (t) { t.setAttribute('aria-checked', String(explainOn)); t.querySelector('small').textContent = explainOn ? 'on' : 'off'; } } }
function toggleMenu() {
  if (gmenu && !gmenu.hidden) { hideMenu(); return; }
  if (!gmenu) {
    gmenu = el('div', 'menu gmenu'); gmenu.id = 'gmenu'; gmenu.setAttribute('role', 'menu'); gmenu.setAttribute('aria-label', 'Guide');
    const item = (k, txt, sub, fn, role) => { const b = el('button', 'mi'); b.type = 'button'; b.dataset.k = k; b.setAttribute('role', role || 'menuitem'); b.append(document.createTextNode(txt)); b.append(el('small', '', sub || '')); b.addEventListener('click', fn); gmenu.append(b); return b; };
    gmenu.append(el('h4', '', 'Guide'));
    item('tour', 'Take the 60-second tour', (M.tour || []).filter(s => visible(s.target)).length + ' steps', () => { hideMenu(); startTour(); });
    item('explain', 'Explain mode', explainOn ? 'on' : 'off', () => setExplain(!explainOn), 'menuitemcheckbox').setAttribute('aria-checked', String(explainOn));
    item('sources', 'Sources & methods', 'every source and formula', () => { hideMenu(); openSources({ tab: 'sources' }); });
    item('verify', 'How we verify data', 'review and releases', () => { hideMenu(); openSources({ tab: 'verify' }); });
    item('help', 'Controls & keyboard', '? · ← → · Space', () => { hideMenu(); const h = $('#help'); if (h) { h.hidden = false; const x = $('#bHelpX'); if (x) x.focus(); } });
    if ($('#chatFab')) item('ask', 'Ask the assistant', 'answers cite sources', () => { hideMenu(); const S = window.AICX_SITE; if (S && S.openChat) S.openChat(); });
    gmenu.append(el('p', 'hint', 'Tip: every panel has an ⓘ button, and every number opens its source or formula when you click it.'));
    gmenu.addEventListener('keydown', e => {
      const items = $$('.mi', gmenu); const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Tab') hideMenu();
    });
    document.body.append(gmenu);
    document.addEventListener('pointerdown', e => { if (gmenu && !gmenu.hidden && !gmenu.contains(e.target) && !($('#bHelp') && $('#bHelp').contains(e.target))) hideMenu(); }, true);
  }
  gmenu.hidden = false; syncMenu();
  const b = $('#bHelp'), r = b ? b.getBoundingClientRect() : { right: window.innerWidth - 12, bottom: 60 }, w = Math.min(320, window.innerWidth - 24);
  gmenu.style.width = w + 'px';
  gmenu.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px';
  gmenu.style.top = Math.min(r.bottom + 6, window.innerHeight - 200) + 'px';
  if (b) b.setAttribute('aria-expanded', 'true');
  const first = gmenu.querySelector('.mi'); if (first) first.focus();
}

/* ---------- layering: Esc closes the top-most guide layer ---------- */
function closeTop() {
  if (hideGloss()) return true;
  if (prov && !prov.hidden) { closeProv(); return true; }
  if (TOUR.on) { endTour(false); return true; }
  if (hideMenu()) { const b = $('#bHelp'); if (b) b.focus(); return true; }
  return false;
}
function closeLow() { return closeExplainer(); }
function blocking() { return TOUR.on || !!(prov && !prov.hidden); }

/* ---------- deep links: #sources · #src-AN12 · #method-K · #tour ---------- */
function onHash() {
  const h = (location.hash || '').replace(/^#/, '');
  if (!h) return;
  if (h === 'sources') openSources({ tab: 'sources' });
  else if (/^src-AN\d{1,2}$/.test(h)) openSources({ tab: 'sources', anchor: h.slice(4) });
  else if (/^method-[A-Za-z]{1,8}$/.test(h) && M.metrics[h.slice(7)]) openSources({ tab: 'methods', metric: h.slice(7) });
  else if (h === 'verify') openSources({ tab: 'verify' });
  else if (h === 'tour') startTour();
}

/* ---------- boot ---------- */
function boot() {
  const gb = $('#bHelp');
  if (gb) { gb.setAttribute('aria-haspopup', 'menu'); gb.setAttribute('aria-expanded', 'false'); }
  const sb = $('#bSources'); if (sb) sb.addEventListener('click', () => openSources({ tab: 'sources' }));
  const sb2 = $('#bSources2'); if (sb2) sb2.addEventListener('click', () => openSources({ tab: 'sources' }));
  $$('[data-explain-btn]').forEach(b => b.addEventListener('click', () => openExplainer(b.dataset.explainBtn, b)));
  const rg = $('#regime'); if (rg) rg.addEventListener('click', () => openExplainer('regime', rg));
  if (explainOn) setExplain(true);
  // ledger status: the same icon + label badges as everywhere else (the tones alone are too close to tell apart)
  $$('#ledger tbody tr[data-an]').forEach(tr => {
    const a = anchorById(tr.dataset.an), s = tr.querySelector('.stat');
    if (a && s) s.replaceWith(badge(badgeKind(a.status)));
  });
  $$('.panel .note, .tilt-note, #help .dialog, .foot').forEach(n => glossify(n, 3));
  onHash(); window.addEventListener('hashchange', onHash);
  setTimeout(showHint, 1600);
}
window.AICX_GUIDE = {
  openExplainer, closeExplainer, openSources, openAnchor, openMetric, openSpec, closeProv, startTour, endTour, toggleMenu, setExplain,
  closeTop, closeLow, blocking, glossify, methods: M,
  get state() { return { tour: TOUR.on ? TOUR.i : -1, explainer: xplId, prov: !!(prov && !prov.hidden), explain: explainOn }; }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
