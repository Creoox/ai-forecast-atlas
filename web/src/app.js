(function () {
'use strict';
const E = window.AICX;
/* weekly data release (public site): re-anchor the Q4 2026 starting values before any run is simulated */
const DATA = window.AIMONITOR_DATA || null;
if (DATA && DATA.dataset && typeof E.applyData === 'function') {
  try { E.applyData(DATA.dataset); } catch (err) { console.warn('AI Forecast Atlas: weekly dataset not applied', err); }
}
const NQ = E.NQ, NOW = E.NOW_I, PRE = E.SCENARIOS;
const $ = (s, r) => (r || document).querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- storage helpers (per-viewer conveniences only; the page works without them) ---------- */
function load(k) { try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
const SITE = Object.assign({ mode: 'artifact' }, window.AIMONITOR || {}, window.AIMONITOR_SITE || {});

/* Text size is independent of layout presets, theme and shared views. */
const TEXT_SIZE_KEY = 'aimonitor.text-size.v1';
const TEXT_SIZES = [100, 125, 150];
const savedTextSize = load(TEXT_SIZE_KEY);
let TEXT_MODE = TEXT_SIZES.includes(savedTextSize) ? savedTextSize : 'auto';
const automaticTextSize = () => innerWidth >= 2500 ? 150 : innerWidth >= 1900 ? 130 : innerWidth >= 1400 ? 115 : 100;
let TEXT_SIZE = TEXT_MODE === 'auto' ? automaticTextSize() : TEXT_MODE;
const textScale = () => TEXT_SIZE / 100;
function applyTextSizeTokens() {
  document.documentElement.style.setProperty('--text-scale', textScale());
  document.documentElement.dataset.textSize = String(TEXT_SIZE);
  document.documentElement.dataset.textMode = String(TEXT_MODE);
  const select = $('#textSize'); if (select) select.value = String(TEXT_MODE);
}
applyTextSizeTokens();
// Broadcast is a fixed 1920×1080 recording composition, independent of reading preferences.
const chartScale = ctx => {
  if (ctx.canvas.id === 'bcv') return 1;
  const panel = ctx.canvas.closest('.is-focus');
  const extra = panel ? clamp(Math.sqrt((ctx.canvas.clientWidth || 1) / (ctx.canvas._normalWidth || ctx.canvas.clientWidth || 1)), 1, 1.8) : 1;
  ctx.canvas.dataset.chartScale = String(textScale() * extra);
  return textScale() * extra;
};

/* ---------- theme: dark (default, the terminal look) or light; tokens are re-read on every switch ---------- */
let THEME = (function () {
  const saved = load('aimonitor.theme');
  if (saved === 'light' || saved === 'dark') return saved;
  const host = document.documentElement.getAttribute('data-theme');
  if (host === 'light' || host === 'dark') return host;
  return SITE.defaultTheme === 'light' ? 'light' : 'dark';
})();
document.documentElement.setAttribute('data-theme', THEME);
const TH = {};
const TOK = ['bg', 'panel', 'panel-2', 'panel-3', 'rule', 'rule-2', 'ink', 'ink-2', 'ink-3', 'amber', 'amber-2', 'up', 'down', 'crit', 'warn', 'good', 'info', 'serious', 'muted', 'gain', 'loss', 'neutral'];
function readTokens() { const cs = getComputedStyle(document.documentElement); TOK.forEach(k => { TH[k.replace('-', '')] = cs.getPropertyValue('--' + k).trim(); }); }
readTokens();
const FD = '"Martian Mono", "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
const FX = '"Archivo", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';
function font(ctx, px, w, fam, stretch) {
  if (ctx.canvas.id !== 'bcv') px = Math.max(px, 10.5 * chartScale(ctx));
  ctx.font = (w || 500) + ' ' + px + 'px ' + (fam || FD);
  if ('fontStretch' in ctx) ctx.fontStretch = stretch || (ctx.canvas.id === 'bcv' ? 'condensed' : 'normal');
}
function hexRgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
function rgba(h, a) { const [r, g, b] = hexRgb(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; }
const RAMP_D = ['#764600', '#9a5b00', '#be7200', '#df8c04', '#f8ab4f', '#ffcd8a'];
const RAMP_L = ['#6b3d00', '#965500', '#c27512', '#dd9a3f', '#ecbe7e', '#f6deb8'];
const DIV_D = [[-100, '#f47b74'], [-55, '#c9433f'], [-20, '#5e2725'], [0, '#232528'], [20, '#1f3d63'], [55, '#3a81d7'], [100, '#7cb6ff']];
const DIV_L = [[-100, '#a8231c'], [-55, '#d4544c'], [-20, '#f0c7c2'], [0, '#ecebe6'], [20, '#c8d9f1'], [55, '#4d84d2'], [100, '#1d4c96']];
let RAMP = RAMP_D, DIV = DIV_D;
/* scenario colours for the light theme (same hues, darker steps so lines and text keep contrast on paper) */
/* validated with the dataviz palette checker against #fcfcfb: all 28 pairs clear the normal-vision floor (ΔE ≥ 15),
   CVD all-pairs 7.9 (floor band → legends and direct labels carry identity), every colour ≥ 3:1 */
const SCN_LIGHT = { COMM: '#226ca1', BUST: '#ab2a08', BRKW: '#4434c8', SPLT: '#b98a24', PWR: '#7e356f', BOOM: '#066a3e', TRST: '#f24f7b', PLAT: '#109984' };
const FUT_SHADE = () => (THEME === 'light' ? 'rgba(0,0,0,0.028)' : 'rgba(255,255,255,0.022)');
const POOL_DIM = () => (THEME === 'light' ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.45)');
function divColor(s) {
  s = clamp(s, -100, 100);
  for (let j = 0; j < DIV.length - 1; j++) if (s >= DIV[j][0] && s <= DIV[j + 1][0]) return mixHex(DIV[j][1], DIV[j + 1][1], (s - DIV[j][0]) / (DIV[j + 1][0] - DIV[j][0]));
  return DIV[3][1];
}
const TONE = {};
function setTone() { Object.assign(TONE, { crit: TH.crit, serious: TH.serious, warn: TH.warn, good: TH.good, info: TH.info, muted: TH.muted }); }
setTone();
function applyThemeVars() {
  RAMP = THEME === 'light' ? RAMP_L : RAMP_D; DIV = THEME === 'light' ? DIV_L : DIV_D;
  CUST_COLOR = THEME === 'light' ? '#55524b' : '#d6d3c9';
  readTokens(); setTone();
}

/* ---------- runs & state ---------- */
const RUN = {};
PRE.forEach(s => { RUN[s.key] = E.simulate(s, null); });
let CUST_COLOR = THEME === 'light' ? '#55524b' : '#d6d3c9'; // custom run: neutral, drawn dashed
if (THEME === 'light') { RAMP = RAMP_L; DIV = DIV_L; }
const state = {
  key: 'COMM', custom: null, t: NOW, playing: false, speed: 1, hover: null, hoverLane: null,
  reveal: true, tour: null, bc: false, closed: {}, from: 'now', firstPlay: true
};
let custRun = null;
const runFor = k => (k === 'CUST' ? custRun : RUN[k]);
const scnFor = k => PRE.find(s => s.key === (k === 'CUST' ? state.custom.base : k));
const scnColor = s => (THEME === 'light' && SCN_LIGHT[s.key]) || s.color;
const colorFor = k => (k === 'CUST' ? CUST_COLOR : scnColor(scnFor(k)));
const shortFor = k => (k === 'CUST' ? 'Custom' : scnFor(k).short);
const nameFor = k => (k === 'CUST' ? 'Custom: ' + scnFor('CUST').name : scnFor(k).name);
const allKeys = () => PRE.map(s => s.key).concat(custRun ? ['CUST'] : []);
const view = { from: null, to: RUN.COMM, p: 1 };
const LOGK = { K: 1, R: 1, CC: 1, VL: 1, VN: 1, Pf: 1, Pc: 1, prem: 1, mf: 1, GR: 1, LB: 1, Mult: 1, DR: 1, CtaskI: 1 };
function mval(k, i) {
  const b = view.to[k][i];
  if (!view.from || view.p >= 1) return b;
  const a = view.from[k][i], e = 1 - Math.pow(1 - view.p, 3);
  if (LOGK[k] && a > 0 && b > 0) return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * e);
  return a + (b - a) * e;
}
function lerpAt(get, f) {
  const i0 = clamp(Math.floor(f), 0, NQ - 1), i1 = Math.min(NQ - 1, i0 + 1), u = f - i0;
  const a = get(i0), b = get(i1);
  return a + (b - a) * u;
}
const at = (k, f) => lerpAt(i => mval(k, i), f);
const ci = () => clamp(Math.round(state.t), 0, NQ - 1);

/* ---------- metrics ---------- */
const MET = {
  K: { n: 'Big-4 hyperscaler capex', f: 'B', d: 'pct', g: 0 },
  R: { n: 'AI revenue (final spending, gross basis)', f: 'B', d: 'pct', g: 1 },
  CC: { n: 'Capital charge on installed base', f: 'B', d: 'pct', g: 0 },
  ccov: { n: 'Revenue ÷ capital charge', f: 'cov', d: 'cov', g: 1 },
  cov: { n: 'Revenue ÷ 1.4× capex (spending indicator)', f: 'cov', d: 'cov', g: 1 },
  VL: { n: 'OpenAI + Anthropic equity value', f: 'T', d: 'pct', g: 0 },
  VN: { n: 'Nvidia market value', f: 'T', d: 'pct', g: 0 },
  Mult: { n: 'Lab equity value ÷ lab revenue', f: 'x', d: 'pct', g: 0 },
  S: { n: 'Hype index', f: 'idx', d: 'pts', g: 0 },
  Cs: { n: 'AI credit-stress index', f: 'idx', d: 'pts', g: -1 },
  Bs: { n: 'Bank stress index', f: 'idx', d: 'pts', g: -1 },
  G: { n: 'Open-weight lag', f: 'mo', d: 'mo', g: 0 },
  Np: { n: 'Labs at frontier parity', f: 'cnt', d: 'cnt', g: 0 },
  Pf: { n: 'Frontier-tier price', f: 'usd', d: 'pct', g: 0 },
  Pc: { n: 'Good-enough-tier price', f: 'usd', d: 'pct', g: 0 },
  prem: { n: 'Frontier price premium', f: 'x', d: 'pct', g: 0 },
  mf: { n: 'Frontier markup over resource cost', f: 'x', d: 'pct', g: 0 },
  DC: { n: 'Data-centre electricity', f: 'twh', d: 'pct', g: 0 },
  Pp: { n: 'US commercial power price', f: 'idx', d: 'pct', g: -1 },
  GR: { n: 'H100 one-year contract rent', f: 'usdh', d: 'pct', g: 0 },
  DR: { n: 'DRAM contract index', f: 'idx', d: 'pct', g: 0 },
  LB: { n: 'Cheapest 128 GB local AI box', f: 'usd0', d: 'pct', g: 0 },
  Ufp: { n: 'Purchased fleet in use', f: 'pct', d: 'pts', g: 1 },
  Uopp: { n: 'Powered capacity in use', f: 'pct', d: 'pts', g: 0 },
  STp: { n: 'Purchased compute unpowered', f: 'pct', d: 'pts', g: -1 },
  SVp: { n: 'Desired compute served', f: 'pct', d: 'pts', g: 1 },
  OS: { n: 'Open-weight share of tokens', f: 'pct', d: 'pts', g: 0 },
  ES: { n: 'Enterprise open-weight use', f: 'pct', d: 'pts', g: 0 },
  LS: { n: 'Local / on-prem share', f: 'pct', d: 'pts', g: 0 },
  AS: { n: 'Specialised-agent share of spend', f: 'pct', d: 'pts', g: 0 },
  TC: { n: 'Top-3 share of enterprise LLM spend', f: 'pct', d: 'pts', g: -1 },
  PF: { n: 'Lab distress index', f: 'idx', d: 'pts', g: -1 },
  SN: { n: 'Signal-to-noise', f: 'idx', d: 'pts', g: 1 },
  GDP: { n: 'AI → US GDP growth', f: 'pp', d: 'pp', g: 1 },
  AU: { n: 'Knowledge work done by AI (realised)', f: 'pct', d: 'pts', g: 0 },
  AUd: { n: 'Work wanted after price response', f: 'pct', d: 'pts', g: 0 },
  AUp: { n: 'Potential work (adoption curve)', f: 'pct', d: 'pts', g: 0 },
  CRp: { n: 'Share of AI work value paid as revenue', f: 'pct', d: 'pts', g: 0 },
  BLD: { n: 'US data-centre construction', f: 'B', d: 'pct', g: 0 },
  AUa: { n: 'AECO design & engineering work by AI', f: 'pct', d: 'pts', g: 0 },
  AUdev: { n: 'Software-development work by AI', f: 'pct', d: 'pts', g: 0 },
  seatG: { n: 'Knowledge-work seat index', f: 'idx', d: 'pts', g: 0 },
  seatA: { n: 'AECO design seat index', f: 'idx', d: 'pts', g: 0 },
  CtaskI: { n: 'AI cost per completed task (today = 100)', f: 'ix', d: 'pct', g: -1 },
  PLAT: { n: 'Platform lock-in (driver)', f: 'idx', d: 'pts', g: 0 }
};
function fmt(k, v) {
  const m = MET[k];
  if (v == null || !isFinite(v)) return '—';
  switch (m.f) {
    case 'B': return v >= 1000 ? '$' + (v / 1000).toFixed(2) + 'T' : '$' + Math.round(v) + 'B';
    case 'T': return '$' + (v >= 10 ? v.toFixed(1) : v.toFixed(2)) + 'T';
    case 'usd': return '$' + (v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
    case 'usdh': return '$' + v.toFixed(2);
    case 'usd0': return '$' + Math.round(v).toLocaleString('en-US');
    case 'pct': return (v < 10 ? v.toFixed(1) : Math.round(v)) + '%';
    case 'cov': return Math.round(v * 100) + '%';
    case 'x': return (v < 10 ? v.toFixed(1) : Math.round(v)) + '×';
    case 'idx': return String(Math.round(v));
    case 'ix': return v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : String(Math.round(v));
    case 'mo': return v.toFixed(1) + ' mo';
    case 'cnt': return String(Math.round(v));
    case 'twh': return Math.round(v).toLocaleString('en-US') + ' TWh';
    case 'pp': { const a = Math.abs(v) < 0.05 ? 0 : v; return (a >= 0 ? '+' : '−') + Math.abs(a).toFixed(1) + ' pp'; }
  }
  return String(v);
}
function delta(k, v, v0) {
  const m = MET[k];
  let d, txt, rel;
  if (m.d === 'pct') { d = v / v0 - 1; rel = d; const p = Math.abs(d * 100); txt = (p < 10 || (p > 99 && p < 100) ? p.toFixed(1) : Math.round(p).toLocaleString('en-US')) + '%'; }
  else if (m.d === 'cov') { d = v - v0; rel = d; txt = Math.round(Math.abs(d) * 100) + ' pts'; }
  else if (m.d === 'pp') { d = v - v0; rel = d / 2; txt = Math.abs(d).toFixed(1) + ' pp'; }
  else if (m.d === 'mo') { d = v - v0; rel = d / 4; txt = Math.abs(d).toFixed(1) + ' mo'; }
  else if (m.d === 'cnt') { d = v - v0; rel = d / 10; txt = Math.round(Math.abs(d)) + ''; }
  else { d = v - v0; rel = d / 50; txt = Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0) + ' pts'; }
  const flat = Math.abs(rel) < 0.004;
  const arrow = flat ? '■' : d > 0 ? '▲' : '▼';
  const cls = flat || m.g === 0 ? 'nt' : (d > 0) === (m.g > 0) ? 'up' : 'dn';
  return { txt: arrow + ' ' + (flat ? '0' : (d > 0 ? '+' : '−') + txt), cls, d };
}

/* ---------- lanes ---------- */
const GROUPS = [
  { g: 'A', n: 'CAPITAL & MARKETS', s: 'capex · revenue · capital charge · values · hype · credit' },
  { g: 'B', n: 'MODELS & PRICING', s: 'open-weight gap · parity · token prices · markup' },
  { g: 'C', n: 'COMPUTE, ENERGY & HARDWARE', s: 'compute in use · power · rents · memory · local boxes' },
  { g: 'D', n: 'MARKET STRUCTURE', s: 'openness · agents · concentration · distress · noise' },
  { g: 'E', n: 'MACRO & WORK', s: 'US growth · potential vs realised automation' }
];
const tickB = v => (v >= 1000 ? '$' + (v / 1000) + 'T' : '$' + v + 'B');
const pctTick = v => Math.round(v * 100) + '%';
const LANES = [
  { id: 'capex', g: 'A', t: 'AI capex, revenue and the capital charge', bt: 'AI capex vs revenue', u: '$B per year · log scale', log: true, s: [{ k: 'K', n: 'Big-4 capex' }, { k: 'R', n: 'AI revenue', c: 'ink' }, { k: 'CC', n: 'Capital charge', c: 'ink3' }], tick: tickB },
  { id: 'cover', g: 'A', t: 'Can revenue pay for the build-out?', bt: 'Revenue ÷ capital charge', u: 'AI revenue ÷ yearly charge on 5 years of capex', floor0: true, s: [{ k: 'ccov', n: 'Charge covered' }, { k: 'cov', n: 'Revenue ÷ 1.4× capex', c: 'ink3' }], thr: [{ v: 1, n: 'REVENUE PAYS THE CHARGE', c: 'good' }], tick: pctTick },
  { id: 'val', g: 'A', t: 'Equity values', u: '$T · log · labs: last rounds, then modelled', log: true, s: [{ k: 'VL', n: 'OpenAI + Anthropic' }, { k: 'VN', n: 'Nvidia', c: 'ink' }], tick: v => '$' + v + 'T' },
  { id: 'hype', g: 'A', t: 'Hype & sentiment', u: 'index 0–100', ill: true, fixed: [0, 100], s: [{ k: 'S', n: 'Hype index' }] },
  { id: 'credit', g: 'A', t: 'Credit & bank stress', u: 'index 0–100 · not a probability', ill: true, fixed: [0, 100], s: [{ k: 'Cs', n: 'AI credit stress' }, { k: 'Bs', n: 'Bank stress', c: 'ink' }], thr: [{ v: 70, n: 'CREDIT-STRESS FLAG', c: 'crit' }] },
  { id: 'gap', g: 'B', t: 'Open-weight lag behind frontier', u: 'months (Epoch Capabilities Index)', floor0: true, s: [{ k: 'G', n: 'Lag' }], tick: v => v + 'mo' },
  { id: 'parity', g: 'B', t: 'Labs at frontier parity', u: 'count within ~6 months', ill: true, floor0: true, s: [{ k: 'Np', n: 'Labs' }] },
  { id: 'price', g: 'B', t: 'Token prices', u: '$ per 1M tokens · 3 in : 1 out · log', log: true, s: [{ k: 'Pf', n: 'Frontier tier' }, { k: 'Pc', n: 'Good-enough tier', c: 'ink' }], tick: v => '$' + v },
  { id: 'prem', g: 'B', t: 'Frontier price premium', u: '× good-enough tier · log', log: true, s: [{ k: 'prem', n: 'Price premium' }, { k: 'mf', n: 'Markup over resource cost', c: 'ink' }], tick: v => v + '×' },
  { id: 'compute', g: 'C', t: 'Compute in use and unmet demand', bt: 'Compute in use', u: '% · fleet = every purchased chip', fixed: [0, 100], s: [{ k: 'Ufp', n: 'Fleet in use' }, { k: 'Uopp', n: 'Powered capacity in use', c: 'ink' }, { k: 'SVp', n: 'Desired compute served', c: 'ink3' }], tick: v => v + '%' },
  { id: 'dc', g: 'C', t: 'Data-centre electricity', u: 'TWh per year, world', floor0: true, s: [{ k: 'DC', n: 'Demand' }], mark: { t: 2030, v: 950, n: 'IEA 2030' } },
  { id: 'pow', g: 'C', t: 'US commercial power price', u: 'index 2023 = 100 (EIA retail)', s: [{ k: 'Pp', n: 'Power price' }] },
  { id: 'gpu', g: 'C', t: 'H100 contract rent', u: '$ per GPU-hour · one-year contracts', floor0: true, s: [{ k: 'GR', n: 'Rent' }], tick: v => '$' + v },
  { id: 'dram', g: 'C', t: 'DRAM contract price', u: 'index 2025 Q1 = 100', floor0: true, s: [{ k: 'DR', n: 'DRAM' }] },
  { id: 'box', g: 'C', t: 'Cheapest 128 GB local AI box', bt: 'Local AI box', u: '$ · runs a ~120B open model · log', log: true, s: [{ k: 'LB', n: 'Box price' }], tick: v => '$' + (v >= 1000 ? (v / 1000) + 'k' : v) },
  { id: 'open', g: 'D', t: 'Open-weight & local share', bt: 'Open-weight & local', u: '% of tokens · % of enterprise use', fixed: [0, 100], s: [{ k: 'OS', n: 'Open-weight, all tokens' }, { k: 'ES', n: 'Open-weight, enterprise', c: 'ink' }, { k: 'LS', n: 'Local / on-prem', c: 'ink3' }], tick: v => v + '%' },
  { id: 'agents', g: 'D', t: 'Specialised agents', u: '% of enterprise AI spend', ill: true, fixed: [0, 100], s: [{ k: 'AS', n: 'Share' }], tick: v => v + '%' },
  { id: 'conc', g: 'D', t: 'Provider concentration', u: 'top-3 share of enterprise LLM API spend', fixed: [0, 100], s: [{ k: 'TC', n: 'Top-3' }], tick: v => v + '%' },
  { id: 'fail', g: 'D', t: 'Lab distress', u: 'index 0–100 · not a probability', ill: true, floor0: true, s: [{ k: 'PF', n: 'Distress' }] },
  { id: 'sn', g: 'D', t: 'Signal-to-noise', u: 'index 2023 = 100', ill: true, floor0: true, s: [{ k: 'SN', n: 'S/N' }] },
  { id: 'gdp', g: 'E', t: 'AI contribution to US GDP growth', bt: 'AI → US GDP growth', u: 'percentage points', zero: true, s: [{ k: 'GDP', n: 'Contribution' }], tick: v => (v > 0 ? '+' : '') + v },
  { id: 'auto', g: 'E', t: 'Knowledge work done by AI', u: '% of knowledge-work value · illustrative', floor0: true, s: [{ k: 'AU', n: 'Realised' }, { k: 'AUd', n: 'Wanted after price response', c: 'ink' }, { k: 'AUp', n: 'Potential (adoption curve)', c: 'ink3' }], tick: v => v + '%' }
];
const BC_LANES = ['capex', 'val', 'price', 'credit', 'compute', 'gdp'];
/* sector lens: AECO, AECO software, software & development (illustrative mappings of model outputs) */
const LENS = [
  { id: 'aeco', n: 'AECO firms', d: 'Architecture, engineering, construction and the operation of buildings and assets', groups: ['AECO'],
    lanes: [
      { id: 'L-bld', t: 'US data-centre construction', u: '$B a year · Census basis (10.8% of Big-4 capex)', floor0: true, s: [{ k: 'BLD', n: 'Put in place' }], tick: tickB },
      { id: 'L-pp', t: 'US commercial power price', u: 'index 2023 = 100', s: [{ k: 'Pp', n: 'Power price' }] },
      { id: 'L-aua', t: 'Design & engineering work done by AI', u: '% · illustrative mapping', ill: true, floor0: true, s: [{ k: 'AUa', n: 'AECO' }, { k: 'AU', n: 'All knowledge work', c: 'ink3' }], tick: v => v + '%' },
      { id: 'L-task', t: 'AI cost per completed task', u: 'index, today = 100 · log', log: true, s: [{ k: 'CtaskI', n: 'Cost per task' }] }
    ] },
  { id: 'aecosw', n: 'AECO software', d: 'BIM, CAD, construction-management and AI tools sold to AECO firms', groups: ['AECO software'],
    lanes: [
      { id: 'L-seat', t: 'Human design seats', u: 'index, today = 100 · if seats track un-automated work', ill: true, s: [{ k: 'seatA', n: 'AECO design seats' }, { k: 'seatG', n: 'All knowledge work', c: 'ink3' }] },
      { id: 'L-as', t: 'Specialised agents', u: '% of enterprise AI spend', ill: true, fixed: [0, 100], s: [{ k: 'AS', n: 'Share' }], tick: v => v + '%' },
      { id: 'L-plat', t: 'Platform lock-in', u: 'driver 0–100 · a scenario input', fixed: [0, 100], s: [{ k: 'PLAT', n: 'Lock-in' }] },
      { id: 'L-es', t: 'Open weights in the enterprise', u: '% of enterprise LLM use · top-3 share', fixed: [0, 100], s: [{ k: 'ES', n: 'Open-weight use' }, { k: 'TC', n: 'Top-3 providers', c: 'ink3' }], tick: v => v + '%' }
    ] },
  { id: 'sw', n: 'Software & development', d: 'Software vendors in general, and the people and teams who build software', pick: ['Seat-based SaaS', 'Usage- and outcome-priced software', 'Developer tools & coding agents', 'Software developers (jobs)', 'AI wrappers & vibe-coded apps', 'Specialised-agent builders', 'IT services & outsourcing'],
    lanes: [
      { id: 'L-dev', t: 'Software-development work done by AI', u: '% · illustrative mapping', ill: true, fixed: [0, 100], s: [{ k: 'AUdev', n: 'Development' }, { k: 'AU', n: 'All knowledge work', c: 'ink3' }], tick: v => v + '%' },
      { id: 'L-seatg', t: 'Knowledge-work seats', u: 'index, today = 100 · if seats track un-automated work', ill: true, s: [{ k: 'seatG', n: 'Seats' }] },
      { id: 'L-pc', t: 'Good-enough token price', u: '$ per 1M tokens · log', log: true, s: [{ k: 'Pc', n: 'Price' }], tick: v => '$' + v },
      { id: 'L-sn', t: 'Signal-to-noise', u: 'index 2023 = 100 · app and content flood', ill: true, floor0: true, s: [{ k: 'SN', n: 'S/N' }] }
    ] }
];
const LENS_LANES = [];
LENS.forEach(S => S.lanes.forEach(L => { L.sec = S.id; LENS_LANES.push(L); }));
let DOM = {};
function computeDomains() {
  const runs = PRE.map(s => RUN[s.key]).concat(custRun ? [custRun] : []);
  LANES.concat(LENS_LANES).forEach(L => {
    let lo = Infinity, hi = -Infinity;
    for (const r of runs) for (const s of L.s) for (let i = 0; i < NQ; i++) {
      const v = r[s.k][i];
      if (!isFinite(v) || (L.log && v <= 0)) continue;
      if (v < lo) lo = v; if (v > hi) hi = v;
    }
    if (L.fixed) { L.dom = { lo: L.fixed[0], hi: L.fixed[1] }; return; }
    if (L.log) { const a = Math.log10(lo), b = Math.log10(hi), p = (b - a) * 0.06; L.dom = { log: true, lo: Math.pow(10, a - p), hi: Math.pow(10, b + p) }; return; }
    if (L.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (L.mark) { lo = Math.min(lo, L.mark.v); hi = Math.max(hi, L.mark.v); }
    const p = (hi - lo) * 0.08;
    L.dom = { lo: L.floor0 ? Math.max(0, lo - p) : lo - p, hi: hi + p };
  });
}
function niceTicks(lo, hi, n) {
  const span = hi - lo, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function logTicks(lo, hi) {
  const out = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) [1, 3].forEach(m => { const v = m * Math.pow(10, e); if (v >= lo && v <= hi) out.push(+v.toPrecision(3)); });
  return out.length > 4 ? out.filter((v, i) => String(v)[0] === '1' || out.length < 6) : out;
}

/* ---------- canvases ---------- */
const CANVASES = new Set();
const ro = new ResizeObserver(entries => {
  for (const e of entries) {
    const cv = e.target, cr = e.contentRect, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv._w = cr.width; cv._h = cr.height; cv._dpr = dpr;
    const W = Math.max(1, Math.round(cr.width * dpr)), H = Math.max(1, Math.round(cr.height * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  dirty();
});
function watch(cv) { CANVASES.add(cv); ro.observe(cv); return cv; }
function ctxOf(cv) { const c = cv.getContext('2d'); const d = cv._dpr || 1; c.setTransform(d, 0, 0, d, 0, 0); return c; }

/* ---------- lane drawing (shared by page and broadcast) ---------- */
function xOfI(i, x0, x1) { return x0 + (i / (NQ - 1)) * (x1 - x0); }
function yMap(L, y0, y1) {
  const d = L.dom;
  if (d.log) { const a = Math.log10(d.lo), b = Math.log10(d.hi); return v => y1 - (Math.log10(Math.max(v, d.lo * 0.5)) - a) / (b - a) * (y1 - y0); }
  return v => y1 - (v - d.lo) / (d.hi - d.lo) * (y1 - y0);
}
function pathSeries(ctx, get, i0, i1, X, Y, fEnd) {
  ctx.beginPath();
  let started = false;
  for (let i = i0; i <= i1; i++) {
    const v = get(i); if (!isFinite(v)) continue;
    const x = X(i), y = Y(v);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  if (fEnd != null && fEnd > i1 && i1 + 1 < NQ) { const u = fEnd - i1; const a = get(i1), b = get(i1 + 1); ctx.lineTo(X(i1 + u), Y(a + (b - a) * u)); }
  return started;
}
function drawLane(ctx, x, y, w, h, L, o) {
  const big = (o.big || 1) * chartScale(ctx);
  const axisW = (ctx.canvas.id === 'bcv' ? 44 : 64) * big, top = 7 * big, bot = 6 * big;
  const x0 = x, x1 = x + w - axisW, y0 = y + top, y1 = y + h - bot;
  const X = i => xOfI(i, x0, x1), Y = yMap(L, y0, y1);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = o.bg || TH.panel; ctx.fillRect(x, y, w, h);
  // forecast shading
  ctx.fillStyle = FUT_SHADE(); ctx.fillRect(X(NOW), y, x1 - X(NOW), h);
  // grid + ticks
  const d = L.dom;
  const ticks = d.log ? logTicks(d.lo, d.hi) : niceTicks(d.lo, d.hi, h > 70 * big ? 3 : 2);
  font(ctx, 8.5 * big, 500);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ticks.forEach(v => {
    const yy = Math.round(Y(v)) + 0.5;
    if (yy < y0 - 1 || yy > y1 + 1) return;
    ctx.strokeStyle = TH.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.fillStyle = TH.ink3; ctx.fillText(L.tick ? L.tick(v) : String(v), x1 + 5 * big, yy);
  });
  if (L.zero) { const yy = Math.round(Y(0)) + 0.5; ctx.strokeStyle = TH.rule2; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
  // thresholds
  (L.thr || []).forEach(t => {
    const yy = Math.round(Y(t.v)) + 0.5; ctx.strokeStyle = rgba(TONE[t.c], 0.55); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    font(ctx, 7.5 * big, 600); ctx.fillStyle = rgba(TONE[t.c], 0.9); ctx.textBaseline = 'bottom'; ctx.fillText(t.n, x0 + 4, yy - 2); ctx.textBaseline = 'middle';
  });
  // NOW line
  const xn = Math.round(X(NOW)) + 0.5;
  ctx.strokeStyle = rgba(TH.amber, 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn, y); ctx.lineTo(xn, y + h); ctx.stroke();
  const primary = L.s[0];
  const keys = allKeys();
  const active = state.key;
  const revealing = o.reveal;
  const fCur = o.f;
  const iCur = Math.floor(fCur);
  // envelope across presets
  ctx.beginPath();
  for (let i = NOW; i < NQ; i++) { let hi = -Infinity; for (const k of keys) { const v = runFor(k)[primary.k][i]; if (v > hi) hi = v; } const xx = X(i), yy = Y(hi); i === NOW ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy); }
  for (let i = NQ - 1; i >= NOW; i--) { let lo = Infinity; for (const k of keys) { const v = runFor(k)[primary.k][i]; if (v < lo) lo = v; } ctx.lineTo(X(i), Y(lo)); }
  ctx.closePath(); ctx.fillStyle = rgba(TH.ink, 0.05); ctx.fill();
  // ghosts
  const gEnd = revealing ? Math.min(NQ - 1, iCur) : NQ - 1;
  for (const k of keys) {
    if (k === active) continue;
    const r = runFor(k);
    ctx.strokeStyle = rgba(colorFor(k), k === 'CUST' || (active === 'CUST' && k === state.custom.base) ? 0.75 : 0.42);
    ctx.lineWidth = 1 * big; ctx.setLineDash(k === 'CUST' ? [5 * big, 3 * big] : []);
    if (pathSeries(ctx, i => r[primary.k][i], NOW, gEnd, X, Y, revealing ? fCur : null)) ctx.stroke();
    ctx.setLineDash([]);
  }
  // secondary series (active run)
  const aCol = colorFor(active);
  for (let s = L.s.length - 1; s >= 1; s--) {
    const S = L.s[s];
    const col = S.c === 'ink3' ? TH.ink3 : TH.ink2;
    ctx.lineWidth = (S.c === 'ink3' ? 1 : 1.3) * big;
    ctx.strokeStyle = col;
    if (pathSeries(ctx, i => mval(S.k, i), 0, revealing ? Math.min(NQ - 1, iCur) : NQ - 1, X, Y, revealing ? fCur : null)) ctx.stroke();
  }
  // history (real data) in ink
  const hk = E.HIST[primary.k];
  ctx.strokeStyle = TH.ink; ctx.lineWidth = 1.6 * big; ctx.setLineDash(hk && hk.kind === 'idx' ? [3 * big, 3 * big] : []);
  if (pathSeries(ctx, i => mval(primary.k, i), 0, Math.min(NOW, revealing ? iCur : NOW), X, Y, revealing && fCur < NOW ? fCur : null)) ctx.stroke();
  ctx.setLineDash([]);
  // active future: area + line
  if (fCur > NOW || !revealing) {
    const endI = revealing ? Math.min(NQ - 1, iCur) : NQ - 1;
    const fEnd = revealing ? fCur : null;
    // area
    const base = d.log ? y1 : Y(Math.max(d.lo, Math.min(d.hi, L.zero ? 0 : d.lo)));
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, rgba(aCol, 0.22)); grad.addColorStop(1, rgba(aCol, 0.0));
    const areaEnd = Math.min(endI, revealing ? endI : iCur);
    if (areaEnd >= NOW) {
      if (pathSeries(ctx, i => mval(primary.k, i), NOW, areaEnd, X, Y, fCur > areaEnd ? fCur : null)) {
        const xe = fCur > areaEnd && areaEnd + 1 < NQ ? X(fCur) : X(areaEnd);
        ctx.lineTo(xe, base); ctx.lineTo(X(NOW), base); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      }
    }
    // line up to cursor (bright) and beyond (dim)
    ctx.lineWidth = 2.1 * big; ctx.strokeStyle = aCol; ctx.lineJoin = 'round'; ctx.setLineDash(active === 'CUST' ? [6 * big, 3 * big] : []);
    const solidEnd = Math.max(NOW, Math.min(NQ - 1, iCur));
    if (pathSeries(ctx, i => mval(primary.k, i), NOW, solidEnd, X, Y, fCur)) ctx.stroke();
    if (!revealing && solidEnd < NQ - 1) {
      ctx.strokeStyle = rgba(aCol, 0.38); ctx.lineWidth = 1.6 * big;
      ctx.beginPath();
      const a = mval(primary.k, solidEnd), b = mval(primary.k, solidEnd + 1), u = Math.max(0, fCur - solidEnd);
      ctx.moveTo(X(solidEnd + u), Y(a + (b - a) * u));
      for (let i = solidEnd + 1; i < NQ; i++) ctx.lineTo(X(i), Y(mval(primary.k, i)));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // IEA-style mark
  if (L.mark) {
    const mx = X(E.idxOf(L.mark.t)), my = Y(L.mark.v);
    ctx.fillStyle = TH.amber; ctx.beginPath(); ctx.moveTo(mx, my - 4 * big); ctx.lineTo(mx + 4 * big, my); ctx.lineTo(mx, my + 4 * big); ctx.lineTo(mx - 4 * big, my); ctx.closePath(); ctx.fill();
    font(ctx, 7.5 * big, 600); ctx.fillStyle = TH.amber; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(L.mark.n, mx - 6 * big, my - 3 * big); ctx.textAlign = 'left';
  }
  // hover
  if (o.hover != null) { const hx = Math.round(X(o.hover)) + 0.5; ctx.strokeStyle = rgba(TH.ink, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, y); ctx.lineTo(hx, y + h); ctx.stroke(); }
  // cursor + head
  const cx = X(fCur);
  ctx.strokeStyle = rgba(TH.ink, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(cx) + 0.5, y); ctx.lineTo(Math.round(cx) + 0.5, y + h); ctx.stroke();
  const hv = at(primary.k, fCur);
  if (isFinite(hv)) {
    const hy = Y(hv);
    if (fCur > NOW) { ctx.fillStyle = rgba(aCol, 0.25); ctx.beginPath(); ctx.arc(cx, hy, 7 * big, 0, 7); ctx.fill(); }
    ctx.fillStyle = fCur > NOW ? aCol : TH.ink; ctx.strokeStyle = TH.panel; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, hy, 3.3 * big, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- scrubber ---------- */
function regimeOf(i) { const r = view.to.regime[i]; return E.REGIMES[r] || E.REGIMES.STEADY; }
function drawScrub(ctx, x, y, w, h, o) {
  const big = (o.big || 1) * chartScale(ctx), axisW = (ctx.canvas.id === 'bcv' ? 44 : 64) * big;
  const x0 = x, x1 = x + w - axisW;
  const X = i => xOfI(i, x0, x1);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = o.bg || TH.panel; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = FUT_SHADE(); ctx.fillRect(X(NOW), y, x1 - X(NOW), h);
  // regime band
  const bandY = y + h - 9 * big, bandH = 5 * big;
  for (let i = 0; i < NQ - 1; i++) { ctx.fillStyle = rgba(TONE[regimeOf(i).tone] || TH.muted, i <= NOW ? 0.35 : 0.8); ctx.fillRect(X(i), bandY, X(i + 1) - X(i) + 0.6, bandH); }
  // years
  font(ctx, 9 * big, 600);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const ySp = X(E.idxOf(2024)) - X(E.idxOf(2023));
  const shortY = ySp < 36 * big, everyOther = ySp < 22 * big;
  for (let yr = 2023; yr <= 2035; yr++) {
    const xx = Math.round(X(E.idxOf(yr))) + 0.5;
    ctx.strokeStyle = TH.rule2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xx, y + 18 * big); ctx.lineTo(xx, bandY - 2); ctx.stroke();
    if (everyOther && yr % 2 === 0) continue;
    const lbl = shortY ? "'" + String(yr).slice(2) : String(yr);
    const tw = ctx.measureText(lbl).width;
    ctx.fillStyle = TH.ink3; ctx.fillText(lbl, Math.min(x + w - tw - 3 * big, xx + 3 * big), y + 5 * big);
  }
  // events
  const ev = o.events || [];
  ev.forEach(e => {
    const xx = X(e.i), col = e.kind === 'hist' ? TH.amber : e.kind === 'auto' ? TH.ink : e.kind === 'shock' ? TH.crit : colorFor(state.key);
    const past = e.i <= o.f + 1e-6;
    ctx.fillStyle = rgba(col.startsWith('#') ? col : TH.ink, past ? 0.95 : 0.4);
    const ty = y + 22 * big;
    ctx.beginPath(); ctx.moveTo(xx, ty + 7 * big); ctx.lineTo(xx - 3.2 * big, ty); ctx.lineTo(xx + 3.2 * big, ty); ctx.closePath(); ctx.fill();
  });
  // NOW
  const xn = Math.round(X(NOW)) + 0.5;
  ctx.strokeStyle = TH.amber; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xn, y + 16 * big); ctx.lineTo(xn, y + h); ctx.stroke();
  font(ctx, 8 * big, 700); ctx.fillStyle = TH.amber; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('NOW', xn + 4 * big, y + 32 * big);
  // cursor
  const cx = X(o.f);
  ctx.fillStyle = rgba(TH.ink, 0.1); ctx.fillRect(Math.min(X(NOW), cx), y + 16 * big, Math.abs(cx - X(NOW)), 2 * big);
  ctx.strokeStyle = TH.ink; ctx.lineWidth = 1.5 * big; ctx.beginPath(); ctx.moveTo(cx, y + 14 * big); ctx.lineTo(cx, y + h); ctx.stroke();
  ctx.fillStyle = colorFor(state.key);
  ctx.beginPath(); ctx.arc(cx, y + 15 * big, 5 * big, 0, 7); ctx.fill();
  ctx.strokeStyle = TH.bg; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

/* ---------- causal network ---------- */
const NODES = [
  { id: 'capital', l: 'CAPITAL', d: 'capital', x: 0, y: .08 }, { id: 'rates', l: 'RATES', d: 'rates', x: 0, y: .25 },
  { id: 'conv', l: 'CATCH-UP', d: 'conv', x: 0, y: .42 }, { id: 'eff', l: 'EFFICIENCY', d: 'efficiency', x: 0, y: .59 },
  { id: 'geo', l: 'GEOPOL', d: 'geo', x: 0, y: .76 }, { id: 'trust', l: 'TRUST HIT', d: 'trust', x: 0, y: .93 },
  { id: 'hype', l: 'HYPE', k: 'S', sc: 30, x: .25, y: .1 }, { id: 'capex', l: 'CAPEX', k: 'K', x: .25, y: .33 },
  { id: 'dram', l: 'DRAM', k: 'DR', x: .25, y: .56 }, { id: 'power', l: 'POWER', k: 'DC', x: .25, y: .79 },
  { id: 'gap', l: 'OPEN GAP', k: 'G', x: .5, y: .1 }, { id: 'price', l: 'TOKEN $', k: 'Pavg', sc: 3, x: .5, y: .33 },
  { id: 'gpu', l: 'GPU RENT', k: 'GR', x: .5, y: .56 }, { id: 'epx', l: 'ENERGY $', k: 'Pp', x: .5, y: .79 },
  { id: 'val', l: 'VALUATION', k: 'VL', x: .75, y: .1 }, { id: 'rev', l: 'REVENUE', k: 'R', x: .75, y: .3 },
  { id: 'work', l: 'AI WORK', k: 'AU', x: .75, y: .5 }, { id: 'local', l: 'LOCAL AI', k: 'LS', sc: 20, lin: 1, x: .75, y: .7 },
  { id: 'agents', l: 'AGENTS', k: 'AS', sc: 25, lin: 1, x: .75, y: .9 },
  { id: 'credit', l: 'CREDIT', k: 'Cs', sc: 30, lin: 1, x: 1, y: .14 }, { id: 'banks', l: 'BANKS', k: 'Bs', sc: 30, lin: 1, x: 1, y: .36 },
  { id: 'fail', l: 'LAB RISK', k: 'PF', sc: 20, lin: 1, x: 1, y: .58 }, { id: 'gdp', l: 'US GDP', k: 'GDP', sc: 1.5, lin: 1, x: 1, y: .8 }
];
const EDGES = [
  ['capital', 'capex', 1], ['rates', 'credit', 1], ['rates', 'val', -1], ['hype', 'capex', 1], ['hype', 'val', 1], ['val', 'hype', 1],
  ['capex', 'dram', 1], ['capex', 'power', 1], ['capex', 'gpu', -1], ['capex', 'credit', 1], ['capex', 'gdp', 1], ['power', 'epx', 1],
  ['epx', 'price', 1], ['gpu', 'price', 1], ['dram', 'local', -1], ['conv', 'gap', -1], ['gap', 'price', 1], ['eff', 'price', -1],
  ['eff', 'local', 1], ['price', 'work', -1], ['price', 'rev', 1], ['work', 'rev', 1], ['rev', 'val', 1], ['rev', 'credit', -1],
  ['val', 'gdp', 1], ['credit', 'banks', 1], ['credit', 'fail', 1], ['credit', 'capex', -1], ['geo', 'dram', 1], ['geo', 'local', 1],
  ['trust', 'hype', -1], ['trust', 'local', 1], ['local', 'rev', -1], ['agents', 'rev', 1], ['epx', 'agents', 1], ['work', 'gdp', 1], ['gap', 'fail', -1]
].map((e, j) => ({ a: e[0], b: e[1], s: e[2], ph: [Math.random(), Math.random(), Math.random()], bend: (j % 2 ? 1 : -1) * 0.13 }));
const NODE = {}; NODES.forEach(n => { NODE[n.id] = n; });
function nodeVal(n, f) {
  if (n.d) return lerpAt(i => view.to.drivers[n.d][i], f);
  return at(n.k, f);
}
function nodeZ(n, f) {
  const v = nodeVal(n, f);
  if (n.d) return (v - E.BASE[n.d]) / 0.3;
  const v0 = view.to[n.k][NOW];
  if (n.lin) return (v - v0) / (n.sc || 20);
  return Math.log(Math.max(1e-9, v) / Math.max(1e-9, v0)) / (n.sc || 1.2);
}
function nodeRate(n, f) { const a = nodeZ(n, Math.max(0, f - 1)), b = nodeZ(n, f); return b - a; }
let netHover = null, netSelected = null;
function drawNet(ctx, x, y, w, h, o) {
  const big = (o.big || 1) * chartScale(ctx), f = o.f, time = o.time / 1000;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = o.bg || TH.panel; ctx.fillRect(x, y, w, h);
  const padX = (ctx.canvas.id === 'bcv' ? 40 : 68) * big;
  const selected = netHover || netSelected;
  const linked = e => !selected || e.a === selected || e.b === selected;
  const activeNodes = new Set(selected ? [selected, ...EDGES.filter(linked).flatMap(e => [e.a, e.b])] : NODES.map(n => n.id));
  ctx.canvas.dataset.highlightedNode = selected || '';
  const P = n => [x + padX + n.x * (w - 2 * padX), y + 10 * big + n.y * (h - 20 * big)];
  const geo = EDGES.map(e => {
    const [ax, ay] = P(NODE[e.a]), [bx, by] = P(NODE[e.b]);
    const dx = bx - ax, dy = by - ay, back = bx < ax - 2;
    const k = back ? 0.45 : e.bend;
    return { e, ax, ay, bx, by, cx: (ax + bx) / 2 - dy * k, cy: (ay + by) / 2 + dx * k };
  });
  // edges
  geo.forEach(g => {
    ctx.strokeStyle = rgba(g.e.s > 0 ? TH.amber : TH.info, selected ? (linked(g.e) ? 0.85 : 0.04) : 0.2);
    ctx.lineWidth = (selected && linked(g.e) ? 2 : 1) * big; ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.quadraticCurveTo(g.cx, g.cy, g.bx, g.by); ctx.stroke();
  });
  // particles
  geo.forEach(g => {
    if (!linked(g.e)) return;
    const src = NODE[g.e.a];
    const r = nodeRate(src, f);
    const mag = clamp(Math.abs(r) * 6, 0, 1);
    const push = g.e.s * Math.sign(r || 0);
    const col = push >= 0 ? TH.amber : TH.info;
    const speed = REDUCED ? 0 : 0.06 + 0.55 * mag;
    for (let p = 0; p < 3; p++) {
      const u = ((g.e.ph[p] + time * speed) % 1 + 1) % 1;
      const qx = (1 - u) * (1 - u) * g.ax + 2 * (1 - u) * u * g.cx + u * u * g.bx;
      const qy = (1 - u) * (1 - u) * g.ay + 2 * (1 - u) * u * g.cy + u * u * g.by;
      ctx.fillStyle = rgba(col, 0.18 + 0.75 * mag);
      ctx.beginPath(); ctx.arc(qx, qy, (1.2 + 1.6 * mag) * big, 0, 7); ctx.fill();
    }
  });
  // nodes
  font(ctx, 8.6 * big, 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  NODES.forEach(n => {
    const [px, py] = P(n);
    ctx.globalAlpha = activeNodes.has(n.id) ? 1 : 0.25;
    const z = clamp(nodeZ(n, f), -2.5, 2.5);
    const arrow = Math.abs(z) < 0.06 ? '' : z > 0 ? ' ▲' : ' ▼';
    const label = n.l + arrow;
    const tw = ctx.measureText(label).width + 10 * big, th = (ctx.canvas.id === 'bcv' ? 16 : 22) * big;
    const tint = z >= 0 ? TH.amber : TH.info;
    ctx.fillStyle = TH.panel3; ctx.fillRect(px - tw / 2, py - th / 2, tw, th);
    ctx.fillStyle = rgba(tint, clamp(Math.abs(z) * 0.35, 0, 0.6)); ctx.fillRect(px - tw / 2, py - th / 2, tw, th);
    ctx.strokeStyle = n.d ? TH.rule2 : rgba(tint, 0.35 + clamp(Math.abs(z) * 0.3, 0, 0.6)); ctx.lineWidth = 1;
    if (selected === n.id) { ctx.strokeStyle = TH.ink; ctx.lineWidth = 1.5; }
    ctx.strokeRect(px - tw / 2 + 0.5, py - th / 2 + 0.5, tw - 1, th - 1);
    ctx.fillStyle = n.d ? TH.ink2 : TH.ink;
    ctx.fillText(label, px, py + 0.5);
    n._box = [px - tw / 2, py - th / 2, tw, th];
  });
  ctx.restore();
}

/* ---------- phase portrait ---------- */
function drawPhase(ctx, x, y, w, h, o) {
  const big = (o.big || 1) * chartScale(ctx), f = o.f;
  const padL = (ctx.canvas.id === 'bcv' ? 34 : 54) * big, padB = 24 * big, padT = 8 * big, padR = 10 * big;
  const x0 = x + padL, x1 = x + w - padR, y0 = y + padT, y1 = y + h - padB;
  const lx = v => x0 + (Math.log10(clamp(v, 4, 300)) - Math.log10(4)) / (Math.log10(300) - Math.log10(4)) * (x1 - x0);
  const ly = v => y1 - (Math.log10(clamp(v, 1.5, 40)) - Math.log10(1.5)) / (Math.log10(40) - Math.log10(1.5)) * (y1 - y0);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = o.bg || TH.panel; ctx.fillRect(x, y, w, h);
  const qx = lx(25), qy = ly(8);
  ctx.fillStyle = 'rgba(255,77,77,0.07)'; ctx.fillRect(x0, y0, qx - x0, qy - y0);
  ctx.fillStyle = 'rgba(255,162,31,0.04)'; ctx.fillRect(qx, y0, x1 - qx, qy - y0);
  ctx.strokeStyle = TH.rule2; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(Math.round(qx) + .5, y0); ctx.lineTo(Math.round(qx) + .5, y1); ctx.moveTo(x0, Math.round(qy) + .5); ctx.lineTo(x1, Math.round(qy) + .5); ctx.stroke();
  ctx.strokeStyle = TH.rule; ctx.strokeRect(x0 + .5, y0 + .5, x1 - x0 - 1, y1 - y0 - 1);
  font(ctx, 8.2 * big, 700);
  ctx.textBaseline = 'top';
  ctx.fillStyle = rgba(TH.crit, 0.85); ctx.textAlign = 'left'; ctx.fillText('BUBBLE ZONE', x0 + 6 * big, y0 + 5 * big);
  ctx.fillStyle = TH.ink3; ctx.textAlign = 'right'; ctx.fillText('MOAT PREMIUM', x1 - 6 * big, y0 + 5 * big);
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'left'; ctx.fillText('UTILITY', x0 + 6 * big, y1 - 4 * big);
  ctx.textAlign = 'right'; ctx.fillText('UNDERPRICED MOAT', x1 - 6 * big, y1 - 4 * big);
  // axes labels/ticks
  font(ctx, 7.8 * big, 500); ctx.fillStyle = TH.ink3;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [5, 10, 25, 50, 100, 200].forEach(v => ctx.fillText(v + '×', lx(v), y1 + 3 * big));
  ctx.fillText('FRONTIER PRICE PREMIUM →', (x0 + x1) / 2, y1 + 13 * big);
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  [2, 5, 10, 20, 40].forEach(v => ctx.fillText(v + '×', x0 - 4 * big, ly(v)));
  ctx.save(); ctx.translate(x + 9 * big, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('LAB EQUITY VALUE / REVENUE →', 0, 0); ctx.restore();
  // ghosts
  const keys = allKeys();
  const gEnd = o.reveal ? Math.floor(f) : NQ - 1;
  keys.forEach(k => {
    if (k === state.key) return;
    const r = runFor(k);
    ctx.strokeStyle = rgba(colorFor(k), 0.38); ctx.lineWidth = 1 * big; ctx.beginPath();
    for (let i = NOW; i <= gEnd; i++) { const px = lx(r.prem[i]), py = ly(r.Mult[i]); i === NOW ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  });
  // history
  ctx.strokeStyle = TH.ink2; ctx.lineWidth = 1.4 * big; ctx.beginPath();
  const hEnd = Math.min(NOW, Math.floor(f));
  for (let i = 0; i <= hEnd; i++) { const px = lx(mval('prem', i)), py = ly(mval('Mult', i)); i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  ctx.stroke();
  // active
  const col = colorFor(state.key);
  const iEnd = o.reveal ? Math.floor(f) : NQ - 1;
  if (iEnd > NOW) {
    ctx.lineWidth = 2 * big; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? NOW : Math.max(NOW, Math.floor(f));
      const to = pass === 0 ? Math.min(iEnd, Math.floor(f)) : iEnd;
      if (to <= from) continue;
      ctx.strokeStyle = pass === 0 ? col : rgba(col, 0.32);
      ctx.beginPath();
      for (let i = from; i <= to; i++) { const px = lx(mval('prem', i)), py = ly(mval('Mult', i)); i === from ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
      ctx.stroke();
    }
  }
  // year dots
  font(ctx, 7.5 * big, 600);
  const placed = [[lx(at('prem', f)), ly(at('Mult', f)), 26 * big]];
  for (let yr = 2023; yr <= 2035; yr++) {
    const i = E.idxOf(yr); if (i > (o.reveal ? f : NQ - 1)) break;
    const px = lx(mval('prem', i)), py = ly(mval('Mult', i));
    ctx.fillStyle = i <= NOW ? TH.ink2 : col; ctx.beginPath(); ctx.arc(px, py, 2.2 * big, 0, 7); ctx.fill();
    if (yr % 2 === 1 || yr === 2026) {
      const clash = placed.some(([qx, qy, r]) => Math.hypot(px - qx, py - qy) < r);
      if (!clash) { ctx.fillStyle = TH.ink3; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText("'" + String(yr).slice(2), px + 3 * big, py - 2 * big); placed.push([px, py, 15 * big]); }
    }
  }
  // head
  const hx = lx(at('prem', f)), hy = ly(at('Mult', f));
  ctx.fillStyle = rgba(f > NOW ? col : TH.ink, 0.25); ctx.beginPath(); ctx.arc(hx, hy, 9 * big, 0, 7); ctx.fill();
  ctx.fillStyle = f > NOW ? col : TH.ink; ctx.beginPath(); ctx.arc(hx, hy, 4 * big, 0, 7); ctx.fill();
  ctx.strokeStyle = TH.bg; ctx.lineWidth = 1.5; ctx.stroke();
  font(ctx, 9 * big, 700); ctx.fillStyle = TH.ink; ctx.textAlign = hx > x1 - 70 * big ? 'right' : 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(E.qLabel(ci()), hx + (ctx.textAlign === 'left' ? 11 : -11) * big, hy);
  ctx.restore();
}

/* ---------- value pools ---------- */
const POOL_SHORT = ['Chips', 'Power/DC', 'Cloud', 'Models', 'Agents', 'Services'];
function poolShares(i) { const p = view.to.pools; let s = 0; for (let l = 0; l < 6; l++) s += p[l][i]; return p.map(a => (s > 0 ? a[i] / s : 0)); }
function drawPools(ctx, x, y, w, h, o) {
  const big = (o.big || 1) * chartScale(ctx), f = o.f;
  const wide = w > 300 * big, labW = (wide ? 104 : 46) * big, x0 = x, x1 = x + w - labW, y0 = y + 4 * big, y1 = y + h - 16 * big;
  const X = i => xOfI(i, x0, x1);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = o.bg || TH.panel; ctx.fillRect(x, y, w, h);
  const shares = []; for (let i = 0; i < NQ; i++) shares.push(poolShares(i));
  for (let l = 0; l < 6; l++) {
    ctx.beginPath();
    for (let i = 0; i < NQ; i++) { let c = 0; for (let m = 0; m <= l; m++) c += shares[i][m]; const yy = y1 - c * (y1 - y0); i === 0 ? ctx.moveTo(X(i), yy) : ctx.lineTo(X(i), yy); }
    for (let i = NQ - 1; i >= 0; i--) { let c = 0; for (let m = 0; m < l; m++) c += shares[i][m]; ctx.lineTo(X(i), y1 - c * (y1 - y0)); }
    ctx.closePath(); ctx.fillStyle = RAMP[l]; ctx.fill();
    ctx.strokeStyle = o.bg || TH.panel; ctx.lineWidth = 1; ctx.stroke();
  }
  // shade future beyond cursor
  const cx = X(f);
  ctx.fillStyle = POOL_DIM(); ctx.fillRect(cx, y0, x1 - cx, y1 - y0);
  ctx.strokeStyle = TH.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(cx) + .5, y0); ctx.lineTo(Math.round(cx) + .5, y1); ctx.stroke();
  const xn = Math.round(X(NOW)) + .5; ctx.strokeStyle = rgba(TH.amber, .7); ctx.beginPath(); ctx.moveTo(xn, y0); ctx.lineTo(xn, y1); ctx.stroke();
  // years
  font(ctx, 7.8 * big, 500); ctx.fillStyle = TH.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  [2023, 2026, 2029, 2032, 2035].forEach(yr => ctx.fillText(String(yr), Math.min(x1 - 10 * big, Math.max(x0 + 12 * big, X(E.idxOf(yr)))), y1 + 4 * big));
  // labels at cursor
  const sh = poolShares(ci());
  let c = 0;
  font(ctx, 8.4 * big, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let l = 0; l < 6; l++) {
    const mid = y1 - (c + sh[l] / 2) * (y1 - y0); c += sh[l];
    if (sh[l] < 0.045) continue;
    ctx.fillStyle = THEME === 'light' ? TH.ink2 : (l >= 4 ? TH.ink : RAMP[Math.min(5, l + 2)]);
    ctx.fillText((wide ? POOL_SHORT[l] + ' ' : '') + Math.round(sh[l] * 100) + '%', x1 + 6 * big, mid);
  }
  ctx.restore();
}

/* ---------- heatmap ---------- */
const HEAT = { rows: [], col0: NOW, colW: 0, x0: 0, y0: 0, rowH: 17 };
function heatLayout(w) {
  const scale = chartScale($('#heat').getContext('2d'));
  HEAT.rowH = (HEAT_ROW[(LAYOUT.size || {}).heat || 'm'] || HEAT_ROW.m) * scale;
  const rows = []; let g = null;
  E.IMPACT_ROWS.forEach((r, idx) => { if (r.g !== g) { rows.push({ head: r.g }); g = r.g; } rows.push({ r, idx }); });
  HEAT.rows = rows;
  const labW = Math.min(250 * scale, Math.max(180 * scale, w * 0.3));
  HEAT.x0 = labW; HEAT.colW = (w - labW - 4) / (NQ - NOW); HEAT.y0 = 22 * scale;
  let h = HEAT.y0; rows.forEach(r => { r.y = h; h += r.head ? 18 * scale : HEAT.rowH; }); HEAT.h = h + 4;
  return HEAT.h;
}
function impactsOf(run) { if (!run._imp) run._imp = E.impacts(run); return run._imp; }
function drawHeat(ctx, w, h) {
  const run = view.to, imp = impactsOf(run), scale = chartScale(ctx);
  ctx.fillStyle = TH.panel; ctx.fillRect(0, 0, w, h);
  const X = i => HEAT.x0 + (i - NOW) * HEAT.colW;
  font(ctx, 8.5 * scale, 600); ctx.fillStyle = TH.ink3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let yr = 2027; yr <= 2035; yr++) ctx.fillText(String(yr), X(E.idxOf(yr)) + HEAT.colW * 2, 11 * scale);
  HEAT.rows.forEach(row => {
    if (row.head) {
      font(ctx, 8.5 * scale, 700); ctx.fillStyle = TH.amber; ctx.textAlign = 'left'; ctx.fillText(row.head.toUpperCase(), 2, row.y + 10 * scale);
      ctx.strokeStyle = TH.rule; ctx.beginPath(); ctx.moveTo(0, row.y + 0.5); ctx.lineTo(w, row.y + 0.5); ctx.stroke();
      return;
    }
    font(ctx, 11 * scale, 500, FX, 'semi-condensed'); ctx.fillStyle = HEAT.hoverRow === row.idx ? TH.ink : TH.ink2; ctx.textAlign = 'left';
    let label = row.r.n;
    while (ctx.measureText(label).width > HEAT.x0 - 12 && label.length > 4) label = label.slice(0, -2) + '…';
    ctx.fillText(label, 2, row.y + HEAT.rowH / 2);
    for (let i = NOW; i < NQ; i++) {
      ctx.fillStyle = divColor(imp.rows[row.idx][i]);
      ctx.fillRect(X(i) + 0.5, row.y + 1, Math.max(1, HEAT.colW - 1), HEAT.rowH - 2);
    }
  });
  const c = ci();
  if (c >= NOW) { ctx.strokeStyle = TH.ink; ctx.lineWidth = 1.5; ctx.strokeRect(X(c) - 0.5, HEAT.y0, HEAT.colW + 1, HEAT.h - HEAT.y0 - 4); }
  if (HEAT.hover) { const { idx, i } = HEAT.hover; const row = HEAT.rows.find(r => r.idx === idx); if (row) { ctx.strokeStyle = TH.amber; ctx.lineWidth = 1.5; ctx.strokeRect(X(i) + 0.5, row.y + 0.5, HEAT.colW - 1, HEAT.rowH - 1); } }
}

/* ---------- sparkline (KPI) ---------- */
function drawSpark(cv, k) {
  if (!cv._w) return;
  const ctx = ctxOf(cv), w = cv._w, h = cv._h;
  ctx.clearRect(0, 0, w, h);
  let lo = Infinity, hi = -Infinity; const lg = !!LOGK[k];
  const val = i => (lg ? Math.log(Math.max(1e-9, mval(k, i))) : mval(k, i));
  for (let i = 0; i < NQ; i++) { const v = val(i); if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const X = i => 1 + i / (NQ - 1) * (w - 2), Y = v => h - 2 - (v - lo) / (hi - lo) * (h - 4);
  ctx.strokeStyle = rgba(TH.amber, 0.4); ctx.beginPath(); ctx.moveTo(Math.round(X(NOW)) + .5, 0); ctx.lineTo(Math.round(X(NOW)) + .5, h); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.strokeStyle = TH.ink3; ctx.beginPath();
  for (let i = 0; i <= NOW; i++) { const x = X(i), y = Y(val(i)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  const col = colorFor(state.key);
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = NOW; i < NQ; i++) { const x = X(i), y = Y(val(i)); i === NOW ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
  const f = state.t, x = X(f), y = Y(lerpAt(val, f));
  ctx.fillStyle = TH.ink; ctx.beginPath(); ctx.arc(x, y, 2.3, 0, 7); ctx.fill();
}

/* ---------- DOM: build ---------- */
const KPI_DEFAULT = ['K', 'R', 'ccov', 'VL', 'prem', 'G', 'DC', 'Ufp', 'Cs', 'GDP'];
let KPIS = KPI_DEFAULT.slice();
const KPI_LABEL = { K: 'Big-4 capex', R: 'AI revenue', ccov: 'Revenue ÷ capital charge', VL: 'Lab equity value', prem: 'Frontier premium', G: 'Open-weight lag', DC: 'DC power', Ufp: 'Chip fleet in use', Cs: 'Credit stress', GDP: 'AI → US GDP', OS: 'Open-weight share', PF: 'Lab distress', AU: 'Work done by AI' };
function buildTabs() {
  const nav = $('#tabs'); nav.innerHTML = '';
  PRE.forEach((s, j) => {
    const b = el('button', 'tab'); b.dataset.k = s.key; b.style.setProperty('--c', scnColor(s));
    b.setAttribute('aria-pressed', 'false');
    const n = el('span', 'n', String(j + 1)); const sw = el('span', 'sw'); sw.style.background = scnColor(s);
    b.append(n, sw, document.createTextNode(s.short));
    b.title = s.name;
    b.addEventListener('click', () => { stopTour(); selectKey(s.key); });
    nav.append(b);
  });
  const c = el('button', 'tab'); c.dataset.k = 'CUST'; c.style.setProperty('--c', CUST_COLOR); c.hidden = true; c.setAttribute('aria-pressed', 'false');
  const sw = el('span', 'sw'); sw.style.background = CUST_COLOR;
  c.append(el('span', 'n', String(PRE.length + 1)), sw, document.createTextNode('Custom'));
  c.addEventListener('click', () => { stopTour(); if (custRun) selectKey('CUST'); });
  nav.append(c);
}
function buildKpis() {
  const box = $('#kpis'); box.innerHTML = ''; DOM.kpi = {};
  box.style.setProperty('--kpi-n', String(Math.max(1, KPIS.length)));
  KPIS.forEach(k => {
    const d = el('div', 'kpi'); d.dataset.prov = 'm:' + k; d.tabIndex = 0; d.setAttribute('role', 'button');
    d.setAttribute('aria-label', (KPI_LABEL[k] || MET[k].n) + ': show where this number comes from');
    const l = el('div', 'l', KPI_LABEL[k] || MET[k].n); l.title = MET[k].n + ' · click for the source or formula';
    const v = el('div', 'v tnum', '—'); const dd = el('div', 'd', '');
    const cv = watch(el('canvas')); cv.setAttribute('role', 'img');
    d.append(l, v, dd, cv); box.append(d);
    DOM.kpi[k] = { v, d: dd, cv };
  });
}
function makeLaneRow(L) {
  const row = el('div', 'lane'); row.id = 'lane-' + L.id;
  const meta = el('div', 'meta');
  const tt = el('div', 'tt', L.t);
  const ib = el('button', 'lane-i'); ib.type = 'button'; ib.dataset.prov = 'lane:' + L.id; ib.title = 'Sources and formula'; ib.setAttribute('aria-label', 'Sources and formula: ' + L.t); ib.innerHTML = ICO.info; tt.append(ib);
  const un = el('div', 'un', L.u + ' ');
  if (L.ill) { const em = el('em', '', 'illustrative'); un.append(em); }
  const vals = el('div', 'vals');
  const vrs = L.s.map((S, j) => {
    const vr = el('div', 'vr'); vr.dataset.prov = 'm:' + S.k; vr.title = S.n + ' · click for the source or formula';
    const key = el('i'); key.style.background = j === 0 ? 'var(--amber)' : (S.c === 'ink3' ? 'var(--ink-3)' : 'var(--ink-2)');
    const vn = el('span', 'vn', S.n); const vv = el('span', 'vv tnum', '—'); const vd = el('span', 'vd', '');
    vr.append(key, vn, vv, vd); vals.append(vr); return { key, vv, vd, k: S.k };
  });
  meta.append(tt, un, vals);
  const cv = watch(el('canvas')); cv.setAttribute('aria-label', L.t + ' over time');
  cv.addEventListener('pointermove', e => onLaneHover(e, L, cv));
  cv.addEventListener('pointerleave', () => { state.hover = null; state.hoverLane = null; hideTip(); dirty(); });
  cv.addEventListener('click', e => { const i = laneIndexAt(e, cv); jumpTo(i); });
  row.append(meta, cv);
  return { row, cv, vrs, L };
}
function buildLanes() {
  const host = $('#lanes'); host.innerHTML = ''; DOM.lanes = {};
  GROUPS.forEach(G => {
    const gh = el('div', 'grp'); gh.setAttribute('role', 'button'); gh.tabIndex = 0;
    gh.append(el('b', '', G.n), el('span', '', G.s));
    gh.dataset.g = G.g;
    const toggle = () => { state.closed[G.g] = !state.closed[G.g]; gh.classList.toggle('closed', !!state.closed[G.g]); applyLaneVisibility(); dirty(); };
    gh.addEventListener('click', toggle); gh.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    host.append(gh);
    LANES.filter(L => L.g === G.g).forEach(L => { const D = makeLaneRow(L); D.row.dataset.g = G.g; host.append(D.row); DOM.lanes[L.id] = D; });
  });
}
function buildLegend() {
  const lg = $('#scnLegend'); lg.innerHTML = '';
  const hist = el('span'); const hi = el('i'); hi.style.background = TH.ink; hist.append(hi, document.createTextNode('History (dashed = index)'));
  const act = el('span'); const ai = el('i'); ai.style.background = colorFor(state.key); ai.id = 'legAct'; act.append(ai, el('span', '', shortFor(state.key))); act.lastChild.id = 'legActT';
  const gh = el('span'); const gi = el('i'); gi.style.background = TH.ink3; gh.append(gi, document.createTextNode('Other scenarios'));
  const band = el('span'); const bi = el('i'); bi.style.cssText = 'height:8px;background:' + rgba(TH.ink, 0.12); band.append(bi, document.createTextNode('Scenario spread'));
  lg.append(hist, act, gh, band);
}
function buildDrivers() {
  const host = $('#drivers'); host.innerHTML = ''; DOM.drv = {};
  E.DRIVERS.forEach(D => {
    const row = el('div', 'drv');
    const lab = el('label'); lab.htmlFor = 'drv-' + D.k; lab.title = D.desc;
    const nm = el('span', '', D.name); const out = el('output', '', '0'); lab.append(nm, out);
    const cv = watch(el('canvas')); cv.setAttribute('role', 'img'); cv.title = 'Driver path: scenario (dim) vs your tilt (amber) · click for details'; cv.dataset.prov = 'drv:' + D.k; cv.style.cursor = 'pointer';
    const inp = el('input'); inp.type = 'range'; inp.min = '-50'; inp.max = '50'; inp.step = '5'; inp.value = '0'; inp.id = 'drv-' + D.k;
    inp.setAttribute('aria-label', D.name + ' tilt');
    inp.addEventListener('input', () => { const v = +inp.value; forkCustom(); state.custom.offsets[D.k] = v / 100; out.textContent = (v > 0 ? '+' : '') + v; out.classList.toggle('on', v !== 0); recomputeCustom(); });
    const ends = el('div', 'ends'); ends.append(el('span', '', D.lo), el('span', '', D.hi));
    row.append(lab, cv, inp, ends); host.append(row);
    DOM.drv[D.k] = { inp, out, cv };
  });
}
function quarterOptions(sel, t0) {
  for (let i = E.idxOf(2027); i <= E.idxOf(2033.75); i++) { const o = el('option', '', E.qLabel(i)); o.value = String(E.tAt(i)); if (Math.abs(E.tAt(i) - t0) < 1e-6) o.selected = true; sel.append(o); }
}
function buildShocks() {
  const host = $('#shocks'); host.innerHTML = ''; DOM.shock = {};
  E.SHOCKS.forEach(S => {
    const row = el('div', 'shock');
    const cb = el('input'); cb.type = 'checkbox'; cb.id = 'sh-' + S.id;
    const lab = el('label'); lab.htmlFor = cb.id; lab.append(document.createTextNode(S.name)); lab.append(el('small', '', S.desc));
    const sel = el('select', 'sel'); sel.id = 'shq-' + S.id; sel.setAttribute('aria-label', S.name + ' date'); quarterOptions(sel, S.t);
    const apply = () => {
      forkCustom();
      state.custom.shocks = state.custom.shocks.filter(x => x.id !== S.id);
      if (cb.checked) state.custom.shocks.push({ id: S.id, t: +sel.value });
      recomputeCustom();
    };
    cb.addEventListener('change', apply); sel.addEventListener('change', () => { if (cb.checked) apply(); });
    row.append(cb, lab, sel); host.append(row);
    DOM.shock[S.id] = { cb, sel };
  });
}
const THESIS = [
  ['Big models converge until the differences are no longer recognisable', 'PARTLY', 'warn', 'Open-weight models trailed the frontier by about four months on average from January to May 2026 (Epoch); Mozilla’s September method gives 4.4 months. About a dozen labs sit near the frontier, yet the top tier still sells at a large premium: GPT-6 Astra lists at $20 per million tokens (3:1 blend) against $0.20 for Luna.', 'https://epoch.ai/data-insights/open-closed-eci-gap'],
  ['Then price, openness and security become the differentiators', 'EMERGING', 'info', 'A frontier price war produced four price moves in 17 days this summer. BenchLM’s median open-weight list price is 75% below proprietary ($0.50 vs $2.00), although lists are not quality-matched. In OpenRouter’s discount study about three-quarters of the share gain came from other labs, i.e. switching rather than new usage.', 'https://benchlm.ai/stats/llm-pricing'],
  ['Operating costs stay high because of energy', 'SUPPORTED (US)', 'good', 'PJM capacity cleared at its $325/MW-day cap again for 2028/29 and is still 6.8 GW short of its reliability target; US commercial electricity is up ~6% in a year (13.85¢/kWh). The IEA expects data-centre use to rise from 485 TWh (2025) to 950 TWh by 2030.', 'https://insidelines.pjm.com/pjm-capacity-auction-procures-138318-mw-of-generation-resources-as-work-continues-to-address-growing-electricity-demand/'],
  ['Investors will push hard for returns', 'SUPPORTED', 'good', 'Big-4 capex guidance still rose to $720–745B for 2026, but the IMF now lists an AI-driven correction among the top near-term risks and CoreWeave bonds yield about 15%.', 'https://www.imf.org/en/blogs/articles/2026/10/12/global-financial-markets-face-rising-risks-from-ai-bond-yields-and-cyberattacks'],
  ['Local models become affordable for communities, firms and people', 'NOT YET', 'crit', 'Conventional DRAM contract prices rose 93–98% in Q1 2026 and are still forecast to rise 10–15% in Q4. OEM 128 GB boxes start near $3,000, but NVIDIA’s own DGX Spark now lists at $6,950.', 'https://www.trendforce.com/presscenter/news/20260930-13258.html'],
  ['Hardware demand will push hardware prices down', 'LATER, NOT NOW', 'warn', 'One-year H100 contracts rose from $1.70 to $2.35 an hour between October 2025 and March 2026. Micron’s new fabs start output in mid-2027 (Idaho), late 2028 and 2030 (New York) — first output, not guaranteed relief.', 'https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity'],
  ['Specialised agents grow because they solve narrow problems cheaply', 'PARTLY', 'warn', 'Gartner expects task-specific agents in 40% of enterprise applications by end-2026 — a count of applications, not of spending. Vendors are moving to usage pricing: GitHub Copilot since June, AEC data APIs on the Autodesk® platform since October, Procore agents billed on credits.', 'https://www.gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025'],
  ['Tight links to one AI provider create collapse risk', 'SUPPORTED', 'good', 'In June 2026 an export-control order suspended access to two frontier models for about three weeks — an outage, not an insolvency. Three providers held 88% of enterprise LLM API spend in 2025 (Menlo).', 'https://www.anthropic.com/news/fable-mythos-access'],
  ['Countries relying on the AI boom — the US — would suffer', 'SUPPORTED', 'good', 'ING estimates tech investment net of imports supplied ~36% of US growth in Q2 2026 (≈0.8 of 2.2 points) plus a wealth effect of ~0.4 points. South Korea’s KOSPI ended July almost 40% below its June peak.', 'https://think.ing.com/opinions/how-much-is-ai-contributing-to-us-economic-growth/'],
  ['Big banks and investors may collapse', 'PARTLY', 'warn', 'The exposure sits mostly in bonds, private credit and project vehicles backed by leases (BIS); hyperscaler bond issuance topped $100B in 2025. The IMF’s sample of 14 deals shows $650B of debt against $1.4T of future revenue commitments. Banks are exposed mainly through lending to those funds.', 'https://www.bis.org/publications/qr-202603/financing-ai-infrastructure-boom-on-and-off-balance-sheet-borrowing']
];
const FACTORS = [
  ['Demand elasticity (Jevons)', 'drivers', 'Cheaper tokens raise usage, but total spending rises only if elasticity is above 1. The “demand response to price” dial sets it between 0.5 and 1.5.'],
  ['Tokens per completed task', 'model', 'Agents and reasoning use more tokens per task, so the cost of a task falls more slowly than the price of a token.'],
  ['Unpowered chips', 'model', 'Chips bought faster than power arrives sit idle: powered capacity can be fully used while part of the purchased fleet earns nothing. Buyers then defer deliveries.'],
  ['Capital charge on the installed base', 'model', 'Five years of capex must be depreciated and financed. Cutting new capex does not shrink that bill, so stress can last after a capex slump.'],
  ['Platform lock-in', 'drivers', 'Identity, workflow, data and distribution can keep the margin with platforms even when models are interchangeable.'],
  ['Memory supercycle', 'model', 'HBM for AI crowds out ordinary DRAM; local AI gets more expensive before it gets cheaper.'],
  ['Circular financing', 'drivers', 'Chipmakers, clouds and labs invest in one another and buy from one another; trouble at one spreads fast.'],
  ['Accounting presentation', 'model', 'Gross vs net revenue and finance vs operating leases change reported numbers, not the economics. The model holds one basis so a restatement cannot create a crisis.'],
  ['Bond yields & cost of capital', 'model', 'High yields raise the bar for debt-funded data centres and neoclouds.'],
  ['Power politics', 'shock', 'Household bills rising with data-centre demand invite tariffs, moratoria and slower grid hook-ups.'],
  ['Sovereign AI programmes', 'drivers', 'Gulf, EU and Asian state money keeps building even when private capital retreats.'],
  ['Open-weight policy', 'shock', 'Limits on publishing weights or on using foreign weights would slow the open catch-up.'],
  ['Insurance & liability', 'shock', 'If insurers exclude autonomous-agent losses, adoption in regulated industries stalls.'],
  ['Copyright & data access', 'shock', 'Court rulings on training data could raise costs or favour holders of licensed data.'],
  ['GPU depreciation mismatch', 'context', 'Accounting lives of 5–6 years versus 2–3 years of real competitiveness can hide losses until a write-down.'],
  ['Labour backlash', 'context', 'Visible white-collar displacement can trigger taxes, regulation or procurement bans.'],
  ['Agent security', 'shock', 'Prompt injection and model supply-chain attacks scale with autonomy; trust can break in one incident.'],
  ['Equity concentration', 'context', 'A few AI companies dominate equity indices; index funds pass an AI correction to every pension.']
];
const SOURCES = [
  ['Big-4 capex, Q2 2026 scoreboard (Platformonomics, 31 Jul 2026)', 'https://platformonomics.com/2026/07/follow-the-capex-q2-2026-scoreboard/'],
  ['Microsoft FY26 Q4 call: capex and lease reclassification (29 Jul 2026)', 'https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4'],
  ['Alphabet Q2 2026 call: capex guidance (22 Jul 2026)', 'https://s206.q4cdn.com/479360582/files/doc_events/2026/Jul/22/2026_Q2_Earnings_Transcript.pdf'],
  ['Meta Q2 2026 results: capex guidance (29 Jul 2026)', 'https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx'],
  ['Amazon Q2 2026 call: cash capex (30 Jul 2026)', 'https://www.roic.ai/quote/AMZN/transcripts/2026-year/2-quarter'],
  ['OpenAI $50B net run-rate; gross vs net accounting (Axios, 8 Oct 2026)', 'https://www.axios.com/2026/10/08/openai-50-billion-arr-anthropic-revenue-accounting'],
  ['Anthropic run-rate above $65B (AI Magazine via Reuters, 18 Aug 2026)', 'https://aimagazine.com/news/how-anthropics-revenue-run-rate-topped-us-65bn'],
  ['OpenAI round at $852B post-money (31 Mar 2026)', 'https://openai.com/index/accelerating-the-next-phase-ai/'],
  ['Anthropic Series H at $965B post-money (28 May 2026)', 'https://www.anthropic.com/news/series-h'],
  ['Nvidia market value (StockAnalysis, 16 Oct 2026)', 'https://stockanalysis.com/stocks/nvda/market-cap/'],
  ['GPT-6 Astra pricing (OpenAI)', 'https://openai.com/index/gpt-6-astra/'],
  ['GPT-6 Sol and Luna pricing (OpenAI, updated 29 Sep 2026)', 'https://openai.com/index/introducing-gpt-6-sol-and-luna/'],
  ['LLM pricing dataset (BenchLM, 16 Oct 2026)', 'https://benchlm.ai/stats/llm-pricing'],
  ['Open vs closed gap, Jan–May 2026 (Epoch AI)', 'https://epoch.ai/data-insights/open-closed-eci-gap'],
  ['State of Open Source AI v1.1 (Mozilla, Sep 2026)', 'https://stateofopensource.ai/'],
  ['Discounts and switching on OpenRouter (25 Aug 2026)', 'https://openrouter.ai/blog/insights/gpt-5-6-discounts-jevons-paradox/'],
  ['Enterprise LLM market shares 2025 (Menlo Ventures)', 'https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/'],
  ['Energy and AI (IEA, 2026)', 'https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary'],
  ['PJM capacity auction 2028/29 (PJM, 14 Jul 2026)', 'https://insidelines.pjm.com/pjm-capacity-auction-procures-138318-mw-of-generation-resources-as-work-continues-to-address-growing-electricity-demand/'],
  ['US commercial electricity prices from EIA data (28 Sep 2026)', 'https://startbusinessbystate.com/data-center-electricity-prices-by-state/'],
  ['H100 one-year rental contracts (SemiAnalysis, Apr 2026)', 'https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity'],
  ['DRAM contract prices Q1–Q2 2026 (TrendForce, 1 Jun 2026)', 'https://www.trendforce.com/presscenter/news/20260601-13070.html'],
  ['DRAM contract prices Q4 2026 (TrendForce, 30 Sep 2026)', 'https://www.trendforce.com/presscenter/news/20260930-13258.html'],
  ['Micron fab timing (Q4 FY26 prepared remarks)', 'https://investors.micron.com/files/doc_financials/2026/q4/Q4-FY26-Prepared-Remarks.pdf'],
  ['DGX Spark listing (NVIDIA marketplace)', 'https://marketplace.nvidia.com/en-us/enterprise/personal-ai-supercomputers/dgx-spark/'],
  ['AI and US growth (ING, 20 Aug 2026)', 'https://think.ing.com/opinions/how-much-is-ai-contributing-to-us-economic-growth/'],
  ['Q2 2026 GDP, third estimate (Advisor Perspectives, 30 Sep 2026)', 'https://www.advisorperspectives.com/dshort/updates/2026/09/30/q2-gdp-third-estimate-real-gdp-at-2-2'],
  ['AI financing on and off balance sheet (BIS, Mar 2026)', 'https://www.bis.org/publications/qr-202603/financing-ai-infrastructure-boom-on-and-off-balance-sheet-borrowing'],
  ['Markets face rising risks from AI (IMF blog, 13 Oct 2026)', 'https://www.imf.org/en/blogs/articles/2026/10/12/global-financial-markets-face-rising-risks-from-ai-bond-yields-and-cyberattacks'],
  ['Model access suspension and restoration (Anthropic, Jun 2026)', 'https://www.anthropic.com/news/fable-mythos-access'],
  ['US construction spending incl. data centres (Census C30)', 'https://www.census.gov/construction/c30/pdf/privsa.pdf'],
  ['RIBA AI Report 2026', 'https://www.riba.org/media/fecm2pl5/riba-ai-report-2026-final_v3.pdf'],
  ['Stack Overflow Developer Survey 2026', 'https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/']
];
function buildStatic() {
  const tb = $('#thesis tbody');
  THESIS.forEach(([a, v, tone, txt, url]) => {
    const tr = el('tr');
    const td1 = el('td', '', a);
    const td2 = el('td'); const vb = el('span', 'verdict t-' + tone, v); td2.append(vb);
    const td3 = el('td'); td3.append(document.createTextNode(txt + ' '));
    const lk = el('a', '', 'Source'); lk.href = url; lk.target = '_blank'; lk.rel = 'noopener'; td3.append(lk);
    tr.append(td1, td2, td3); tb.append(tr);
  });
  const fac = $('#factors');
  FACTORS.forEach(([n, kind, txt]) => { const d = el('div'); const b = el('b', '', n); b.append(el('em', '', kind === 'model' ? 'in model' : kind === 'drivers' ? 'via driver dials' : kind === 'shock' ? 'shock toggle' : 'context')); d.append(b, document.createTextNode(txt)); fac.append(d); });
  const ul = $('#sources');
  SOURCES.forEach(([n, u]) => { const li = el('li'); const a = el('a', '', n); a.href = u; a.target = '_blank'; a.rel = 'noopener'; li.append(a); ul.append(li); });
  buildPoolLegend();
}
function buildPoolLegend() {
  const pl = $('#poolLegend'); pl.innerHTML = '';
  E.LAYERS.forEach((n, l) => { const s = el('span'); const i = el('i'); i.style.cssText = 'height:8px;background:' + RAMP[l]; s.append(i, document.createTextNode(n)); pl.append(s); });
}

/* ---------- sector lens & evidence ledger ---------- */
const lensState = { sec: 'aeco' };
function pctChg(v, v0) { const d = (v / v0 - 1) * 100; return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0) + '%'; }
function lensRowsOf(S) { return E.IMPACT_ROWS.map((r, j) => ({ r, j })).filter(x => (S.groups && S.groups.indexOf(x.r.g) >= 0) || (S.pick && S.pick.indexOf(x.r.n) >= 0)); }
function lensBullets(sec, r, c) {
  const v = k => r[k][c], v0 = k => r[k][NOW], out = [];
  if (sec === 'aeco') {
    const b = v('BLD'), b0 = v0('BLD');
    out.push(['Data-centre construction.', fmt('BLD', b) + ' a year in the US (today ' + fmt('BLD', b0) + ', ' + pctChg(b, b0) + '). ' + (b > b0 * 1.15 ? 'More shell, power, cooling and grid work for engineers and contractors.' : b < b0 * 0.85 ? 'The data-centre building boom fades; crews and engineers move back to other work.' : 'Roughly today’s pipeline of data-centre work.')]);
    const p = v('Pp'), p0 = v0('Pp');
    out.push(['Power costs.', 'Commercial electricity ' + pctChg(p, p0) + ' vs today. ' + (p > p0 * 1.1 ? 'Building operating costs rise; efficiency retrofits and on-site energy pay back faster.' : p < p0 * 0.97 ? 'Cheaper power eases operating budgets.' : 'Little change for operating budgets.')]);
    const a = v('AUa'), a0 = v0('AUa');
    out.push(['Design & engineering work.', 'About ' + fmt('AUa', a) + ' done by AI (today ' + fmt('AUa', a0) + '; illustrative). ' + (a > 10 ? 'Hour-based fees come under pressure; firms that price outcomes keep the gain.' : a > 5 ? 'AI becomes a daily tool and fee models start to shift.' : 'Mostly productivity tools; billing models hold.')]);
    const t = v('CtaskI');
    out.push(['Cost of AI per task.', 'Index ' + fmt('CtaskI', t) + ' (today 100): a completed task costs ' + (t < 100 ? 'about ' + (t < 10 ? t.toFixed(1) : Math.round(t)) + '% of today’s price. ' : (t / 100).toFixed(1) + '× today’s price. ') + (t < 30 ? 'Using AI on every project costs next to nothing.' : t > 150 ? 'Top-tier AI stays expensive; use it where it pays.' : 'Costs fall gradually.')]);
    const cs = v('Cs');
    out.push(['Finance.', 'Credit-stress index ' + Math.round(cs) + (cs >= 70 ? ': flag zone, so project and developer finance tighten.' : cs >= 58 ? ': elevated, lenders get choosier.' : ': normal conditions.')]);
  } else if (sec === 'aecosw') {
    const s = v('seatA');
    out.push(['Seats.', 'Human design seats at ' + Math.round(s) + ' (today 100; illustrative). ' + (s < 85 ? 'Per-seat licences shrink; usage, agent and outcome pricing have to replace them.' : s < 95 ? 'Seat growth stalls; usage-based add-ons start to matter.' : 'Per-seat licensing still holds.')]);
    out.push(['Agents.', 'Specialised agents take ' + fmt('AS', v('AS')) + ' of enterprise AI spend (today ' + fmt('AS', v0('AS')) + ').']);
    const pl = v('PLAT');
    out.push(['Platform lock-in.', Math.round(pl) + '/100 — ' + (pl >= 70 ? 'high: suites and clouds bundle AI and keep the margin; open formats and integrations are the way in.' : pl <= 45 ? 'low: open formats, open models and routers make switching easy.' : 'medium: customers can switch, at a cost.')]);
    const g = v('G');
    out.push(['Open models.', 'Open weights trail the frontier by ' + fmt('G', g) + ' and run ' + fmt('ES', v('ES')) + ' of enterprise AI (today ' + fmt('ES', v0('ES')) + '). ' + (g < 2 ? 'Domain agents can be built on open models without a capability penalty.' : g > 6 ? 'Open models fall behind; dependence on a few labs grows.' : 'Open models are close enough for most domain work.')]);
    out.push(['Model prices.', 'Frontier tier ' + fmt('prem', v('prem')) + ' the good-enough tier, of which ' + fmt('mf', v('mf')) + ' is markup over resource cost.']);
  } else {
    const d = v('AUdev'), d0 = v0('AUdev');
    out.push(['Development work.', 'About ' + fmt('AUdev', d) + ' of software-development work done by AI (today ' + fmt('AUdev', d0) + '; illustrative mapping).']);
    const s = v('seatG');
    out.push(['Seats.', 'Knowledge-work seats at ' + Math.round(s) + ' (today 100; illustrative). ' + (s < 85 ? 'Seat-based software loses volume unless pricing moves to usage or outcomes.' : 'Seat volumes roughly hold.')]);
    out.push(['Token prices.', 'Good-enough tier ' + fmt('Pc', v('Pc')) + ' per million tokens (today ' + fmt('Pc', v0('Pc')) + '); frontier ' + fmt('Pf', v('Pf')) + '.']);
    out.push(['Suppliers.', 'Top-3 providers hold ' + fmt('TC', v('TC')) + ' of enterprise LLM spend (2025: 88%).']);
    const sn = v('SN');
    out.push(['Noise.', 'Signal-to-noise ' + Math.round(sn) + ' (today ' + Math.round(v0('SN')) + '). ' + (sn < 40 ? 'A flood of AI-made apps and content; curation, trust and distribution decide.' : sn > 65 ? 'Provenance and verification restore some signal.' : 'Discovery stays hard for new apps.')]);
  }
  return out;
}
let lastLens = '';
function updateLens() {
  const c0 = ci(), c = c0 <= NOW ? E.idxOf(2030.75) : c0;
  const key = lensState.sec + '|' + state.key + '|' + c + '|' + (custRun ? custRun._stamp : '');
  if (key === lastLens && !view.changed) return; lastLens = key;
  const S = LENS.find(s => s.id === lensState.sec), r = view.to;
  $('#lensWhen').textContent = (c0 <= NOW ? 'At ' + E.qLabel(c) + ' (move the cursor)' : 'At ' + E.qLabel(c)) + ' · ' + shortFor(state.key);
  const ul = $('#lensBullets'); ul.innerHTML = '';
  lensBullets(S.id, r, c).forEach(([h, t]) => { const li = el('li'); li.append(el('b', '', h), document.createTextNode(' ' + t)); ul.append(li); });
  const imp = impactsOf(r), tb = $('#lensRows'); tb.innerHTML = '';
  lensRowsOf(S).map(x => ({ n: x.r.n, v: imp.rows[x.j][c], why: imp.why[x.j][c] || [], j: x.j })).sort((a, b) => b.v - a.v).forEach(x => {
    const tr = el('tr'); const nc = el('td'); const nb = el('button', 'lnk', x.n); nb.type = 'button'; nb.dataset.prov = 'imp:' + x.j; nc.append(nb);
    tr.append(nc, el('td', 'num ' + (x.v >= 0 ? 'up' : 'dn'), (x.v >= 0 ? '+' : '−') + Math.abs(Math.round(x.v))),
      el('td', 'why', x.why.slice(0, 2).map(w => (w.v >= 0 ? 'helps: ' : 'hurts: ') + w.f + (w.dir > 0 ? ' ▲' : w.dir < 0 ? ' ▼' : '')).join(' · ')));
    tb.append(tr);
  });
}
function showLensSector() {
  const S = LENS.find(s => s.id === lensState.sec);
  LENS_LANES.forEach(L => { DOM.lens[L.id].row.hidden = L.sec !== S.id; });
  $('#lensDesc').textContent = S.d;
  document.querySelectorAll('#lensTabs .ltab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === S.id)));
  const ev = $('#lensEv'); ev.innerHTML = '';
  (E.SECTOR_EVIDENCE[S.id] || []).forEach(x => { const li = el('li'); li.append(document.createTextNode(x.t + ' — ')); const a = el('a', '', x.src); a.href = x.url; a.target = '_blank'; a.rel = 'noopener'; li.append(a); ev.append(li); });
  lastLens = '';
}
function buildLens() {
  const tabs = $('#lensTabs'); tabs.innerHTML = '';
  LENS.forEach(S => {
    const b = el('button', 'ltab', S.n); b.type = 'button'; b.dataset.s = S.id;
    b.addEventListener('click', () => { lensState.sec = S.id; showLensSector(); dirty(true); });
    tabs.append(b);
  });
  const host = $('#lensLanes'); host.innerHTML = ''; DOM.lens = {};
  LENS_LANES.forEach(L => { const D = makeLaneRow(L); host.append(D.row); DOM.lens[L.id] = D; });
  showLensSector();
}
/* AI research panel (via.panel): several AI agents answered the same question; the published value is their weighted
   median. Summarises the record defensively (every field may be missing) for the ledger, the release dialog and the guide. */
function panelInfo(v) {
  const P = v && v.panel;
  if (!P || typeof P !== 'object' || Array.isArray(P)) return null;
  const num = x => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' && x.trim() !== '' && isFinite(+x) ? +x : null);
  const mem = (Array.isArray(P.members) ? P.members : []).filter(m => m && typeof m === 'object').slice(0, 12);
  const asked = Math.max(num(P.asked) || 0, mem.length);
  const answered = Math.min(asked, num(P.answered) != null ? num(P.answered) : mem.length);
  const judged = mem.filter(m => num(m.value) != null && typeof m.agrees === 'boolean');   // answers outside the plausible range are not judged
  const tol = num(P.tol), share = num(P.agree);
  return {
    asked, answered, members: mem, valued: judged.length, agreeN: judged.filter(m => m.agrees === true).length,
    tol: tol != null && tol > 0 && tol < 1 ? tol : null, share: share != null && share >= 0 && share <= 1 ? share : null,
    lo: num(P.lo), hi: num(P.hi), rule: typeof P.rule === 'string' && P.rule ? P.rule : 'weighted median', lead: mem.find(m => m.lead === true) || null, num
  };
}
function buildLedger() {
  const tone = { reported: 'good', survey: 'info', estimate: 'warn', forecast: 'warn', index: 'muted', assumption: 'serious' };
  const tb = $('#ledger tbody'); tb.innerHTML = '';
  E.ANCHORS.forEach(a => {
    const tr = el('tr'); tr.dataset.an = a.id;
    const idc = el('td', 'num'); const ib = el('button', 'lnk prov-id', a.id); ib.type = 'button'; ib.dataset.prov = 'an:' + a.id; ib.setAttribute('aria-label', a.id + ' ' + a.name + ': full provenance'); idc.append(ib);
    const nmc = el('td'); const nb = el('button', 'lnk', a.name); nb.type = 'button'; nb.dataset.prov = 'an:' + a.id; nb.tabIndex = -1; nmc.append(nb);
    tr.append(idc, nmc, el('td', 'num', a.v));
    const st = el('td'); st.append(el('span', 'stat t-' + (tone[a.status] || 'muted'), a.status.toUpperCase())); tr.append(st);
    tr.append(el('td', '', a.period));
    const src = el('td');
    if (a.url && /^https?:\/\//i.test(a.url)) { const lk = el('a', '', a.src); lk.href = a.url; lk.target = '_blank'; lk.rel = 'noopener'; src.append(lk); } else src.textContent = a.src;
    const pi = panelInfo(a.via);
    const vt = a.via && (pi ? 'AI research panel' + (a.via.type === 'ai-knowledge' ? ' (AI knowledge)' : '') + ' · reviewed' : { api: 'official API · reviewed', ai: 'AI-assisted research · reviewed', 'ai-knowledge': 'AI knowledge, no specific source · reviewed', manual: 'edited by the team' }[a.via.type]);
    if (vt) src.append(el('div', 'via-s', vt + (a.reviewed ? ' ' + a.reviewed : '') + (pi && pi.valued ? ' · ' + pi.agreeN + ' of ' + pi.valued + ' agree' : '')));
    if (a.refs && a.refs.length) { const mb = el('button', 'lnk more', '+' + a.refs.length + ' more'); mb.type = 'button'; mb.dataset.prov = 'an:' + a.id; mb.title = 'Further references'; src.append(document.createTextNode(' '), mb); }
    const derivation = [a.scope ? 'Scope: ' + a.scope + '.' : '', a.calc || '', a.prev ? 'Previous value: ' + a.prev + '.' : a.was ? 'v2: ' + a.was + '.' : ''].filter(Boolean).join(' ');
    const cell = el('td', 'calc'), detail = el('details');
    detail.append(el('summary', '', derivation.length > 100 ? derivation.slice(0, 100).replace(/\s+\S*$/, '') + '… More' : 'Derivation · More'), el('p', '', derivation || 'See the linked source for this anchor.'));
    cell.append(detail); tr.append(src, cell);
    tb.append(tr);
  });
  const P = E.PARAMS, pc = x => Math.round(x * 100) + '%', gr = x => Math.round((Math.exp(x) - 1) * 100) + '%', dc = x => Math.round((1 - Math.exp(-x)) * 100) + '%';
  const rows = [
    ['Knowledge-work value pool', '$' + P.pool0 / 1000 + 'T a year, growing ' + (P.poolG * 100).toFixed(1) + '% a year'],
    ['Organisational adoption', 'S-curve rate ' + P.auRateNow + ' → ' + P.auRateLong + ' a year; ceiling ' + P.auCeil + '% of work (at most ' + P.auCeilMax + '%)'],
    ['Price elasticity of usage', 'ε from ' + P.epsLo + ' to ' + P.epsHi + ' (base 1.0, set by a driver); automated work responds at ' + P.workElas + '·ε, at most ±' + pc(Math.exp(P.workSat) - 1)],
    ['Tokens per completed task', 'grow ' + gr(P.tauNow) + ' a year now, ' + gr(P.tauLong) + ' in the long run'],
    ['Algorithmic efficiency', 'compute per token falls ' + dc(P.algEff) + ' a year now, ' + dc(P.algLong) + ' later'],
    ['Hardware price-performance', 'compute per dollar rises ' + gr(P.hwPP) + ' a year now, ' + gr(P.hwLong) + ' later; per kWh ' + gr(P.cptG) + ' → ' + gr(P.cptLong)],
    ['Accelerator life', P.accelLife / 4 + ' years in the fleet'],
    ['Capital charge', 'depreciation over ' + P.depLife + ' years + ' + pc(P.coc) + ' on half the gross base = ' + pc(1 / P.depLife + P.coc / 2) + ' of 5 years of capex, each year'],
    ['Revenue capture', 'half priced on cost per task, half on value; soft ceiling ' + pc(P.captureCeil) + ' of the value of AI work'],
    ['Capex floor and speed', '$' + P.maint0 + 'B (2022 level) growing ' + pc(P.maintG) + ' a year; AI capex above it can reach zero, falling at most ~40% a year'],
    ['Chip deliveries', 'deferred once more than ' + pc(P.strandFree) + ' of purchased compute is unpowered'],
    ['Compute priority', 'paid work served first, up to ' + pc(P.prodShareMax) + ' of served compute; desired compute starts ' + pc(P.excess0) + ' above supply'],
    ['Financing', 'debt share starts at 0.40; hyperscaler operating cash flow $' + P.cfo0 + 'B a year, +' + pc(P.cfoG)],
    ['US GDP channels', 'capex × ' + P.gdpCapex + ' (all US AI builders, domestic share); wealth 1.5¢ per $ (ING); productivity ' + P.gdpProd + ' of new AI work value'],
    ['Sector mappings', 'US DC construction = ' + (P.buildShare * 100).toFixed(1) + '% of Big-4 capex; exposure exponents AECO ' + P.aecoK + ', software development ' + P.devK]
  ];
  const box = $('#assume'); box.innerHTML = '';
  rows.forEach(([n, t]) => { const d = el('div'); d.append(el('b', '', n), document.createTextNode(t)); box.append(d); });
}

/* ---------- events ---------- */
let EVENTS = [];
let wirePaused = REDUCED || load('aimonitor.events-paused') === true;
const KORD = { hist: 0, scn: 1, base: 1, shock: 2, auto: 3 };
function buildEvents() {
  const k = state.key, run = runFor(k), scn = scnFor(k);
  const ev = E.HIST_EVENTS.map(([t, text]) => ({ i: E.idxOf(t), text, kind: 'hist' }));
  scn.ev.forEach(([t, text]) => ev.push({ i: E.idxOf(t), text: text, kind: k === 'CUST' ? 'base' : 'scn' }));
  if (k === 'CUST') state.custom.shocks.forEach(s => { const d = E.SHOCKS.find(x => x.id === s.id); ev.push({ i: E.idxOf(s.t), text: 'Shock: ' + d.name, kind: 'shock' }); });
  E.autoEvents(run).forEach(a => ev.push({ i: a.i, text: a.text, kind: 'auto' }));
  ev.sort((a, b) => a.i - b.i || KORD[a.kind] - KORD[b.kind]);
  EVENTS = ev;
  // tape (duplicated for a seamless loop)
  const tape = $('#tape'); tape.innerHTML = '';
  for (let rep = 0; rep < 2; rep++) ev.forEach(e => {
    const s = el('span', 'ev'); s.dataset.i = e.i; if (rep) s.setAttribute('aria-hidden', 'true');
    const tm = el('i', '', E.qLabel(e.i));
    const tx = el('em', '', (e.kind === 'auto' ? '⚡ ' : '') + e.text);
    if (e.kind !== 'hist') tx.style.color = e.kind === 'auto' ? TH.ink : e.kind === 'shock' ? TH.crit : colorFor(k);
    s.append(el('span', 'event-kind ' + (e.kind === 'hist' ? 'history' : 'scenario'), e.kind === 'hist' ? 'Historical' : 'Scenario'), tm, tx); tape.append(s);
  });
  tape.style.animationDuration = Math.max(60, ev.length * 4.5) + 's';
  // log
  const list = $('#evlist'); list.innerHTML = '';
  ev.forEach(e => {
    const r = el('div', 'evrow' + (e.kind === 'auto' ? ' auto' : '')); r.dataset.i = e.i; r.tabIndex = 0;
    const tm = el('time', '', E.qLabel(e.i)); const dt = el('span', 'dot');
    dt.style.background = e.kind === 'hist' ? TH.amber : e.kind === 'auto' ? TH.ink : e.kind === 'shock' ? TH.crit : colorFor(k);
    const tx = el('span', '', e.text + (e.kind === 'base' ? ' (base story)' : ''));
    if (e.kind === 'hist') { const ms = ((window.AIMONITOR_METHODS || {}).events || []).find(x => Math.abs(x.t - E.tAt(e.i)) < 1e-6 && x.text === e.text); const s1 = ms && (ms.sources || []).find(x => x.url); if (s1) { const lk = el('a', 'evsrc', '↗ ' + (s1.publisher || 'source')); lk.href = s1.url; lk.target = '_blank'; lk.rel = 'noopener'; lk.title = s1.title || s1.url; lk.addEventListener('click', ev3 => ev3.stopPropagation()); tx.append(document.createTextNode(' '), lk); } }
    tx.prepend(el('span', 'event-kind ' + (e.kind === 'hist' ? 'history' : 'scenario'), e.kind === 'hist' ? 'Historical' : 'Scenario'), document.createTextNode(' '));
    r.append(tm, dt, tx);
    const jump = () => jumpTo(e.i);
    r.addEventListener('click', jump); r.addEventListener('keydown', ev2 => { if (ev2.key === 'Enter') jump(); });
    list.append(r);
  });
  $('#evScn').textContent = 'history + ' + shortFor(k).toLowerCase();
  lastEvI = -1;
}
let lastEvI = -1, lastFlash = '';
function updateEventMarks() {
  const c = ci();
  if (c === lastEvI) return; lastEvI = c;
  document.querySelectorAll('#tape .ev').forEach(n => n.classList.toggle('past', +n.dataset.i <= c));
  document.querySelectorAll('#evlist .evrow').forEach(n => n.classList.toggle('fut', +n.dataset.i > c));
  const list = $('#evlist');
  if (!list.matches(':hover')) { const rows = list.querySelectorAll('.evrow:not(.fut)'); const lr = rows[rows.length - 1]; if (lr) { const d = lr.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientHeight * 0.55; if (Math.abs(d) > 4) list.scrollTop += d; } }
  const cur = latestEvent(c);
  const txt = cur ? (cur.kind === 'hist' ? 'Historical' : 'Scenario') + ' · ' + E.qLabel(cur.i) + ' · ' + cur.text : '—';
  if (txt !== lastFlash && (!wirePaused || !lastFlash)) {
    lastFlash = txt; $('#flashTxt').textContent = txt;
    const fl = $('#flash'); fl.classList.remove('pulse'); if (state.playing) { void fl.offsetWidth; fl.classList.add('pulse'); }
  }
}
function latestEvent(c) {
  let best = null;
  for (const e of EVENTS) if (e.i <= c && (!best || e.i >= best.i)) { if (best && e.i === best.i && e.kind === 'hist' && best.kind !== 'hist') continue; best = e; }
  return best;
}

/* ---------- signposts & matrix ---------- */
const SIGNS = [
  { n: 'Open-weight lag under 2 months', k: 'G', op: '<', v: 2, risk: 0 },
  { n: 'Frontier markup over resource cost below 1.5×', k: 'mf', op: '<', v: 1.5, risk: 1 },
  { n: 'Big-4 capex shrinking year-on-year', fn: (r, i) => (i >= 4 ? r.K[i] / r.K[i - 4] - 1 : 0), op: '<', v: 0, f: v => (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(0) + '%', risk: 1 },
  { n: 'Revenue covers under half the capital charge', k: 'ccov', op: '<', v: 0.5, risk: 1 },
  { n: 'Credit-stress index above 70 (flag)', k: 'Cs', op: '>', v: 70, risk: 2 },
  { n: 'More than 15% of purchased compute unpowered', k: 'STp', op: '>', v: 15, risk: 1 },
  { n: 'Under 85% of desired compute served', k: 'SVp', op: '<', v: 85, risk: 1 },
  { n: 'H100 contract rent below $1.50/hr (glut)', k: 'GR', op: '<', v: 1.5, risk: 1 },
  { n: 'H100 contract rent above $4/hr (crunch)', k: 'GR', op: '>', v: 4, risk: 1 },
  { n: 'DRAM index back under 300', k: 'DR', op: '<', v: 300, risk: 0 },
  { n: 'Local 128 GB AI box under $1,000', k: 'LB', op: '<', v: 1000, risk: 0 },
  { n: 'Top-3 provider share under 60%', k: 'TC', op: '<', v: 60, risk: 0 },
  { n: 'Lab distress index above 25', k: 'PF', op: '>', v: 25, risk: 2 },
  { n: 'AI drags on US GDP growth', k: 'GDP', op: '<', v: 0, risk: 2 },
  { n: 'DC power above IEA 2030 projection (950 TWh)', k: 'DC', op: '>', v: 950, risk: 1 }
];
function signVal(s, r, i) { return s.fn ? s.fn(r, i) : r[s.k][i]; }
function signHit(s, v) { return s.op === '<' ? v < s.v : v > s.v; }
function buildSigns() {
  const tb = $('#signs tbody'); tb.innerHTML = ''; DOM.sign = [];
  SIGNS.forEach(s => {
    const tr = el('tr'); const a = el('td'); const nb = el('button', 'lnk', s.n); nb.type = 'button'; nb.dataset.prov = 'sign:' + SIGNS.indexOf(s); a.append(nb); const b = el('td', 'num'); const c = el('td'); const d = el('td', 'num');
    tr.append(a, b, c, d); tb.append(tr); DOM.sign.push({ b, c, d });
  });
}
function updateSigns() {
  const r = view.to, c = ci();
  SIGNS.forEach((s, j) => {
    const v = signVal(s, r, c);
    const D = DOM.sign[j];
    D.b.textContent = s.f ? s.f(v) : fmt(s.k, v);
    const hit = signHit(s, v);
    const near = !hit && (s.v === 0 ? Math.abs(v) < 0.05 : Math.abs(v - s.v) / Math.abs(s.v) < 0.25);
    D.c.innerHTML = '';
    const tone = hit ? (s.risk === 2 ? 'crit' : s.risk === 1 ? 'warn' : 'info') : near ? 'muted' : 'muted';
    const st = el('span', 'stat t-' + tone, hit ? 'TRIGGERED' : near ? 'WATCH' : 'CLEAR');
    if (!hit && !near) st.style.opacity = '.55';
    D.c.append(st);
    let first = null; for (let i = NOW + 1; i < NQ; i++) if (signHit(s, signVal(s, r, i))) { first = i; break; }
    D.d.textContent = signHit(s, signVal(s, r, NOW)) ? 'today' : first != null ? E.qLabel(first) : '—';
  });
}
const MX = Object.keys(MET).filter(k => k !== 'PLAT');
function buildMatrix() {
  const t = $('#matrix'); t.innerHTML = '';
  const thead = el('thead'), tr = el('tr');
  tr.append(el('th', '', 'Metric'), el('th', 'num', 'Today'));
  allKeys().forEach(k => { const th = el('th', 'num'); th.dataset.k = k; const sw = el('span'); sw.style.cssText = 'display:inline-block;width:8px;height:8px;margin-right:5px;background:' + colorFor(k); th.append(sw, document.createTextNode(shortFor(k))); tr.append(th); });
  thead.append(tr); t.append(thead);
  const tb = el('tbody'); DOM.mx = [];
  MX.forEach(m => {
    const r = el('tr'); const mt = el('td'); const mb = el('button', 'lnk', MET[m].n); mb.type = 'button'; mb.dataset.prov = 'm:' + m; mt.append(mb); r.append(mt);
    const today = el('td', 'num', fmt(m, RUN.COMM[m][NOW])); r.append(today);
    const cells = allKeys().map(k => { const td = el('td', 'num pv'); td.dataset.k = k; td.dataset.prov = 'm:' + m + '|s:' + k; r.append(td); return { k, td }; });
    tb.append(r); DOM.mx.push({ m, cells });
  });
  t.append(tb);
}
function updateMatrix() {
  const c = ci();
  $('#matrix thead').querySelectorAll('th[data-k]').forEach(th => th.classList.toggle('act', th.dataset.k === state.key));
  DOM.mx.forEach(({ m, cells }) => cells.forEach(({ k, td }) => { td.textContent = fmt(m, runFor(k)[m][c]); td.classList.toggle('act', k === state.key); }));
}

/* ---------- brief, KPIs, lane values ---------- */
function updateBrief() {
  const k = state.key, s = scnFor(k);
  $('#briefCode').textContent = k === 'CUST' ? 'CUSTOM' : s.key;
  $('#briefTag').textContent = k === 'CUST' ? 'your run · fork of ' + s.short : 'preset scenario';
  $('#briefBar').style.background = colorFor(k);
  $('#briefName').textContent = k === 'CUST' ? 'Custom · ' + s.name : s.name;
  let thesis = s.thesis;
  if (k === 'CUST') {
    const tilts = Object.entries(state.custom.offsets).filter(([, v]) => v).map(([d, v]) => E.DRIVERS.find(x => x.k === d).name.toLowerCase() + ' ' + (v > 0 ? '+' : '−') + Math.round(Math.abs(v) * 100));
    const sh = state.custom.shocks.map(x => E.SHOCKS.find(y => y.id === x.id).name.toLowerCase() + ' (' + E.qLabel(E.idxOf(x.t)) + ')');
    thesis = 'Your run starts from “' + s.name + '”' + (tilts.length ? ', tilting ' + tilts.join(', ') : '') + (sh.length ? (tilts.length ? '; ' : ', ') + 'with shocks: ' + sh.join(', ') : '') + '. Compare it with the preset in the scenario matrix below.';
  }
  $('#briefThesis').textContent = thesis;
  $('#heroName').textContent = nameFor(k); $('#heroThesis').textContent = (thesis.match(/^[\s\S]+?[.!?](?:\s|$)/) || [thesis])[0].trim(); $('#scenarioHero').style.borderColor = colorFor(k);
  const ul = $('#briefFirst'); ul.innerHTML = ''; s.first.forEach(f => ul.append(el('li', '', f)));
}
let lastWL = -2;
function updateWinners() {
  const c0 = ci(); const c = c0 <= NOW ? E.idxOf(2030.75) : c0;
  if (c === lastWL && !view.changed) return; lastWL = c;
  const imp = impactsOf(view.to);
  const rows = E.IMPACT_ROWS.map((r, j) => ({ n: r.n, v: imp.rows[j][c], j })).sort((a, b) => b.v - a.v);
  const wl = r => { const s2 = el('span', '', r.n); s2.title = r.n + ' ' + Math.round(r.v) + ' · click for the calculation'; s2.dataset.prov = 'imp:' + r.j; s2.tabIndex = 0; s2.setAttribute('role', 'button'); return s2; };
  const nmb = r => { const b2 = el('button', 'lnk', r.n); b2.type = 'button'; b2.dataset.prov = 'imp:' + r.j; return b2; };
  $('#wlLabel').textContent = (c0 <= NOW ? 'At ' + E.qLabel(c) + ' (move the cursor)' : 'At ' + E.qLabel(c)) + ' · who gains, who loses';
  const W = $('#winners'), L = $('#losers');
  W.querySelectorAll('span').forEach(n => n.remove()); L.querySelectorAll('span').forEach(n => n.remove());
  rows.slice(0, 4).forEach(r => W.append(wl(r)));
  rows.slice(-4).reverse().forEach(r => L.append(wl(r)));
  const tg = $('#topGain'), tl = $('#topLoss'); tg.innerHTML = ''; tl.innerHTML = '';
  rows.slice(0, 5).forEach(r => { const li = el('li'); li.append(nmb(r), el('b', 'up', '+' + Math.round(r.v))); tg.append(li); });
  rows.slice(-5).reverse().forEach(r => { const li = el('li'); li.append(nmb(r), el('b', 'dn', '−' + Math.abs(Math.round(r.v)))); tl.append(li); });
}
function updateKpis() {
  const f = state.t;
  KPIS.forEach(k => {
    const v = at(k, f), v0 = view.to[k][NOW];
    const D = DOM.kpi[k];
    D.v.textContent = fmt(k, v);
    D.cv.setAttribute('aria-label', MET[k].n + ' trend; ' + E.qLabel(ci()) + ': ' + fmt(k, v));
    D.cv.parentElement.setAttribute('aria-label', MET[k].n + ': ' + fmt(k, v) + ' at ' + E.qLabel(ci()) + '. Show source or formula.');
    if (f <= NOW + 0.01) { D.d.textContent = f >= NOW - 0.01 ? 'today' : 'history'; D.d.className = 'd'; }
    else { const dl = delta(k, v, v0); D.d.textContent = dl.txt + ' vs today'; D.d.className = 'd ' + dl.cls; }
    drawSpark(D.cv, k);
  });
}
function updateLaneVals() {
  const f = state.hover != null ? state.hover : state.t;
  LANES.concat(LENS_LANES).forEach(L => {
    const D = DOM.lanes[L.id] || DOM.lens[L.id]; if (D.row.hidden) return;
    D.cv.setAttribute('role', 'img');
    D.cv.setAttribute('aria-label', L.t + ', ' + E.qLabel(Math.round(f)) + ': ' + L.s.map(S => S.n + ' ' + fmt(S.k, at(S.k, f))).join('; '));
    D.vrs.forEach((vr, j) => {
      const v = at(vr.k, f), v0 = view.to[vr.k][NOW];
      vr.vv.textContent = fmt(vr.k, v);
      if (j === 0) vr.key.style.background = f > NOW ? colorFor(state.key) : TH.ink;
      if (f > NOW + 0.01) { const dl = delta(vr.k, v, v0); vr.vd.textContent = dl.txt; vr.vd.className = 'vd ' + dl.cls; }
      else { vr.vd.textContent = ''; }
    });
  });
}
function updateClock() {
  const c = ci();
  const t = E.tAt(c);
  $('#date').firstChild.nodeValue = E.qLabel(c);
  const yrs = t - E.NOW_T;
  $('#dateSub').textContent = c < NOW ? 'HISTORY · REAL DATA' : c === NOW ? 'TODAY · OCT 2026' : 'SCENARIO · ' + (yrs < 1 ? Math.round(yrs * 4) + ' QTR' : yrs.toFixed(yrs % 1 ? 1 : 0) + ' YRS') + ' AHEAD';
  const rg = regimeOf(c); const chip = $('#regime');
  chip.textContent = rg.label; chip.className = 'chip t-' + rg.tone;
}
function updateDriverMinis() {
  const f = state.t;
  E.DRIVERS.forEach(D => {
    const cv = DOM.drv[D.k].cv; cv.setAttribute('aria-label', D.name + ' driver, ' + E.qLabel(ci()) + ': ' + Math.round(lerpAt(i => view.to.drivers[D.k][i], f) * 100) + '/100'); if (!cv._w) return;
    const ctx = ctxOf(cv), w = cv._w, h = cv._h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = TH.panel2; ctx.fillRect(0, 0, w, h);
    const X = i => 1 + i / (NQ - 1) * (w - 2), Y = v => h - 2 - v * (h - 4);
    const xn = Math.round(X(NOW)) + .5; ctx.strokeStyle = rgba(TH.amber, .35); ctx.beginPath(); ctx.moveTo(xn, 0); ctx.lineTo(xn, h); ctx.stroke();
    const base = RUN[state.key === 'CUST' ? state.custom.base : state.key].drivers[D.k];
    ctx.strokeStyle = TH.ink3; ctx.lineWidth = 1; ctx.beginPath(); base.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
    const cur = view.to.drivers[D.k];
    ctx.strokeStyle = state.key === 'CUST' ? TH.amber : colorFor(state.key); ctx.lineWidth = 1.5; ctx.beginPath(); cur.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
    ctx.fillStyle = TH.ink; ctx.beginPath(); ctx.arc(X(f), Y(lerpAt(i => cur[i], f)), 2, 0, 7); ctx.fill();
  });
}
function syncControls() {
  const offs = state.key === 'CUST' ? state.custom.offsets : {};
  E.DRIVERS.forEach(D => { const v = Math.round((offs[D.k] || 0) * 100); const X = DOM.drv[D.k]; X.inp.value = String(v); X.out.textContent = (v > 0 ? '+' : '') + v; X.out.classList.toggle('on', v !== 0); });
  const sh = state.key === 'CUST' ? state.custom.shocks : [];
  E.SHOCKS.forEach(S => { const on = sh.find(x => x.id === S.id); DOM.shock[S.id].cb.checked = !!on; if (on) DOM.shock[S.id].sel.value = String(on.t); });
  $('#shockCount').textContent = sh.length + ' active';
  document.querySelectorAll('#tabs .tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === state.key)));
  const ct = $('#tabs .tab[data-k="CUST"]'); ct.hidden = !custRun;
  const la = $('#legAct'), lt = $('#legActT'); if (la) { la.style.background = colorFor(state.key); lt.textContent = shortFor(state.key); }
}

/* ---------- selection & custom ---------- */
function selectKey(k) {
  if (k === state.key && view.p >= 1) return;
  const next = runFor(k); if (!next) return;
  view.from = view.to; view.to = next; view.p = REDUCED ? 1 : 0; view.changed = true;
  state.key = k;
  buildEvents(); updateBrief(); syncControls(); buildMatrix(); lastWL = -2;
  dirty(true);
}
function forkCustom() {
  if (state.key === 'CUST' && state.custom) return;
  state.custom = { base: state.key, offsets: {}, shocks: [] };
}
let recomputeTimer = 0;
function recomputeCustom() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    const base = PRE.find(s => s.key === state.custom.base);
    custRun = E.simulate(base, { offsets: state.custom.offsets, shocks: state.custom.shocks }); custRun._stamp = Date.now();
    computeDomains();
    const was = state.key;
    if (was !== 'CUST') { state.key = 'CUST'; view.from = view.to; view.p = REDUCED ? 1 : 0; }
    else { view.from = null; view.p = 1; }
    view.to = custRun; view.changed = true;
    buildEvents(); updateBrief(); syncControls(); buildMatrix(); lastWL = -2;
    dirty(true);
  }, 60);
}
function resetCustom() {
  const base = state.custom ? state.custom.base : state.key;
  state.custom = null; custRun = null; computeDomains();
  selectKey(base === 'CUST' ? 'COMM' : base);
  syncControls(); buildMatrix();
}

/* ---------- tooltip & hover ---------- */
const tip = $('#tip');
function showTip(x, y, build) {
  tip.innerHTML = ''; build(tip); tip.hidden = false;
  const r = tip.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  let lx = x + 14, ly = y + 14;
  if (lx + r.width > vw - 8) lx = x - r.width - 14;
  if (ly + r.height > vh - 8) ly = y - r.height - 14;
  tip.style.left = Math.max(8, lx) + 'px'; tip.style.top = Math.max(8, ly) + 'px';
}
function hideTip() { tip.hidden = true; }
function laneIndexAt(e, cv) {
  const r = cv.getBoundingClientRect(); const axisW = 64 * chartScale(cv.getContext('2d'));
  const u = clamp((e.clientX - r.left) / (r.width - axisW), 0, 1);
  return Math.round(u * (NQ - 1));
}
function onLaneHover(e, L, cv) {
  const i = laneIndexAt(e, cv);
  state.hover = i; state.hoverLane = L.id; dirty();
  showTip(e.clientX, e.clientY, t => {
    t.append(el('h4', '', L.t + ' · ' + E.qLabel(i)));
    const rows = allKeys().map(k => ({ k, v: runFor(k)[L.s[0].k][i] }));
    if (i <= NOW) {
      L.s.forEach(S => { const r = el('div', 'r'); const k = el('i'); k.style.background = TH.ink; r.append(k, el('span', '', S.n + (i === NOW ? ' (today)' : '')), el('b', 'tnum', fmt(S.k, view.to[S.k][i]))); t.append(r); });
    } else {
      rows.sort((a, b) => b.v - a.v).forEach(({ k, v }) => {
        const r = el('div', 'r' + (k === state.key ? ' on' : '')); const kk = el('i'); kk.style.background = colorFor(k);
        r.append(kk, el('span', '', shortFor(k)), el('b', 'tnum', fmt(L.s[0].k, v))); t.append(r);
      });
      if (L.s.length > 1) t.append(el('p', '', L.s.slice(1).map(S => S.n + ': ' + fmt(S.k, view.to[S.k][i])).join(' · ') + ' (' + shortFor(state.key) + ')'));
    }
    const hk = E.HIST[L.s[0].k];
    t.append(el('p', 'src', i > NOW ? 'Scenario model output · ⓘ next to the lane title shows the formula' : (hk && hk.kind === 'idx' ? 'Illustrative history (index or assumption)' : 'History · dated public data') + ' · ⓘ shows the sources'));
  });
}

/* ---------- scrubber interaction ---------- */
function bindScrub() {
  const cv = $('#scrub');
  const idxAt = e => { const r = cv.getBoundingClientRect(); return clamp((e.clientX - r.left) / (r.width - 64 * chartScale(cv.getContext('2d'))), 0, 1) * (NQ - 1); };
  let drag = false;
  cv.addEventListener('pointerdown', e => { drag = true; cv.setPointerCapture(e.pointerId); jumpTo(Math.round(idxAt(e))); });
  cv.addEventListener('pointermove', e => {
    if (drag) { state.t = Math.round(idxAt(e)); dirty(true); return; }
    const i = Math.round(idxAt(e)); const ev = EVENTS.filter(x => x.i === i);
    const rg = regimeOf(i);
    showTip(e.clientX, e.clientY, t => { t.append(el('h4', '', E.qLabel(i) + ' · ' + rg.label)); if (!ev.length) t.append(el('p', '', 'Drag or click to move the cursor.')); ev.forEach(x => t.append(el('p', '', (x.kind === 'auto' ? '⚡ ' : '') + x.text))); });
  });
  cv.addEventListener('pointerup', () => { drag = false; });
  cv.addEventListener('pointerleave', () => { if (!drag) hideTip(); });
  cv.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); step(e.key === 'ArrowLeft' ? -1 : 1); }
    if (e.key === 'Home') { e.preventDefault(); state.t = 0; dirty(true); }
    if (e.key === 'End') { e.preventDefault(); state.t = NQ - 1; dirty(true); }
  });
}
function jumpTo(i) { state.firstPlay = false; stopTour(); setPlaying(false); state.t = clamp(i, 0, NQ - 1); dirty(true); }
function step(d) { state.firstPlay = false; stopTour(); setPlaying(false); state.t = clamp(Math.round(state.t) + d, 0, NQ - 1); dirty(true); }

/* ---------- network & heat hover ---------- */
function bindNet() {
  const cv = $('#net');
  const pick = $('#netPath'); NODES.forEach(n => { const o = el('option', '', n.l); o.value = n.id; pick.append(o); });
  pick.addEventListener('change', () => { netSelected = pick.value || null; dirty(); });
  cv.addEventListener('click', () => { netSelected = netHover === netSelected ? null : netHover; pick.value = netSelected || ''; dirty(); });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
    const n = NODES.find(n => n._box && x >= n._box[0] - 3 && x <= n._box[0] + n._box[2] + 3 && y >= n._box[1] - 3 && y <= n._box[1] + n._box[3] + 3);
    netHover = n ? n.id : null; dirty();
    if (!n) { hideTip(); return; }
    const f = state.t;
    showTip(e.clientX, e.clientY, t => {
      t.append(el('h4', '', n.l + ' · ' + E.qLabel(ci())));
      if (n.d) { const D = E.DRIVERS.find(x => x.k === n.d); const v = nodeVal(n, f); t.append(el('p', '', D.name + ': ' + Math.round(v * 100) + '/100 (today ' + Math.round(E.BASE[n.d] * 100) + '). ' + D.desc)); }
      else if (MET[n.k]) { const v = at(n.k, f), v0 = view.to[n.k][NOW]; const dl = delta(n.k, v, v0); const r2 = el('div', 'r'); r2.append(el('span', '', MET[n.k].n), el('b', 'tnum', fmt(n.k, v))); t.append(r2); t.append(el('p', '', 'vs today: ' + dl.txt)); }
      else { const v = at(n.k, f), v0 = view.to[n.k][NOW]; t.append(el('p', '', 'Average realised token price: $' + v.toFixed(3) + ' per 1M (today $' + v0.toFixed(2) + ')')); }
      const ins = EDGES.filter(x => x.b === n.id).map(x => NODE[x.a].l + (x.s > 0 ? ' ↑' : ' ↓'));
      const outs = EDGES.filter(x => x.a === n.id).map(x => NODE[x.b].l + (x.s > 0 ? ' ↑' : ' ↓'));
      if (ins.length) t.append(el('p', '', 'Driven by: ' + ins.join(', ')));
      if (outs.length) t.append(el('p', '', 'Pushes: ' + outs.join(', ')));
    });
  });
  cv.addEventListener('pointerleave', () => { netHover = null; hideTip(); dirty(); });
}
function heatHit(e) {
  const cv = $('#heat'), r = cv.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
  const row = HEAT.rows.find(rw => !rw.head && y >= rw.y && y < rw.y + HEAT.rowH);
  const i = Math.floor((x - HEAT.x0) / HEAT.colW) + NOW;
  return row && i >= NOW && i < NQ ? { row, i } : null;
}
function bindHeat() {
  const cv = $('#heat');
  cv.addEventListener('pointermove', e => {
    const hit = heatHit(e); const row = hit && hit.row, i = hit ? hit.i : -1;
    if (!row || i < NOW || i >= NQ) { HEAT.hover = null; HEAT.hoverRow = null; hideTip(); dirty(); return; }
    HEAT.hover = { idx: row.idx, i }; HEAT.hoverRow = row.idx; dirty();
    const imp = impactsOf(view.to); const v = imp.rows[row.idx][i]; const why = imp.why[row.idx][i] || [];
    showTip(e.clientX, e.clientY, t => {
      t.append(el('h4', '', row.r.n + ' · ' + E.qLabel(i)));
      const rr = el('div', 'r'); rr.append(el('span', '', 'Impact vs today'), el('b', 'tnum ' + (v >= 0 ? 'up' : 'dn'), (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)))); t.append(rr);
      why.forEach(w => { const p = el('div', 'r'); p.append(el('span', '', w.f + ' ' + (w.dir > 0 ? '▲' : w.dir < 0 ? '▼' : '■')), el('b', w.v >= 0 ? 'up' : 'dn', w.v >= 0 ? 'helps' : 'hurts')); t.append(p); });
      t.append(el('p', 'src', 'Model output · click the cell for the full calculation'));
    });
  });
  cv.addEventListener('pointerleave', () => { HEAT.hover = null; HEAT.hoverRow = null; hideTip(); dirty(); });
  cv.addEventListener('click', e => { const hit = heatHit(e); if (!hit) return; jumpTo(hit.i); document.dispatchEvent(new CustomEvent('aicx:heat', { detail: { row: hit.row.idx, i: hit.i, x: e.clientX, y: e.clientY } })); });
}

/* ---------- playback & tour ---------- */
const QPS = 4 / 3; // quarters per second at 1×
function setPlaying(p) {
  state.playing = p;
  $('#playTxt').textContent = p ? 'Pause' : 'Play';
  $('#playIco').innerHTML = p ? '<path d="M2 1h3v10H2zM7 1h3v10H7z"/>' : '<path d="M2 1l9 5-9 5z"/>';
  $('#bcPlay').textContent = p ? 'Pause' : 'Play';
  dirty(true);
}
function togglePlay() {
  if (state.playing) { setPlaying(false); return; }
  state.firstPlay = false;
  if (state.t >= NQ - 1.01) state.t = state.bc && state.from === 'start' ? 0 : NOW;
  setPlaying(true);
}
function stopTour() {
  if (!state.tour) return;
  state.tour = null; $('#bTour').setAttribute('aria-pressed', 'false'); $('#bcTour').setAttribute('aria-pressed', 'false'); titleCard = null;
}
let titleCard = null;
function startTour() {
  state.tour = { j: 0, phase: 'card', until: performance.now() + 2200 };
  $('#bTour').setAttribute('aria-pressed', 'true'); $('#bcTour').setAttribute('aria-pressed', 'true');
  beginTourScenario();
}
function beginTourScenario() {
  const s = PRE[state.tour.j];
  selectKey(s.key);
  state.t = state.tour.j === 0 && state.bc && state.from === 'start' ? 0 : NOW;
  setPlaying(false);
  state.tour.phase = 'card'; state.tour.until = performance.now() + 2200;
  titleCard = { s, n: state.tour.j + 1, t0: performance.now() };
  if (!state.bc) toast('Scenario ' + (state.tour.j + 1) + ' of ' + PRE.length + ': ' + s.name);
}
function tourTick(now) {
  const T = state.tour; if (!T) return;
  if (T.phase === 'card' && now >= T.until) { T.phase = 'play'; titleCard = null; setPlaying(true); }
  else if (T.phase === 'hold' && now >= T.until) {
    T.j++;
    if (T.j >= PRE.length) { stopTour(); if (rec) stopRec(); return; }
    beginTourScenario();
  }
}
function onPlayEnd() {
  setPlaying(false);
  if (state.tour) { state.tour.phase = 'hold'; state.tour.until = performance.now() + 1800; }
  else if (rec) setTimeout(() => { if (rec && !state.playing) stopRec(); }, 1200);
}

/* ---------- broadcast ---------- */
const BW = 1920, BH = 1080;
function drawBroadcast(now) {
  const cv = $('#bcv'); const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const f = state.t, c = ci(), key = state.key, col = colorFor(key), s = scnFor(key);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, BW, BH);
  // header
  ctx.fillStyle = TH.amber; ctx.fillRect(40, 34, 92, 34); font(ctx, 20, 700); ctx.fillStyle = '#0a0600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('AICX', 86, 52);
  ctx.fillStyle = TH.up; ctx.fillRect(138, 34, 50, 34); ctx.fillStyle = '#031107'; ctx.fillText('GO', 163, 52);
  ctx.textAlign = 'left'; font(ctx, 40, 800, FX, 'condensed'); ctx.fillStyle = TH.ink; ctx.fillText('AI COMMODITIZATION MONITOR', 206, 52);
  font(ctx, 15, 600); ctx.fillStyle = TH.amber; ctx.fillText('SCENARIO', 40, 100);
  // date first, so the scenario name can be fitted to the space left of it
  ctx.textAlign = 'right'; font(ctx, 104, 800, FX, 'condensed'); ctx.fillStyle = TH.ink; ctx.fillText(E.qLabel(c), 1880, 66);
  const dateW = ctx.measureText(E.qLabel(c)).width;
  ctx.textAlign = 'left';
  let nm = (key === 'CUST' ? 'CUSTOM · ' : '') + s.name.toUpperCase(), fs = 46; const maxW = 1880 - dateW - 60 - 150;
  font(ctx, fs, 800, FX, 'condensed'); while (ctx.measureText(nm).width > maxW && fs > 30) { fs -= 2; font(ctx, fs, 800, FX, 'condensed'); }
  while (ctx.measureText(nm).width > maxW && nm.length > 8) nm = nm.slice(0, -2) + '…';
  ctx.fillStyle = col; ctx.fillText(nm, 150, 102);
  ctx.textAlign = 'right';
  const rg = regimeOf(c); font(ctx, 16, 700); const rt = rg.label; const tw = ctx.measureText(rt).width + 34;
  ctx.strokeStyle = TONE[rg.tone]; ctx.lineWidth = 2; ctx.strokeRect(1880 - tw, 112, tw, 30); ctx.fillStyle = TONE[rg.tone];
  ctx.beginPath(); ctx.arc(1880 - tw + 13, 127, 5, 0, 7); ctx.fill(); ctx.textAlign = 'left'; ctx.fillText(rt, 1880 - tw + 24, 128);
  font(ctx, 14, 600); ctx.fillStyle = TH.ink3; ctx.textAlign = 'right';
  ctx.fillText(c < NOW ? 'HISTORY · REAL DATA' : c === NOW ? 'TODAY · OCTOBER 2026' : 'SCENARIO MODEL · NOT A FORECAST', 1880 - tw - 18, 128);
  ctx.textAlign = 'left';
  // scrubber
  drawScrub(ctx, 40, 150, 1840, 64, { f, events: EVENTS, big: 1.25, bg: '#050505' });
  // lanes
  const lanes = BC_LANES.map(id => LANES.find(L => L.id === id));
  const ly0 = 232, lh = 116, lgap = 8;
  lanes.forEach((L, j) => {
    const y = ly0 + j * (lh + lgap);
    ctx.fillStyle = '#0a0a0b'; ctx.fillRect(40, y, 1200, lh);
    font(ctx, 15, 700); ctx.fillStyle = TH.amber; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; let bt = (L.bt || L.t).toUpperCase(); while (ctx.measureText(bt).width > 262 && bt.length > 6) bt = bt.slice(0, -2) + '…'; ctx.fillText(bt, 54, y + 12);
    font(ctx, 11.5, 500); ctx.fillStyle = TH.ink3; let bu = L.u; while (ctx.measureText(bu).width > 262 && bu.length > 6) bu = bu.slice(0, -2) + '…'; ctx.fillText(bu, 54, y + 33);
    const S0 = L.s[0], v = at(S0.k, f), v0 = view.to[S0.k][NOW];
    font(ctx, 34, 700, FX, 'condensed'); ctx.fillStyle = f > NOW ? col : TH.ink; const t0 = fmt(S0.k, v); ctx.fillText(t0, 54, y + 52);
    if (f > NOW + 0.01) { const w0 = ctx.measureText(t0).width; const dl = delta(S0.k, v, v0); font(ctx, 13, 600); ctx.fillStyle = clsColor(dl.cls); ctx.fillText(dl.txt, 64 + w0, y + 66); }
    if (L.s[1]) { const S1 = L.s[1], v1 = at(S1.k, f), nm = S1.n.toUpperCase(); font(ctx, 11.5, 500); ctx.fillStyle = TH.ink3; ctx.fillText(nm, 54, y + 94); const nw = ctx.measureText(nm).width; font(ctx, 18, 700, FX, 'condensed'); ctx.fillStyle = TH.ink2; ctx.fillText(fmt(S1.k, v1), 62 + nw, y + 90); }
    drawLane(ctx, 330, y, 910, lh, L, { f, reveal: state.reveal && (state.playing || !!state.tour), big: 1.2, bg: '#0a0a0b' });
  });
  // KPI tiles
  const kp = ['R', 'ccov', 'prem', 'OS', 'PF', 'AU'];
  kp.forEach((k, j) => {
    const x = 1270 + (j % 3) * 205, y = 232 + Math.floor(j / 3) * 106;
    ctx.fillStyle = '#0a0a0b'; ctx.fillRect(x, y, 197, 98);
    font(ctx, 12, 700); ctx.fillStyle = TH.amber; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText((KPI_LABEL[k] || MET[k].n).toUpperCase(), x + 12, y + 11);
    const v = at(k, f), v0 = view.to[k][NOW];
    font(ctx, 36, 700, FX, 'condensed'); ctx.fillStyle = TH.ink; ctx.fillText(fmt(k, v), x + 12, y + 32);
    if (f > NOW + 0.01) { const dl = delta(k, v, v0); font(ctx, 12, 600); ctx.fillStyle = clsColor(dl.cls); ctx.fillText(dl.txt + ' vs today', x + 12, y + 74); }
    else { font(ctx, 12, 600); ctx.fillStyle = TH.ink3; ctx.fillText(c === NOW ? 'today' : 'history', x + 12, y + 74); }
  });
  font(ctx, 13, 700); ctx.fillStyle = TH.amber; ctx.fillText('PHASE PORTRAIT · PRICING POWER VS VALUATION', 1270, 452);
  drawPhase(ctx, 1270, 474, 610, 262, { f, reveal: state.reveal && (state.playing || !!state.tour), big: 1.25, bg: '#0a0a0b' });
  font(ctx, 13, 700); ctx.fillStyle = TH.amber; ctx.textBaseline = 'top'; ctx.fillText('CAUSAL MAP · HOW PRESSURE TRAVELS', 1270, 752);
  drawNet(ctx, 1270, 774, 610, 200, { f, time: now, big: 1.05, bg: '#0a0a0b' });
  // caption + tape
  const ev = latestEvent(c);
  ctx.fillStyle = TH.panel3; ctx.fillRect(40, 990, 1840, 56);
  ctx.fillStyle = TH.amber; ctx.fillRect(40, 990, 6, 56);
  font(ctx, 15, 700); ctx.fillStyle = TH.amber; ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillText(ev ? E.qLabel(ev.i) : '', 62, 1018);
  font(ctx, 28, 700, FX, 'condensed'); ctx.fillStyle = TH.ink;
  let cap = ev ? (ev.kind === 'auto' ? '⚡ ' : '') + ev.text : '';
  while (ctx.measureText(cap).width > 1640 && cap.length > 10) cap = cap.slice(0, -2) + '…';
  ctx.fillText(cap, 190, 1019);
  font(ctx, 11, 500); ctx.fillStyle = TH.ink3; ctx.textAlign = 'left'; ctx.fillText('Illustrative scenario model ' + E.VERSION + ' built on dated public data (company filings, Epoch AI, IEA, EIA, Census, TrendForce, ING). Not a forecast; not investment advice.', 40, 1064);
  ctx.textAlign = 'right'; ctx.fillText('History = dated data (dashed = index) · faint lines = other scenarios', 1880, 1064);
  // title card
  if (titleCard) {
    const a = clamp((now - titleCard.t0) / 300, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.82 * a) + ')'; ctx.fillRect(0, 0, BW, BH);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    font(ctx, 24, 700); ctx.fillStyle = TH.amber; ctx.fillText('SCENARIO ' + titleCard.n + ' OF ' + PRE.length, BW / 2, 400);
    font(ctx, 100, 800, FX, 'condensed'); ctx.fillStyle = titleCard.s.color; ctx.fillText(titleCard.s.name.toUpperCase(), BW / 2, 500);
    font(ctx, 30, 500, FX, 'semi-condensed'); ctx.fillStyle = TH.ink2;
    const first = titleCard.s.thesis.split('. ')[0] + '.';
    wrapText(ctx, first, BW / 2, 610, 1300, 42);
    ctx.globalAlpha = 1;
  }
}
function clsColor(c) { return c === 'up' ? TH.up : c === 'dn' ? TH.down : TH.neutral; }
function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '', yy = y;
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t; });
  if (line) ctx.fillText(line, x, yy);
}
let bcIdle = 0;
let bcTheme = null;
function openBroadcast() {
  if (THEME !== 'dark') { bcTheme = THEME; setTheme('dark', { persist: false }); }
  state.bc = true; $('#bc').hidden = false; document.body.style.overflow = 'hidden';
  const el2 = $('#bc'); if (el2.requestFullscreen) el2.requestFullscreen().catch(() => {});
  bcPoke();
  dirty(true);
}
function closeBroadcast() {
  if (rec) stopRec();
  state.bc = false; $('#bc').hidden = true; document.body.style.overflow = '';
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (bcTheme) { const t = bcTheme; bcTheme = null; setTheme(t, { persist: false }); }
  dirty(true);
}
function bcPoke() { const c = $('#bcCtl'); c.classList.remove('idle'); clearTimeout(bcIdle); bcIdle = setTimeout(() => { if (state.playing || state.tour) c.classList.add('idle'); }, 2600); }

/* ---------- capabilities: downloads (video, CSV) ---------- */
let DL = null;
const SITE_DL = SITE.mode === 'site';
async function saveFile(filename, data, type) {
  if (DL) return DL.save({ filename, data });
  if (SITE_DL) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.rel = 'noopener';
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  }
  const err = new Error('Saving files is not available here'); err.code = 'unavailable'; throw err;
}
(async () => {
  try { DL = window.claude && window.claude.use && SITE.mode !== 'site' ? await window.claude.use('downloads') : null; } catch (e) { DL = null; }
  const can = !!(DL || SITE_DL);
  const canRec = !!(can && typeof MediaRecorder !== 'undefined' && HTMLCanvasElement.prototype.captureStream);
  $('#bcRec').hidden = !canRec;
  $('#bCsv').hidden = !can;
  if (!canRec) $('#bcMsg').textContent = 'Tip: record this view with your screen recorder (Mac: ⇧⌘5 · Windows: Win+Alt+R).';
})();
let rec = null;
function pickMime() { const c = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']; return c.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || ''; }
function startRec() {
  if (!DL && !SITE_DL) return;
  const mime = pickMime();
  let stream;
  try { stream = $('#bcv').captureStream(30); } catch (e) { toast('Recording is not supported in this browser.'); return; }
  const chunks = [];
  let mr;
  try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8000000 } : { videoBitsPerSecond: 8000000 }); } catch (e) { toast('Recording is not supported in this browser.'); return; }
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  mr.onstop = async () => {
    const type = mr.mimeType || mime || 'video/webm';
    const ext = type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    const name = 'ai-commoditization-' + (state.tour ? 'tour' : shortFor(state.key).toLowerCase().replace(/[^a-z]+/g, '-')) + '.' + ext;
    try { await saveFile(name, blob, type); toast('Video saved: ' + name); }
    catch (err) { const code = err && err.code; toast(code === 'declined' ? 'Save cancelled.' : code === 'too_large' ? 'The video is too large to save here — try a shorter run.' : 'Could not save the video here. Use your screen recorder instead.'); }
  };
  mr.start(500);
  rec = mr;
  $('#bcRec').setAttribute('aria-pressed', 'true'); $('#bcRecTxt').textContent = 'Stop & save';
  if (!state.tour) { state.t = state.from === 'start' ? 0 : NOW; setPlaying(true); }
}
function stopRec() {
  if (!rec) return; const r = rec; rec = null;
  try { r.stop(); } catch (e) {}
  $('#bcRec').setAttribute('aria-pressed', 'false'); $('#bcRecTxt').textContent = 'Record';
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 4200); }
async function saveCsv() {
  if (!DL && !SITE_DL) return;
  const run = view.to, keys = ['K', 'R', 'CC', 'ccov', 'cov', 'VL', 'VN', 'Mult', 'S', 'Cs', 'Bs', 'G', 'Np', 'Pf', 'Pc', 'prem', 'mf', 'DC', 'Pp', 'GR', 'DR', 'LB', 'Ufp', 'Uopp', 'STp', 'SVp', 'OS', 'ES', 'LS', 'AS', 'TC', 'PF', 'SN', 'GDP', 'AUp', 'AUd', 'AU', 'CRp', 'BLD', 'AUa', 'AUdev', 'seatG', 'seatA', 'CtaskI'];
  const s = scnFor(state.key);
  const meta = '# AICX engine ' + E.VERSION + ' · scenario: ' + (state.key === 'CUST' ? 'custom fork of ' + s.name : s.name) + (state.key === 'CUST' ? ' · tilts: ' + (Object.entries(state.custom.offsets).filter(([, v]) => v).map(([d, v]) => d + (v > 0 ? '+' : '') + v).join(' ') || 'none') + ' · shocks: ' + (state.custom.shocks.map(x => x.id + '@' + E.qLabel(E.idxOf(x.t))).join(' ') || 'none') : '') + ' · history to Q4 2026, model after · illustrative';
  const head = ['quarter', 'regime'].concat(keys.map(k => '"' + MET[k].n + '"')).concat(E.DK.map(k => '"driver: ' + k + '"')).join(',');
  const lines = [meta, head];
  for (let i = 0; i < NQ; i++) lines.push([E.qLabel(i), (E.REGIMES[run.regime[i]] || {}).label].concat(keys.map(k => (isFinite(run[k][i]) ? +run[k][i].toPrecision(5) : ''))).concat(E.DK.map(k => +run.drivers[k][i].toFixed(3))).join(','));
  try { await saveFile('ai-commoditization-' + shortFor(state.key).toLowerCase().replace(/[^a-z]+/g, '-') + '.csv', lines.join('\n'), 'text/csv'); toast('CSV saved.'); }
  catch (err) { toast(err && err.code === 'declined' ? 'Save cancelled.' : 'Could not save the file here.'); }
}

/* ---------- render ---------- */
let isDirty = true, heavy = true;
function dirty(h) { isDirty = true; if (h) heavy = true; }
let netVisible = true;
function render(now) {
  const f = state.t;
  updateClock(); updateKpis(); updateLaneVals(); updateEventMarks(); updateOverview();
  if (heavy) { updateSigns(); updateMatrix(); updateWinners(); updateLens(); updateDriverMinis(); heavy = false; view.changed = false; }
  const sc = $('#scrub'); if (sc._w) drawScrub(ctxOf(sc), 0, 0, sc._w, sc._h, { f, events: EVENTS });
  const rev = state.reveal && (state.playing || !!state.tour);
  LANES.forEach(L => { const D = DOM.lanes[L.id]; if (D.row.hidden || !D.cv._w) return; drawLane(ctxOf(D.cv), 0, 0, D.cv._w, D.cv._h, L, { f, reveal: rev, hover: state.hoverLane ? state.hover : null }); D.row.classList.toggle('hl', state.hoverLane === L.id); });
  LENS_LANES.forEach(L => { const D = DOM.lens[L.id]; if (D.row.hidden || !D.cv._w) return; drawLane(ctxOf(D.cv), 0, 0, D.cv._w, D.cv._h, L, { f, reveal: rev, hover: state.hoverLane ? state.hover : null }); D.row.classList.toggle('hl', state.hoverLane === L.id); });
  const ph = $('#phase'); if (ph._w) drawPhase(ctxOf(ph), 0, 0, ph._w, ph._h, { f, reveal: rev });
  const po = $('#pools'); if (po._w) drawPools(ctxOf(po), 0, 0, po._w, po._h, { f });
  const ht = $('#heat'); if (ht._w) { const need = heatLayout(ht._w); if (Math.abs(ht._h - need) > 1) ht.style.height = need + 'px'; drawHeat(ctxOf(ht), ht._w, ht._h); }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state.tour) tourTick(now);
  if (state.playing) {
    const prev = Math.round(state.t);
    state.t = Math.min(NQ - 1, state.t + dt * QPS * state.speed);
    if (Math.round(state.t) !== prev) heavy = true;
    if (state.t >= NQ - 1) onPlayEnd();
    isDirty = true;
  }
  if (view.p < 1) { view.p = Math.min(1, view.p + dt / 0.6); isDirty = true; if (view.p >= 1) { view.from = null; heavy = true; } }
  const did = isDirty;
  if (isDirty) { isDirty = false; render(now); }
  const nt = $('#net'); if (nt._w && netVisible && (!REDUCED || did)) drawNet(ctxOf(nt), 0, 0, nt._w, nt._h, { f: state.t, time: now });
  if (state.bc) drawBroadcast(now);
  requestAnimationFrame(frame);
}

/* Accessible current readings mirror the chart data; no separate model or assumptions. */
function readingsFor(id) {
  const metricRows = keys => [...new Set(keys)].map(k => [MET[k].n, fmt(k, at(k, state.t))]);
  if (id === 'lanes' || id === 'lens') return metricRows((id === 'lanes' ? LANES : LENS_LANES).flatMap(L => L.s.map(S => S.k)));
  if (id === 'drivers') return E.DRIVERS.map(d => [d.name, Math.round(lerpAt(i => view.to.drivers[d.k][i], state.t) * 100) + '/100']);
  if (id === 'net') return NODES.map(n => [n.l, n.d ? Math.round(nodeVal(n, state.t) * 100) + '/100' : MET[n.k] ? fmt(n.k, nodeVal(n, state.t)) : '$' + nodeVal(n, state.t).toFixed(3) + ' per 1M tokens']);
  if (id === 'phase') return metricRows(['prem', 'Mult']);
  if (id === 'pools') return poolShares(ci()).map((v, i) => [POOL_SHORT[i], Math.round(v * 100) + '%']);
  if (id === 'heat') return E.IMPACT_ROWS.map((r, i) => [r.n, Math.round(impactsOf(view.to).rows[i][ci()]) + ' (−100 to +100 impact index)']);
  return [];
}
function updateReadingsTable(detail) {
  let table = detail.querySelector('table'); if (!table) { table = el('table'); detail.append(table); }
  table.replaceChildren(); const caption = el('caption', '', nameFor(state.key) + ' · ' + E.qLabel(ci())); table.append(caption);
  const head = el('thead'), hr = el('tr'); hr.append(el('th', '', 'Measure'), el('th', '', 'Current reading')); head.append(hr); table.append(head);
  const body = el('tbody'); readingsFor(detail.dataset.readingsPanel).forEach(([label, value]) => { const row = el('tr'); row.append(el('th', '', label), el('td', '', value)); body.append(row); }); table.append(body);
}
let lastOverview = '';
function updateOverview() {
  const stamp = state.key + '|' + ci() + '|' + (view.to._stamp || '') + '|' + view.p;
  if (stamp === lastOverview) return; lastOverview = stamp;
  $('#heroWhen').textContent = E.qLabel(ci()) + (ci() > NOW ? ' · scenario values' : ' · historical / starting values');
  const box = $('#heroNumbers'); box.replaceChildren();
  ['K', 'R', 'Pc'].forEach(k => { const item = el('div'); item.append(el('strong', '', fmt(k, at(k, state.t))), el('span', '', k === 'K' ? 'Big-4 capex / year' : k === 'R' ? 'AI revenue / year' : 'Good-enough price / 1M tokens')); box.append(item); });
  ['net', 'phase', 'pools', 'heat'].forEach(id => { const cv = $('#' + id); cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', cv.closest('[data-panel]').dataset.title + ', ' + E.qLabel(ci()) + ': ' + readingsFor(id).map(r => r.join(' ')).join('; ')); });
  $('#scrub').setAttribute('aria-label', 'Timeline scrubber, ' + E.qLabel(ci()) + '. Arrow keys move one quarter; view the scenario matrix for readings.');
  $('#bcv').setAttribute('aria-label', 'Broadcast: ' + nameFor(state.key) + ', ' + E.qLabel(ci()) + '. ' + ['K', 'R', 'Pc'].map(k => MET[k].n + ' ' + fmt(k, at(k, state.t))).join('; '));
  document.querySelectorAll('.chart-readings[open]').forEach(updateReadingsTable);
}

/* ---------- wiring ---------- */
function wire() {
  $('#textSize').addEventListener('change', e => setTextSize(e.target.value === 'auto' ? 'auto' : Number(e.target.value)));
  window.addEventListener('resize', () => { if (TEXT_MODE === 'auto' && TEXT_SIZE !== automaticTextSize()) setTextSize('auto'); });
  const menus = [...document.querySelectorAll('.header-menu')];
  menus.forEach(menu => menu.addEventListener('toggle', () => { if (menu.open) menus.forEach(other => { if (other !== menu) other.open = false; }); }));
  document.addEventListener('pointerdown', e => { if (e.target.closest('.overlay, #lmenu')) return; menus.forEach(menu => { if (!menu.contains(e.target)) menu.open = false; }); });
  $('#introDetail').hidden = load('aimonitor.intro-dismissed') === true;
  $('#bIntroDismiss').addEventListener('click', () => { $('#introDetail').hidden = true; store('aimonitor.intro-dismissed', true); $('#frame').focus(); });
  $('#bIntroTour').addEventListener('click', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.startTour(); });
  $('#bIntroRead').addEventListener('click', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.openExplainer('scenarios', $('#bIntroRead')); });
  const syncWire = () => { $('.wire').classList.toggle('is-paused', wirePaused); $('#bWirePause').setAttribute('aria-pressed', String(wirePaused)); $('#bWirePause').textContent = wirePaused ? 'Resume' : 'Pause'; $('#bWirePause').setAttribute('aria-label', (wirePaused ? 'Resume' : 'Pause') + ' event ticker'); };
  syncWire();
  $('#bWirePause').addEventListener('click', () => { wirePaused = !wirePaused; store('aimonitor.events-paused', wirePaused); syncWire(); lastEvI = -1; dirty(); });
  document.querySelectorAll('.section-nav a').forEach(a => a.addEventListener('click', () => { const panel = $(a.getAttribute('href')); if (panel) { panel.classList.remove('phone-collapsed'); const b = panel.querySelector('.panel-collapse'); if (b) b.setAttribute('aria-expanded', 'true'); } }));
  $('#bPlay').addEventListener('click', () => { stopTour(); togglePlay(); });
  $('#bStart').addEventListener('click', () => jumpTo(0));
  $('#bNow').addEventListener('click', () => jumpTo(NOW));
  $('#speed').addEventListener('change', e => { state.speed = +e.target.value; });
  $('#bTour').addEventListener('click', () => { state.tour ? (stopTour(), setPlaying(false)) : startTour(); });
  $('#bBroadcast').addEventListener('click', openBroadcast);
  $('#bHelp').addEventListener('click', () => { if (window.AICX_GUIDE) window.AICX_GUIDE.toggleMenu(); else { $('#help').hidden = false; $('#bHelpX').focus(); } });
  $('#bHelpX').addEventListener('click', () => { $('#help').hidden = true; });
  $('#help').addEventListener('click', e => { if (e.target.id === 'help') $('#help').hidden = true; });
  $('#bReset').addEventListener('click', resetCustom);
  $('#reveal').addEventListener('change', e => { state.reveal = e.target.checked; dirty(); });
  $('#bCsv').addEventListener('click', saveCsv);
  $('#bcExit').addEventListener('click', closeBroadcast);
  $('#bcPlay').addEventListener('click', () => { stopTour(); togglePlay(); bcPoke(); });
  $('#bcFrom').addEventListener('click', () => { state.from = state.from === 'start' ? 'now' : 'start'; $('#bcFrom').textContent = state.from === 'start' ? 'From 2023' : 'From today'; state.t = state.from === 'start' ? 0 : NOW; dirty(true); bcPoke(); });
  $('#bcTour').addEventListener('click', () => { state.tour ? (stopTour(), setPlaying(false)) : startTour(); bcPoke(); });
  $('#bcRec').addEventListener('click', () => { rec ? stopRec() : startRec(); bcPoke(); });
  $('#bc').addEventListener('pointermove', bcPoke);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && state.bc) bcPoke(); });
  document.addEventListener('keydown', e => {
    const t = e.target && e.target.closest ? e.target : null;
    if (e.key === 'Escape') { if (closeTopLayer()) return; if (!$('#help').hidden) $('#help').hidden = true; else if (state.bc) closeBroadcast(); return; }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (t && t !== document.body && t.closest('button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="checkbox"], [role="switch"], [role="slider"]')) return;
    if (t && t.closest('.overlay, .dialog, .chat, .menu, .tour-card, .xpl, .prov, .gtip, #lmenu, #gmenu')) return;
    if (document.querySelector('.overlay:not([hidden])') || (window.AICX_GUIDE && window.AICX_GUIDE.blocking())) return;
    if (e.key === ' ') { e.preventDefault(); stopTour(); togglePlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (/^[1-9]$/.test(e.key) && +e.key <= PRE.length) { stopTour(); selectKey(PRE[+e.key - 1].key); }
    else if (e.key === String(PRE.length + 1) && custRun) { stopTour(); selectKey('CUST'); }
    else if (e.key === 'b' || e.key === 'B') { state.bc ? closeBroadcast() : openBroadcast(); }
    else if (e.key === 't' || e.key === 'T') { state.tour ? (stopTour(), setPlaying(false)) : startTour(); }
    else if (e.key === '?') { if (window.AICX_GUIDE) window.AICX_GUIDE.toggleMenu(); else $('#help').hidden = false; }
  });
  const io = new IntersectionObserver(es => { es.forEach(x => { netVisible = x.isIntersecting; if (netVisible) dirty(); }); });
  io.observe($('#net'));
  const hdr = $('#cmd');
  new ResizeObserver(() => { document.documentElement.style.setProperty('--hdr-h', hdr.offsetHeight + 'px'); }).observe(hdr);
}

/* ---------- text size and theme switching ---------- */
function setTextSize(value) {
  if (value !== 'auto' && !TEXT_SIZES.includes(value)) return;
  TEXT_MODE = value;
  TEXT_SIZE = value === 'auto' ? automaticTextSize() : value;
  store(TEXT_SIZE_KEY, TEXT_MODE === 'auto' ? null : TEXT_MODE);
  applyTextSizeTokens();
  HEAT.rowH = (HEAT_ROW[(LAYOUT.size || {}).heat || 'm'] || HEAT_ROW.m) * textScale();
  hideTip();
  dirty(true);
}
function setTheme(t, opt) {
  opt = opt || {};
  const next = t === 'light' ? 'light' : 'dark';
  if (opt.persist !== false) store('aimonitor.theme', next);
  if (next === THEME && document.documentElement.getAttribute('data-theme') === next && !opt.force) return;
  THEME = next;
  document.documentElement.setAttribute('data-theme', THEME);
  applyThemeVars();
  buildTabs(); syncControls(); buildLegend(); buildPoolLegend(); buildEvents(); buildMatrix(); updateMatrix();
  lastWL = -2; lastLens = '';
  document.dispatchEvent(new CustomEvent('aicx:theme', { detail: THEME }));
  dirty(true);
}
// follow an explicit theme the host page sets (e.g. the claude.ai viewer), unless the visitor chose one here
new MutationObserver(() => {
  const host = document.documentElement.getAttribute('data-theme');
  if ((host === 'light' || host === 'dark') && host !== THEME && !bcTheme) setTheme(host, { persist: false });
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ---------- layout customisation: panel order, size, full-width pin, hide, focus view, KPI tiles, lanes ---------- */
const LAYOUT_KEY = 'aimonitor.layout.v1';
const LANE_H = { compact: 60, normal: 84, tall: 124, xl: 170 };
const HEAT_ROW = { s: 14, m: 17, l: 22, xl: 28 };
const SIZE_SEQ = ['s', 'm', 'l', 'xl'];
const newLayout = () => ({ v: 1, order: {}, hidden: [], size: {}, pinned: [], kpis: KPI_DEFAULT.slice(), lanesHidden: [], laneH: 'normal' });
const PRESETS = {
  default: { n: 'Default', d: 'The standard terminal layout', make: () => newLayout() },
  charts: { n: 'Big charts', d: 'Phase portrait full width, larger charts and lanes', make: () => Object.assign(newLayout(), { pinned: ['phase'], size: { phase: 'xl', net: 'l', pools: 'l' }, laneH: 'tall' }) },
  presenter: { n: 'Presenter', d: 'Fewer tables, big charts for screens and calls', make: () => Object.assign(newLayout(), { pinned: ['phase'], size: { phase: 'xl', net: 'l' }, laneH: 'tall', hidden: ['drivers', 'shocks', 'signs', 'xwatch', 'matrix', 'ledger', 'thesis', 'factors'] }) },
  compact: { n: 'Compact', d: 'Everything smaller, more on one screen', make: () => Object.assign(newLayout(), { size: { net: 's', phase: 's', pools: 's', heat: 's', events: 's', xwatch: 's' }, laneH: 'compact', hidden: ['factors'] }) }
};
let LAYOUT = newLayout();
const PANELS = {};          // id -> { el, home }
let DEFAULT_ORDER = {};     // containerId -> [movable ids]
const DEFAULT_ANCHOR = {};  // containerId -> fixed element that follows the movables (e.g. the footer), or null
let customizing = false;
const movId = n => n.dataset.panel || n.dataset.block;
const movables = c => [...c.children].filter(n => n.dataset && (n.dataset.panel || n.dataset.block));
const containers = () => ['colLeft', 'colCenter', 'colRight', 'colSide', 'rowImpact', 'rowThesis', 'frame'].map(id => document.getElementById(id)).filter(Boolean);
function findMovable(id) { return document.querySelector('[data-panel="' + id + '"]') || document.querySelector('[data-block="' + id + '"]'); }
function snapshotOrder() { const o = {}; containers().forEach(c => { const m = movables(c); o[c.id] = m.map(movId); DEFAULT_ANCHOR[c.id] = m.length ? m[m.length - 1].nextElementSibling : null; }); return o; }
const anchorIn = c => { const a = DEFAULT_ANCHOR[c.id]; return a && a.parentElement === c ? a : null; };
function saveLayout() { store(LAYOUT_KEY, LAYOUT); }
function placeInOrder(c, ids) {
  const a = anchorIn(c);
  ids.forEach(id => { const n = findMovable(id); if (n && n.parentElement === c) c.insertBefore(n, a); });
}
function homeAll() {
  // every movable back to its default container and position
  containers().forEach(c => (DEFAULT_ORDER[c.id] || []).forEach(id => { const n = findMovable(id); if (n && n.parentElement !== c && !n.classList.contains('is-focus')) c.insertBefore(n, anchorIn(c)); }));
  containers().forEach(c => { const d = DEFAULT_ORDER[c.id]; if (d) placeInOrder(c, d); });
}
function applyLayout() {
  if (focusEl) closeFocus();
  homeAll();
  Object.entries(LAYOUT.order || {}).forEach(([cid, ids]) => {
    const c = document.getElementById(cid); if (!c || !DEFAULT_ORDER[cid]) return;
    const known = ids.filter(id => DEFAULT_ORDER[cid].includes(id));
    DEFAULT_ORDER[cid].forEach(id => { if (!known.includes(id)) known.push(id); });
    placeInOrder(c, known);
  });
  const stage = $('#stage');
  (LAYOUT.pinned || []).forEach(id => { const P = PANELS[id]; if (P) stage.append(P.el); });
  stage.hidden = !stage.children.length;
  Object.values(PANELS).forEach(P => {
    const id = P.el.dataset.panel;
    P.el.hidden = (LAYOUT.hidden || []).includes(id);
    const sz = (LAYOUT.size || {})[id];
    if (sz && sz !== 'm') P.el.dataset.size = sz; else delete P.el.dataset.size;
    updatePanelControls(P.el);
  });
  HEAT.rowH = (HEAT_ROW[(LAYOUT.size || {}).heat || 'm'] || HEAT_ROW.m) * textScale();
  document.documentElement.style.setProperty('--lane-h', (LANE_H[LAYOUT.laneH] || 84) + 'px');
  const ks = (LAYOUT.kpis || KPI_DEFAULT).filter(k => MET[k]).slice(0, 12);
  KPIS = ks.length ? ks : KPI_DEFAULT.slice();
  buildKpis();
  applyLaneVisibility();
  dirty(true);
}
function applyLaneVisibility() {
  const hiddenL = new Set(LAYOUT.lanesHidden || []);
  GROUPS.forEach(G => {
    const lanes = LANES.filter(L => L.g === G.g);
    lanes.forEach(L => { const D = DOM.lanes[L.id]; if (D) D.row.hidden = !!state.closed[G.g] || hiddenL.has(L.id); });
    const gh = document.querySelector('#lanes .grp[data-g="' + G.g + '"]');
    if (gh) gh.hidden = lanes.every(L => hiddenL.has(L.id));
  });
}
function commit() { saveLayout(); syncLayoutMenu(); }
function setSize(id, sz) { LAYOUT.size = LAYOUT.size || {}; if (sz === 'm') delete LAYOUT.size[id]; else LAYOUT.size[id] = sz; applyOne(id); commit(); }
function cycleSize(id) { const cur = (LAYOUT.size || {})[id] || 'm'; setSize(id, SIZE_SEQ[(SIZE_SEQ.indexOf(cur) + 1) % SIZE_SEQ.length]); toast(PANELS[id].el.dataset.title + ': size ' + ((LAYOUT.size || {})[id] || 'm').toUpperCase()); }
function applyOne(id) {
  const el2 = PANELS[id].el, sz = (LAYOUT.size || {})[id];
  if (sz && sz !== 'm') el2.dataset.size = sz; else delete el2.dataset.size;
  if (id === 'heat') HEAT.rowH = (HEAT_ROW[sz || 'm'] || HEAT_ROW.m) * textScale();
  updatePanelControls(el2); dirty(true);
}
function movePanel(id, dir) {
  const n = findMovable(id); const c = n && n.parentElement; if (!c || c.id === 'focus') return;
  const list = movables(c).filter(x => !x.hidden || x === n); const i = list.indexOf(n), j = i + dir;
  if (j < 0 || j >= list.length) { toast('Already at the ' + (dir < 0 ? 'top' : 'bottom') + ' of this column.'); return; }
  if (dir < 0) c.insertBefore(n, list[j]); else c.insertBefore(list[j], n);
  if (c.id === 'stage') LAYOUT.pinned = movables(c).map(movId);
  else { LAYOUT.order = LAYOUT.order || {}; LAYOUT.order[c.id] = movables(c).map(movId); }
  commit(); dirty(true);
  const b = n.querySelector('.pc [data-act="' + (dir < 0 ? 'up' : 'down') + '"]'); if (b) b.focus();
}
function togglePin(id) {
  LAYOUT.pinned = LAYOUT.pinned || [];
  const i = LAYOUT.pinned.indexOf(id);
  if (i >= 0) LAYOUT.pinned.splice(i, 1); else LAYOUT.pinned.push(id);
  applyLayout(); commit();
  if (i < 0) { PANELS[id].el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' }); toast(PANELS[id].el.dataset.title + ' pinned full width at the top.'); }
}
function hidePanel(id, on) {
  LAYOUT.hidden = (LAYOUT.hidden || []).filter(x => x !== id); if (on) LAYOUT.hidden.push(id);
  PANELS[id].el.hidden = !!on; commit(); dirty(true);
  if (on) toast(PANELS[id].el.dataset.title + ' hidden. Show it again from Layout.');
}
function resetLayout() { LAYOUT = newLayout(); applyLayout(); commit(); toast('Layout reset to default.'); }
function applyPreset(k) { LAYOUT = PRESETS[k].make(); applyLayout(); commit(); closeLayoutMenu(); toast('Layout: ' + PRESETS[k].n + ' · Reset to default is in the Layout menu'); }

/* focus (expanded) view */
let focusEl = null, focusHome = null, focusNext = null;
function openFocus(id) {
  const P = PANELS[id]; if (!P) return;
  if (focusEl) closeFocus();
  if (P.el.hidden) hidePanel(id, false);
  let ov = $('#focus');
  if (!ov) {
    ov = el('div', 'focus'); ov.id = 'focus'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.addEventListener('click', e => { if (e.target === ov) closeFocus(); });
    ov.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const f = [...ov.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"]):not([disabled])')].filter(x => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
    const close = el('button', 'btn focus-close', 'Close expanded view'); close.type = 'button'; close.addEventListener('click', closeFocus); ov.append(close);
    document.body.append(ov);
  }
  focusHome = P.el.parentElement; focusNext = P.el.nextSibling;
  P.el.querySelectorAll('canvas').forEach(cv => { cv._normalWidth = cv.clientWidth; });
  ov.setAttribute('aria-label', P.el.dataset.title + ' (expanded)');
  ov.append(P.el); ov.hidden = false; P.el.classList.add('is-focus'); focusEl = P.el;
  document.body.classList.add('focusing'); updatePanelControls(P.el);
  const b = ov.querySelector('.focus-close'); if (b) b.focus();
  dirty(true);
}
function closeFocus() {
  if (!focusEl) return false;
  const P = focusEl; focusEl = null;
  P.classList.remove('is-focus');
  if (focusHome) focusHome.insertBefore(P, focusNext && focusNext.parentElement === focusHome ? focusNext : null);
  const ov = $('#focus'); if (ov) ov.hidden = true;
  document.body.classList.remove('focusing'); updatePanelControls(P);
  const b = P.querySelector('.pc [data-act="focus"]'); if (b) b.focus();
  dirty(true);
  return true;
}
function closeTopLayer() {
  const S = window.AICX_SITE, G = window.AICX_GUIDE;
  if (G && G.closeTop && G.closeTop()) return true;             // glossary tip, provenance popover, tour, guide menu
  if (S && S.closeDialog && S.closeDialog()) return true;      // site dialogs sit above the dashboard
  if (G && G.closeLow && G.closeLow()) return true;             // explainer drawer
  const m = $('#lmenu'); if (m && !m.hidden) { closeLayoutMenu(); return true; }
  if (focusEl) { closeFocus(); return true; }
  if (customizing) { setCustomizing(false); return true; }
  if (S && S.closeChat && S.closeChat()) return true;
  const menu = $('.header-menu[open]'); if (menu) { menu.open = false; $('summary', menu).focus(); return true; }
  return false;
}

/* per-panel header controls */
const ICO = {
  info: '<svg viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.6a5.4 5.4 0 1 1 0 10.8A5.4 5.4 0 0 1 8 2.6zM7.2 7h1.6v4.5H7.2zm0-2.7h1.6v1.6H7.2z"/></svg>',
  focus: '<svg viewBox="0 0 12 12"><path d="M1 1h4v1.5H2.5V5H1zM7 1h4v4H9.5V2.5H7zM1 7h1.5v2.5H5V11H1zM9.5 7H11v4H7V9.5h2.5z"/></svg>',
  unfocus: '<svg viewBox="0 0 12 12"><path d="M3.5 1H5v4H1V3.5h2.5zM7 1h1.5v2.5H11V5H7zM1 7h4v4H3.5V8.5H1zM7 7h4v1.5H8.5V11H7z"/></svg>',
  up: '<svg viewBox="0 0 12 12"><path d="M6 2l5 6H1z"/></svg>',
  down: '<svg viewBox="0 0 12 12"><path d="M6 10L1 4h10z"/></svg>',
  pin: '<svg viewBox="0 0 12 12"><path d="M0 1h12v1.6H0zM2 4h8v7H2z"/></svg>',
  hide: '<svg viewBox="0 0 12 12"><path d="M2.1 1L6 4.9 9.9 1 11 2.1 7.1 6 11 9.9 9.9 11 6 7.1 2.1 11 1 9.9 4.9 6 1 2.1z"/></svg>'
};
function addPanelControls(p) {
  const ph = [...p.children].find(n => n.classList && n.classList.contains('ph')); if (!ph) return;
  const id = p.dataset.panel, pc = el('span', 'pc'); pc.setAttribute('role', 'group'); pc.setAttribute('aria-label', p.dataset.title + ' layout controls');
  const mk = (act, title, html, cls) => { const b = el('button', cls || ''); b.type = 'button'; b.dataset.act = act; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = html; pc.append(b); return b; };
  mk('info', 'What is this? How to read it, method and sources', ICO.info, 'info');
  mk('up', 'Move up', ICO.up, 'cz'); mk('down', 'Move down', ICO.down, 'cz');
  if (p.dataset.sizes) mk('size', 'Size: click to cycle S · M · L · XL', 'M', 'sz');
  mk('pin', 'Pin full width at the top', ICO.pin, 'cz');
  mk('hide', 'Hide this panel', ICO.hide, 'cz');
  mk('focus', 'Expand (Esc to close)', ICO.focus);
  if (['drivers', 'shocks', 'net', 'phase', 'pools', 'signs', 'events', 'ledger', 'thesis', 'factors'].includes(id)) {
    const collapsed = load('aimonitor.panel-collapsed.' + id) !== false;
    p.classList.toggle('phone-collapsed', collapsed);
    const toggle = mk('collapse', 'Show or collapse ' + p.dataset.title, 'Details', 'panel-collapse'); toggle.setAttribute('aria-expanded', String(!collapsed));
  }
  if (p.querySelector('canvas')) {
    const details = el('details', 'chart-readings'); details.dataset.readingsPanel = id;
    const summary = el('summary', '', 'View current readings as a table'); details.append(summary); details.addEventListener('toggle', () => { if (details.open) updateReadingsTable(details); });
    p.append(details);
  }
  pc.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
    const a = b.dataset.act;
    if (a === 'info') { if (window.AICX_GUIDE) window.AICX_GUIDE.openExplainer(id, b); }
    else if (a === 'focus') { focusEl === p ? closeFocus() : openFocus(id); }
    else if (a === 'collapse') { const collapsed = p.classList.toggle('phone-collapsed'); b.setAttribute('aria-expanded', String(!collapsed)); store('aimonitor.panel-collapsed.' + id, collapsed); dirty(true); }
    else if (a === 'size') cycleSize(id);
    else if (a === 'up') movePanel(id, -1);
    else if (a === 'down') movePanel(id, 1);
    else if (a === 'pin') togglePin(id);
    else if (a === 'hide') hidePanel(id, true);
  });
  ph.append(pc);
}
function updatePanelControls(p) {
  const pc = p.querySelector(':scope > .ph > .pc'); if (!pc) return;
  const id = p.dataset.panel;
  const sz = pc.querySelector('[data-act="size"]'); if (sz) sz.textContent = ((LAYOUT.size || {})[id] || 'm').toUpperCase();
  const f = pc.querySelector('[data-act="focus"]'); if (f) { const on = focusEl === p; f.innerHTML = on ? ICO.unfocus : ICO.focus; f.title = on ? 'Close the expanded view (Esc)' : 'Expand (Esc to close)'; f.setAttribute('aria-label', f.title); }
  const pin = pc.querySelector('[data-act="pin"]'); if (pin) { const on = (LAYOUT.pinned || []).includes(id); pin.setAttribute('aria-pressed', String(on)); pin.title = on ? 'Unpin: return to its column' : 'Pin full width at the top'; pin.setAttribute('aria-label', pin.title); }
}

/* customise mode + layout menu */
function setCustomizing(on) {
  customizing = !!on; document.body.classList.toggle('customizing', customizing);
  let bar = $('#custBar');
  if (!bar) {
    bar = el('div', 'custbar'); bar.id = 'custBar'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Customize layout');
    bar.append(el('span', '', 'Customizing: ▲▼ move · S/M/L/XL size · pin full width · ✕ hide'));
    const r = el('button', 'btn', 'Reset to default'); r.type = 'button'; r.addEventListener('click', resetLayout);
    const d = el('button', 'btn primary', 'Done'); d.type = 'button'; d.addEventListener('click', () => setCustomizing(false));
    bar.append(r, d); document.body.append(bar);
  }
  bar.hidden = !customizing; syncLayoutMenu();
}
function closeLayoutMenu() { const m = $('#lmenu'); if (m) m.hidden = true; const b = $('#bLayout'); if (b) b.setAttribute('aria-expanded', 'false'); }
function syncLayoutMenu() { const m = $('#lmenu'); if (m && !m.hidden) buildLayoutMenu(m); }
function buildLayoutMenu(m) {
  m.innerHTML = '';
  const h = t => m.append(el('h4', '', t));
  const item = (txt, sub, fn) => { const b = el('button', 'mi'); b.type = 'button'; b.append(document.createTextNode(txt)); if (sub) b.append(el('small', '', sub)); b.addEventListener('click', fn); m.append(b); return b; };
  h('Panels');
  item(customizing ? 'Finish customizing' : 'Customize panels…', customizing ? 'on' : 'move · size · pin · hide', () => { setCustomizing(!customizing); closeLayoutMenu(); });
  const hid = (LAYOUT.hidden || []).filter(id => PANELS[id]);
  if (hid.length) { m.append(el('p', 'hint', 'Hidden panels:')); hid.forEach(id => item('Show ' + PANELS[id].el.dataset.title, '', () => hidePanel(id, false))); }
  h('Presets');
  Object.entries(PRESETS).forEach(([k, P]) => item(P.n, P.d, () => applyPreset(k)));
  h('Lane height');
  const row = el('div', 'row'), seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Lane height');
  Object.keys(LANE_H).forEach(k => { const b = el('button', '', k); b.type = 'button'; b.setAttribute('aria-pressed', String((LAYOUT.laneH || 'normal') === k)); b.addEventListener('click', () => { LAYOUT.laneH = k; document.documentElement.style.setProperty('--lane-h', LANE_H[k] + 'px'); commit(); dirty(true); }); seg.append(b); });
  row.append(seg); m.append(row);
  h('KPI tiles · up to 12');
  const kc = el('div', 'checks');
  const order = KPI_DEFAULT.concat(Object.keys(MET).filter(k => KPI_DEFAULT.indexOf(k) < 0 && k !== 'PLAT'));
  order.forEach(k => {
    const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = KPIS.includes(k); cb.disabled = !cb.checked && KPIS.length >= 12;
    cb.addEventListener('change', () => { const cur = KPIS.slice(); if (cb.checked) { if (cur.length < 12) cur.push(k); } else if (cur.length > 1) cur.splice(cur.indexOf(k), 1); else cb.checked = true; LAYOUT.kpis = cur; KPIS = cur; buildKpis(); commit(); dirty(true); });
    lab.append(cb, el('span', '', KPI_LABEL[k] || MET[k].n)); lab.title = MET[k].n; kc.append(lab);
  });
  m.append(kc);
  h('Timeline lanes');
  const lc = el('div', 'checks');
  LANES.forEach(L => {
    const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !(LAYOUT.lanesHidden || []).includes(L.id);
    cb.addEventListener('change', () => { const s2 = new Set(LAYOUT.lanesHidden || []); cb.checked ? s2.delete(L.id) : s2.add(L.id); LAYOUT.lanesHidden = [...s2]; applyLaneVisibility(); commit(); dirty(true); });
    lab.append(cb, el('span', '', L.bt || L.t)); lab.title = L.t; lc.append(lab);
  });
  m.append(lc);
  m.append(el('hr'));
  const rb = el('button', 'btn primary reset', 'Reset to default'); rb.type = 'button'; rb.addEventListener('click', () => { resetLayout(); buildLayoutMenu(m); }); m.append(rb);
  m.append(el('p', 'hint', 'Your layout is remembered in this browser only. Theme: use the sun/moon button.'));
}
function openLayoutMenu() {
  let m = $('#lmenu');
  if (!m) { m = el('div', 'menu'); m.id = 'lmenu'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-label', 'Layout'); document.body.append(m); document.addEventListener('pointerdown', e => { const mm = $('#lmenu'); if (mm && !mm.hidden && !mm.contains(e.target) && e.target.id !== 'bLayout') closeLayoutMenu(); }); }
  buildLayoutMenu(m); m.hidden = false;
  const b = $('#bLayout'), r = b.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 24);
  m.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w)) + 'px';
  m.style.top = Math.min(r.bottom + 6, window.innerHeight - 120) + 'px';
  b.setAttribute('aria-expanded', 'true');
  const first = m.querySelector('button'); if (first) first.focus();
}
function initLayout() {
  document.querySelectorAll('[data-panel]').forEach(p => { PANELS[p.dataset.panel] = { el: p, home: p.parentElement.id }; addPanelControls(p); });
  DEFAULT_ORDER = snapshotOrder();
  const saved = load(LAYOUT_KEY);
  if (saved && saved.v === 1) LAYOUT = Object.assign(newLayout(), saved);
  applyLayout();
  const b = $('#bLayout'); if (b) b.addEventListener('click', () => { const m = $('#lmenu'); (m && !m.hidden) ? closeLayoutMenu() : openLayoutMenu(); });
  window.addEventListener('resize', () => { const m = $('#lmenu'); if (m && !m.hidden) openLayoutMenu(); });
}

/* ---------- deep links: ?s=COMM&t=2030.75&lens=aeco&focus=phase&theme=light (site) or #phase (artifact) ---------- */
function parseT(v) { if (v == null) return null; const m = /^(\d{4})(?:-?Q([1-4]))?$/i.exec(String(v)); if (m) return +m[1] + (m[2] ? (+m[2] - 1) / 4 : 0.75); const f = parseFloat(v); return isFinite(f) ? f : null; }
function applyDeepLink() {
  let q = null; try { q = new URLSearchParams(location.search); } catch (e) { q = null; }
  const get = k => (q && q.get(k)) || null;
  const s = get('s'); if (s && (RUN[s.toUpperCase()])) { state.key = s.toUpperCase(); view.to = RUN[state.key]; view.from = null; view.p = 1; buildEvents(); updateBrief(); syncControls(); buildMatrix(); }
  const t = parseT(get('t')); if (t != null) { state.t = clamp(E.idxOf(t), 0, NQ - 1); state.firstPlay = false; }
  const lens = get('lens'); if (lens && LENS.find(x => x.id === lens)) { lensState.sec = lens; showLensSector(); }
  const th = get('theme'); if (th === 'light' || th === 'dark') setTheme(th, { persist: false });
  const pr = get('layout'); if (pr && PRESETS[pr]) { LAYOUT = PRESETS[pr].make(); applyLayout(); }
  let fo = get('focus'); const h = (location.hash || '').replace('#', '');
  if (!fo && h && PANELS[h]) fo = h;
  if (fo && PANELS[fo]) setTimeout(() => openFocus(fo), 50);
  dirty(true);
}
function permalink(base) {
  const u = new URL(base || SITE.siteUrl || location.href);
  u.search = ''; u.hash = '';
  if (state.key !== 'CUST') u.searchParams.set('s', state.key);
  u.searchParams.set('t', E.qLabel(ci()).replace(/^Q(\d) (\d{4})$/, '$2Q$1'));
  u.searchParams.set('lens', lensState.sec);
  if (focusEl) u.searchParams.set('focus', focusEl.dataset.panel);
  return u.toString();
}

/* ---------- public UI hooks for the site layer (site.js) and tests ---------- */
window.AICX_UI = {
  get state() { return { key: state.key, name: nameFor(state.key), t: E.tAt(ci()), quarter: E.qLabel(ci()), lens: lensState.sec, theme: THEME, custom: state.custom ? JSON.parse(JSON.stringify(state.custom)) : null, layout: JSON.parse(JSON.stringify(LAYOUT)) }; },
  selectKey: k => { if (k === 'CUST' ? custRun : RUN[k]) { stopTour(); selectKey(k); } },
  setTime: tt => { const v = parseT(tt); if (v != null) jumpTo(E.idxOf(v)); },
  setLens: sec => { if (LENS.find(x => x.id === sec)) { lensState.sec = sec; showLensSector(); dirty(true); } },
  get theme() { return THEME; }, setTheme: t => setTheme(t), toggleTheme: () => setTheme(THEME === 'light' ? 'dark' : 'light'),
  get textSize() { return TEXT_SIZE; }, get textSizeMode() { return TEXT_MODE; }, setTextSize,
  toast, saveFile, openFocus, closeFocus, resetLayout, applyPreset, openLayoutMenu, setCustomizing, permalink,
  panels: () => Object.keys(PANELS),
  engine: E, data: DATA, metrics: MET, fmt, panelInfo,
  ci, now: NOW, valueAt: (k, i, key) => { const r = runFor(key || state.key); return r && r[k] ? r[k][i] : NaN; }, jumpTo,
  impactsOf: key => impactsOf(runFor(key || state.key)),
  signs: SIGNS, lanes: LANES.concat(LENS_LANES), lens: LENS, kpiLabel: KPI_LABEL, footerSources: SOURCES,
  scenarios: () => PRE.map(s => ({ key: s.key, name: s.name, short: s.short, color: scnColor(s) })),
  runs: () => { const o = {}; PRE.forEach(s => { o[s.key] = RUN[s.key]; }); if (custRun) o.CUST = custRun; return o; },
  snapshot() {
    const c = ci(), f = state.t, r = view.to;
    const kp = {}; KPI_DEFAULT.concat(['AU', 'AUa', 'AUdev', 'BLD', 'Pf', 'Pc', 'OS', 'TC', 'CtaskI']).forEach(k => { kp[k] = { name: MET[k].n, value: fmt(k, at(k, f)), today: fmt(k, r[k][NOW]) }; });
    const imp = impactsOf(r), cc = c <= NOW ? E.idxOf(2030.75) : c;
    const S = LENS.find(x => x.id === lensState.sec);
    const rows = lensRowsOf(S).map(x => ({ n: x.r.n, v: Math.round(imp.rows[x.j][cc]) })).sort((a, b) => b.v - a.v);
    return { scenario: { key: state.key, name: nameFor(state.key) }, quarter: E.qLabel(c), impactQuarter: E.qLabel(cc), regime: regimeOf(c).label, kpis: kp, lens: { id: S.id, name: S.n, impacts: rows }, custom: state.custom ? JSON.parse(JSON.stringify(state.custom)) : null };
  }
};

/* ---------- boot ---------- */
computeDomains();
buildTabs(); buildKpis(); buildLegend(); buildLanes(); buildDrivers(); buildShocks(); buildStatic(); buildSigns(); buildMatrix(); buildLens(); buildLedger();
[$('#scrub'), $('#net'), $('#phase'), $('#pools'), $('#heat')].forEach(watch);
bindScrub(); bindNet(); bindHeat(); wire();
view.to = RUN.COMM; view.p = 1;
buildEvents(); updateBrief(); syncControls();
initLayout();
applyDeepLink();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => dirty(true));
dirty(true);
requestAnimationFrame(frame);
document.dispatchEvent(new CustomEvent('aicx:ready'));
})();
