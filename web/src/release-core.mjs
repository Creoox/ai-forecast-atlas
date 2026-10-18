/* AI Forecast Atlas — release core: turns a dataset (Q4 2026 starting values) into a complete weekly release:
   release.json (summary, changes, headline numbers, signposts, impacts), per-scenario series (JSON + CSV),
   impact scores, chart images (SVG), measure and scenario dictionaries and a Frictionless data package.
   Pure ES module: no DOM, no Node APIs. Runs in the admin page (browser) and in Node (tools/release.mjs).
   Deterministic: the same engine, dataset and previous release always give byte-identical files.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */

export const RELEASE_SCHEMA = 'aimonitor.release/1';
export const DATASET_SCHEMA = 'aimonitor.dataset/1';
export const SERIES_SCHEMA = 'aimonitor.series/1';

/* Measure dictionary (keys match the dashboard). f = display format, g = group. */
export const METRICS = {
  K: { name: 'Big-4 hyperscaler capex', unit: '$B per year (annualised)', f: 'B', g: 'A' },
  R: { name: 'AI revenue (final spending, gross basis)', unit: '$B per year', f: 'B', g: 'A' },
  CC: { name: 'Capital charge on installed base', unit: '$B per year', f: 'B', g: 'A' },
  ccov: { name: 'Revenue ÷ capital charge', unit: 'ratio (1 = 100%)', f: 'cov', g: 'A' },
  cov: { name: 'Revenue ÷ 1.4× capex (spending indicator)', unit: 'ratio (1 = 100%)', f: 'cov', g: 'A' },
  VL: { name: 'OpenAI + Anthropic equity value', unit: '$T', f: 'T', g: 'A' },
  VN: { name: 'Nvidia market value', unit: '$T', f: 'T', g: 'A' },
  Mult: { name: 'Lab equity value ÷ lab revenue', unit: 'multiple (×)', f: 'x', g: 'A' },
  S: { name: 'Hype index', unit: 'index 0–100 (illustrative)', f: 'idx', g: 'A' },
  Cs: { name: 'AI credit-stress index', unit: 'index 0–100 (illustrative, not a probability)', f: 'idx', g: 'A' },
  Bs: { name: 'Bank stress index', unit: 'index 0–100 (illustrative)', f: 'idx', g: 'A' },
  G: { name: 'Open-weight lag', unit: 'months behind the frontier (Epoch Capabilities Index)', f: 'mo', g: 'B' },
  Np: { name: 'Labs at frontier parity', unit: 'count', f: 'cnt', g: 'B' },
  Pf: { name: 'Frontier-tier price', unit: '$ per 1M tokens (3 input : 1 output)', f: 'usd', g: 'B' },
  Pc: { name: 'Good-enough-tier price', unit: '$ per 1M tokens (3 input : 1 output)', f: 'usd', g: 'B' },
  prem: { name: 'Frontier price premium', unit: 'multiple of the good-enough tier (×)', f: 'x', g: 'B' },
  mf: { name: 'Frontier markup over resource cost', unit: 'multiple (×)', f: 'x', g: 'B' },
  DC: { name: 'Data-centre electricity', unit: 'TWh per year (world)', f: 'twh', g: 'C' },
  Pp: { name: 'US commercial power price', unit: 'index (2023 = 100)', f: 'idx', g: 'C' },
  GR: { name: 'H100 one-year contract rent', unit: '$ per GPU-hour', f: 'usdh', g: 'C' },
  DR: { name: 'DRAM contract index', unit: 'index (Q1 2025 = 100)', f: 'idx', g: 'C' },
  LB: { name: 'Cheapest 128 GB local AI box', unit: '$', f: 'usd0', g: 'C' },
  Ufp: { name: 'Purchased fleet in use', unit: '%', f: 'pct', g: 'C' },
  Uopp: { name: 'Powered capacity in use', unit: '%', f: 'pct', g: 'C' },
  STp: { name: 'Purchased compute unpowered', unit: '%', f: 'pct', g: 'C' },
  SVp: { name: 'Desired compute served', unit: '%', f: 'pct', g: 'C' },
  OS: { name: 'Open-weight share of tokens', unit: '%', f: 'pct', g: 'D' },
  ES: { name: 'Enterprise open-weight use', unit: '%', f: 'pct', g: 'D' },
  LS: { name: 'Local / on-prem share', unit: '% of inference', f: 'pct', g: 'D' },
  AS: { name: 'Specialised-agent share of spend', unit: '% of enterprise AI spend', f: 'pct', g: 'D' },
  TC: { name: 'Top-3 share of enterprise LLM spend', unit: '%', f: 'pct', g: 'D' },
  PF: { name: 'Lab distress index', unit: 'index 0–100 (illustrative)', f: 'idx', g: 'D' },
  SN: { name: 'Signal-to-noise', unit: 'index (2023 = 100, illustrative)', f: 'idx', g: 'D' },
  GDP: { name: 'AI → US GDP growth', unit: 'percentage points of US real GDP growth', f: 'pp', g: 'E' },
  AU: { name: 'Knowledge work done by AI (realised)', unit: '% of knowledge-work value', f: 'pct', g: 'E' },
  AUd: { name: 'Work wanted after price response', unit: '% of knowledge-work value', f: 'pct', g: 'E' },
  AUp: { name: 'Potential work (adoption curve)', unit: '% of knowledge-work value', f: 'pct', g: 'E' },
  CRp: { name: 'Share of AI work value paid as revenue', unit: '%', f: 'pct', g: 'E' },
  BLD: { name: 'US data-centre construction', unit: '$B per year', f: 'B', g: 'S' },
  AUa: { name: 'AECO design & engineering work by AI', unit: '% (illustrative mapping)', f: 'pct', g: 'S' },
  AUdev: { name: 'Software-development work by AI', unit: '% (illustrative mapping)', f: 'pct', g: 'S' },
  seatG: { name: 'Knowledge-work seat index', unit: 'index (Q4 2026 = 100)', f: 'idx', g: 'S' },
  seatA: { name: 'AECO design seat index', unit: 'index (Q4 2026 = 100)', f: 'idx', g: 'S' },
  CtaskI: { name: 'AI cost per completed task', unit: 'index (Q4 2026 = 100)', f: 'ix', g: 'S' },
  PLAT: { name: 'Platform lock-in (driver)', unit: 'index 0–100 (scenario input)', f: 'idx', g: 'D' }
};
export const GROUPS = { A: 'Capital & markets', B: 'Models & pricing', C: 'Compute, energy & hardware', D: 'Market structure', E: 'Macro & work', S: 'Sector series' };
export const LOG_METRICS = { K: 1, R: 1, CC: 1, VL: 1, VN: 1, Pf: 1, Pc: 1, prem: 1, mf: 1, GR: 1, LB: 1, Mult: 1, DR: 1, CtaskI: 1 };
export const HEADLINE = ['K', 'R', 'ccov', 'VL', 'VN', 'Pf', 'Pc', 'prem', 'mf', 'G', 'Np', 'DC', 'Pp', 'GR', 'DR', 'LB', 'Ufp', 'STp', 'OS', 'ES', 'LS', 'AS', 'TC', 'PF', 'SN', 'S', 'Cs', 'Bs', 'GDP', 'AU', 'AUd', 'AUp', 'CRp', 'BLD', 'AUa', 'AUdev', 'seatG', 'seatA', 'CtaskI'];
export const CHARTS = ['K', 'R', 'ccov', 'VL', 'VN', 'Pf', 'Pc', 'prem', 'G', 'DC', 'Pp', 'GR', 'DR', 'LB', 'Ufp', 'OS', 'TC', 'Cs', 'S', 'GDP', 'AU', 'AUa', 'AUdev', 'BLD', 'CtaskI'];
export const HORIZONS = [2026.75, 2027.75, 2028.75, 2030.75, 2035.75];
export const LIGHT_COLORS = { COMM: '#226ca1', BUST: '#ab2a08', BRKW: '#4434c8', SPLT: '#b98a24', PWR: '#7e356f', BOOM: '#066a3e', TRST: '#f24f7b', PLAT: '#109984' };
export const SECTORS = [
  { id: 'aeco', name: 'AECO firms', rows: r => r.g === 'AECO' },
  { id: 'aecosw', name: 'AECO software', rows: r => r.g === 'AECO software' },
  { id: 'sw', name: 'Software & development', rows: r => ['Seat-based SaaS', 'Usage- and outcome-priced software', 'Developer tools & coding agents', 'Software developers (jobs)', 'AI wrappers & vibe-coded apps', 'Specialised-agent builders', 'IT services & outsourcing'].indexOf(r.n) >= 0 }
];
export const SIGNPOSTS = [
  { id: 'gap2', name: 'Open-weight lag under 2 months', k: 'G', op: '<', v: 2, risk: 0 },
  { id: 'markup', name: 'Frontier markup over resource cost below 1.5×', k: 'mf', op: '<', v: 1.5, risk: 1 },
  { id: 'capexyoy', name: 'Big-4 capex shrinking year-on-year', yoy: 'K', op: '<', v: 0, risk: 1 },
  { id: 'cover', name: 'Revenue covers under half the capital charge', k: 'ccov', op: '<', v: 0.5, risk: 1 },
  { id: 'credit', name: 'Credit-stress index above 70 (flag)', k: 'Cs', op: '>', v: 70, risk: 2 },
  { id: 'unpowered', name: 'More than 15% of purchased compute unpowered', k: 'STp', op: '>', v: 15, risk: 1 },
  { id: 'served', name: 'Under 85% of desired compute served', k: 'SVp', op: '<', v: 85, risk: 1 },
  { id: 'glut', name: 'H100 contract rent below $1.50/hr (glut)', k: 'GR', op: '<', v: 1.5, risk: 1 },
  { id: 'crunch', name: 'H100 contract rent above $4/hr (crunch)', k: 'GR', op: '>', v: 4, risk: 1 },
  { id: 'dram', name: 'DRAM index back under 300', k: 'DR', op: '<', v: 300, risk: 0 },
  { id: 'localbox', name: 'Local 128 GB AI box under $1,000', k: 'LB', op: '<', v: 1000, risk: 0 },
  { id: 'top3', name: 'Top-3 provider share under 60%', k: 'TC', op: '<', v: 60, risk: 0 },
  { id: 'distress', name: 'Lab distress index above 25', k: 'PF', op: '>', v: 25, risk: 2 },
  { id: 'gdp', name: 'AI drags on US GDP growth', k: 'GDP', op: '<', v: 0, risk: 2 },
  { id: 'iea', name: 'DC power above IEA 2030 projection (950 TWh)', k: 'DC', op: '>', v: 950, risk: 1 }
];

/* ---------- formatting (same rules as the dashboard) ---------- */
export function fmt(k, v) {
  const m = METRICS[k];
  if (v == null || !isFinite(v)) return '—';
  switch (m ? m.f : '') {
    case 'B': return v >= 1000 ? '$' + (v / 1000).toFixed(2) + 'T' : '$' + Math.round(v) + 'B';
    case 'T': return '$' + (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'T';
    case 'usd': return '$' + (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
    case 'usdh': return '$' + v.toFixed(2);
    case 'usd0': return '$' + Math.round(v).toLocaleString('en-US');
    case 'pct': return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + '%';
    case 'cov': return Math.round(v * 100) + '%';
    case 'x': return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + '×';
    case 'idx': return String(Math.round(v));
    case 'ix': return v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v));
    case 'mo': return v.toFixed(1) + ' mo';
    case 'cnt': return String(Math.round(v));
    case 'twh': return Math.round(v).toLocaleString('en-US') + ' TWh';
    case 'pp': { const a = Math.abs(v) < 0.05 ? 0 : v; return (a >= 0 ? '+' : '−') + Math.abs(a).toFixed(1) + ' pp'; }
  }
  return String(+v.toPrecision(4));
}
const r6 = v => (v == null || !isFinite(v) ? null : +(+v).toPrecision(6));
const r3 = v => (v == null || !isFinite(v) ? null : +(+v).toPrecision(3));

/* ---------- dates ---------- */
export function isoWeekId(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y0, 0, 1)) / 86400000 + 1) / 7);
  return y0 + '-W' + String(w).padStart(2, '0');
}

export function longDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return String(ymd);
  return +m[3] + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + m[1];
}

/* ---------- datasets ---------- */
const TEXT_FIELDS = ['name', 'v', 'status', 'period', 'scope', 'src', 'url', 'calc', 'was'];
/* provenance carried with every starting value: supporting quote, extra references, how it was obtained
   (via.type desk | api | ai | manual | assumption | model, with the AI model and second opinion for 'ai'), review dates */
export const PROV_FIELDS = ['quote', 'refs', 'via', 'reviewed', 'retrieved', 'prev'];
const clone = v => (v != null && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
export function datasetFromEngine(E, asOf) {
  const vals = E.anchorValues();
  const anchors = {};
  for (const a of E.ANCHORS) {
    const o = { metric: a.k, value: r6(vals[a.id]) };
    for (const f of TEXT_FIELDS) if (a[f] != null && a[f] !== '') o[f] = a[f];
    for (const f of PROV_FIELDS) if (a[f] != null && a[f] !== '' && !(Array.isArray(a[f]) && !a[f].length)) o[f] = clone(a[f]);
    anchors[a.id] = o;
  }
  return { schema: DATASET_SCHEMA, asOf: asOf || '2026-10-17', engine: E.VERSION, anchors };
}
export function diffDatasets(prev, next) {
  const out = [];
  const P = (prev && prev.anchors) || {}, N = (next && next.anchors) || {};
  for (const id of Object.keys(N).sort((a, b) => +a.slice(2) - +b.slice(2))) {
    const a = P[id] || {}, b = N[id];
    const numChanged = typeof a.value === 'number' && typeof b.value === 'number' && Math.abs(a.value - b.value) > 1e-9 * Math.max(1, Math.abs(a.value));
    const textChanged = ['v', 'status', 'period', 'src'].some(f => (a[f] || '') !== (b[f] || ''));
    if (!numChanged && !textChanged && P[id]) continue;
    const ch = { id, metric: b.metric, name: b.name || id, from: a.value == null ? null : a.value, to: b.value, fromText: a.v || (a.value == null ? '—' : String(a.value)), toText: b.v || String(b.value), status: b.status || '', period: b.period || '', src: b.src || '', url: b.url || '', numeric: !!numChanged };
    for (const f of ['quote', 'refs', 'via', 'reviewed']) if (b[f] != null && b[f] !== '') ch[f] = clone(b[f]);
    out.push(ch);
  }
  return out;
}

/* ---------- SVG chart (light background, all scenarios, history in ink) ---------- */
function niceTicks(lo, hi, log) {
  if (log) {
    const t = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) for (const m of [1, 2, 5]) { const v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) t.push(v); }
    return t.length > 7 ? t.filter((v, i) => i % 2 === 0) : t;
  }
  const span = hi - lo || 1, step0 = span / 5, p = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= step0) || 10 * p;
  const t = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(+v.toPrecision(10));
  return t;
}
const xmlEsc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function svgChart(E, runs, k, opts) {
  opts = opts || {};
  const W = 720, H = 380, L = 58, R = 104, T = 44, B = 64;
  const m = METRICS[k]; const log = !!LOG_METRICS[k];
  const keys = Object.keys(runs);
  let lo = Infinity, hi = -Infinity;
  for (const s of keys) for (const v of runs[s][k]) if (isFinite(v) && (!log || v > 0)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (!log) { const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.1 || 1; lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad; hi += pad; } else { lo /= 1.15; hi *= 1.15; }
  const n = E.NQ;
  const X = i => L + (W - L - R) * i / (n - 1);
  const Y = v => { const a = log ? Math.log(lo) : lo, b = log ? Math.log(hi) : hi, x = log ? Math.log(Math.max(v, lo)) : v; return T + (H - T - B) * (1 - (x - a) / (b - a)); };
  const now = E.NOW_I;
  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, Helvetica, sans-serif" role="img" aria-label="' + xmlEsc(m.name + ', eight scenarios, 2023–2035') + '">');
  parts.push('<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>');
  parts.push('<text x="' + L + '" y="20" font-size="15" font-weight="700" fill="#17171a">' + xmlEsc(m.name) + '</text>');
  parts.push('<text x="' + L + '" y="36" font-size="11" fill="#66635b">' + xmlEsc(m.unit + (log ? ' · log scale' : '') + ' · eight scenarios') + '</text>');
  parts.push('<rect x="' + X(now).toFixed(1) + '" y="' + T + '" width="' + (X(n - 1) - X(now)).toFixed(1) + '" height="' + (H - T - B) + '" fill="#f6f5f1"/>');
  for (const v of niceTicks(lo, hi, log)) {
    const y = Y(v).toFixed(1);
    parts.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#e6e3da" stroke-width="1"/>');
    parts.push('<text x="' + (L - 6) + '" y="' + (+y + 4) + '" font-size="10.5" fill="#66635b" text-anchor="end">' + xmlEsc(fmt(k, v)) + '</text>');
  }
  for (let yr = 2023; yr <= 2035; yr++) {
    const i = E.idxOf(yr); if (i < 0 || i >= n) continue;
    const x = X(i).toFixed(1);
    parts.push('<line x1="' + x + '" x2="' + x + '" y1="' + (H - B) + '" y2="' + (H - B + 4) + '" stroke="#a9a59a"/>');
    if (yr % 2 === 1) parts.push('<text x="' + x + '" y="' + (H - B + 16) + '" font-size="10.5" fill="#66635b" text-anchor="middle">' + yr + '</text>');
  }
  parts.push('<line x1="' + X(now).toFixed(1) + '" x2="' + X(now).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="#9c5500" stroke-dasharray="3 3"/>');
  parts.push('<text x="' + (X(now) + 4).toFixed(1) + '" y="' + (T + 10) + '" font-size="9.5" fill="#9c5500">model →</text>');
  const path = (arr, i0, i1) => { let d = ''; for (let i = i0; i <= i1; i++) { const v = arr[i]; if (!isFinite(v) || (log && v <= 0)) continue; d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); } return d; };
  for (const s of keys) parts.push('<path d="' + path(runs[s][k], now, n - 1) + '" fill="none" stroke="' + (opts.colors && opts.colors[s] || '#555') + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>');
  parts.push('<path d="' + path(runs[keys[0]][k], 0, now) + '" fill="none" stroke="#17171a" stroke-width="2.4" stroke-linejoin="round"/>');
  /* direct labels at the line ends (identity never rests on colour alone) */
  const ends = keys.map(s => { const arr = runs[s][k]; let i = n - 1; while (i > now && !(isFinite(arr[i]) && (!log || arr[i] > 0))) i--; return { s, y: Y(arr[i]), y0: Y(arr[i]) }; }).sort((a, b) => a.y - b.y);
  const gap = 11.5, top = T + 6, bot = H - B - 2;
  for (let i = 1; i < ends.length; i++) if (ends[i].y < ends[i - 1].y + gap) ends[i].y = ends[i - 1].y + gap;
  if (ends.length && ends[ends.length - 1].y > bot) { ends[ends.length - 1].y = bot; for (let i = ends.length - 2; i >= 0; i--) if (ends[i].y > ends[i + 1].y - gap) ends[i].y = ends[i + 1].y - gap; }
  if (ends.length && ends[0].y < top) { const sh = top - ends[0].y; ends.forEach(e => { e.y += sh; }); }
  const xe = X(n - 1);
  for (const e of ends) {
    const col = opts.colors && opts.colors[e.s] || '#555';
    parts.push('<path d="M' + (xe + 2).toFixed(1) + ' ' + e.y0.toFixed(1) + 'L' + (xe + 10).toFixed(1) + ' ' + e.y.toFixed(1) + 'H' + (xe + 16).toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="1.5"/>');
    parts.push('<text x="' + (xe + 19).toFixed(1) + '" y="' + (e.y + 3.5).toFixed(1) + '" font-size="10" fill="#43413c">' + xmlEsc(opts.names && opts.names[e.s] || e.s) + '</text>');
  }
  let lx = L, ly = H - 30;
  for (const s of keys) {
    const label = opts.names && opts.names[s] || s;
    const w = 16 + label.length * 5.6;
    if (lx + w > W - R) { lx = L; ly += 13; }
    parts.push('<rect x="' + lx.toFixed(1) + '" y="' + (ly - 7) + '" width="10" height="3" fill="' + (opts.colors && opts.colors[s] || '#555') + '"/><text x="' + (lx + 13).toFixed(1) + '" y="' + ly + '" font-size="10" fill="#43413c">' + xmlEsc(label) + '</text>');
    lx += w + 6;
  }
  parts.push('<text x="' + (W - R) + '" y="' + (H - 4) + '" font-size="9" fill="#8a877e" text-anchor="end">' + xmlEsc('AI Forecast Atlas by Creoox AG · aiforecastatlas.com' + (opts.release ? ' · release ' + opts.release : '') + ' · CC BY 4.0') + '</text>');
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

/* ---------- the release ---------- */
function signHit(sp, v) { return sp.op === '<' ? v < sp.v : v > sp.v; }
function signVal(sp, r, i) { return sp.yoy ? (i >= 4 ? r[sp.yoy][i] / r[sp.yoy][i - 4] - 1 : 0) : r[sp.k][i]; }

/**
 * buildRelease({ createEngine, dataset, previous, id, publishedAt, next, asOf, siteUrl, carryForward, notes })
 *  createEngine : factory from engine.mjs (a fresh instance is used)
 *  dataset      : aimonitor.dataset/1 object (the starting values to publish)
 *  previous     : { release, dataset } of the last published release, or null
 * Returns { release, files } where files maps relative paths to file contents (strings).
 */
export function buildRelease(o) {
  const E = o.createEngine();
  const base = datasetFromEngine(o.createEngine(), '2026-10-17');
  const applied = E.applyData(o.dataset);
  const scn = E.SCENARIOS;
  const runs = {};
  for (const s of scn) runs[s.key] = E.simulate(s, null);
  const n = E.NQ, now = E.NOW_I;
  const quarters = [], ts = [];
  for (let i = 0; i < n; i++) { quarters.push(E.qLabel(i)); ts.push(E.tAt(i)); }
  const keys = Object.keys(METRICS).filter(k => runs[scn[0].key][k]);
  const id = o.id;
  const files = {};
  const names = {}; const colors = {};
  scn.forEach(s => { names[s.key] = s.short; colors[s.key] = LIGHT_COLORS[s.key] || s.color; });

  /* series */
  const longRows = ['scenario,quarter,t,metric,value'];
  for (const s of scn) {
    const r = runs[s.key];
    const metrics = {};
    keys.forEach(k => { metrics[k] = r[k].map(r6); });
    files['series/' + s.key + '.json'] = JSON.stringify({ schema: SERIES_SCHEMA, release: id, scenario: { key: s.key, name: s.name }, quarters, t: ts, history_until: quarters[now], metrics }) + '\n';
    const rows = ['quarter,t,' + keys.join(',')];
    for (let i = 0; i < n; i++) rows.push(quarters[i] + ',' + ts[i] + ',' + keys.map(k => { const v = r6(r[k][i]); return v == null ? '' : v; }).join(','));
    files['series/' + s.key + '.csv'] = rows.join('\n') + '\n';
    for (let i = 0; i < n; i++) keys.forEach(k => { const v = r6(r[k][i]); if (v != null) longRows.push(s.key + ',' + quarters[i] + ',' + ts[i] + ',' + k + ',' + v); });
  }
  files['series/all.csv'] = longRows.join('\n') + '\n';

  /* impacts: score −100…+100 vs today, at the Q4 of each year */
  const years = []; for (let y = 2027; y <= 2035; y++) years.push(y);
  const impacts = {};
  for (const s of scn) {
    const imp = E.impacts(runs[s.key]);
    impacts[s.key] = imp;
    const rows = E.IMPACT_ROWS.map((row, j) => { const sc = {}; years.forEach(y => { sc[y] = Math.round(imp.rows[j][E.idxOf(y + 0.75)]); }); return { group: row.g, name: row.n, scores: sc }; });
    files['impacts/' + s.key + '.json'] = JSON.stringify({ schema: 'aimonitor.impacts/1', release: id, scenario: { key: s.key, name: s.name }, scale: '−100 (loses most) … +100 (gains most), change versus Q4 2026', years, rows }) + '\n';
  }

  /* headline numbers per scenario at fixed horizons */
  const hIdx = HORIZONS.map(t => E.idxOf(t));
  const headline = { horizons: hIdx.map(i => quarters[i]), metrics: HEADLINE.filter(k => keys.indexOf(k) >= 0), scenarios: {} };
  for (const s of scn) { const o2 = {}; headline.metrics.forEach(k => { o2[k] = hIdx.map(i => r6(runs[s.key][k][i])); }); headline.scenarios[s.key] = o2; }

  /* signposts: first quarter each scenario crosses each threshold */
  const signposts = SIGNPOSTS.map(sp => {
    const by = {};
    for (const s of scn) {
      const r = runs[s.key];
      let first = null;
      if (signHit(sp, signVal(sp, r, now))) first = 'today';
      else for (let i = now + 1; i < n; i++) if (signHit(sp, signVal(sp, r, i))) { first = quarters[i]; break; }
      by[s.key] = first;
    }
    return { id: sp.id, name: sp.name, risk: sp.risk, first: by };
  });

  /* regimes and impacts at Q4 2030 */
  const i30 = E.idxOf(2030.75);
  const regimes = {}; const winners = {}; const sectors = {};
  for (const s of scn) {
    regimes[s.key] = hIdx.map(i => { const g = runs[s.key].regime[i]; return (E.REGIMES[g] || {}).label || g; });
    const sc = E.IMPACT_ROWS.map((row, j) => ({ name: row.n, group: row.g, score: Math.round(impacts[s.key].rows[j][i30]) }));
    const sorted = sc.slice().sort((a, b) => b.score - a.score);
    winners[s.key] = { gains: sorted.slice(0, 3), losses: sorted.slice(-3).reverse() };
  }
  SECTORS.forEach(S => {
    const rows = E.IMPACT_ROWS.map((row, j) => ({ row, j })).filter(x => S.rows(x.row));
    sectors[S.id] = { name: S.name, rows: rows.map(x => { const o2 = { name: x.row.n }; scn.forEach(s => { o2[s.key] = Math.round(impacts[s.key].rows[x.j][i30]); }); return o2; }) };
  });

  /* what changed: dataset vs previous release, and how the Q4 2030 numbers moved */
  const prevDs = o.previous && o.previous.dataset ? o.previous.dataset : base;
  const changes = diffDatasets(prevDs, o.dataset);
  const moves = [];
  const prevH = o.previous && o.previous.release && o.previous.release.headline;
  if (prevH && prevH.scenarios) {
    const hi = headline.horizons.indexOf('Q4 2030'), phi = prevH.horizons ? prevH.horizons.indexOf('Q4 2030') : -1;
    if (hi >= 0 && phi >= 0) for (const s of scn) for (const k of ['K', 'R', 'ccov', 'VL', 'Pf', 'Pc', 'G', 'DC', 'Pp', 'GR', 'Ufp', 'OS', 'GDP', 'AU', 'Cs']) {
      const a = prevH.scenarios[s.key] && prevH.scenarios[s.key][k] && prevH.scenarios[s.key][k][phi], b = headline.scenarios[s.key][k] && headline.scenarios[s.key][k][hi];
      if (a == null || b == null) continue;
      const pts = ['pct', 'pp', 'mo'].indexOf(METRICS[k].f) >= 0 || ['S', 'Cs', 'Bs', 'PF', 'PLAT'].indexOf(k) >= 0;
      const rel = pts ? (b - a) / 50 : a !== 0 ? b / a - 1 : 0;
      if (Math.abs(rel) >= 0.02) moves.push({ scenario: s.key, metric: k, from: a, to: b, fromText: fmt(k, a), toText: fmt(k, b), rel: r3(rel) });
    }
    moves.sort((x, y) => Math.abs(y.rel) - Math.abs(x.rel) || (x.scenario + x.metric < y.scenario + y.metric ? -1 : 1));
  }
  const sName = k => (scn.find(s => s.key === k) || {}).short || k;
  const perMetric = {}, picked = [];
  for (const mv of moves) { if (picked.length >= 6) break; if ((perMetric[mv.metric] || 0) >= 2) continue; perMetric[mv.metric] = (perMetric[mv.metric] || 0) + 1; picked.push(mv); }
  const highlights = picked.map(mv => sName(mv.scenario) + ': ' + METRICS[mv.metric].name + ' in Q4 2030 ' + mv.toText + ' (was ' + mv.fromText + ')');
  const comm = headline.scenarios.COMM;
  const idx30 = headline.horizons.indexOf('Q4 2030');
  let summary;
  if (o.carryForward) summary = 'No new release was built this week: starting values and all scenario paths are unchanged.';
  else if (o.base) summary = 'Base release: starting values as checked on ' + longDate(o.dataset.asOf || '2026-10-17') + '. Weekly releases follow every Friday at 13:00 Swiss time.';
  else if (!changes.length) summary = 'No starting values changed this week; all scenario paths are unchanged.';
  else summary = changes.length + ' starting value' + (changes.length > 1 ? 's' : '') + ' updated: ' + changes.slice(0, 3).map(c => c.name + ' ' + c.fromText + ' → ' + c.toText).join('; ') + (changes.length > 3 ? '; and more' : '') + '.';
  if (comm && idx30 >= 0) summary += ' In the Commoditization scenario, Big-4 capex reaches ' + fmt('K', comm.K[idx30]) + ' a year and AI revenue ' + fmt('R', comm.R[idx30]) + ' by Q4 2030.';

  const release = {
    schema: RELEASE_SCHEMA, id, publishedAt: o.publishedAt || null, next: o.next || null, asOf: o.dataset.asOf || null,
    engine: E.VERSION, base: !!o.base, carryForward: !!o.carryForward,
    summary, notes: o.notes || '', changes, highlights, moves: moves.slice(0, 20),
    scenarios: scn.map(s => ({ key: s.key, name: s.name, short: s.short, color: s.color, colorLight: colors[s.key], thesis: s.thesis })),
    headline, regimes: { horizons: headline.horizons, scenarios: regimes }, signposts, impacts2030: winners, sectors,
    autoEvents: Object.fromEntries(scn.map(s => [s.key, E.autoEvents(runs[s.key], s).map(ev => ({ quarter: quarters[ev.i], text: ev.text }))])),
    evidence: E.SECTOR_EVIDENCE,
    appliedChanges: applied.map(c => ({ id: c.id, metric: c.k, from: r6(c.from), to: r6(c.to) })),
    licence: 'CC BY 4.0 — credit “AI Forecast Atlas by Creoox AG”, aiforecastatlas.com, release ' + id,
    files: {
      dataset: 'dataset.json', metrics: 'metrics.json', scenarios: 'scenarios.json', all: 'series/all.csv',
      series: Object.fromEntries(scn.map(s => [s.key, { json: 'series/' + s.key + '.json', csv: 'series/' + s.key + '.csv', impacts: 'impacts/' + s.key + '.json' }])),
      charts: Object.fromEntries(CHARTS.filter(k => keys.indexOf(k) >= 0).map(k => [k, 'charts/' + k + '.svg']))
    }
  };

  files['release.json'] = JSON.stringify(release, null, 1) + '\n';
  files['dataset.json'] = JSON.stringify(o.dataset, null, 2) + '\n';
  files['metrics.json'] = JSON.stringify({ schema: 'aimonitor.metrics/1', groups: GROUPS, metrics: Object.fromEntries(keys.map(k => [k, { name: METRICS[k].name, unit: METRICS[k].unit, group: METRICS[k].g, log: !!LOG_METRICS[k] }])) }, null, 1) + '\n';
  files['scenarios.json'] = JSON.stringify({ schema: 'aimonitor.scenarios/1', scenarios: release.scenarios, drivers: E.DRIVERS.map(d => ({ key: d.k, name: d.name, low: d.lo, high: d.hi, description: d.desc })) }, null, 1) + '\n';
  CHARTS.filter(k => keys.indexOf(k) >= 0).forEach(k => { files['charts/' + k + '.svg'] = svgChart(E, runs, k, { colors, names, release: id }); });
  const site = String(o.siteUrl || 'https://aiforecastatlas.com/').replace(/\/?$/, '/');
  files['datapackage.json'] = JSON.stringify({
    profile: 'tabular-data-package', name: 'ai-forecast-atlas-' + id.toLowerCase(), title: 'AI Forecast Atlas weekly release ' + id, version: id,
    homepage: site, licenses: [{ name: 'CC-BY-4.0', path: 'https://creativecommons.org/licenses/by/4.0/', title: 'Creative Commons Attribution 4.0' }],
    contributors: [{ title: 'Creoox AG', role: 'publisher', path: 'https://creoox.com' }],
    resources: [
      { name: 'all', path: 'series/all.csv', profile: 'tabular-data-resource', format: 'csv', mediatype: 'text/csv', schema: { fields: [{ name: 'scenario', type: 'string' }, { name: 'quarter', type: 'string' }, { name: 't', type: 'number', description: 'decimal year at the start of the quarter' }, { name: 'metric', type: 'string', description: 'see metrics.json' }, { name: 'value', type: 'number' }] } }
    ].concat(scn.map(s => ({ name: s.key.toLowerCase(), path: 'series/' + s.key + '.csv', profile: 'tabular-data-resource', format: 'csv', mediatype: 'text/csv', description: s.name, schema: { fields: [{ name: 'quarter', type: 'string' }, { name: 't', type: 'number' }].concat(keys.map(k => ({ name: k, type: 'number', title: METRICS[k].name, description: METRICS[k].unit }))) } })))
  }, null, 1) + '\n';
  return { release, files };
}
