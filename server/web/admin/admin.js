/* AI Forecast Atlas — admin app: overview and health, daily review queue (with the answers of the AI research panel),
   X watch review, weekly release builder (runs the model in this browser), newsletter, visitor suggestions,
   AI agents (keys, models, weights, tasks) and settings (site, Mailjet, limits).
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */
const meta = n => (document.querySelector('meta[name="' + n + '"]') || {}).content || '';
const MODE = meta('aim-mode');
const CSRF = meta('aim-csrf');
const API = '../api/admin.php';
const app = document.getElementById('app');
let S = null;          // admin state
let TAB = (location.hash || '#overview').slice(1);
let WORK = null;       // working dataset bundle
let BUILT = null;      // last browser-built release

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
function b64(str) { const by = new TextEncoder().encode(str); let s = ''; for (let i = 0; i < by.length; i += 0x8000) s += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000)); return btoa(s); }
async function call(a, body, extra) {
  const opt = { method: body ? 'POST' : 'GET', headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.headers['X-AIM-CSRF'] = CSRF; opt.body = JSON.stringify({ p: b64(JSON.stringify(body)) }); }
  const r = await fetch(API + '?a=' + encodeURIComponent(a) + (extra || ''), opt);
  if ((r.headers.get('content-type') || '').indexOf('json') < 0) { if (r.ok) return r.text(); throw new Error('Server answered HTTP ' + r.status + (r.status === 403 ? ' (blocked — the host firewall may have stopped this request)' : '')); }
  const j = await r.json();
  if (j.ok === false) { const e = new Error(typeof j.error === 'string' ? j.error : (j.error && j.error.message) || 'Error'); e.code = j.error && j.error.code; throw e; }
  return j;
}
let toastT;
function toast(m, bad) { let t = document.querySelector('.toast'); if (!t) { t = h('div', { class: 'toast', role: 'status' }); document.body.append(t); } t.textContent = m; t.style.borderColor = bad ? 'var(--err)' : ''; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200); }
const when = iso => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d) ? iso : new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); };
const usd = v => '$' + (+v || 0).toFixed(v >= 10 ? 0 : 2);
function busy(btn, fn) { return async (...a) => { const t = btn.textContent; btn.disabled = true; btn.textContent = 'Working…'; try { await fn(...a); } catch (e) { toast(e.message || String(e), true); } finally { btn.disabled = false; btn.textContent = t; } }; }
function getPath(o, p) { return p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
function setPath(o, p, v) { const ks = p.split('.'); let x = o; ks.slice(0, -1).forEach(k => { x[k] = x[k] || {}; x = x[k]; }); x[ks[ks.length - 1]] = v; }
function weekId(ymd) { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y0 = t.getUTCFullYear(); const w = Math.ceil(((t - Date.UTC(y0, 0, 1)) / 86400000 + 1) / 7); return y0 + '-W' + String(w).padStart(2, '0'); }

/* ---------- setup and login ---------- */
function screenSetup() {
  const key = h('input', { type: 'text', autocomplete: 'off', placeholder: 'xxxxxx-xxxxxx-xxxxxx-xxxxxx' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const em = h('input', { type: 'email', autocomplete: 'email', placeholder: 'you@creoox.com' });
  const url = h('input', { type: 'url', value: location.origin + location.pathname.replace(/admin\/.*$/, '') });
  const msg = h('p', { class: 'msg' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Finish setup');
  const f = h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault(); msg.textContent = '';
    if (pw.value !== pw2.value) { msg.className = 'msg err'; msg.textContent = 'The two passwords differ.'; return; }
    go.disabled = true;
    try { await call('setup', { setupKey: key.value.trim(), password: pw.value, email: em.value.trim(), siteUrl: url.value.trim() }); location.reload(); }
    catch (err) { msg.className = 'msg err'; msg.textContent = err.message; go.disabled = false; }
  } },
    h('h1', {}, 'Set up AI Forecast Atlas'),
    h('p', { class: 'note' }, 'To prove that you manage this server, open the file ', h('code', {}, '_private/storage/setup-key.php'), ' with the home.pl file manager (WebFTP) or FileZilla and copy the key from its last line.'),
    h('label', { class: 'f' }, 'Setup key', key),
    h('label', { class: 'f' }, 'Admin password (at least 12 characters)', pw),
    h('label', { class: 'f' }, 'Repeat the password', pw2),
    h('label', { class: 'f' }, 'Your email (for the daily review summary)', em),
    h('label', { class: 'f' }, 'Site address', url),
    h('p', {}, go), msg);
  app.replaceChildren(h('main', {}, h('div', { class: 'center' }, f)));
  key.focus();
}
function screenLogin() {
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const msg = h('p', { class: 'msg' });
  const f = h('form', { class: 'card', onsubmit: async e => {
    e.preventDefault();
    try { await call('login', { password: pw.value }); location.reload(); } catch (err) { msg.className = 'msg err'; msg.textContent = err.message; }
  } }, h('h1', {}, 'AI Forecast Atlas admin'), h('label', { class: 'f' }, 'Password', pw), h('p', {}, h('button', { class: 'btn primary', type: 'submit' }, 'Log in')), msg,
    h('p', { class: 'note' }, 'Forgot the password? Delete the file _private/storage/admin.php on the server and open this page again to set a new one.'));
  app.replaceChildren(h('main', {}, h('div', { class: 'center' }, f)));
  pw.focus();
}

/* ---------- layout ---------- */
const TABS = [['overview', 'Overview'], ['review', 'Review'], ['xwatch', 'X watch'], ['release', 'Release'], ['newsletter', 'Newsletter'], ['feedback', 'Suggestions'], ['agents', 'AI agents'], ['settings', 'Settings']];
async function refresh() { S = await call('state'); }
function frame(content) {
  const nav = h('nav', { class: 'tabs', 'aria-label': 'Sections' }, TABS.map(([id, n]) => h('button', { type: 'button', 'aria-current': TAB === id ? 'page' : null, onclick: () => go(id) }, n + (id === 'review' && S.candidates.length ? ' (' + S.candidates.length + ')' : '') + (id === 'feedback' && S.feedbackNew ? ' (' + S.feedbackNew + ')' : '') + (id === 'xwatch' && S.xwatchOpen.length ? ' (' + S.xwatchOpen.length + ')' : ''))));
  const top = h('header', { class: 'top' }, h('span', { class: 'k' }, 'AICX'), h('span', { class: 't' }, 'AI Forecast Atlas admin'), nav, h('span', { class: 'sp' }),
    h('a', { class: 'btn', href: S.settings.site.url, target: '_blank', rel: 'noopener' }, 'Open site'),
    h('button', { class: 'btn', type: 'button', onclick: async () => { await call('logout', {}); location.reload(); } }, 'Log out'));
  app.replaceChildren(top, h('main', {}, content));
}
async function go(tab) { TAB = tab; history.replaceState(null, '', '#' + tab); await render(); }
async function render() {
  try {
    const v = TAB === 'review' ? await viewReview() : TAB === 'xwatch' ? viewXwatch() : TAB === 'release' ? await viewRelease() : TAB === 'newsletter' ? await viewNewsletter() : TAB === 'feedback' ? await viewFeedback() : TAB === 'agents' ? viewAgents() : TAB === 'settings' ? viewSettings() : viewOverview();
    frame(v);
  } catch (e) { frame(h('p', { class: 'err' }, e.message)); }
}

/* ---------- overview ---------- */
function card(label, big, ...rest) { return h('div', { class: 'card' }, h('div', { class: 'lbl' }, label), h('div', { class: 'big' }, big), ...rest); }
function healthTable(checks) {
  return h('div', { class: 'tw' }, h('table', {}, h('tbody', {}, checks.map(c => h('tr', {}, h('td', {}, c.name), h('td', { class: c.ok ? 'ok' : c.level === 'warn' ? 'warn' : 'err' }, c.ok ? 'OK' : c.level === 'warn' ? 'CHECK' : 'PROBLEM'), h('td', { class: 'small' }, c.info))))));
}
function viewOverview() {
  const st = S.state || {};
  const nl = S.newsletter;
  const u = S.usage;
  const cost = Object.entries(u).map(([r, x]) => r + ' ' + usd(x.today) + ' today / ' + usd(x.month) + ' month').join(' · ');
  const health = h('div', {}, healthTable(S.health));
  const deep = h('button', { class: 'btn', type: 'button' }, 'Run the full check (connections, private folder)');
  deep.onclick = busy(deep, async () => { const r = await call('health'); health.replaceChildren(healthTable(r.checks)); });
  const collect = h('button', { class: 'btn', type: 'button' }, 'Run the daily data check now');
  const collectMsg = r => toast(r.done ? 'Daily data check finished: ' + (r.new || 0) + ' new data point(s) to review.' : r.busy ? 'The data check is already running.' : 'Daily data check is running (' + (r.progress || 'started') + '); the scheduler finishes it within minutes.');
  collect.onclick = busy(collect, async () => { collectMsg((await call('collect-now', { restart: false })).result || {}); await refresh(); await render(); });
  // starting today's check again asks every agent again (and pays again), so it needs a second click
  const restart = h('button', { class: 'btn danger', type: 'button' }, 'Restart today’s check');
  let armed = false;
  restart.onclick = async () => {
    if (!armed) { armed = true; restart.textContent = 'Click again: all agents are asked again (costs again)'; setTimeout(() => { armed = false; restart.textContent = 'Restart today’s check'; }, 6000); return; }
    armed = false; restart.disabled = true;
    try { collectMsg((await call('collect-now', { restart: true })).result || {}); await refresh(); await render(); } catch (e) { toast(e.message, true); restart.disabled = false; }
  };
  const tick = h('button', { class: 'btn', type: 'button' }, 'Run the scheduler now');
  tick.onclick = busy(tick, async () => { const r = (await call('cron-now', {})).result || {}; const done = Object.keys(r).filter(k => k !== 'housekeeping'); toast(r.busy ? 'The scheduler is already running.' : done.length ? 'Scheduler ran: ' + done.join(', ') + '.' : 'Scheduler ran: nothing was due.'); await refresh(); await render(); });
  const staged = S.staged.length ? S.staged.map(s => s.id + ' (staged ' + when(s.stagedAt) + ')').join(', ') : 'nothing staged — Friday repeats the last release';
  const col = st.collect || {};
  return h('div', {},
    h('h1', {}, 'Overview'),
    h('div', { class: 'grid' },
      card('Next release', when(S.nextRelease), h('div', { class: 'small muted' }, staged)),
      card('Last release', st.lastRelease || '—', h('div', { class: 'small muted' }, when(st.lastReleaseAt) + (st.lastReleaseSource ? ' · ' + st.lastReleaseSource : ''))),
      card('Review queue', String(S.candidates.length), h('div', { class: 'small muted' }, 'data points waiting · ', h('a', { href: '#review', onclick: e => { e.preventDefault(); go('review'); } }, 'review'))),
      card('Daily data check', col.date || '—', h('div', { class: 'small muted' }, col.finished ? 'finished ' + when(col.finished) + ' · ' + (col.new || 0) + ' new' : col.date ? 'in progress ' + (col.done || []).length + ' steps' : 'starts at 06:00')),
      card('Newsletter', nl ? (nl.phase === 'send' ? 'sending ' + nl.sent + '/' + (nl.total || '?') : nl.phase) : 'idle', h('div', { class: 'small muted' }, 'sent today: ' + S.sentToday)),
      card('Suggestions', String(S.feedbackNew), h('div', { class: 'small muted' }, 'new this month')),
      card('AI costs (estimate)', usd(Object.values(u).reduce((a, x) => a + x.month, 0)) + ' this month', h('div', { class: 'small muted' }, cost))),
    h('h2', {}, 'Health'), health, h('p', { class: 'row' }, deep, collect, tick, restart),
    h('h2', {}, 'Scheduler'),
    h('p', { class: 'note' }, 'Last run: ' + when(st.lastTick) + (st.lastTickSource ? ' (' + st.lastTickSource + ')' : '') + '. On home.pl the scheduler runs from the files cron-5min.php and cron-13.php in /public_html (see the guide). If your host cannot run them, use an external cron service to call this address every 5 minutes:'),
    h('p', {}, h('code', {}, S.cron.url)));
}

/* ---------- review ---------- */
async function viewReview() {
  WORK = await call('working');
  const anchors = WORK.working.anchors || {};
  const list = h('div', { class: 'grid', style: 'grid-template-columns: minmax(0, 1fr)' });
  if (!S.candidates.length) list.append(h('p', { class: 'muted' }, 'Nothing waiting. The daily data check runs every morning from 06:00 and adds what it finds here.'));
  S.candidates.forEach(c => list.append(candidateCard(c, anchors[c.anchor] || {})));
  const diff = WORK.diff;
  return h('div', {},
    h('h1', {}, 'Review'),
    h('p', { class: 'note' }, 'New data points from official sources and from the AI research panel. For panel questions you see every agent’s answer: the proposal is the weighted median (one agent’s real answer, with its source); “Use this answer” publishes another agent’s answer instead. Approve what is right (you can edit the value and texts first), reject the rest. A value is approved either with its source link or — when an AI model gives it from its own knowledge — as “AI knowledge”, which is published with that label, the model, the date and its explanation. Approved values go into the working dataset together with their source, quote, references and the panel’s answers; the next release is built from it.'),
    list,
    h('h2', {}, 'Working dataset'),
    h('p', { class: 'note' }, diff.length ? 'Differs from the published data in ' + diff.length + ' value(s): ' + diff.map(d => d.name + ' ' + d.from + ' → ' + d.to).join('; ') + '. Build the release under Release.' : 'Same as the published data.'),
    workingTable(anchors, WORK.published.anchors || {}),
    h('p', { class: 'row' }, resetButton()));
}
function resetButton() {
  const b = h('button', { class: 'btn danger', type: 'button' }, 'Reset to the published data');
  let armed = false;
  b.onclick = async () => {
    if (!armed) { armed = true; b.textContent = 'Click again to confirm the reset'; setTimeout(() => { armed = false; b.textContent = 'Reset to the published data'; }, 5000); return; }
    await call('working-reset', {}); toast('Working dataset reset to the published data.'); await render();
  };
  return b;
}
function candidateCard(c, cur) {
  const p = c.proposed || {};
  const fields = {};
  let use = '';   // research panel: the agent whose answer is published instead of the lead's
  const inp = (k, label, val, type) => { const i = type === 'textarea' ? h('textarea', {}, val || '') : h('input', { type: type || 'text', value: val == null ? '' : String(val) }); fields[k] = i; return h('label', { class: 'f' }, label, i); };
  const msg = h('span', { class: 'small' });
  const approve = h('button', { class: 'btn primary', type: 'button' }, 'Approve');
  const reject = h('button', { class: 'btn', type: 'button' }, c.kind === 'evidence' ? 'Dismiss' : 'Reject');
  const edit = () => { const o = {}; for (const [k, i] of Object.entries(fields)) o[k] = k === 'value' ? (i.value.trim() === '' ? null : +i.value) : i.value.trim(); if (use) o.use = use; return o; };
  approve.onclick = busy(approve, async () => { await call('candidate', { id: c.id, action: 'approve', edit: edit() }); toast('Approved.'); await refresh(); await render(); });
  reject.onclick = busy(reject, async () => { await call('candidate', { id: c.id, action: 'reject' }); toast('Removed.'); await refresh(); await render(); });
  // "Use this answer": fill the form with another agent's answer; the server publishes it with that agent's source
  const fill = id => {
    const q = c.panel && c.panel.proposals && c.panel.proposals[id]; if (!q) return;
    use = id === c.panel.lead ? '' : id;
    const set = (k, v) => { if (fields[k]) fields[k].value = v == null ? '' : String(v); };
    ['value', 'v', 'period', 'src', 'url', 'quote', 'calc'].forEach(k => set(k, q[k]));
    if (fields.basis) fields.basis.value = q.via && q.via.type === 'ai-knowledge' ? 'ai-knowledge' : 'source';
    msg.textContent = id === c.panel.lead ? 'Back to the lead answer.' : 'Using the answer of ' + (AGENT_NAMES[id] || id) + ' — approve to publish it with its source.';
  };
  return h('div', { class: 'card cand' },
    h('div', { class: 'row' }, h('b', {}, cur.name || c.anchor), h('span', { class: 'badge a' }, c.panel ? 'AI research panel' : c.source), h('span', { class: 'badge' }, c.kind), p.via && p.via.type === 'ai-knowledge' ? h('span', { class: 'badge a' }, 'AI knowledge') : null, c.confidence ? h('span', { class: 'badge' }, 'confidence ' + c.confidence) : null, h('span', { class: 'small muted' }, when(c.created))),
    h('p', { class: 'small' }, 'Now: ', h('b', {}, cur.v || '—'), ' · ' + (cur.period || '') + ' · ' + (cur.src || '')),
    c.evidence ? h('p', { class: 'small' }, 'Found: ' + c.evidence) : null,
    c.note ? h('p', { class: 'note' }, c.note) : null,
    (c.flags && c.flags.length) ? h('p', { class: 'flags' }, c.flags.map(f => h('span', {}, '⚠ ' + f))) : null,
    c.panel && c.panel.answers ? panelBlock(c, fill) : null,
    c.crosscheck ? h('p', { class: 'small' }, 'Second opinion (' + (c.crosscheck.provider || '') + '): ' + (c.crosscheck.error ? 'no answer' : (c.crosscheck.agree ? 'agrees' : 'disagrees') + (c.crosscheck.value != null ? ', value ' + c.crosscheck.value : '') + (c.crosscheck.note ? ' — ' + c.crosscheck.note : '')), c.crosscheck.url ? h('span', {}, ' · ', h('a', { href: c.crosscheck.url, target: '_blank', rel: 'noopener' }, 'page it checked')) : null) : null,
    p.via ? h('p', { class: 'small muted' }, 'How it was found: ' + (p.via.name || p.via.type) + (p.via.model ? ' (' + p.via.model + ')' : '') + (p.retrieved ? ' · retrieved ' + p.retrieved : '')) : null,
    p.quote && !c.panel ? h('blockquote', { class: 'small', style: 'margin:6px 0;padding-left:10px;border-left:3px solid var(--rule2)' }, '“' + p.quote + '”') : null,
    h('div', { class: 'fgrid' }, inp('value', 'New value (model units: ' + (c.metric || '') + ')', p.value, 'number'), inp('v', 'Display text', p.v), inp('period', 'Period', p.period), basisField(fields, p), inp('src', 'Source (publisher: title, date)', p.src), inp('url', 'Source link (required unless AI knowledge)', p.url, 'url')),
    inp('quote', 'Supporting quote from the source', p.quote, 'textarea'),
    inp('calc', 'Derivation / note', p.calc, 'textarea'),
    (p.refs && p.refs.length) ? h('details', {}, h('summary', {}, 'Further references kept with the value (' + p.refs.length + ')'), h('ul', {}, p.refs.map(s => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title || s.url))))) : null,
    (c.searchSources && c.searchSources.length) ? h('details', {}, h('summary', {}, 'Pages the search used (' + c.searchSources.length + ')'), h('ul', {}, c.searchSources.map(s => h('li', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title || s.url))))) : null,
    p.url ? h('p', { class: 'small' }, h('a', { href: p.url, target: '_blank', rel: 'noopener' }, 'Open the source')) : null,
    h('p', { class: 'row' }, approve, reject, msg));
}
const AGENT_NAMES = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini', xai: 'xAI (Grok)', deepseek: 'DeepSeek' };
/* every agent's answer to the question, the consensus, and a button to publish another agent's answer */
function panelBlock(c, onUse) {
  const P = c.panel, sum = P.summary || {};
  const pct = x => Math.round(x * 100) + '%';
  const head = h('p', { class: 'small' }, h('b', {}, 'AI research panel: '), (sum.answered != null ? sum.answered : '?') + ' of ' + (P.asked || '?') + ' agents answered'
    + (P.consensus != null ? ' · weighted median ' + P.consensus + (P.lead ? ' (' + (AGENT_NAMES[P.lead] || P.lead) + ')' : '') : '')
    + (sum.lo != null ? ' · range ' + sum.lo + ' – ' + sum.hi : '')
    + (sum.agree != null ? ' · ' + pct(sum.agree) + ' of the counted weight within ±' + pct(sum.tol || 0.1) : ''));
  const rows = Object.entries(P.answers || {}).map(([id, a]) => {
    const lead = id === P.lead;
    const what = !a.ok ? h('span', { class: 'err' }, a.error || 'no answer') : !a.found ? h('span', { class: 'muted' }, 'nothing newer' + (a.reason ? ': ' + a.reason : '')) : h('span', {}, (a.display || (a.value != null ? String(a.value) : '—')) + (a.period ? ' · ' + a.period : ''));
    const basis = a.ok && a.found ? (a.basis === 'knowledge' ? h('span', { class: 'badge a', title: a.note || '' }, 'AI knowledge') : (a.url ? h('a', { href: a.url, target: '_blank', rel: 'noopener' }, a.title || a.publisher || 'source') : h('span', { class: 'warn' }, 'no link'))) : null;
    const q = a.ok && a.found ? (a.basis === 'knowledge' ? a.note : a.quote) : '';
    const btn = a.ok && a.found && P.proposals && P.proposals[id] ? h('button', { class: 'btn', type: 'button', onclick: () => onUse(id) }, lead ? 'Use the lead answer' : 'Use this answer') : null;
    return h('tr', {},
      h('td', {}, h('b', {}, AGENT_NAMES[id] || id), h('div', { class: 'small muted' }, (a.model || '') + ' · weight ' + (a.w != null ? a.w : '?') + (a.cost ? ' · ' + usd(a.cost) : ''))),
      h('td', {}, what, (a.flags && a.flags.length) ? h('div', { class: 'small warn' }, a.flags.join('; ')) : null),
      h('td', {}, basis), h('td', { class: 'small' }, q ? '“' + q + '”' : ''),
      h('td', {}, lead ? h('span', { class: 'badge a' }, 'lead') : null, btn));
  });
  return h('details', { open: true }, h('summary', {}, 'Answers of the AI agents'), head,
    h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Agent', 'Answer', 'Source', 'Quote or explanation', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows))));
}
/* what the value rests on: a source link, or an AI model's own knowledge (published with the label "AI knowledge") */
function basisField(fields, p) {
  const sel = h('select', {}, h('option', { value: 'source' }, 'Source link'), h('option', { value: 'ai-knowledge' }, 'AI knowledge (no specific source)'));
  sel.value = p.via && p.via.type === 'ai-knowledge' ? 'ai-knowledge' : 'source';
  fields.basis = sel;
  return h('label', { class: 'f', title: 'AI knowledge: information an AI model gives from its training or observations without a citable page. It is published with the label “AI knowledge”, the model and the date.' }, 'Basis', sel);
}
function workingTable(anchors, pub) {
  const rows = Object.entries(anchors).sort((a, b) => +a[0].slice(2) - +b[0].slice(2)).map(([id, a]) => {
    const changed = !pub[id] || pub[id].value !== a.value || pub[id].v !== a.v;
    const val = h('input', { type: 'number', step: 'any', value: a.value, style: 'width:7.5em' });
    const v = h('input', { type: 'text', value: a.v || '' });
    const per = h('input', { type: 'text', value: a.period || '' });
    const src = h('input', { type: 'text', value: a.src || '' });
    const url = h('input', { type: 'url', value: a.url || '', placeholder: 'https://…' });
    const calc = h('input', { type: 'text', value: a.calc || '', placeholder: 'How the value was derived' });
    const save = h('button', { class: 'btn', type: 'button' }, 'Save');
    save.onclick = busy(save, async () => { const r = await call('working-edit', { anchor: id, fields: { value: +val.value, v: v.value, period: per.value, src: src.value, url: url.value.trim(), calc: calc.value } }); toast(r.unchanged ? 'Nothing changed.' : id + ' saved.'); await render(); });
    const via = a.via ? (a.via.name || a.via.type) + (a.reviewed ? ' · reviewed ' + a.reviewed : '') : '';
    return h('tr', { style: changed ? 'background: color-mix(in srgb, var(--a) 10%, transparent)' : null }, h('td', { class: 'mono', style: 'white-space:nowrap' }, id), h('td', {}, a.name || '', h('div', { class: 'small muted' }, a.metric + ' · ' + (a.status || '') + (via ? ' · ' + via : ''))), h('td', {}, val), h('td', {}, v), h('td', {}, per), h('td', {}, src), h('td', {}, url), h('td', {}, calc), h('td', {}, save));
  });
  return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['ID', 'Measure', 'Value', 'Display', 'Period', 'Source', 'Link', 'Derivation', ''].map(t => h('th', {}, t)))), h('tbody', {}, rows)));
}

/* ---------- release ---------- */
async function viewRelease() {
  const nextId = weekId(String(S.nextRelease).slice(0, 10));
  const out = h('div', {});
  const refreshPages = h('button', { class: 'btn', type: 'button' }, 'Refresh public pages');
  const refreshStatus = h('p', { class: 'note', role: 'status' });
  let pageCursor = null;
  refreshPages.onclick = busy(refreshPages, async () => {
    let complete = false, count = 0;
    // Small server batches fit shared hosting. Keep the last cursor if a later request fails.
    for (let batch = 0; batch < 100 && !complete; batch++) {
      const r = await call('regenerate_public_pages', { cursor: pageCursor, limit: 10 });
      count += Number(r.processed) || 0;
      complete = !!r.complete;
      if (!complete && (!r.next || r.next === pageCursor)) throw new Error('Page refresh did not advance. Please retry.');
      pageCursor = complete ? null : r.next;
      refreshStatus.textContent = complete ? 'Public pages refreshed from the published data. No newsletter was sent.' : count + ' archived release pages refreshed; continuing…';
    }
    if (!complete) refreshStatus.textContent = 'This batch is complete. Click again to continue refreshing older release pages.';
  });
  const build = h('button', { class: 'btn primary', type: 'button' }, 'Build the release from the working dataset');
  build.onclick = busy(build, async () => {
    WORK = await call('working');
    const [eng, RC] = await Promise.all([import('../assets/engine.esm.js'), import('../assets/release-core.js')]);
    const t0 = performance.now();
    BUILT = RC.buildRelease({ createEngine: eng.createEngine, dataset: WORK.working, previous: WORK.latest ? { release: WORK.latest, dataset: WORK.published } : null, id: nextId, siteUrl: S.settings.site.url });
    BUILT.ms = Math.round(performance.now() - t0);
    showBuilt(out, nextId);
  });
  const staged = S.staged.length ? h('ul', {}, S.staged.map(s => h('li', {}, h('b', {}, s.id), ' staged ' + when(s.stagedAt) + ' by ' + (s.by || '') + ' ', h('button', { class: 'btn danger', type: 'button', onclick: async () => { await call('unstage', { id: s.id }); toast('Removed.'); await refresh(); await render(); } }, 'Remove')))) : h('p', { class: 'muted' }, 'Nothing staged: on Friday the last release is repeated as “no new data this week”.');
  return h('div', {},
    h('h1', {}, 'Weekly release'),
    h('p', {}, 'Next release: ', h('b', {}, when(S.nextRelease)), ' (', h('span', { class: 'mono' }, nextId), '). The scheduler publishes the staged build at that time and sends the newsletter.'),
    h('h2', {}, 'Staged'), staged,
    h('h2', {}, 'Build'),
    h('p', { class: 'note' }, 'Runs the model in this browser on the working dataset (' + (S.workingDiff.length ? S.workingDiff.length + ' change(s) since the last release' : 'no changes since the last release') + '), computes all eight scenarios and prepares every data file, chart and feed text. Nothing is public until it is published.'),
    h('p', {}, build), out,
    h('h2', {}, 'Public pages'),
    h('p', { class: 'note' }, 'Refresh the scenario, measure, About, FAQ, methodology and archived release pages, search sitemap and AI reading files using already-published data. This keeps the historical datasets and settings and does not publish working edits or send email.'),
    h('p', {}, refreshPages), refreshStatus,
    h('h2', {}, 'Published releases'),
    h('div', { class: 'tw' }, h('table', {}, h('tbody', {}, S.releases.map(r => h('tr', {}, h('td', { class: 'mono' }, h('a', { href: S.settings.site.url + 'data/releases/' + r.id + '/', target: '_blank', rel: 'noopener' }, r.id)), h('td', { class: 'small' }, when(r.publishedAt)), h('td', { class: 'small' }, r.summary)))))));
}
function showBuilt(out, id) {
  const r = BUILT.release;
  const size = Object.values(BUILT.files).reduce((a, s) => a + s.length, 0);
  const stage = h('button', { class: 'btn primary', type: 'button' }, 'Stage for ' + when(S.nextRelease));
  const pubNow = h('button', { class: 'btn', type: 'button' }, 'Publish now instead');
  const files = () => { const f = {}; for (const [p, c] of Object.entries(BUILT.files)) f[p] = b64(c); return f; };
  stage.onclick = busy(stage, async () => { await call('stage', { id, files: files() }); toast('Staged. It goes live on ' + when(S.nextRelease) + '.'); await refresh(); await render(); });
  const confirmRow = h('p', { class: 'row', hidden: true }, h('span', { class: 'warn' }, 'Publish now and send the newsletter to all subscribers?'), h('button', { class: 'btn primary', type: 'button', onclick: busy(pubNow, async () => { await call('stage', { id, files: files() }); const x = await call('publish-now', { id }); toast('Published as ' + x.id + '.'); await refresh(); await render(); }) }, 'Yes, publish now'), h('button', { class: 'btn', type: 'button', onclick: () => { confirmRow.hidden = true; } }, 'Cancel'));
  pubNow.onclick = () => { confirmRow.hidden = false; };
  out.replaceChildren(h('div', { class: 'card' },
    h('p', {}, h('b', {}, 'Release ' + id), ' · ' + Object.keys(BUILT.files).length + ' files · ' + Math.round(size / 1024) + ' KB · computed in ' + BUILT.ms + ' ms'),
    h('p', {}, r.summary),
    r.changes.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Measure', 'Was', 'Now', 'Source'].map(t => h('th', {}, t)))), h('tbody', {}, r.changes.map(c => h('tr', {}, h('td', {}, c.name), h('td', {}, c.fromText), h('td', {}, c.toText), h('td', { class: 'small' }, c.src)))))) : h('p', { class: 'muted' }, 'No starting values changed.'),
    r.highlights.length ? h('ul', {}, r.highlights.map(x => h('li', {}, x))) : null,
    h('p', { class: 'row' }, stage, pubNow), confirmRow));
}

/* ---------- newsletter ---------- */
async function viewNewsletter() {
  const m = S.settings.mailjet;
  const ready = m.public_key && m.private_key && m.list_id && m.from_email;
  const lang = h('select', {}, S.languages.map(l => h('option', { value: l.id }, l.name)));
  const ed = h('select', {}, h('option', { value: 'weekly' }, 'Weekly edition'), h('option', { value: 'monthly' }, 'Monthly edition'));
  const cats = h('div', { class: 'row' }, S.categories.map(c => h('label', { class: 'small' }, h('input', { type: 'checkbox', value: c.id, checked: true, disabled: c.always ? true : null }), ' ' + c.label.en)));
  const frame = h('iframe', { class: 'preview', title: 'Newsletter preview', sandbox: '' });
  const pv = h('button', { class: 'btn', type: 'button' }, 'Show preview');
  const chosen = () => [...cats.querySelectorAll('input:checked')].map(i => i.value);
  pv.onclick = busy(pv, async () => { const html = await call('newsletter-preview', null, '&lang=' + lang.value + '&edition=' + ed.value + '&cats=' + encodeURIComponent(chosen().join(','))); frame.srcdoc = html; });
  const to = h('input', { type: 'text', value: S.settings.newsletter.test_recipients || S.settings.admin.email || '' });
  const send = h('button', { class: 'btn', type: 'button' }, 'Send a test email');
  send.onclick = busy(send, async () => { const r = await call('newsletter-test', { emails: to.value, lang: lang.value, cats: chosen(), edition: ed.value }); toast(r.ok ? 'Test sent (' + r.sent + ').' : 'Not sent: ' + r.error, !r.ok); });
  const check = h('button', { class: 'btn', type: 'button' }, 'Check the Mailjet setup');
  check.onclick = busy(check, async () => { const r = await call('mailjet-setup', {}); toast('List: ' + r.list + ' · sender: ' + r.sender + ' · properties ' + (r.properties.ok ? 'ready' : r.properties.error), !r.ok); });
  const nl = S.newsletter;
  return h('div', {},
    h('h1', {}, 'Newsletter'),
    h('p', {}, ready ? h('span', { class: 'ok' }, 'Mailjet is configured (list ' + m.list_id + ', sender ' + m.from_email + ').') : h('span', { class: 'warn' }, 'Mailjet is not configured yet — add the keys under Settings → Newsletter.'), ' ', check),
    h('p', { class: 'note' }, 'After each Friday release the scheduler sends one email per subscriber, in their language and with their topics, in batches of 50. Monthly subscribers get the edition of the first Friday of each month. Open and click tracking are off. Mailjet’s free plan allows 200 emails a day: set the daily limit in Settings to match your plan.'),
    nl ? h('p', {}, 'Current send: release ' + nl.id + ' · ' + nl.phase + ' · ' + nl.sent + ' sent' + (nl.total ? ' of ' + nl.total : '') + (nl.failed ? ' · ' + nl.failed + ' failed' : '') + ' ', h('button', { class: 'btn danger', type: 'button', onclick: async () => { await call('newsletter-stop', {}); toast('Stopped.'); await refresh(); await render(); } }, 'Stop sending')) : null,
    h('h2', {}, 'Preview and test'),
    h('div', { class: 'fgrid' }, h('label', { class: 'f' }, 'Language', lang), h('label', { class: 'f' }, 'Edition', ed), h('label', { class: 'f' }, 'Test addresses (comma separated)', to)),
    h('h3', {}, 'Topics'), cats,
    h('p', { class: 'row' }, pv, send), frame);
}

/* ---------- X watch ---------- */
const XW_TOPICS = [['markets', 'Capital & markets'], ['models', 'Models & pricing'], ['compute', 'Compute, energy & hardware'], ['structure', 'Market structure'], ['work', 'Macro & work'], ['aeco', 'AECO firms'], ['aecosw', 'AECO software'], ['dev', 'Software & development']];
function postList(posts, keep) {
  return h('ul', { class: 'small' }, (posts || []).map(p => h('li', {}, keep ? h('input', { type: 'checkbox', checked: true, value: p.url, 'data-keep': keep, 'aria-label': 'Keep this post' }) : null, ' ', h('a', { href: p.url, target: '_blank', rel: 'noopener' }, '@' + p.handle), ' ' + [p.name, p.kind, p.posted].filter(Boolean).join(' · '))));
}
function xwCard(x) {
  const title = h('input', { type: 'text', value: x.title || '', maxlength: '110' });
  const sum = h('textarea', {}, x.summary || ''), why = h('textarea', {}, x.why || '');
  const sel = (vals, cur) => h('select', {}, vals.map(v => h('option', { value: v, selected: cur === v ? true : null }, v)));
  const cred = sel(['high', 'medium', 'low', 'unverified'], x.credibility), imp = sel(['high', 'medium', 'low'], x.impact);
  const topics = h('div', { class: 'row' }, XW_TOPICS.map(([id, n]) => h('label', { class: 'small' }, h('input', { type: 'checkbox', value: id, checked: (x.topics || []).includes(id) ? true : null }), ' ' + n)));
  const dir = sel(['up', 'down', 'mixed', 'none'], x.direction || 'none');
  const card = h('div', { class: 'card cand' });
  const kept = k => [...card.querySelectorAll('input[data-keep="' + k + '"]:checked')].map(i => i.value);
  const approve = h('button', { class: 'btn primary', type: 'button' }, 'Approve and publish');
  const reject = h('button', { class: 'btn', type: 'button' }, 'Reject');
  approve.onclick = busy(approve, async () => {
    const r = await call('xwatch', { id: x.id, action: 'approve', edit: { title: title.value.trim(), summary: sum.value.trim(), why: why.value.trim(), credibility: cred.value, impact: imp.value, direction: dir.value, topics: [...topics.querySelectorAll('input:checked')].map(i => i.value), keepPosts: kept('posts'), keepRefs: kept('refs'), keepAnchors: kept('anchors') } });
    toast('Published as ' + r.id + ' on the dashboard; it goes into the next release and newsletter.'); await refresh(); await render();
  });
  reject.onclick = busy(reject, async () => { await call('xwatch', { id: x.id, action: 'reject' }); toast('Removed.'); await refresh(); await render(); });
  card.append(
    h('div', { class: 'row' }, h('span', { class: 'badge a' }, 'X watch'), h('span', { class: 'badge' }, 'credibility ' + x.credibility), h('span', { class: 'badge' }, 'impact ' + x.impact), x.direction && x.direction !== 'none' ? h('span', { class: 'badge' }, x.direction) : null, h('span', { class: 'small muted' }, when(x.created) + (x.via && x.via.model ? ' · ' + x.via.model : '') + (x.ai && x.ai.cost ? ' · ' + usd(x.ai.cost) : ''))),
    (x.flags && x.flags.length) ? h('p', { class: 'flags' }, x.flags.map(f => h('span', {}, '⚠ ' + f))) : null,
    h('p', { class: 'small' }, h('b', {}, 'Posts'), ' (untick to leave a post out):'), postList(x.posts, 'posts'),
    (x.refs && x.refs.length) ? h('div', {}, h('p', { class: 'small' }, h('b', {}, 'Other pages that confirm it'), ' (untick to leave out):'), h('ul', { class: 'small' }, x.refs.map(r => h('li', {}, h('input', { type: 'checkbox', checked: true, value: r.url, 'data-keep': 'refs', 'aria-label': 'Keep this page' }), ' ', h('a', { href: r.url, target: '_blank', rel: 'noopener' }, r.title || r.url))))) : null,
    (x.credNote || x.impactNote) ? h('p', { class: 'small muted' }, [x.credNote ? 'Credibility: ' + x.credNote : '', x.impactNote ? 'Impact: ' + x.impactNote : ''].filter(Boolean).join(' · ')) : null,
    (x.anchors && x.anchors.length) ? h('p', { class: 'small' }, 'Linked to the ledger: ', x.anchors.map(a => h('label', { class: 'small', style: 'margin-right:8px' }, h('input', { type: 'checkbox', checked: true, value: a, 'data-keep': 'anchors' }), ' ' + a))) : null,
    h('label', { class: 'f' }, 'Title (max 110 characters)', title),
    h('div', { class: 'fgrid' }, h('label', { class: 'f' }, 'Credibility', cred), h('label', { class: 'f' }, 'Impact on X', imp), h('label', { class: 'f' }, 'Direction for the linked measure', dir)),
    h('label', { class: 'f' }, 'Summary — what was said', sum), h('label', { class: 'f' }, 'Why it matters for the monitor', why),
    h('p', { class: 'small' }, 'Topics (newsletter readers of these topics see it):'), topics,
    h('p', { class: 'note' }, 'Open the posts before approving: check that they exist, say what the summary says and come from the accounts shown.'),
    h('p', { class: 'row' }, approve, reject));
  return card;
}
function viewXwatch() {
  const scan = h('button', { class: 'btn primary', type: 'button', disabled: S.xwatchReady ? null : true }, 'Scan X now');
  scan.onclick = busy(scan, async () => { const r = await call('xwatch-scan', {}); toast(r.added ? r.added + ' new post' + (r.added > 1 ? 's' : '') + ' to review.' : 'Nothing new on X.'); await refresh(); await render(); });
  const pub = S.xwatchPublished.map(x => {
    const w = h('button', { class: 'btn danger', type: 'button' }, 'Withdraw');
    let armed = false;
    w.onclick = async () => {
      if (!armed) { armed = true; w.textContent = 'Click again to withdraw'; setTimeout(() => { armed = false; w.textContent = 'Withdraw'; }, 5000); return; }
      try { await call('xwatch-withdraw', { id: x.id }); toast(x.id + ' withdrawn from the dashboard.'); await refresh(); await render(); } catch (e) { toast(e.message, true); }
    };
    return h('tr', {}, h('td', { class: 'mono' }, x.id), h('td', {}, h('b', {}, x.title), h('div', { class: 'small muted' }, 'credibility ' + x.credibility + ' · impact ' + x.impact + ' · ' + (x.date || '') + (x.edited ? ' · edited' : '')), postList(x.posts)), h('td', {}, w));
  });
  const st = (S.agentStatus || {}).xai;
  return h('div', {},
    h('h1', {}, 'X watch'),
    h('p', { class: 'note' }, 'On the scan days Grok (xAI) searches posts on X for news that matters to the monitor: from credible accounts (official company and institution accounts, executives, journalists and media, analysts, researchers) and from accounts with heavy impact on X, labelled honestly for credibility. Approved items appear at once in the X watch panel of the dashboard, then in the next weekly release and newsletter. They are signals, not data: they never change the model. Settings are under AI agents.'),
    h('p', { class: 'row' }, scan, S.xwatchReady ? h('span', { class: 'small muted' }, st && st.task === 'xwatch' && st.last ? 'last scan ' + when(st.last) + (st.ok ? '' : ' — failed: ' + (st.error || '')) : 'no scan yet') : h('span', { class: 'warn' }, 'Add the xAI key under AI agents to use X watch.')),
    h('h2', {}, 'Waiting for review (' + S.xwatchOpen.length + ')'),
    S.xwatchOpen.length ? h('div', { class: 'grid', style: 'grid-template-columns: minmax(0,1fr)' }, S.xwatchOpen.map(xwCard)) : h('p', { class: 'muted' }, 'Nothing waiting. Scans run with the daily data check from 06:00 on the scan days; items not reviewed within 14 days are dropped.'),
    h('h2', {}, 'On the dashboard (' + pub.length + ')'),
    pub.length ? h('div', { class: 'tw' }, h('table', {}, h('tbody', {}, pub))) : h('p', { class: 'muted' }, 'Nothing published yet.'),
    h('p', { class: 'note' }, 'Withdraw removes an item from the dashboard, from every weekly release that listed it and from the feeds. Newsletters already sent cannot be recalled.'),
    olderWithdraw());
}
/* an author asks for removal of an item that is no longer on the dashboard but still in old releases */
function olderWithdraw() {
  const id = h('input', { type: 'text', placeholder: 'X12', style: 'width:8em', 'aria-label': 'Id of the item' });
  const b = h('button', { class: 'btn danger', type: 'button' }, 'Withdraw from all releases');
  b.onclick = busy(b, async () => { const v = id.value.trim(); if (!v) return; const r = await call('xwatch-withdraw', { id: v }); toast(v + ' removed from ' + (r.releases || 0) + ' release(s) and the dashboard.'); id.value = ''; await refresh(); await render(); });
  return h('details', {}, h('summary', { class: 'small' }, 'Remove an older item (from its id, shown in releases and newsletters)'), h('p', { class: 'row' }, id, b));
}

/* ---------- suggestions ---------- */
async function viewFeedback() {
  const r = await call('feedback');
  const rows = r.items.map(x => {
    const sel = h('select', {}, ['new', 'planned', 'done', 'declined'].map(s => h('option', { value: s, selected: x.status === s ? true : null }, s)));
    sel.onchange = async () => { await call('feedback-mark', { id: x.id, status: sel.value }); toast('Saved.'); };
    return h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'small muted' }, when(x.t)), h('span', { class: 'badge' }, (x.view && x.view.scenario || '') + ' ' + (x.view && x.view.quarter || '')), h('span', { class: 'sp' }), sel),
      h('p', {}, x.text), x.summary ? h('details', {}, h('summary', {}, 'As written up with the assistant'), h('p', { class: 'small', style: 'white-space:pre-wrap' }, x.summary)) : null);
  });
  return h('div', {}, h('h1', {}, 'Visitor suggestions'), h('p', { class: 'note' }, 'Ideas and problems sent from the “Suggest an improvement” tab of the assistant (last three months).'), rows.length ? h('div', { class: 'grid', style: 'grid-template-columns: minmax(0,1fr)' }, rows) : h('p', { class: 'muted' }, 'None yet.'));
}

/* ---------- settings ---------- */
const SECRET = { 'turnstile.secret': 1, 'mailjet.private_key': 1, 'sources.eia_key': 1 };
function field(path, label, type, opts, help) {
  const val = getPath(S.settings, path);
  let input;
  const secret = SECRET[path] || /^ai\.providers\.[a-z]+\.key$/.test(path);
  if (type === 'textarea') input = h('textarea', { 'data-path': path }, val || '');
  else if (type === 'select') input = h('select', { 'data-path': path }, opts.map(o => h('option', { value: Array.isArray(o) ? o[0] : o, selected: String(val) === String(Array.isArray(o) ? o[0] : o) ? true : null }, Array.isArray(o) ? o[1] : o)));
  else if (type === 'checkbox') input = h('input', { type: 'checkbox', 'data-path': path, checked: val ? true : null });
  else if (type === 'range') {
    input = h('input', { type: 'range', min: '0', max: '10', step: '1', 'data-path': path, value: String(val == null ? 0 : val), 'aria-label': label });
    const out = h('output', { class: 'mono', style: 'min-width:2ch;display:inline-block;text-align:right' }, String(val == null ? 0 : val));
    input.addEventListener('input', () => { out.textContent = input.value; });
    return h('label', { class: 'f' }, label, h('span', { class: 'row', style: 'flex-wrap:nowrap' }, input, out), help ? h('span', { class: 'note' }, help) : null);
  }
  else input = h('input', { type: secret ? 'password' : (type || 'text'), 'data-path': path, value: secret ? '' : (val == null ? '' : String(val)), placeholder: secret ? (val ? val + ' (saved — type to replace)' : 'not set') : '', autocomplete: secret ? 'new-password' : 'off', list: opts && opts.list ? opts.list : null, step: type === 'number' ? 'any' : null });
  const kids = [label, input];
  if (secret && val) kids.push(h('label', { class: 'small' }, h('input', { type: 'checkbox', 'data-clear': path }), ' remove the saved key'));
  if (help) kids.push(h('span', { class: 'note' }, help));
  return h('label', { class: 'f' }, ...kids);
}
function section(title, note, fields, extra) {
  const box = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, title), note ? h('p', { class: 'note' }, note) : null, h('div', { class: 'fgrid' }, fields), extra || null);
  const save = h('button', { class: 'btn primary', type: 'button' }, 'Save');
  save.onclick = busy(save, async () => {
    const upd = {};
    box.querySelectorAll('[data-path]').forEach(i => {
      const p = i.dataset.path;
      let v = i.type === 'checkbox' ? i.checked : i.value;
      if (i.type === 'number') v = i.value === '' ? 0 : +i.value;
      if (i.type === 'password' && v === '') return;
      setPath(upd, p, v);
    });
    box.querySelectorAll('[data-clear]').forEach(c => { if (c.checked) setPath(upd, c.dataset.clear, '__clear__'); });
    const r = await call('settings', { settings: upd });
    S.settings = r.settings;
    toast(r.mailjet ? (r.mailjet.ok ? 'Saved. Mailjet subscriber fields are ready.' : 'Saved, but Mailjet could not be set up: ' + (r.mailjet.error || 'check the keys') + '. Keep the newsletter sign-up closed until this works.') : 'Saved.');
    await refresh(); await render();
  });
  box.append(h('p', {}, save));
  return box;
}
/* ---------- AI agents ---------- */
const AGENT_NOTES = {
  openai: 'Web search. Its research answers run in background mode and are collected on later scheduler runs.',
  anthropic: 'Web search. Its research answers run as a message batch: half price, usually ready within the hour.',
  gemini: 'Google Search grounding. Links it gives are checked against the pages Google returned.',
  xai: 'Web search. Also scans posts on X for the X watch list (settings below).',
  deepseek: 'No web access: it answers from its own knowledge, labelled “AI knowledge” and counted with the knowledge factor. DeepSeek processes data in China, so it only receives research questions (no personal data) and is never used for the visitor chat.',
};
function viewAgents() {
  const P = S.providers;
  const st = S.agentStatus || {}, au = S.agentUsage || {};
  const cards = S.agents.map(a => {
    const k = a.id;
    const model = field('ai.agents.' + k + '.model', 'Model', 'text', { list: 'models-' + k });
    const test = h('button', { class: 'btn', type: 'button' }, 'Test the key and model');
    test.onclick = busy(test, async () => { const m = (model.querySelector('input').value || a.model).trim(); const r = await call('test-provider', { provider: k, model: m }); toast(r.ok ? a.label + ': OK (' + r.text + ')' : a.label + ': ' + r.error, !r.ok); });
    const s0 = st[k], u = au[k] || {};
    const state = a.ready ? (a.research ? 'Ready — answers the daily research questions' : 'Ready — research switched off for this agent') : !a.hasKey ? 'No API key yet' : !a.enabled ? 'Switched off' : 'No model set';
    const status = h('p', { class: 'small' }, h('span', { class: a.ready ? 'ok' : 'warn' }, state),
      s0 && s0.last ? ' · last answer ' + when(s0.last) + (s0.ok ? ' (OK)' : ' (failed: ' + (s0.error || '') + ')') : '',
      ' · spent ' + usd(u.today) + ' today, ' + usd(u.month) + ' this month');
    return section(a.label, AGENT_NOTES[k], [
      field('ai.providers.' + k + '.key', 'API key', 'text', null, h('a', { href: P[k].keys_url, target: '_blank', rel: 'noopener' }, 'Where to get a key')),
      model, field('ai.agents.' + k + '.weight', 'Weight in the panel (0 = shown to you, not counted)', 'range'),
      field('ai.agents.' + k + '.enabled', 'Switched on', 'checkbox'), field('ai.agents.' + k + '.research', 'Answers the daily research questions', 'checkbox'),
      h('details', {}, h('summary', { class: 'small' }, 'Advanced'), field('ai.agents.' + k + '.effort', 'Reasoning effort', 'select', [['', 'default'], 'none', 'low', 'medium', 'high']), field('ai.agents.' + k + '.max_output', 'Longest answer (tokens)', 'number'), field('ai.providers.' + k + '.base', 'API address', 'url'))
    ], h('div', {}, h('datalist', { id: 'models-' + k }, (P[k].models || []).map(m => h('option', { value: m }))), status, h('p', { class: 'row' }, test)));
  });
  const provOpts = [['', '— none —']].concat(Object.entries(P).filter(([k]) => k !== 'deepseek').map(([k, v]) => [k, v.label]));
  const chatOpts = provOpts.filter(o => o[0] !== '');
  const others = ['mistral', 'perplexity', 'openrouter'].map(k => h('div', { class: 'card' }, h('b', {}, P[k].label), ' ', h('a', { class: 'small', href: P[k].keys_url, target: '_blank', rel: 'noopener' }, 'get a key'), field('ai.providers.' + k + '.key', 'API key', 'text'), h('details', {}, h('summary', { class: 'small' }, 'Advanced'), field('ai.providers.' + k + '.base', 'API address', 'url'))));
  const scan = h('button', { class: 'btn', type: 'button', disabled: S.xwatchReady ? null : true }, 'Scan X now');
  scan.onclick = busy(scan, async () => { const r = await call('xwatch-scan', {}); toast(r.added ? r.added + ' new post(s) to review under X watch.' : 'Nothing new on X.'); await refresh(); });
  const ans = S.answersToday || {};
  const ansRows = Object.entries(ans).flatMap(([aid, by]) => Object.entries(by).map(([ag, x]) => h('tr', {}, h('td', { class: 'mono' }, aid), h('td', {}, AGENT_NAMES[ag] || ag), h('td', { class: 'small' }, !x.ok ? h('span', { class: 'err' }, x.error || 'failed') : !x.found ? 'nothing newer' : (x.display || x.value) + (x.basis === 'knowledge' ? ' (AI knowledge)' : '')), h('td', { class: 'small' }, x.cost ? usd(x.cost) : ''))));
  const ru = S.usage.research || {};
  return h('div', {},
    h('h1', {}, 'AI agents'),
    h('p', { class: 'note' }, 'Five AI agents feed the monitor. Every question of the daily data check goes to each agent that is switched on and has a key; their answers are combined by weighted median, and you approve the result under Review with all answers side by side. Grok (xAI) also scans X for the X watch list. Keys are stored only on this server, outside the public files, and are never shown again in full.'),
    h('p', {}, 'Research spending: ', h('b', {}, usd(ru.month) + ' this month'), ' of the ' + usd(S.settings.sources.research_budget_usd_month) + ' budget · ' + usd(ru.today) + ' today.'),
    h('div', { class: 'grid', style: 'grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }, cards),
    section('How the answers are combined', 'The published value is the weighted median: one agent’s real answer, so its source supports it exactly. The other answers are kept with the value and shown to readers. Answers without a source (AI knowledge) count with the factor below. Agreement tells readers how many agents landed within the tolerance of the published value.', [
      field('sources.research_enabled', 'Daily AI research on', 'checkbox'),
      field('sources.research_budget_usd_month', 'Budget per month for all agents and X watch (USD)', 'number'),
      field('ai.panel.knowledge_factor', 'Weight factor for answers without a source (0–1, default 0.5)', 'number'),
      field('ai.panel.tolerance', 'Agreement tolerance (0.10 = within ±10%)', 'number'),
      field('ai.background', 'Background mode (OpenAI) and batches (Anthropic): keeps scheduler runs short', 'checkbox')]),
    section('X watch (Grok scans X)', 'On the scan days Grok searches posts on X from the look-back period. The watch list tells it whom to prefer (it still looks further); excluded accounts are never used (at most 20). Findings wait under X watch for your approval.', [
      field('xwatch.enabled', 'X watch on', 'checkbox'),
      field('xwatch.days', 'Scan days (1 = Monday … 7 = Sunday, comma separated)'),
      field('xwatch.lookback_hours', 'Look back (hours)', 'number'),
      field('xwatch.max_items', 'Most items per scan', 'number'),
      field('xwatch.handles', 'Watch list: preferred accounts, one per line, without @', 'textarea'),
      field('xwatch.exclude', 'Never use these accounts, one per line', 'textarea'),
      field('xwatch.model', 'Model for the scan (empty = the xAI agent’s model)', 'text', { list: 'models-xai' }),
      field('xwatch.keep_days', 'Days an approved item stays on the dashboard', 'number')], h('p', { class: 'row' }, scan)),
    section('Visitor assistant and newsletter writer', 'The chat answers visitors (cheap and fast is best); the writer drafts the newsletter opening paragraph. DeepSeek is not offered here because visitors’ messages would be processed in China.', [
      field('ai.roles.chat.provider', 'Chat assistant: provider', 'select', chatOpts), field('ai.roles.chat.model', 'model', 'text', { list: 'models' }), field('ai.roles.chat.effort', 'reasoning effort (OpenAI)', 'select', ['none', 'low', 'medium', 'high']), field('ai.roles.chat.max_output', 'max answer length (tokens)', 'number'),
      field('ai.roles.writer.provider', 'Newsletter intro: provider', 'select', provOpts), field('ai.roles.writer.model', 'model', 'text', { list: 'models' }), field('ai.roles.writer.effort', 'reasoning effort (OpenAI)', 'select', ['none', 'low', 'medium', 'high']), field('ai.roles.writer.max_output', 'max answer length (tokens)', 'number'),
      field('ai.fallback_chat', 'Chat fallback if the main provider fails (provider:model, e.g. anthropic:claude-haiku-5-5)')]),
    h('h2', {}, 'Other providers (optional)'),
    h('p', { class: 'note' }, 'Mistral, Perplexity and OpenRouter can serve the chat, the writer or the chat fallback.'),
    section('Keys of other providers', null, others),
    h('h2', {}, 'Today’s answers'),
    ansRows.length ? h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, ['Question', 'Agent', 'Answer', 'Cost'].map(t => h('th', {}, t)))), h('tbody', {}, ansRows))) : h('p', { class: 'muted' }, 'No research answers yet today. The daily data check starts at 06:00 (Monday to Thursday have research questions).'),
    h('datalist', { id: 'models' }, Object.values(P).flatMap(v => v.models).map(m => h('option', { value: m }))));
}

/* ---------- settings ---------- */
function viewSettings() {
  const pw1 = h('input', { type: 'password', autocomplete: 'current-password' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwb = h('button', { class: 'btn', type: 'button' }, 'Change password');
  pwb.onclick = busy(pwb, async () => { await call('password', { current: pw1.value, new: pw2.value }); pw1.value = pw2.value = ''; toast('Password changed.'); });
  return h('div', {},
    h('h1', {}, 'Settings'),
    h('p', { class: 'note' }, 'API keys, models and weights of the AI agents are under ', h('a', { href: '#agents', onclick: e => { e.preventDefault(); go('agents'); } }, 'AI agents'), '.'),
    section('Site and company', 'Shown in the imprint, privacy notice and newsletter footer. Filled in from the public data of Creoox AG (creoox.com imprint and the Liechtenstein commercial register); check them once.', [
      field('site.url', 'Site address', 'url'), field('site.company', 'Company'), field('site.legal_form', 'Legal form'), field('site.address', 'Registered office (address)', 'textarea'), field('site.postal', 'Postal address, if different'), field('site.email', 'Contact email', 'email'), field('site.phone', 'Phone'),
      field('site.represented_by', 'Represented by'), field('site.register', 'Commercial register and number'), field('site.uid', 'Company number (UID), if any'), field('site.vat', 'VAT number'), field('site.dpo', 'Data protection contact'), field('site.authority', 'Supervisory authority for data protection'),
      field('site.eu_representative', 'EU representative (GDPR Art. 27) — only needed if the operator is outside the EEA'),
      field('site.company_url', 'Company website', 'url'), field('site.team_location', 'Team location'), field('site.xeokit_url', 'xeokit credit website, if applicable', 'url'),
      field('site.company_logo_url', 'Company logo URL for search metadata', 'url'), field('site.linkedin_url', 'Company LinkedIn URL', 'url'),
      field('site.repo_url', 'Source code address (GitHub), if published', 'url'), field('site.default_theme', 'Default theme', 'select', ['dark', 'light']), field('site.beacon_token', 'Cloudflare Web Analytics token (optional)'), field('site.imprint_extra', 'Extra imprint text', 'textarea')]),
    section('Chat limits', 'Protects your budget from heavy use.', [field('chat.enabled', 'Chat switched on', 'checkbox'), field('chat.daily_budget_usd', 'Daily budget (USD)', 'number'), field('chat.per_ip_hour', 'Questions per visitor per hour', 'number'), field('chat.per_ip_day', 'Questions per visitor per day', 'number'), field('chat.max_input_chars', 'Longest question (characters)', 'number'), field('chat.max_concurrent', 'Answers at the same time (keep 2 on shared hosting)', 'number'), field('chat.label', 'Provider name shown to visitors')]),
    section('Bot protection (Cloudflare Turnstile, recommended)', 'Free. In the Cloudflare dashboard open Turnstile → Add widget, enter aiforecastatlas.com, choose “Managed”, then paste both keys here.', [field('turnstile.site_key', 'Site key'), field('turnstile.secret', 'Secret key')]),
    section('Newsletter (Mailjet)', 'Mailjet account → API Key Management for the two keys; Contacts → Contact lists for the list ID; the sender address must be validated in Mailjet (Senders & domains).', [
      field('mailjet.public_key', 'API key'), field('mailjet.private_key', 'Secret key'), field('mailjet.list_id', 'Contact list ID'), field('mailjet.from_email', 'Sender address', 'email'), field('mailjet.from_name', 'Sender name'), field('mailjet.reply_to', 'Reply-to address (optional)', 'email'),
      field('mailjet.daily_limit', 'Daily sending limit of your Mailjet plan (free plan: 200; a tenth is kept for confirmation emails)', 'number'), field('mailjet.sandbox', 'Test mode (Mailjet accepts but does not deliver)', 'checkbox'), field('newsletter.enabled', 'Newsletter sign-up open', 'checkbox'), field('newsletter.test_recipients', 'Test addresses'), field('newsletter.notify_admin', 'Email me release and review summaries', 'checkbox'), field('admin.email', 'My email', 'email')]),
    section('Data sources', 'The SEC asks every user of its API to identify itself with a company name and email. The EIA key is free (eia.gov/opendata/register.php).', [field('sources.sec_user_agent', 'SEC user agent'), field('sources.eia_key', 'EIA API key'), field('sources.auto_approve_api', 'Approve official-API values automatically (not AI research)', 'checkbox')]),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Automation (optional)'), h('p', { class: 'note' }, 'To build releases automatically (for example with GitHub Actions, see docs/AUTOMATION.md), use this address and secret. Keep the secret private.'), h('p', {}, h('code', {}, S.ingest.url)), h('details', {}, h('summary', {}, 'Show the secret'), h('p', {}, h('code', {}, S.ingest.secret)))),
    h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Admin password'), h('div', { class: 'fgrid' }, h('label', { class: 'f' }, 'Current password', pw1), h('label', { class: 'f' }, 'New password (12+ characters)', pw2)), h('p', {}, pwb)));
}

/* ---------- start ---------- */
(async () => {
  if (MODE === 'setup') return screenSetup();
  if (MODE === 'login') return screenLogin();
  try { await refresh(); } catch (e) { if (e.code === 'auth') return screenLogin(); app.replaceChildren(h('main', {}, h('p', { class: 'err' }, e.message))); return; }
  if (!TABS.some(t => t[0] === TAB)) TAB = 'overview';
  await render();
  window.addEventListener('hashchange', () => { const t = (location.hash || '#overview').slice(1); if (t !== TAB && TABS.some(x => x[0] === t)) go(t); });
})();
