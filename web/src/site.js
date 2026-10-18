/* AI Forecast Atlas — site layer: theme switch, release bar, credits, dialogs (about, subscribe, share, data & API),
   the AI chat drawer and embed mode. Runs after app.js, talks to it only through window.AICX_UI.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
(function () {
'use strict';
const UI = window.AICX_UI;
if (!UI) return;

/* ---------- configuration: build-time (AIMONITOR), runtime settings (AIMONITOR_SITE), weekly data (AIMONITOR_DATA) ---------- */
const CFG = Object.assign({
  mode: 'artifact', siteUrl: 'https://aiforecastatlas.com/', apiBase: 'api/', repoUrl: 'https://github.com/Creoox/ai-forecast-atlas', contactEmail: '',
  chatEnabled: true, newsletterEnabled: true, turnstileSiteKey: '', chatProviderLabel: 'OpenAI', company: 'Creoox AG',
  privacyUrl: 'privacy.php', imprintUrl: 'imprint.php', codeLicence: 'BUSL-1.1', dataLicence: 'CC BY 4.0', beaconToken: ''
}, window.AIMONITOR || {}, window.AIMONITOR_SITE || {});
const SITE = CFG.mode === 'site';
const DATA = window.AIMONITOR_DATA || null;
const REL = (DATA && DATA.release) || null;
const NL = CFG.newsletter || { languages: [{ id: 'en', name: 'English' }], frequencies: [{ id: 'weekly', label: { en: 'Every Friday' } }], categories: [{ id: 'summary', always: true, label: { en: 'Weekly summary' }, desc: { en: '' } }] };
const SITE_URL = String(CFG.siteUrl || '').replace(/\/?$/, '/');
const abs = p => SITE_URL + String(p).replace(/^\//, '');
const api = p => (SITE ? String(CFG.apiBase || 'api/') : abs('api/')).replace(/\/?$/, '/') + p + '.php';
/* chat and feedback bodies travel base64-wrapped so the host's web firewall does not trip over code or HTML in messages */
function wrap(obj) { const by = new TextEncoder().encode(JSON.stringify(obj)); let b = ''; for (let i = 0; i < by.length; i += 0x8000) b += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return JSON.stringify({ p: btoa(b) }); }
const TZ = 'Europe/Zurich';

/* ---------- small helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
/* only web, mail and in-page links are ever rendered as links, whatever the data say */
function safeHref(u) {
  u = String(u || '');
  if (/^#[\w.~-]*$/.test(u)) return u;
  try { const x = new URL(u, 'https://aimonitor.invalid/'); if (!/^(https?|mailto):$/.test(x.protocol)) return null; return x.origin === 'https://aimonitor.invalid' ? u : x.href; } catch (e) { return null; }
}
function link(href, txt, ext) {
  const h = safeHref(href);
  if (!h) return el('span', '', txt);
  const a = el('a', '', txt); a.href = h; if (ext !== false && /^https?:/.test(h)) { a.target = '_blank'; a.rel = 'noopener'; } return a;
}
function btn(txt, cls, fn) { const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
function load(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
function sload(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
async function copyText(text, node) {
  try { await navigator.clipboard.writeText(text); UI.toast('Copied.'); return true; }
  catch (e) {
    if (node) { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    UI.toast('Press Ctrl+C (⌘C) to copy the selected text.'); return false;
  }
}
function codeBox(text, label) {
  const wrap = el('div');
  const box = el('div', 'codebox', text); box.tabIndex = 0; if (label) box.setAttribute('aria-label', label);
  const b = btn('Copy', '', () => copyText(box.textContent, box));
  wrap.append(box, b);
  return { wrap, box };
}
function linkRow(grid, url, desc, live) {
  const c = el('code', '', url);
  const right = el('span');
  if (live) { const a = link(url, 'Open'); right.append(a, document.createTextNode(' · ')); }
  const cp = el('button', '', 'Copy'); cp.type = 'button'; cp.className = 'btn'; cp.style.minHeight = '24px'; cp.style.padding = '2px 7px'; cp.addEventListener('click', () => copyText(url, c));
  right.append(cp);
  const d = el('span', '', desc);
  const left = el('div'); left.style.minWidth = '0'; left.append(c, el('br'), d);
  grid.append(left, right);
}

/* ---------- dates in Swiss time ---------- */
function zonedParts(date) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
  const p = {}; f.formatToParts(date).forEach(x => { p[x.type] = x.value; }); return p;
}
function tzOffsetMin(date) { const p = zonedParts(date); return (Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second) - date.getTime()) / 60000; }
function zurichTime(y, m, d, hh, mm) {
  const g = Date.UTC(y, m - 1, d, hh, mm);
  let t = g - tzOffsetMin(new Date(g)) * 60000;
  t = g - tzOffsetMin(new Date(t)) * 60000;
  return new Date(t);
}
function nextFriday13(now) {
  now = now || new Date();
  for (let i = 0; i < 9; i++) {
    const p = zonedParts(new Date(now.getTime() + i * 86400000));
    if (p.weekday !== 'Fri') continue;
    const t = zurichTime(+p.year, +p.month, +p.day, 13, 0);
    if (t > now) return t;
  }
  return null;
}
function when(v, withTime) {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return '';
  const o = { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' });
  return new Intl.DateTimeFormat('en-GB', o).format(d);
}
function dateLong(v) { const d = new Date(v); return isNaN(d) ? String(v || '') : new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d); }

/* ---------- dialogs ---------- */
const DLG = [];
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const box = e.currentTarget.querySelector('.dialog');
  const f = [...box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(n => n.offsetParent !== null || n === document.activeElement);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function openDialog(id, title, build, opt) {
  opt = opt || {};
  closeDialogId(id);
  const ov = el('div', 'overlay'); ov.dataset.dlg = id;
  const box = el('div', 'dialog' + (opt.wide ? ' wide' : '')); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  const ph = el('div', 'ph'); const h = el('h2', '', title); h.id = 'dlg-' + id; box.setAttribute('aria-labelledby', h.id);
  const x = btn('Close', '', () => closeDialog()); x.style.minHeight = '24px'; x.style.padding = '3px 8px 2px';
  ph.append(h, x);
  const pb = el('div', 'pb');
  box.append(ph, pb); ov.append(box); document.body.append(ov);
  const MP = opt.explain && window.AIMONITOR_METHODS && window.AIMONITOR_METHODS.panels[opt.explain];
  if (MP) {
    const d = el('details', 'how'); d.append(el('summary', '', 'How this works'));
    d.append(el('p', '', MP.what)); const ul = el('ul'); (MP.howToRead || []).forEach(t => ul.append(el('li', '', t))); d.append(ul);
    if (MP.method) d.append(el('p', 'note', MP.method));
    pb.append(d);
  }
  const entry = { id, ov, prev: document.activeElement, onClose: opt.onClose };
  DLG.push(entry);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeDialog(); });
  ov.addEventListener('keydown', trapTab);
  build(pb);
  setTimeout(() => { const f = box.querySelector('[autofocus]') || x; f.focus(); }, 0);
  return entry;
}
function closeDialogId(id) { const i = DLG.findIndex(d => d.id === id); if (i < 0) return; const [d] = DLG.splice(i, 1); d.ov.remove(); if (d.onClose) d.onClose(); }
function closeDialog() {
  const d = DLG.pop(); if (!d) return false;
  d.ov.remove(); if (d.onClose) d.onClose();
  if (d.prev && d.prev.isConnected && d.prev.focus) d.prev.focus();
  return true;
}
const P = (txt, cls) => el('p', cls || '', txt);
const H3 = txt => el('h3', '', txt);

/* ---------- theme switch ---------- */
const ICON_SUN = '<path d="M8 4.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4zM7.3 0h1.4v2.5H7.3zM7.3 13.5h1.4V16H7.3zM0 7.3h2.5v1.4H0zM13.5 7.3H16v1.4h-2.5zM2.05 3.04l.99-.99 1.77 1.77-.99.99zM11.19 12.18l.99-.99 1.77 1.77-.99.99zM2.05 12.96l1.77-1.77.99.99-1.77 1.77zM11.19 3.82l1.77-1.77.99.99-1.77 1.77z"/>';
const ICON_MOON = '<path d="M8 1a7 7 0 1 0 7 7A5.5 5.5 0 0 1 8 1z"/>';
function syncThemeBtn() {
  const b = $('#bTheme'); if (!b) return;
  const dark = UI.theme !== 'light';
  const svg = b.querySelector('svg'); if (svg) svg.innerHTML = dark ? ICON_SUN : ICON_MOON;
  const t = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
  b.title = t; b.setAttribute('aria-label', t);
}

/* ---------- release bar + dated labels ---------- */
function buildRelbar() {
  const bar = $('#relbar'); if (!bar) return;
  bar.innerHTML = '';
  let nxt = REL && REL.next ? new Date(REL.next) : null;
  if (!nxt || isNaN(nxt) || nxt <= new Date()) nxt = nextFriday13();
  if (REL) {
    bar.append(el('b', '', REL.base ? 'BASE RELEASE' : 'WEEKLY RELEASE'), el('span', 'rel-id', REL.id));
    if (REL.publishedAt) bar.append(el('span', '', 'published ' + when(REL.publishedAt, true)));
    if (REL.asOf) bar.append(el('span', '', 'data to ' + dateLong(REL.asOf)));
    const n = (REL.changes || []).length;
    const ch = el('a', '', REL.carryForward ? 'no new release this week' : n ? 'what changed (' + n + ')' : 'what changed'); ch.href = '#'; ch.addEventListener('click', e => { e.preventDefault(); openChanges(); });
    bar.append(ch);
  } else if (SITE) {
    bar.append(el('b', '', 'DATA'), el('span', '', 'base dataset · checked 17 Oct 2026'));
  } else {
    bar.append(el('b', '', 'PREVIEW'), el('span', '', 'data to 17 Oct 2026 · on aiforecastatlas.com the data is checked daily and released every Friday at 13:00 Swiss time'));
  }
  bar.append(el('span', 'sp'));
  if (SITE || REL) {
    if (nxt) { const ns = el('span', '', 'next release ' + when(nxt, true)); ns.id = 'relNext'; bar.append(ns); }
    const chk = el('span', '', 'data checked daily'); chk.id = 'relCheck'; bar.append(chk);
    const rss = link(SITE ? 'feeds/releases.xml' : abs('feeds/releases.xml'), 'RSS'); bar.append(rss);
  }
  const ib = el('button', 'rel-i'); ib.type = 'button'; ib.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 8 2.6zM7.2 7h1.6v4.5H7.2zm0-2.7h1.6v1.6H7.2z"/></svg>';
  ib.setAttribute('aria-label', 'About releases and how data are verified'); ib.title = 'About releases and how data are verified';
  ib.addEventListener('click', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.openExplainer('relbar', ib); });
  bar.append(ib);
  if (SITE) {
    fetch('data/status.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).then(st => {
      if (st && st.lastCheck) { const c = $('#relCheck'); if (c) c.textContent = 'data checked daily · last ' + when(st.lastCheck, true); }
      if (st && st.nextRelease) { const d = new Date(st.nextRelease), n = $('#relNext'); if (n && !isNaN(d) && d > new Date()) n.textContent = 'next release ' + when(d, true); }
    }).catch(() => { /* status is optional */ });
  }
}
function datedLabels() {
  if (!REL) return;
  const asOf = REL.asOf ? dateLong(REL.asOf) : '';
  const b = $('#brandSub'); if (b) b.textContent = 'AI commoditization scenarios · data to ' + asOf + ' · release ' + REL.id;
  const l = $('#ledgerAsOf'); if (l) l.textContent = 'Q4 2026 starting values · release ' + REL.id + ' · data to ' + asOf;
}
function openChanges() {
  openDialog('changes', 'Weekly release ' + (REL ? REL.id : ''), pb => {
    if (!REL) { pb.append(P('No release yet.')); return; }
    pb.append(P((REL.publishedAt ? 'Published ' + when(REL.publishedAt, true) + '. ' : '') + (REL.summary || '')));
    const ch = REL.changes || [];
    if (!ch.length) pb.append(P(REL.carryForward ? 'No new release was built this week, so the starting values and all scenario paths are unchanged.' : 'No starting values changed in this release.'));
    else {
      const wrap = el('div', 'tscroll'); const t = el('table'); const th = el('thead'); const tr0 = el('tr');
      ['Measure', 'Was', 'Now', 'Source'].forEach((h, i) => { const c = el('th', i === 1 || i === 2 ? 'num' : '', h); tr0.append(c); });
      th.append(tr0); t.append(th); const tb = el('tbody');
      ch.forEach(c => {
        const tr = el('tr');
        tr.append(el('td', '', c.name || c.id), el('td', 'num', c.fromText || String(c.from)), el('td', 'num', c.toText || String(c.to)));
        const s = el('td'); if (c.url) s.append(link(c.url, c.src || 'source')); else s.textContent = c.src || '';
        const isK = c.via && c.via.type === 'ai-knowledge';
        const pi = UI.panelInfo ? UI.panelInfo(c.via) : null;
        if (pi) s.append(el('div', 'note', 'AI research panel' + (isK ? ' (AI knowledge' + (c.via.model ? ', lead answer ' + c.via.model : '') + ')' : '') + ', reviewed' + (c.reviewed ? ' ' + c.reviewed : '') + ' · ' + pi.answered + ' of ' + pi.asked + ' agents answered' + (pi.valued ? ' · ' + pi.agreeN + ' of ' + pi.valued + ' agree' : '')));
        else if (c.via && c.via.type === 'ai') s.append(el('div', 'note', 'AI-assisted research, reviewed' + (c.reviewed ? ' ' + c.reviewed : '') + (c.via.check ? ' · second opinion ' + (c.via.check.agree ? 'agrees' : 'disagrees') : '')));
        else if (isK) s.append(el('div', 'note', 'AI knowledge without a specific source' + (c.via.model ? ' (' + c.via.model + ')' : '') + ', reviewed' + (c.reviewed ? ' ' + c.reviewed : '') + (c.via.check ? ' · second opinion ' + (c.via.check.agree ? 'agrees' : 'disagrees') : '')));
        else if (c.via && c.via.type === 'api') s.append(el('div', 'note', 'official API, reviewed' + (c.reviewed ? ' ' + c.reviewed : '')));
        if (c.quote) s.append(el('div', 'note', isK ? 'The model’s explanation: ' + c.quote : '“' + c.quote + '”'));
        tr.append(s);
        tb.append(tr);
      });
      t.append(tb); wrap.append(t); pb.append(wrap);
    }
    if (REL.highlights && REL.highlights.length) {
      pb.append(H3('What moved in the scenarios'));
      const ul = el('ul'); REL.highlights.forEach(h => ul.append(el('li', '', h))); pb.append(ul);
    }
    const xw = (Array.isArray(REL.xwatch) ? REL.xwatch : []).filter(xwValid).slice(0, 8);
    if (xw.length) {
      pb.append(H3('X watch this week'));
      const ul = el('ul', 'xw-mini');
      xw.forEach(it => {
        const li = el('li'); const cr = XW_CRED[it.credibility] || XW_CRED.unverified;
        li.append(el('span', 'bdg t-' + cr[1], cr[0]), document.createTextNode(' ' + String(it.title) + ' '));
        const p0 = xwPosts(it)[0]; if (p0) li.append(webLink(p0.url, '@' + (p0.handle || 'post') + ' on X'), document.createTextNode(' '));
        const sb = btn('Show', '', () => { closeDialog(); focusXw(it.id, true); }); sb.setAttribute('aria-label', 'Show “' + String(it.title).slice(0, 80) + '” in X watch'); li.append(sb);
        ul.append(li);
      });
      pb.append(ul, P('Posts on X that the editor approved this week. They are signals, not data: they never change the model.', 'note'));
    }
    const lk = el('p', 'note');
    lk.append(link(SITE ? 'data/releases/' + REL.id + '/release.json' : abs('data/releases/' + REL.id + '/release.json'), 'Release data (JSON)'), document.createTextNode(' · '), link(SITE ? 'data/releases/index.json' : abs('data/releases/index.json'), 'All releases'));
    if (window.AICX_GUIDE) { lk.append(document.createTextNode(' · ')); const sm = el('button', 'btn', 'Sources & provenance'); sm.type = 'button'; sm.addEventListener('click', () => { closeDialog(); window.AICX_GUIDE.openSources({ tab: 'changes' }); }); lk.append(sm); }
    pb.append(lk);
  }, { wide: true });
}

/* ---------- credits ---------- */
function buildCredits() {
  const nav = $('#crLinks'); if (!nav) return;
  nav.innerHTML = '';
  const add = (txt, fn, href) => { if (href) nav.append(link(href, txt)); else nav.append(btn(txt, '', fn)); };
  add('About & credits', openAbout);
  add('Sources & methods', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.openSources({ tab: 'sources' }); });
  add('Data & API', openData);
  add('Newsletter', openSubscribe);
  if (SITE) { add('Privacy', null, CFG.privacyUrl); add('Imprint', null, CFG.imprintUrl); }
  if (CFG.repoUrl) add('Source code', null, CFG.repoUrl);
  const repo = $('#crRepo'); if (repo && CFG.repoUrl) repo.href = CFG.repoUrl;   // a copy run by someone else links to its own repository
  const lic = $('#crLicLink'); if (lic && CFG.repoUrl) lic.href = CFG.repoUrl.replace(/\/$/, '') + '/blob/main/LICENSE';
  add('Creoox', null, 'https://creoox.com');
  add('xeokit SDK', null, 'https://xeokit.io');
  nav.querySelectorAll('button').forEach(b => { b.className = ''; });
}
function openAbout() {
  openDialog('about', 'About AI Forecast Atlas', pb => {
    pb.append(P('AI Forecast Atlas follows how AI is turning from a scarce premium technology into a commodity, and what that means for capital, compute, energy, prices and work. Eight scenarios run on one quarterly model from 2027 to 2035. History from Q1 2023 to Q4 2026 comes from dated public data, and every starting value is listed with its source in the evidence ledger.'));
    pb.append(P('Every day the platform checks official sources and AI-assisted research for new data; the team reviews it, and every Friday at 13:00 Swiss time a weekly release re-anchors the starting values and recomputes all scenarios. It is a scenario model, not a forecast and not investment advice.'));
    const tr = el('p'); tr.append(document.createTextNode('Every number is traceable: click it to see its source or formula, or open '));
    const sb = el('button', 'btn', 'Sources & methods'); sb.type = 'button'; sb.addEventListener('click', () => { closeDialog(); if (window.AICX_GUIDE) window.AICX_GUIDE.openSources({ tab: 'verify' }); }); tr.append(sb, document.createTextNode('.')); pb.append(tr);
    pb.append(H3('Credits'));
    const c = el('p');
    c.append(document.createTextNode('Designed and built by the '), link('https://creoox.com', 'Creoox AG'), document.createTextNode(' team in Lausanne, Switzerland, the team behind '), link('https://xeokit.io', 'xeokit SDK'), document.createTextNode(', the open-source toolkit for fast BIM and engineering visualisation in the browser ('), link('https://github.com/xeokit/xeokit-sdk', 'GitHub'), document.createTextNode(').'));
    pb.append(c);
    pb.append(P('Version 3 of the model was revised after independent reviews run with Gemini, DeepSeek, Grok and ChatGPT.'));
    pb.append(H3('Licences'));
    const l = el('ul');
    const li1 = el('li'); li1.append(document.createTextNode('Data, charts and texts: ' + CFG.dataLicence + '. Please credit “AI Forecast Atlas by Creoox AG” with a link to aiforecastatlas.com and the release number.')); l.append(li1);
    const li2 = el('li'); li2.append(document.createTextNode('Code: ' + CFG.codeLicence + '. '));
    if (CFG.repoUrl) li2.append(link(CFG.repoUrl, 'Source code')); else li2.append(document.createTextNode('Source code on request.'));
    l.append(li2);
    l.append(el('li', '', 'Third-party data keep their own terms: SEC EDGAR filings (public), U.S. Energy Information Administration (public domain), Epoch AI (CC BY 4.0) and the publishers named in the evidence ledger.'));
    pb.append(l);
    pb.append(H3('Version'));
    const E = UI.engine;
    pb.append(P('Engine ' + (E && E.VERSION || 'v3') + (REL ? ' · weekly release ' + REL.id : '') + (CFG.buildDate ? ' · site build ' + CFG.buildDate : '') + '.', 'note'));
    pb.append(P($('#crFine') ? $('#crFine').textContent : '', 'note'));
  }, { explain: 'about' });
}

/* ---------- newsletter sign-up ---------- */
let tsScript = null;
function loadTurnstile() {
  if (!SITE || !CFG.turnstileSiteKey) return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!tsScript) tsScript = new Promise(res => {
    const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true;
    s.onload = () => res(window.turnstile || null); s.onerror = () => res(null); document.head.append(s);
  });
  return tsScript;
}
async function mountTurnstile(host) {
  const ts = await loadTurnstile(); if (!ts || !host.isConnected) return null;
  let token = '';
  const id = ts.render(host, { sitekey: CFG.turnstileSiteKey, theme: UI.theme === 'light' ? 'light' : 'dark', size: 'flexible', callback: t => { token = t; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; } });
  return { get token() { return token; }, reset() { token = ''; try { ts.reset(id); } catch (e) { /* ignore */ } } };
}
const L10N = (o, lang) => (o && (o[lang] || o.en)) || '';
function openSubscribe(preset) {
  openDialog('subscribe', 'Get the weekly AI Forecast Atlas', pb => {
    pb.append(P('A short email after each Friday release: what changed in the data, how the scenarios moved, and only the topics you pick. No tracking pixels; one-click unsubscribe in every email.'));
    const f = el('form', 'form'); f.noValidate = true;
    const lab = (txt, input) => { const l = el('label', 'f'); l.append(el('span', '', txt), input); return l; };
    const email = el('input'); email.type = 'email'; email.name = 'email'; email.required = true; email.autocomplete = 'email'; email.placeholder = 'name@company.com'; email.setAttribute('autofocus', '');
    const name = el('input'); name.type = 'text'; name.name = 'name'; name.autocomplete = 'name'; name.placeholder = 'optional';
    const lang = el('select'); lang.name = 'lang'; NL.languages.forEach(L => { const o = el('option', '', L.name); o.value = L.id; lang.append(o); });
    const navLang = (navigator.language || 'en').slice(0, 2); if (NL.languages.some(L => L.id === navLang)) lang.value = navLang;
    const row = el('div'); row.style.display = 'grid'; row.style.gridTemplateColumns = 'repeat(auto-fit, minmax(180px, 1fr))'; row.style.gap = '10px';
    row.append(lab('Email', email), lab('Name', name), lab('Language', lang));
    f.append(row);
    f.append(H3('How often'));
    const freq = el('div', 'chips'); freq.setAttribute('role', 'radiogroup');
    NL.frequencies.forEach((F, i) => { const l = el('label'); const r = el('input'); r.type = 'radio'; r.name = 'frequency'; r.value = F.id; r.checked = i === 0; l.append(r, el('span', '', L10N(F.label, 'en'))); freq.append(l); });
    f.append(freq);
    f.append(H3('Topics'));
    const cats = el('div', 'chips');
    NL.categories.forEach(C => {
      const l = el('label'); l.title = L10N(C.desc, 'en');
      const cb = el('input'); cb.type = 'checkbox'; cb.name = 'categories'; cb.value = C.id;
      cb.checked = C.always || (preset && preset.indexOf(C.id) >= 0) || (!preset && ['markets', 'models'].indexOf(C.id) >= 0);
      if (C.always) { cb.disabled = true; cb.checked = true; }
      l.append(cb, el('span', '', L10N(C.label, 'en'))); cats.append(l);
    });
    f.append(cats);
    const all = el('div'); all.style.display = 'flex'; all.style.gap = '6px';
    all.append(btn('Select all', '', () => cats.querySelectorAll('input').forEach(i => { i.checked = true; })), btn('Only the summary', '', () => cats.querySelectorAll('input').forEach(i => { i.checked = i.disabled; })));
    f.append(all);
    const hp = el('div', 'hp'); hp.setAttribute('aria-hidden', 'true'); const hpi = el('input'); hpi.type = 'text'; hpi.name = 'website'; hpi.tabIndex = -1; hpi.autocomplete = 'off'; hp.append(el('label', '', 'Leave this empty'), hpi); f.append(hp);
    const cons = el('label', 'consent'); const cb = el('input'); cb.type = 'checkbox'; cb.name = 'consent'; cb.required = true;
    const ct = el('span'); ct.append(document.createTextNode('I agree to receive the AI Forecast Atlas newsletter from ' + CFG.company + ' at this address. I can unsubscribe at any time. '));
    if (SITE) ct.append(link(CFG.privacyUrl, 'Privacy notice'));
    cons.append(cb, ct); f.append(cons);
    const tsHost = el('div'); f.append(tsHost);
    const msg = el('p', '', ''); msg.setAttribute('role', 'status'); msg.setAttribute('aria-live', 'polite');
    const go = el('button', 'btn primary', SITE ? 'Subscribe' : 'Subscribe (on the live site)'); go.type = 'submit';
    const acts = el('div'); acts.style.display = 'flex'; acts.style.gap = '8px'; acts.style.alignItems = 'center'; acts.append(go); f.append(acts, msg);
    let ts = null;
    if (SITE && CFG.turnstileSiteKey) mountTurnstile(tsHost).then(t => { ts = t; });
    if (!SITE) msg.textContent = 'This is a preview. Sign-up works on aiforecastatlas.com.';
    if (SITE && !CFG.newsletterEnabled) { go.disabled = true; msg.textContent = 'The newsletter starts soon. Please check back.'; }
    f.addEventListener('submit', async e => {
      e.preventDefault();
      msg.className = '';
      if (!SITE) { msg.textContent = 'Sign-up works on aiforecastatlas.com once the site is live.'; return; }
      const em = email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { msg.className = 'msg-err'; msg.textContent = 'Please enter a valid email address.'; email.focus(); return; }
      if (!cb.checked) { msg.className = 'msg-err'; msg.textContent = 'Please tick the consent box.'; cb.focus(); return; }
      const body = {
        email: em, name: name.value.trim(), lang: lang.value,
        frequency: (f.querySelector('input[name=frequency]:checked') || {}).value || 'weekly',
        categories: [...cats.querySelectorAll('input:checked')].map(i => i.value),
        consent: true, website: hpi.value, turnstile: ts ? ts.token : ''
      };
      go.disabled = true; msg.textContent = 'Sending…';
      try {
        const r = await fetch(api('subscribe'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ok) { msg.className = 'msg-ok'; msg.textContent = 'Almost done: we sent a confirmation link to ' + em + '. Please click it to start your subscription.'; f.querySelectorAll('input,select').forEach(i => { i.disabled = true; }); go.hidden = true; }
        else { msg.className = 'msg-err'; msg.textContent = (j.error && j.error.message) || 'Something went wrong. Please try again later.'; go.disabled = false; if (ts) ts.reset(); }
      } catch (err) { msg.className = 'msg-err'; msg.textContent = 'Could not reach the server. Please try again later.'; go.disabled = false; }
    });
    pb.append(f);
  }, { wide: true, explain: 'subscribe' });
}

/* ---------- share ---------- */
const CANVAS_PANELS = [['phase', 'Phase portrait'], ['net', 'Causal map'], ['pools', 'Value migration'], ['heat', 'Impact matrix'], ['scrub', 'Timeline scrubber']];
async function saveCanvasPng(id) {
  const src = document.getElementById(id); if (!src || !src.width) { UI.toast('That chart is not visible right now.'); return; }
  const st = UI.state; const dpr = Math.max(1, src.width / Math.max(1, src.clientWidth));
  const pad = Math.round(14 * dpr), foot = Math.round(30 * dpr);
  const c = document.createElement('canvas'); c.width = src.width + pad * 2; c.height = src.height + pad * 2 + foot;
  const x = c.getContext('2d'); const cs = getComputedStyle(document.documentElement);
  x.fillStyle = cs.getPropertyValue('--panel').trim() || '#111'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(src, pad, pad);
  x.fillStyle = cs.getPropertyValue('--ink-3').trim() || '#888';
  x.font = Math.round(11 * dpr) + 'px ui-monospace, Menlo, Consolas, monospace';
  x.textBaseline = 'middle';
  const label = 'AI Forecast Atlas by Creoox · aiforecastatlas.com · ' + st.name + ' · ' + st.quarter + (REL ? ' · release ' + REL.id : '') + ' · CC BY 4.0';
  x.fillText(label, pad, c.height - foot / 2 - pad / 3);
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  if (!blob) { UI.toast('Could not create the image.'); return; }
  try { await UI.saveFile('aimonitor-' + id + '-' + st.key + '-' + st.quarter.replace(/\s+/g, '') + '.png', blob, 'image/png'); }
  catch (e) { UI.toast(e && e.code === 'unavailable' ? 'Saving files is not available in this view.' : 'The image was not saved.'); }
}
function openShare() {
  const st = UI.state;
  const url = UI.permalink(SITE_URL);
  openDialog('share', 'Share this view', pb => {
    pb.append(P('The link opens the monitor on ' + st.name + ', ' + st.quarter + ', with the same sector lens' + (document.querySelector('.panel.is-focus') ? ' and the expanded panel' : '') + '.'));
    pb.append(codeBox(url, 'Link to this view').wrap);
    const text = 'AI Forecast Atlas: ' + st.name + ' at ' + st.quarter;
    const bar = el('div', 'sharebar');
    const enc = encodeURIComponent;
    [['LinkedIn', 'https://www.linkedin.com/sharing/share-offsite/?url=' + enc(url)], ['X', 'https://x.com/intent/post?url=' + enc(url) + '&text=' + enc(text)], ['Bluesky', 'https://bsky.app/intent/compose?text=' + enc(text + ' ' + url)], ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url)], ['Email', 'mailto:?subject=' + enc(text) + '&body=' + enc(url)]]
      .forEach(([n, h]) => { const a = link(h, n); a.className = 'btn'; bar.append(a); });
    pb.append(bar);
    if (!SITE) pb.append(P('Email links may not open from this preview; copy the link instead.', 'note'));
    pb.append(H3('Embed on your site'));
    const metSel = el('select'); metSel.setAttribute('aria-label', 'Chart for the embed');
    const M = UI.metrics; ['K', 'R', 'ccov', 'VL', 'Pf', 'Pc', 'prem', 'G', 'DC', 'Pp', 'GR', 'Ufp', 'OS', 'TC', 'GDP', 'AU', 'AUa', 'AUdev', 'BLD', 'Cs'].forEach(k => { if (!M[k]) return; const o = el('option', '', M[k].n); o.value = k; metSel.append(o); });
    const scnAll = el('label', 'consent'); const all = el('input'); all.type = 'checkbox'; all.checked = true; scnAll.append(all, el('span', '', 'all eight scenarios (otherwise only ' + (st.key === 'CUST' ? 'the base scenario' : st.name) + ')'));
    const row = el('div', 'form'); row.append(metSel, scnAll); pb.append(row);
    const code1 = codeBox('', 'Embed code for one chart'); const code2 = codeBox('', 'Image link for one chart'); const code3 = codeBox('', 'Embed code for the whole monitor');
    const upd = () => {
      const k = metSel.value; const s = all.checked ? '' : '&s=' + (st.key === 'CUST' ? 'COMM' : st.key);
      code1.box.textContent = '<iframe src="' + abs('embed/?m=' + k + s) + '" title="AI Forecast Atlas: ' + (M[k] ? M[k].n : k) + '" width="640" height="380" style="border:0;max-width:100%" loading="lazy"></iframe>';
      code2.box.textContent = '<a href="' + SITE_URL + '"><img src="' + abs('data/latest/charts/' + k + '.svg') + '" alt="AI Forecast Atlas: ' + (M[k] ? M[k].n : k) + ', eight scenarios 2023–2035" width="640"></a>';
    };
    metSel.addEventListener('change', upd); all.addEventListener('change', upd); upd();
    code3.box.textContent = '<iframe src="' + UI.permalink(SITE_URL).replace(/\?/, '?embed=1&') + '" title="AI Forecast Atlas" width="100%" height="900" style="border:0" loading="lazy"></iframe>';
    pb.append(P('A live chart (updates with every weekly release):', 'note'), code1.wrap, P('A static image (SVG, refreshed every Friday):', 'note'), code2.wrap, P('The whole monitor:', 'note'), code3.wrap);
    pb.append(H3('Cite'));
    const y = REL && REL.publishedAt ? new Date(REL.publishedAt).getUTCFullYear() : 2026;
    pb.append(codeBox(CFG.company + ' (' + y + '). AI Forecast Atlas — ' + (REL ? 'weekly release ' + REL.id : 'scenario model v3') + ' [Data set]. ' + (REL ? abs('data/releases/' + REL.id + '/') : SITE_URL) + '. Licence: ' + CFG.dataLicence + '.', 'Citation').wrap);
    pb.append(H3('Save a chart as an image'));
    const sb = el('div', 'sharebar');
    CANVAS_PANELS.forEach(([id, n]) => sb.append(btn(n, '', () => saveCanvasPng(id))));
    pb.append(sb, P('Images carry the scenario, quarter and source line, so they stay correctly credited when shared.', 'note'));
  }, { wide: true, explain: 'share' });
}

/* ---------- data & API ---------- */
function seriesCsv() {
  const E = UI.engine, runs = UI.runs(), M = UI.metrics, keys = Object.keys(M);
  const lines = ['scenario,quarter,t,metric,metric_name,value'];
  Object.entries(runs).forEach(([s, r]) => {
    for (let i = 0; i < E.NQ; i++) {
      const q = E.qLabel(i), t = E.tAt(i);
      keys.forEach(k => { const v = r[k] && r[k][i]; if (v == null || !isFinite(v)) return; lines.push([s, q, t, k, '"' + M[k].n.replace(/"/g, '""') + '"', +v.toPrecision(6)].join(',')); });
    }
  });
  return lines.join('\n') + '\n';
}
function datasetJson() {
  const E = UI.engine; const v = E.anchorValues ? E.anchorValues() : {};
  const anchors = {};
  E.ANCHORS.forEach(a => { const o = { metric: a.k, name: a.name, value: v[a.id], v: a.v, status: a.status, period: a.period, scope: a.scope, src: a.src, url: a.url, calc: a.calc }; ['quote', 'refs', 'via', 'reviewed', 'retrieved'].forEach(f => { if (a[f] != null) o[f] = a[f]; }); anchors[a.id] = o; });
  return JSON.stringify({ schema: 'aimonitor.dataset/1', engine: E.VERSION, asOf: REL ? REL.asOf : '2026-10-17', anchors }, null, 2);
}
function openData() {
  openDialog('data', 'Data & API', pb => {
    pb.append(P('Everything on the monitor is open data under ' + CFG.dataLicence + ': download it, chart it yourself, feed it into your own tools, or let an AI assistant read it. Please credit “AI Forecast Atlas by Creoox AG” and the release number.'));
    if (!SITE) {
      pb.append(P('This preview has no server. When aiforecastatlas.com is live, all addresses below work and update every Friday. You can already save the current numbers:', 'note'));
      const sb = el('div', 'sharebar');
      sb.append(btn('Save all scenario paths (CSV)', 'primary', async () => { try { await UI.saveFile('aimonitor-series-' + (REL ? REL.id : 'v3') + '.csv', seriesCsv(), 'text/csv'); } catch (e) { UI.toast('Saving files is not available in this view.'); } }),
        btn('Save starting values (JSON)', '', async () => { try { await UI.saveFile('aimonitor-dataset.json', datasetJson(), 'application/json'); } catch (e) { UI.toast('Saving files is not available in this view.'); } }));
      pb.append(sb);
    }
    const live = SITE;
    const grid = (title, rows) => { pb.append(H3(title)); const g = el('div', 'linkgrid'); rows.forEach(r => linkRow(g, abs(r[0]), r[1], live)); pb.append(g); };
    grid('Latest weekly release', [
      ['data/latest/release.json', 'Summary: what changed, headline numbers per scenario, signposts'],
      ['data/latest/dataset.json', 'Starting values (Q4 2026) with status, period, source and provenance (quote, references, how obtained, review date)'],
      ['data/latest/series/all.csv', 'All scenarios × all measures, quarterly 2023–2035 (long CSV)'],
      ['data/latest/series/COMM.json', 'One scenario as JSON (COMM, BUST, BRKW, SPLT, PWR, BOOM, TRST, PLAT)'],
      ['data/latest/impacts/COMM.json', 'Who gains and loses: impact scores −100…+100 by year'],
      ['data/latest/metrics.json', 'Measure dictionary: names, units, groups'],
      ['data/latest/datapackage.json', 'Frictionless Data package description']
    ]);
    grid('Archive and updates', [
      ['data/releases/index.json', 'Every weekly release since launch, with links'],
      ['feeds/releases.xml', 'RSS feed of weekly releases'],
      ['feeds/releases-atom.xml', 'Atom feed'],
      ['feeds/releases.json', 'JSON Feed'],
      ['feeds/schedule.ics', 'Calendar: every Friday release at 13:00 Swiss time']
    ]);
    grid('For developers and AI assistants', [
      ['openapi.json', 'OpenAPI 3.1 description of the data endpoints'],
      ['api/mcp.php', 'MCP server (Streamable HTTP) for AI assistants: list_metrics, get_release, get_series, explain_metric, get_impacts'],
      ['llms.txt', 'Short guide for language models'],
      ['assets/methods.json', 'Explanations, formulas and source notes for every panel and measure (CC BY 4.0)'],
      ['data/latest/charts/K.svg', 'Chart images per measure (SVG), e.g. K = Big-4 capex'],
      ['assets/engine.esm.js', 'The model itself (JavaScript module): run your own scenarios']
    ]);
    pb.append(H3('Use it in an AI assistant (MCP)'));
    pb.append(codeBox('{\n  "mcpServers": {\n    "ai-forecast-atlas": { "type": "http", "url": "' + abs('api/mcp.php') + '" }\n  }\n}', 'MCP configuration').wrap);
    pb.append(H3('Run the model yourself'));
    pb.append(codeBox("// save engine.esm.js next to your script (browsers and Deno can also import it by URL)\nimport { createEngine } from '" + abs('assets/engine.esm.js') + "';\nconst E = createEngine();\nconst ds = await (await fetch('" + abs('data/latest/dataset.json') + "')).json();\nE.applyData(ds);                       // this week's starting values\nconst run = E.simulate(E.SCENARIOS[0]); // COMM; tilt a driver (names in E.DK): E.simulate(s, { offsets: { energy: 10 } })\nconsole.log(E.qLabel(31), run.K[31]);  // Big-4 capex, Q4 2030, $B a year", 'Example code').wrap);
    pb.append(P('Data sources keep their own terms: SEC EDGAR (public, credit the SEC), EIA (public domain), Epoch AI (CC BY 4.0), and the publishers listed in the evidence ledger.', 'note'));
  }, { wide: true, explain: 'data' });
}

/* ---------- X watch: posts on X the editor is watching (signals, not data; they never change the model) ----------
   Live site: data/xwatch.json, rewritten by the server whenever the editor approves an item. Elsewhere: the items of
   the weekly release (REL.xwatch). Everything in an item is untrusted text: rendered as text, links only http(s). */
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const XW = { items: [], loaded: false, all: false, updated: '', want: null };
const XW_SHOW = 6;
const XW_CRED = { high: ['High credibility', 'good'], medium: ['Medium credibility', 'info'], low: ['Low credibility', 'warn'], unverified: ['Unverified', 'serious'] };
const XW_IMP = { high: 'High impact', medium: 'Medium impact', low: 'Low impact' };
const XW_KIND = { official: 'official account', executive: 'executive', journalist: 'journalist', media: 'news organisation', analyst: 'analyst', researcher: 'researcher', influencer: 'high-reach account', other: 'other account' };
const XW_DIR = { up: '↑ points up', down: '↓ points down', mixed: '↕ mixed signal' };
function webHref(u) { const h = safeHref(u); return h && /^https?:/i.test(h) ? h : null; }
function webLink(u, txt, title) { const h = webHref(u); if (!h) return el('span', '', txt); const a = el('a', '', txt); a.href = h; a.target = '_blank'; a.rel = 'noopener'; if (title) a.title = title; return a; }
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function dShort(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); const mon = m && ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[2] - 1];
  return mon && +m[3] >= 1 && +m[3] <= 31 ? +m[3] + ' ' + mon + ' ' + m[1] : '';
}
function xwValid(it) { return !!it && typeof it === 'object' && /^X\d{1,6}$/.test(String(it.id || '')) && typeof it.title === 'string' && it.title.trim() !== ''; }
function xwPosts(it) {
  return (Array.isArray(it.posts) ? it.posts : []).filter(p => p && typeof p === 'object' && webHref(p.url)).slice(0, 6).map(p => {
    let hd = String(p.handle || '').replace(/^@/, '').slice(0, 30);
    if (!hd) { const m = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,30})\//i.exec(String(p.url)); hd = m ? m[1] : hostOf(p.url); }
    return { url: String(p.url), handle: hd, name: String(p.name || '').slice(0, 80), kind: String(p.kind || ''), posted: String(p.posted || '') };
  });
}
function xwFileUrl() { return SITE ? 'data/xwatch.json' : abs('data/xwatch.json'); }
function xwItem(it) {
  const a = el('article', 'xw'); a.id = 'x-' + it.id; a.tabIndex = -1; a.setAttribute('aria-labelledby', 'xwt-' + it.id);
  const h = el('div', 'xw-h');
  const cr = XW_CRED[it.credibility] || XW_CRED.unverified;
  const cb = el('span', 'bdg t-' + cr[1], cr[0]); cb.title = 'Credibility label' + (it.credNote ? ': ' + it.credNote : ''); h.append(cb);
  if (XW_IMP[it.impact]) { const ib = el('span', 'bdg t-ink', XW_IMP[it.impact]); ib.title = 'Impact label (reach and engagement on X)' + (it.impactNote ? ': ' + it.impactNote : ''); h.append(ib); }
  if (dShort(it.date)) { const t = el('time', '', dShort(it.date)); t.dateTime = String(it.date).slice(0, 10); h.append(t); }
  h.append(el('span', 'xw-id', String(it.id)));
  a.append(h);
  const t = el('h3', 'xw-t', String(it.title)); t.id = 'xwt-' + it.id; a.append(t);
  if (it.summary) a.append(el('p', 'xw-s', String(it.summary)));
  if (it.why) { const w = el('p', 'xw-why'); w.append(el('b', '', 'Why it matters: '), document.createTextNode(String(it.why))); a.append(w); }
  const ch = el('p', 'chips2');
  (Array.isArray(it.metrics) ? it.metrics : []).slice(0, 4).forEach(k => {
    if (typeof k !== 'string' || !UI.metrics[k]) return;
    const b = el('button', 'achip'); b.type = 'button'; b.dataset.prov = 'm:' + k + '|i:' + UI.now; b.title = UI.metrics[k].n + ' at Q4 2026: value, source and formula';
    b.append(el('b', '', 'ƒ'), document.createTextNode(' ' + shortTxt((UI.kpiLabel && UI.kpiLabel[k]) || UI.metrics[k].n, 28))); ch.append(b);
  });
  (Array.isArray(it.anchors) ? it.anchors : []).slice(0, 4).forEach(id => {
    const an = typeof id === 'string' && UI.engine.ANCHORS.find(x => x.id === id); if (!an) return;
    const b = el('button', 'achip'); b.type = 'button'; b.dataset.prov = 'an:' + an.id; b.title = 'Provenance of ' + an.id + ' · ' + an.name;
    b.append(el('b', '', an.id), document.createTextNode(' ' + shortTxt(an.name, 26))); ch.append(b);
  });
  if (XW_DIR[it.direction] && ch.childNodes.length) { const d = el('span', 'xw-dir', XW_DIR[it.direction]); d.title = 'Which way this signal points for the measure'; ch.append(d); }
  if (ch.childNodes.length) a.append(ch);
  const posts = xwPosts(it);
  if (posts.length) {
    const ul = el('ul', 'xw-posts'); ul.setAttribute('aria-label', 'Posts on X');
    posts.forEach(p => {
      const li = el('li'); li.append(webLink(p.url, '@' + p.handle, 'Open the post on X (new tab)'));
      const bits = [p.name && p.name.toLowerCase() !== p.handle.toLowerCase() ? p.name : '', XW_KIND[p.kind] || '', dShort(p.posted)].filter(Boolean);
      if (bits.length) li.append(document.createTextNode(' · ' + bits.join(' · ')));
      ul.append(li);
    });
    a.append(ul);
  }
  const refs = (Array.isArray(it.refs) ? it.refs : []).filter(r => r && typeof r === 'object' && webHref(r.url)).slice(0, 4);
  if (refs.length) { const r = el('p', 'xw-refs'); r.append(el('b', '', 'Corroboration: ')); refs.forEach((x, i) => { if (i) r.append(document.createTextNode(' · ')); r.append(webLink(x.url, String(x.title || hostOf(x.url)))); }); a.append(r); }
  const notes = [it.credNote ? 'Credibility: ' + it.credNote : '', it.impactNote ? 'Impact: ' + it.impactNote : ''].filter(Boolean);
  if (notes.length) a.append(el('p', 'xw-notes', notes.join(' · ')));
  const v = it.via && typeof it.via === 'object' ? it.via : {};
  a.append(el('p', 'xw-via', String(v.name || 'Grok X search, reviewed by the editor') + (v.model ? ' · ' + v.model : '') + (dShort(it.reviewed) ? ' · reviewed ' + dShort(it.reviewed) : '') + (it.edited ? ' · texts edited by the editor' : '')));
  return a;
}
function renderXw() {
  const list = $('#xwlist'); if (!list) return;
  list.innerHTML = '';
  const n = XW.items.length, meta = $('#xwMeta');
  if (meta) meta.textContent = n ? n + ' item' + (n === 1 ? '' : 's') + (dShort(XW.updated) ? ' · ' + dShort(XW.updated).replace(/ \d{4}$/, '') : '') : 'not data';
  if (meta) meta.title = n && dShort(XW.updated) ? 'List updated ' + dShort(XW.updated) : 'Signals from X, not data';
  if (!n) {
    list.append(el('p', 'xw-empty', (SITE ? 'Nothing on the watch list yet. ' : 'This preview has no watch list. On aiforecastatlas.com, ') + 'Every weekday Grok (xAI) searches X for posts about what this monitor tracks — capex, chips, energy, prices, models and AI at work — from official accounts, executives, journalists, analysts and researchers, and from accounts with heavy reach on X. The editor approves each item before it appears here, with its post links, a credibility label and an impact label.'));
    return;
  }
  (XW.all ? XW.items : XW.items.slice(0, XW_SHOW)).forEach(it => list.append(xwItem(it)));
  // the list is rebuilt: keep keyboard focus on the toggle button
  if (n > XW_SHOW) list.append(btn(XW.all ? 'Show fewer' : 'Show all ' + n, 'xw-more', () => { XW.all = !XW.all; renderXw(); const m = $('#xwlist .xw-more'); if (m) m.focus(); }));
  list.append(el('p', 'xw-note', 'Signals, not data: X watch items never change the model or the starting values.'));
}
function setXw(items, j) {
  const id = x => +String(x.id).slice(1);
  XW.items = (Array.isArray(items) ? items : []).filter(xwValid).slice(0, 60).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || id(b) - id(a));
  XW.updated = j && typeof j.updated === 'string' ? j.updated : '';
  XW.loaded = true;
  renderXw();
  if (XW.want) focusXw(XW.want);
}
function loadXwatch() {
  const rel = REL && Array.isArray(REL.xwatch) ? REL.xwatch : [];
  if (!SITE) { setXw(rel, null); return; }
  fetch('data/xwatch.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null))
    .then(j => { if (j && Array.isArray(j.items)) setXw(j.items, j); else setXw(rel, null); })
    .catch(() => setXw(rel, null));
}
/* scroll to one item and highlight it (deep link #x-X12, chat citation [X12], the release dialog) */
function focusXw(id) {
  if (!XW.loaded) { XW.want = id; return; }
  XW.want = null;
  const i = XW.items.findIndex(x => x.id === id);
  if (i < 0) { UI.toast('X watch item ' + id + ' is not on the current list.'); return; }
  if (i >= XW_SHOW && !XW.all) { XW.all = true; renderXw(); }
  const pnl = $('#xwatchPanel');
  if (pnl && (pnl.hidden || pnl.closest('[hidden]')) && UI.openFocus) UI.openFocus('xwatch');
  const node = document.getElementById('x-' + id); if (!node) return;
  document.querySelectorAll('.xw.hit').forEach(x => x.classList.remove('hit'));
  node.classList.add('hit');
  node.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  node.focus({ preventScroll: true });
  clearTimeout(focusXw.t); focusXw.t = setTimeout(() => node.classList.remove('hit'), 8000);
}
function xwHash() { const h = (location.hash || '').replace(/^#/, ''); if (/^x-X\d{1,6}$/.test(h)) focusXw(h.slice(2)); }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-xw]'); if (!b) return;
  e.preventDefault();
  if (window.innerWidth <= 900) closeChat();
  focusXw(b.dataset.xw);
});
function xwText() {
  const items = XW.items.slice(0, 8); if (!items.length) return '';
  return 'X watch — posts on X that the editor is watching; signals, not data (JSON): ' + JSON.stringify(items.map(it => ({ id: it.id, date: it.date, title: it.title, summary: it.summary, credibility: it.credibility, impact: it.impact })));
}

/* ---------- chat ---------- */
const CHAT = { open: false, mode: 'ask', panel: null, turns: { ask: [], suggest: [] }, ctl: null, busy: false, session: sload('aimonitor.chat.session') || '', ts: null, profile: load('aimonitor.chat.profile') || { role: '', country: '' } };
const ROLES = ['', 'AECO firm (architecture, engineering, construction)', 'AECO software vendor', 'Software developer or team lead', 'Software company', 'Investor or analyst', 'Policy or public sector', 'Student or researcher', 'Other'];
function escHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
/* citations the assistant writes: [AN12] = a starting value in the evidence ledger, [M:K] = a model measure,
   [AI] = the assistant's own knowledge or observation (no AI Forecast Atlas source behind it), [X12] = an item on the X watch list */
const CITE_RX = /\[((?:AN\d{1,2}|M:[A-Za-z]{1,8}|AI|X\d{1,4})(?:\s*[,;]\s*(?:AN\d{1,2}|M:[A-Za-z]{1,8}|AI|X\d{1,4}))*)\]/g;
const AI_KNOW = 'From the assistant’s own knowledge or observation (training data), not from AI Forecast Atlas’s sourced data. Useful context, but not independently checked and possibly outdated.';
function shortTxt(t, n) { t = String(t).split(/ \(|, /)[0]; return t.length > n ? t.slice(0, n - 1) + '…' : t; }
function citeChip(id) {
  const E = UI.engine;
  if (id === 'AI') return '<span class="cite ai" role="note" tabindex="0" title="' + escHtml(AI_KNOW) + '" aria-label="' + escHtml('AI knowledge: ' + AI_KNOW) + '"><b>AI</b>knowledge</span>';
  if (/^AN\d{1,2}$/.test(id)) {
    const a = E.ANCHORS.find(x => x.id === id); if (!a) return null;
    return '<button type="button" class="cite" data-prov="an:' + id + '" title="' + escHtml(id + ' · ' + a.name + ' — source: ' + (a.src || '—')) + '"><b>' + id + '</b>' + escHtml(shortTxt(a.name, 24)) + '</button>';
  }
  if (/^X\d{1,4}$/.test(id)) {
    const it = XW.items.find(x => x.id === id);
    if (it) return '<button type="button" class="cite x" data-xw="' + id + '" title="' + escHtml('X watch item: ' + it.title + ' (a signal from X, not data)') + '"><b>' + id + '</b>' + escHtml(shortTxt(String(it.title), 24)) + '</button>';
    return '<a class="cite x" href="' + escHtml(xwFileUrl()) + '" target="_blank" rel="noopener" title="' + escHtml('X watch item ' + id + ': opens the watch list (a signal from X, not data)') + '"><b>' + id + '</b>X watch</a>';
  }
  const k = id.slice(2), m = UI.metrics[k]; if (!m) return null;
  return '<button type="button" class="cite m" data-prov="meth:' + k + '" title="' + escHtml('How it is computed: ' + m.n) + '"><b>ƒ</b>' + escHtml(shortTxt((UI.kpiLabel && UI.kpiLabel[k]) || m.n, 24)) + '</button>';
}
function citeIds(text) { const out = []; String(text).replace(CITE_RX, (m, inner) => { inner.split(/\s*[,;]\s*/).forEach(x => { if (out.indexOf(x) < 0) out.push(x); }); return m; }); return out; }
function mdInline(s) {
  let h = escHtml(s);
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  h = h.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  h = h.replace(/\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/g, (m, t, u) => '<a href="' + u.replace(/"/g, '%22') + '" target="_blank" rel="noopener">' + t + '</a>');
  h = h.split(/(<[^>]*>)/).map(part => part.charAt(0) === '<' ? part : part.replace(CITE_RX, (m, inner) => inner.split(/\s*[,;]\s*/).map(id => citeChip(id) || escHtml('[' + id + ']')).join(''))).join('');
  return h;
}
function sourcesUsed(text) {
  const ids = citeIds(text); if (!ids.length) return null;
  const E = UI.engine, box = el('div', 'cites'); box.append(el('b', '', 'Sources used'));
  const ul = el('ul');
  ids.forEach(id => {
    const li = el('li');
    if (id === 'AI') { li.innerHTML = citeChip(id); li.append(document.createTextNode(' ' + AI_KNOW)); }
    else if (/^AN/.test(id)) { const a = E.ANCHORS.find(x => x.id === id); if (!a) return; li.innerHTML = citeChip(id); li.append(document.createTextNode(' ' + a.name + ' — ')); if (a.url) li.append(link(a.url, a.src || a.url)); else li.append(document.createTextNode(a.src || '')); }
    else if (/^X\d/.test(id)) {
      const it = XW.items.find(x => x.id === id); li.innerHTML = citeChip(id);
      if (it) { li.append(document.createTextNode(' ' + it.title + ' — ')); const p0 = xwPosts(it)[0]; if (p0) li.append(webLink(p0.url, '@' + p0.handle + ' on X')); li.append(document.createTextNode(' (X watch: a signal, not data)')); }
      else li.append(document.createTextNode(' X watch item (a signal from X, not data)'));
    }
    else { const k = id.slice(2), m = UI.metrics[k]; if (!m) return; li.innerHTML = citeChip(id); li.append(document.createTextNode(' ' + m.n + ' — model formula and inputs')); }
    ul.append(li);
  });
  if (!ul.childNodes.length) return null;
  box.append(ul); return box;
}
function mdToHtml(text) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  String(text).replace(/\r/g, '').split('\n').forEach(line => {
    const t = line.trim();
    let m;
    if (!t) { close(); return; }
    if ((m = /^[-*•]\s+(.*)$/.exec(t))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + mdInline(m[1]) + '</li>'); return; }
    if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + mdInline(m[1]) + '</li>'); return; }
    close();
    if ((m = /^#{1,4}\s+(.*)$/.exec(t))) { out.push('<p><b>' + mdInline(m[1]) + '</b></p>'); return; }
    out.push('<p>' + mdInline(t) + '</p>');
  });
  close();
  return out.join('');
}
function chatEl() { return $('#chat'); }
function buildChat() {
  if (!CFG.chatEnabled) return;
  const fab = el('button', 'chat-fab'); fab.id = 'chatFab'; fab.type = 'button';
  fab.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h12v9H6l-4 3z"/></svg>';
  fab.append(document.createTextNode('Ask AI')); fab.title = 'Ask the AI about the monitor, or suggest an improvement';
  fab.addEventListener('click', () => openChat());
  const box = el('section', 'chat'); box.id = 'chat'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'AI assistant');
  const ph = el('div', 'ph'); ph.append(el('h2', '', 'Ask the AI Forecast Atlas'));
  const ci = el('button', 'chat-i'); ci.type = 'button'; ci.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 8 2.6zM7.2 7h1.6v4.5H7.2zm0-2.7h1.6v1.6H7.2z"/></svg>';
  ci.setAttribute('aria-label', 'How the assistant works and how it cites sources'); ci.title = 'How the assistant works and how it cites sources';
  ci.addEventListener('click', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.openExplainer(CHAT.mode === 'ask' ? 'chat-ask' : 'chat-suggest', ci); });
  ph.append(ci);
  const x = btn('Close', '', () => closeChat()); x.style.minHeight = '24px'; x.style.padding = '3px 8px 2px'; x.style.marginLeft = 'auto'; ph.append(x);
  const tabs = el('div', 'chat-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Mode');
  const tAsk = btn('Ask a question', '', () => setMode('ask')); const tSug = btn('Suggest an improvement', '', () => setMode('suggest'));
  const tMe = btn('About you', '', () => toggleProfile()); tMe.style.marginLeft = 'auto'; tMe.title = 'Optional: tell the assistant who you are, for answers that fit you';
  tabs.append(tAsk, tSug, tMe);
  const prof = el('div', 'form'); prof.id = 'chatProfile'; prof.hidden = true; prof.style.padding = '8px 10px'; prof.style.borderBottom = '1px solid var(--rule)';
  const role = el('select'); role.setAttribute('aria-label', 'Your role'); ROLES.forEach(r => { const o = el('option', '', r || 'Your role (optional)'); o.value = r; role.append(o); }); role.value = CHAT.profile.role || '';
  const ctry = el('input'); ctry.type = 'text'; ctry.placeholder = 'Country or region (optional)'; ctry.value = CHAT.profile.country || ''; ctry.setAttribute('aria-label', 'Country or region');
  const saveP = () => { CHAT.profile = { role: role.value, country: ctry.value.trim().slice(0, 60) }; store('aimonitor.chat.profile', CHAT.profile); };
  role.addEventListener('change', saveP); ctry.addEventListener('change', saveP);
  prof.append(role, ctry, el('span', 'note', 'Kept in this browser only and sent with your questions so answers fit your situation.'));
  const log = el('div', 'chat-log'); log.id = 'chatLog'; log.setAttribute('aria-live', 'polite');
  const sugg = el('div', 'chat-sugg'); sugg.id = 'chatSugg';
  const form = el('form', 'chat-in');
  const ta = el('textarea'); ta.id = 'chatIn'; ta.rows = 2; ta.maxLength = 2000; ta.placeholder = 'Ask about any chart, scenario or number…'; ta.setAttribute('aria-label', 'Your message');
  const send = el('button', 'btn primary', 'Send'); send.type = 'submit'; send.id = 'chatSend';
  form.append(ta, send);
  const foot = el('div', 'chat-foot'); foot.id = 'chatFoot';
  const tsHost = el('div'); tsHost.id = 'chatTs'; tsHost.style.padding = '0 10px';
  box.append(ph, tabs, prof, log, sugg, tsHost, form, foot);
  document.body.append(fab, box);
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', e => { e.preventDefault(); if (CHAT.busy) { stopChat(); return; } const v = ta.value.trim(); if (v) { ta.value = ''; ask(v); } });
  CHAT.ui = { fab, box, tAsk, tSug, log, sugg, ta, send, foot, prof, tsHost };
  setMode('ask', true);
}
function toggleProfile() { const p = $('#chatProfile'); p.hidden = !p.hidden; }
function footText() {
  if (!SITE) return 'Preview: answers come from Claude on your own Claude account. On the live site they come from ' + CFG.chatProviderLabel + '. Answers cite the evidence ledger (tap a chip to check the source); “AI knowledge” marks the assistant’s own knowledge. Answers can be wrong; this is not investment advice.';
  return 'Your message and the current dashboard view are sent to ' + CFG.chatProviderLabel + ' to answer it; conversations are not stored. Answers cite the evidence ledger — tap a chip to check the source; “AI knowledge” marks the assistant’s own knowledge. Answers can be wrong; not investment advice. Please do not enter personal data.';
}
function suggestions() {
  const st = UI.state;
  if (CHAT.mode === 'suggest') return ['A chart or measure I would like to see', 'A data source you should add', 'Something that looks wrong', 'An idea for the newsletter'];
  const nm = st.key === 'CUST' ? 'my custom scenario' : '“' + st.name + '”';
  const MP = CHAT.panel && window.AIMONITOR_METHODS && window.AIMONITOR_METHODS.panels[CHAT.panel];
  if (MP) return ['Explain the ' + MP.title.toLowerCase() + ' at ' + st.quarter + ' in plain words', 'What should I watch in the ' + MP.title.toLowerCase() + '?', 'Which sources and formulas are behind the ' + MP.title.toLowerCase() + '?'];
  return [
    'What does ' + nm + ' mean for ' + (CHAT.profile.role ? 'someone like me' : 'an AECO firm') + '?',
    'Explain the phase portrait at ' + st.quarter + ' in plain words',
    'Which early-warning signs should I watch now?',
    REL ? 'What changed in this week’s release?' : 'How are the starting values sourced?',
    'Compare ' + nm + ' with “The Power Wall”'
  ];
}
function renderSugg() {
  const s = CHAT.ui.sugg; s.innerHTML = '';
  if (CHAT.turns[CHAT.mode].length) return;
  suggestions().forEach(q => { const b = el('button', '', q); b.type = 'button'; b.addEventListener('click', () => { if (CHAT.mode === 'suggest') { CHAT.ui.ta.value = q + ': '; CHAT.ui.ta.focus(); } else ask(q); }); s.append(b); });
}
function setMode(m, quiet) {
  if (CHAT.busy) stopChat();
  CHAT.mode = m;
  CHAT.ui.tAsk.setAttribute('aria-pressed', String(m === 'ask')); CHAT.ui.tSug.setAttribute('aria-pressed', String(m === 'suggest'));
  CHAT.ui.ta.placeholder = m === 'ask' ? 'Ask about any chart, scenario or number…' : 'Describe your idea or what looks wrong…';
  const log = CHAT.ui.log; log.innerHTML = '';
  if (m === 'ask') sysMsg('Ask anything about the charts, scenarios and numbers on screen. The assistant sees the view you are looking at (scenario, quarter, sector lens) and cites its sources: tap a chip such as AN1 to see where a number comes from.');
  else sysMsg('Help us improve the monitor. The assistant helps you shape the idea; then you can send it to the Creoox team.');
  CHAT.turns[m].forEach(t => addMsg(t.role === 'user' ? 'u' : 'a', t.content));
  CHAT.ui.foot.textContent = footText();
  renderSugg();
  if (!quiet) CHAT.ui.ta.focus();
}
function sysMsg(t) { const d = el('div', 'm sys', t); CHAT.ui.log.append(d); return d; }
function addMsg(who, text) {
  const d = el('div', 'm ' + who);
  if (who === 'a') d.innerHTML = mdToHtml(text); else d.textContent = text;
  CHAT.ui.log.append(d); CHAT.ui.log.scrollTop = CHAT.ui.log.scrollHeight;
  return d;
}
function openChat(prefill, opts) {
  if (!CHAT.ui) return;
  CHAT.panel = opts && opts.panel ? String(opts.panel) : null;
  if (CHAT.mode !== 'ask' && CHAT.panel) setMode('ask', true);
  CHAT.open = true; CHAT.ui.box.hidden = false; CHAT.ui.fab.hidden = true;
  if (prefill) CHAT.ui.ta.value = prefill;
  renderSugg(); CHAT.ui.ta.focus();
  if (SITE && CFG.turnstileSiteKey && !CHAT.session && !CHAT.ts) mountTurnstile(CHAT.ui.tsHost).then(t => { CHAT.ts = t; });
}
function closeChat() {
  if (!CHAT.ui || !CHAT.open) return false;
  CHAT.open = false; CHAT.ui.box.hidden = true; CHAT.ui.fab.hidden = false; CHAT.ui.fab.focus();
  return true;
}
function setBusy(b) { CHAT.busy = b; CHAT.ui.send.textContent = b ? 'Stop' : 'Send'; CHAT.ui.send.classList.toggle('primary', !b); }
function stopChat() { if (CHAT.ctl) CHAT.ctl.abort(); }
const CHAT_ERR = {
  rate_limited: 'You have reached the question limit for now. Please try again in a while.',
  budget: 'The assistant has used its budget for today. Please try again tomorrow.',
  turnstile: 'Please complete the check above, then send your message again.',
  disabled: 'The assistant is switched off at the moment.',
  provider: 'The AI service did not answer. Please try again.',
  network: 'Could not reach the server. Please check your connection.',
  too_long: 'That message is too long. Please shorten it.',
  unavailable: 'The assistant is not available in this view.',
  not_granted: 'The preview needs your permission to use Claude. Reload the page to be asked again.',
  sampling_disabled: 'Claude is not available for this account.',
  blocked: 'The server’s security filter stopped this message. Please rephrase it without code or links.',
  busy: 'Many people are asking right now. Please try again in a minute.'
};
function snapshotText() { try { return JSON.stringify(UI.snapshot()); } catch (e) { return '{}'; } }
function ledgerText() {
  const E = UI.engine;
  return JSON.stringify(E.ANCHORS.map(a => ({ id: a.id, measure: a.name, key: a.k, value: a.v, period: a.period, status: a.status, source: a.src || '', url: a.url || '' })));
}
function measuresText() {
  const MM = (window.AIMONITOR_METHODS && window.AIMONITOR_METHODS.metrics) || {};
  return JSON.stringify(Object.keys(UI.metrics).map(k => ({ key: k, name: UI.metrics[k].n, unit: (MM[k] && MM[k].unit) || '' })));
}
function panelText() {
  const MP = CHAT.panel && window.AIMONITOR_METHODS && window.AIMONITOR_METHODS.panels[CHAT.panel];
  return MP ? 'The visitor is asking about the “' + MP.title + '” panel. Its explainer (JSON): ' + JSON.stringify({ what: MP.what, howToRead: MP.howToRead, method: MP.method, caveats: MP.caveats }) : '';
}
function siteGuideText() {
  const guide = window.AIMONITOR_CHAT_GUIDE;
  if (!guide || !window.AIMONITOR_selectChatGuide) return panelText();
  const questions = CHAT.turns[CHAT.mode].filter(m => m.role === 'user');
  const current = questions[questions.length - 1], previous = questions[questions.length - 2];
  const context = window.AIMONITOR_selectChatGuide(guide, current ? current.content : '', CHAT.panel || '', previous ? previous.content : '');
  return guide.rules + '\n\nSite guide — product definitions, not current observations (JSON): ' + JSON.stringify(context);
}
const CITE_RULE = 'Citations: cite [ANxx] right after every number you take from the evidence ledger (for example “$900B a year [AN1]”) and [M:<key>] for model measures (for example [M:K] for a 2030 capex value); use only IDs and keys listed below and never write URLs — the dashboard turns the IDs into links to the sources. Your own knowledge and observations are welcome when they help: mark each such statement with [AI] right after it (for example “several labs now sell agent subscriptions [AI]”), say what period it refers to when that matters, keep it separate from AI Forecast Atlas’s data, and never present it as AI Forecast Atlas data. Posts on the X watch list (if listed below) are cited by their id, for example [X12]; call them signals from X, not data.';
function releaseText() {
  if (!REL) return 'No weekly release yet; base dataset checked 17 Oct 2026.';
  return JSON.stringify({ id: REL.id, publishedAt: REL.publishedAt, asOf: REL.asOf, summary: REL.summary, changes: (REL.changes || []).slice(0, 12).map(c => ({ measure: c.name, was: c.fromText, now: c.toText, src: c.src })), highlights: REL.highlights || [] });
}
function rulesText() {
  if (CHAT.mode === 'suggest') return [
    'You help a visitor of AI Forecast Atlas (aiforecastatlas.com, a scenario dashboard by Creoox AG about AI commoditization) turn an idea or a problem into a clear suggestion for the team.',
    'Ask at most one short clarifying question if the idea is unclear. Then write the suggestion as: **Title** (one line), What (2–4 sentences), Why it helps (1–2 sentences), Where on the dashboard. Keep it neutral and short. Do not promise that it will be implemented. Reply in the visitor’s language.',
    'Current dashboard view (JSON): ' + snapshotText()
  ].join('\n\n');
  return [
    'You are the assistant of AI Forecast Atlas (aiforecastatlas.com), a public scenario dashboard by Creoox AG that tracks how AI is becoming a commodity and what that means for capital, compute, energy, prices and work.',
    'How it works: history from Q1 2023 to Q4 2026 comes from dated public data (the evidence ledger); from 2027 to 2035 a quarterly system-dynamics model runs eight scenarios: COMM The Great Commoditization; BUST Hype Implosion & Credit Event; BRKW Frontier Breakaway; SPLT Sovereign Splinternet; PWR The Power Wall; BOOM Agentic Productivity Boom; TRST Trust Shock; PLAT Commodity Models, Concentrated Platforms. Indices (hype, credit stress, bank stress, lab distress, signal-to-noise) are illustrative, not probabilities. It is a scenario model, not a forecast.',
    'Rules: use the site guide for definitions, scenarios and interface questions, and the supplied data for dashboard figures. Explain clearly when something is outside the model or the data. Be concrete and brief: 2–6 short paragraphs or bullets, plain words, numbers with units and the quarter they refer to. For “what does this mean for me” questions use the visitor profile if given: 2–4 implications across scenarios and what to watch. No personal investment, legal or tax advice. Write trademarks carefully: “Autodesk®” only as an adjective (e.g. “Autodesk® software”), never possessive. If the visitor proposes an improvement, thank them and point to the “Suggest an improvement” tab. Reply in the visitor’s language.',
    siteGuideText(),
    CITE_RULE,
    'Current dashboard view (JSON): ' + snapshotText(),
    'Latest weekly release (JSON): ' + releaseText(),
    xwText(),
    'Evidence ledger (JSON): ' + ledgerText(),
    'Measures (JSON): ' + measuresText(),
    'Visitor profile: ' + (CHAT.profile.role || CHAT.profile.country ? JSON.stringify(CHAT.profile) : 'not given')
  ].filter(Boolean).join('\n\n');
}
async function readSSE(body, on) {
  const reader = body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      let ev = 'message'; const data = [];
      chunk.split('\n').forEach(l => { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, '')); });
      if (data.length) { let d; try { d = JSON.parse(data.join('\n')); } catch (e) { d = { t: data.join('\n') }; } on(ev, d); }
    }
  }
}
async function askSite(turns, onText) {
  const body = { mode: CHAT.mode, messages: turns.slice(-12), snapshot: Object.assign(UI.snapshot(), CHAT.panel ? { panel: { id: CHAT.panel } } : {}), profile: CHAT.profile, session: CHAT.session, turnstile: CHAT.ts ? CHAT.ts.token : '' };
  const res = await fetch(api('chat'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' }, body: wrap(body), signal: CHAT.ctl.signal });
  if (res.status === 403 && (res.headers.get('content-type') || '').indexOf('json') < 0) { const e = new Error('blocked'); e.code = 'blocked'; throw e; }
  const ct = res.headers.get('content-type') || '';
  let text = '', sources = [], err = null;
  const on = (ev, d) => {
    if (ev === 'meta' && d.session) { CHAT.session = d.session; sstore('aimonitor.chat.session', d.session); if (CHAT.ts) { CHAT.ui.tsHost.innerHTML = ''; CHAT.ts = null; } }
    else if (ev === 'delta' && d.t) { text += d.t; onText(text); }
    else if (ev === 'sources' && Array.isArray(d)) sources = d;
    else if (ev === 'error') err = d;
  };
  if (ct.indexOf('text/event-stream') >= 0 && res.body && res.body.getReader) await readSSE(res.body, on);
  else {
    const j = await res.json().catch(() => ({ error: { code: 'provider' } }));
    if (j.error) err = j.error; else { on('meta', { session: j.session }); if (j.text) on('delta', { t: j.text }); if (j.sources) sources = j.sources; }
  }
  if (err) { const e = new Error(err.message || 'error'); e.code = err.code || 'provider'; e.text = text; throw e; }
  return { text, sources };
}
let samplePromise = null;
function getSample() {
  if (!samplePromise) samplePromise = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return samplePromise;
}
async function askArtifact(turns, onText) {
  const sample = await getSample();
  if (!sample) { const e = new Error('unavailable'); e.code = 'unavailable'; throw e; }
  const input = [{ role: 'user', content: rulesText() }].concat(turns.slice(-10));
  try {
    const r = await sample(input, { cache: false, signal: CHAT.ctl.signal, modelTier: 'default', onText: ({ text }) => onText(text) });
    return { text: r.text, sources: [] };
  } catch (e) { const x = new Error(e && e.message || 'error'); x.code = e && e.code; x.text = e && e.text; throw x; }
}
async function ask(text) {
  if (CHAT.busy || !text) return;
  if (!CHAT.open) openChat();
  if (text.length > 2000) { sysMsg(CHAT_ERR.too_long); return; }
  const turns = CHAT.turns[CHAT.mode];
  turns.push({ role: 'user', content: text });
  addMsg('u', text); CHAT.ui.sugg.innerHTML = '';
  const bubble = addMsg('a', ''); bubble.textContent = 'Thinking…'; bubble.classList.add('pending');
  CHAT.ctl = new AbortController(); setBusy(true);
  let shown = '';
  const onText = t => { shown = t; bubble.classList.remove('pending'); bubble.innerHTML = mdToHtml(t); CHAT.ui.log.scrollTop = CHAT.ui.log.scrollHeight; };
  try {
    const r = SITE ? await askSite(turns, onText) : await askArtifact(turns, onText);
    const final = r.text || shown;
    if (!final) throw Object.assign(new Error('empty'), { code: 'provider' });
    onText(final);
    turns.push({ role: 'assistant', content: final });
    if (CHAT.mode === 'ask') { const su = sourcesUsed(final); if (su) bubble.append(su); }
    if (r.sources && r.sources.length) {
      const s = el('div', 'note'); s.append(document.createTextNode('Web pages the assistant read: '));
      r.sources.slice(0, 6).forEach((x, i) => { if (i) s.append(document.createTextNode(' · ')); s.append(link(x.url, x.title || x.url)); });
      bubble.append(s);
    }
    if (CHAT.mode === 'suggest') offerSend(bubble, text, final);
  } catch (e) {
    turns.pop();
    if (e && (e.code === 'cancelled' || e.name === 'AbortError')) { if (shown) { turns.push({ role: 'user', content: text }); turns.push({ role: 'assistant', content: shown }); bubble.append(el('div', 'note', 'Stopped.')); } else bubble.remove(); }
    else {
      if (!shown) bubble.remove(); else bubble.append(el('div', 'note', 'Interrupted.'));
      const code = e && e.code;
      sysMsg(CHAT_ERR[code] || (e instanceof TypeError ? CHAT_ERR.network : CHAT_ERR.provider));
      if (code === 'turnstile' && SITE && CFG.turnstileSiteKey) { CHAT.session = ''; sstore('aimonitor.chat.session', null); if (!CHAT.ts) mountTurnstile(CHAT.ui.tsHost).then(t => { CHAT.ts = t; }); else CHAT.ts.reset(); }
      if (code === 'not_granted' || code === 'sampling_disabled' || code === 'unavailable') CHAT.ui.send.disabled = true;
    }
  } finally { setBusy(false); CHAT.ctl = null; }
}
function offerSend(bubble, userText, aiText) {
  const row = el('div'); row.style.marginTop = '8px'; row.style.display = 'flex'; row.style.gap = '6px'; row.style.flexWrap = 'wrap';
  const b = btn(SITE ? 'Send this to the AI Forecast Atlas team' : 'Sending works on the live site', 'primary');
  if (!SITE) b.disabled = true;
  b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = 'Sending…';
    try {
      const r = await fetch(api('feedback'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: wrap({ text: userText, summary: aiText, snapshot: UI.snapshot(), session: CHAT.session, turnstile: CHAT.ts ? CHAT.ts.token : '' }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { b.textContent = 'Sent. Thank you!'; }
      else { b.disabled = false; b.textContent = 'Send this to the AI Forecast Atlas team'; sysMsg((j.error && j.error.message) || 'Could not send. Please try again later.'); }
    } catch (e) { b.disabled = false; b.textContent = 'Send this to the AI Forecast Atlas team'; sysMsg(CHAT_ERR.network); }
  });
  row.append(b); bubble.append(row);
}

/* ---------- embed mode (?embed=1): no site chrome, a link back to the full monitor ---------- */
function embedMode() {
  let q = null; try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  if (!q || q.get('embed') !== '1') return false;
  document.body.classList.add('embed');
  const a = link(UI.permalink(SITE_URL), 'Open in AI Forecast Atlas ↗'); a.className = 'btn embed-open';
  document.body.append(a);
  return true;
}

/* ---------- boot ---------- */
function boot() {
  syncThemeBtn();
  document.addEventListener('aicx:theme', syncThemeBtn);
  const bt = $('#bTheme'); if (bt) bt.addEventListener('click', () => UI.toggleTheme());
  const bs = $('#bShare'); if (bs) bs.addEventListener('click', openShare);
  const bd = $('#bData'); if (bd) bd.addEventListener('click', openData);
  const bn = $('#bSub'); if (bn) { bn.classList.add('sub'); bn.addEventListener('click', () => openSubscribe()); }
  buildRelbar(); datedLabels(); buildCredits();
  const emb = embedMode();
  if (!emb) buildChat();
  if (SITE && CFG.beaconToken) {
    const s = document.createElement('script'); s.defer = true; s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    s.setAttribute('data-cf-beacon', JSON.stringify({ token: CFG.beaconToken })); document.head.append(s);
  }
  loadXwatch();
  const h = (location.hash || '').replace('#', '');
  if (h === 'subscribe') openSubscribe(); else if (h === 'data') openData(); else if (h === 'about') openAbout(); else if (h === 'ask') openChat();
  else xwHash();
  window.addEventListener('hashchange', xwHash);
}
window.AICX_SITE = {
  closeDialog, closeChat, openDialog, openSubscribe, openShare, openData, openAbout, openChat, openChanges, ask, config: CFG,
  renderMarkdown: mdToHtml,   // the chat's renderer (markdown + citation chips), for tests and embedding
  xwatch: { focus: focusXw, get items() { return XW.items.slice(); }, get loaded() { return XW.loaded; } }
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
