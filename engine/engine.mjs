/* AICX scenario engine v3 — quarterly system-dynamics model of AI commoditization.
   Three layers, kept apart on purpose:
     DATA    — dated observations, estimates and forecasts for 2023 Q1 – 2026 Q4 (HIST) and the evidence
               ledger for every Q4 2026 starting value (ANCHORS).
     PARAMS  — modelling assumptions: exploratory numbers, not facts. Change them to stress the model.
     simulate() — the quarterly loop for 2027 Q1 – 2035 Q4.
   Structural equations are calibrated so the first simulated quarter continues the Q4 2026 anchors;
   scenarios move the world only through driver paths, optional shocks and a few one-off jolts. */
/* ES module build (v3.3): createEngine() returns an independent engine instance. The browser bundle strips the
   "export" keywords and sets window.AICX = createEngine(). Licence: Business Source License 1.1 (see LICENSE). */
export function createEngine() {
'use strict';

const VERSION = 'v3.3 · 17 Oct 2026';
const T0 = 2023, NQ = 52, NOW_I = 15, DT = 0.25;
const NOW_T = T0 + NOW_I / 4; // 2026.75 = Q4 2026
const tAt = i => T0 + i / 4;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sigmoid = x => 1 / (1 + Math.exp(-x));
const smoothstep = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ex = Math.exp, mx = Math.max, mn = Math.min;
const ln = x => Math.log(x > 1e-12 ? x : 1e-12);

function qLabel(i) {
  const t = tAt(i) + 1e-6, y = Math.floor(t), q = Math.floor((t - y) * 4) + 1;
  return 'Q' + q + ' ' + y;
}
function idxOf(t) { return Math.round((t - T0) * 4); }
function interp(pts, t, log) {
  if (t <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return last[1];
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j], b = pts[j + 1];
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return log ? ex(ln(a[1]) + (ln(b[1]) - ln(a[1])) * u) : a[1] + (b[1] - a[1]) * u;
    }
  }
  return last[1];
}
function keyframe(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (t >= last[0]) return last[1];
  for (let j = 0; j < pts.length - 1; j++) {
    const a = pts[j], b = pts[j + 1];
    if (t >= a[0] && t <= b[0]) return a[1] + (b[1] - a[1]) * smoothstep((t - a[0]) / (b[0] - a[0]));
  }
  return last[1];
}

/* =====================================================================================
   DATA LAYER — history (t = year + (quarter − 1)/4; Q4 2026 = 2026.75).
   kind: 'obs' = dated observations or estimates of an observable quantity;
         'idx' = model index or assumption (its history is illustrative, drawn dashed).
   from: no comparable data before this date (the chart starts there).
   ===================================================================================== */
const HIST = {
  K:   { kind: 'obs', log: true, pts: [[2021, 100], [2021.75, 120], [2022.75, 150], [2023, 140], [2023.75, 180], [2024.75, 310], [2025, 308], [2025.25, 388], [2025.75, 510], [2026, 532], [2026.25, 688], [2026.75, 900]] },
  R:   { kind: 'obs', log: true, pts: [[2023, 6], [2023.75, 15], [2024.75, 40], [2025.75, 95], [2026.25, 160], [2026.75, 260]] },
  VL:  { kind: 'obs', log: true, pts: [[2023, 0.033], [2023.75, 0.105], [2024.75, 0.22], [2025, 0.36], [2025.5, 0.68], [2025.75, 0.85], [2026, 1.232], [2026.25, 1.817], [2026.75, 1.817]] },
  VN:  { kind: 'obs', log: true, pts: [[2023, 0.65], [2023.75, 1.2], [2024, 2.226], [2024.25, 3.0], [2024.75, 3.3], [2025, 2.7], [2025.25, 3.8], [2025.75, 4.6], [2026, 4.5], [2026.25, 4.8], [2026.5, 5.2], [2026.75, 5.17]] },
  S:   { kind: 'idx', pts: [[2023, 70], [2023.5, 74], [2024, 78], [2024.75, 82], [2025, 72], [2025.25, 76], [2025.75, 86], [2026, 78], [2026.25, 88], [2026.5, 79], [2026.75, 84]] },
  Cs:  { kind: 'idx', pts: [[2023, 15], [2024.25, 18], [2025.25, 25], [2025.75, 38], [2026.25, 48], [2026.5, 53], [2026.75, 55]] },
  Bs:  { kind: 'idx', pts: [[2023, 34], [2023.5, 20], [2024, 15], [2025, 15], [2026.25, 20], [2026.75, 24]] },
  G:   { kind: 'obs', pts: [[2023, 18], [2023.75, 14], [2024.25, 10], [2024.75, 6], [2025, 4], [2025.75, 3.5], [2026.25, 4], [2026.75, 4]] },
  Np:  { kind: 'idx', pts: [[2023, 1], [2023.75, 2], [2024.25, 3], [2024.75, 5], [2025.25, 7], [2025.75, 9], [2026.25, 11], [2026.75, 12]] },
  Pf:  { kind: 'obs', log: true, pts: [[2023, 37.5], [2023.75, 20], [2024.25, 12], [2024.75, 10], [2025.25, 8], [2025.75, 7], [2026.25, 10], [2026.75, 10]] },
  Pc:  { kind: 'obs', log: true, pts: [[2023, 1.6], [2023.75, 0.9], [2024.25, 0.5], [2024.75, 0.35], [2025.25, 0.3], [2025.75, 0.25], [2026.25, 0.2], [2026.75, 0.18]] },
  DC:  { kind: 'obs', pts: [[2023, 360], [2023.5, 375], [2024.5, 415], [2025.5, 485], [2026.75, 570]] },
  Pp:  { kind: 'obs', pts: [[2023, 99], [2023.5, 100], [2025, 103.9], [2026, 110], [2026.75, 114]] },
  GR:  { kind: 'obs', log: true, from: 2025.75, pts: [[2025.75, 1.7], [2026, 2.35], [2026.75, 2.8]] },
  DR:  { kind: 'obs', pts: [[2023, 75], [2023.5, 65], [2024, 85], [2024.5, 105], [2025, 100], [2025.5, 115], [2025.75, 170], [2026, 332], [2026.25, 533], [2026.5, 616], [2026.75, 693]] },
  LB:  { kind: 'obs', log: true, from: 2025.75, pts: [[2025.75, 1999], [2026, 2459], [2026.75, 3000]] },
  OS:  { kind: 'idx', pts: [[2023, 5], [2023.75, 9], [2024.75, 15], [2025.75, 25], [2026.25, 31], [2026.75, 35]] },
  ES:  { kind: 'obs', from: 2024.75, pts: [[2024.75, 19], [2025.75, 11], [2026.75, 11]] },
  LS:  { kind: 'idx', pts: [[2023, 2], [2024.25, 4], [2025.25, 6], [2026.75, 9]] },
  AS:  { kind: 'idx', pts: [[2023, 3], [2024.25, 6], [2025.25, 10], [2025.75, 13], [2026.75, 18]] },
  TC:  { kind: 'obs', from: 2023.75, pts: [[2023.75, 69], [2025.75, 88], [2026.75, 88]] },
  PF:  { kind: 'idx', pts: [[2023, 4], [2024.25, 3], [2024.5, 7], [2025.25, 5], [2026.25, 7], [2026.75, 8]] },
  SN:  { kind: 'idx', pts: [[2023, 100], [2024, 88], [2025, 74], [2026, 62], [2026.75, 55]] },
  GDP: { kind: 'obs', pts: [[2023, 0.1], [2023.75, 0.25], [2024.75, 0.5], [2025.25, 0.8], [2025.75, 1.0], [2026.25, 1.2], [2026.75, 1.2]] },
  AU:  { kind: 'idx', log: true, pts: [[2023, 0.105], [2023.75, 0.256], [2024.75, 0.66], [2025.75, 1.51], [2026.75, 4.0]] },
  U:   { kind: 'idx', pts: [[2023, 0.97], [2023.75, 0.98], [2024.25, 0.92], [2024.75, 0.85], [2025.25, 0.8], [2025.75, 0.86], [2026.25, 0.95], [2026.75, 1.0]] },
  SC:  { kind: 'idx', pts: [[2023, 0.4], [2024, 0.25], [2024.75, 0.04], [2025, 0], [2025.75, 0], [2026.25, 0.05], [2026.75, 0.04]] },
  DS:  { kind: 'idx', pts: [[2023, 0.05], [2024.75, 0.12], [2025.75, 0.28], [2026.75, 0.40]] }
};

/* Evidence ledger for the Q4 2026 starting values.
   status: reported · survey · estimate · forecast · index · assumption.  'calc' shows any conversion. */
const ANCHORS = [
  { id: 'AN1', k: 'K', name: 'Big-4 capex, annualised', v: '$900B a year', status: 'estimate', period: 'Q4 2026 exit rate', scope: 'Microsoft, Alphabet, Amazon, Meta; capex incl. finance leases where reported',
    src: 'Platformonomics Q2 2026 scoreboard (31 Jul 2026); company guidance, 22–30 Jul 2026', url: 'https://platformonomics.com/2026/07/follow-the-capex-q2-2026-scoreboard/',
    calc: 'Reported ≈$133B (Q1) and ≈$172B (Q2). Full-year guidance sums to $720–745B (MSFT ≈175 after its lease reclassification, GOOGL 195–205, AMZN ≈220 cash, META 130–145), so H2 ≈ $415–440B; Q4 ≈ 52% of H2, ×4 ≈ $865–915B. Mixed accounting bases.', was: '$820B' },
  { id: 'AN2', k: 'R', name: 'AI revenue (final customer spending, gross basis)', v: '$260B a year', status: 'estimate', period: 'Q4 2026 run-rate', scope: 'AI models, apps and AI cloud services bought by end users; partner-sold usage counted once, at the price the customer pays',
    src: 'Axios (8 Oct 2026); Reuters via AI Magazine (18 Aug 2026)', url: 'https://www.axios.com/2026/10/08/openai-50-billion-arr-anthropic-revenue-accounting',
    calc: 'OpenAI ≈$70B gross-equivalent ($50B as it reports, net of partners); Anthropic >$65B run-rate at end-July (books partner sales gross); all others ≈$125B (assumption: Google, Microsoft, AWS direct AI services, other labs, apps, neocloud enterprise sales). Range ≈ $230–290B. The OpenAI presentation change is not an economic change, so the anchor is unchanged.', was: '$260B (mixed basis)' },
  { id: 'AN3', k: 'VL', name: 'OpenAI + Anthropic equity value', v: '$1.817T', status: 'reported', period: 'Last announced rounds: 31 Mar and 28 May 2026', scope: 'Announced post-money equity values (not enterprise value)',
    src: 'OpenAI (31 Mar 2026); Anthropic Series H (28 May 2026)', url: 'https://www.anthropic.com/news/series-h', calc: '$852B + $965B = $1,817B.', was: '$2.2T blended mark' },
  { id: 'AN4', k: 'VN', name: 'Nvidia market value', v: '$5.17T', status: 'reported', period: 'Close, 16 Oct 2026', scope: 'Equity market capitalisation',
    src: 'StockAnalysis (16 Oct 2026)', url: 'https://stockanalysis.com/stocks/nvda/market-cap/', was: '$5.8T (labelled reported)' },
  { id: 'AN5', k: 'Pf', name: 'Frontier price (3 input : 1 output blend)', v: '$10 per M tokens', status: 'estimate', period: 'Sep–Oct 2026 list prices', scope: 'Flagship tier of the leading labs; list prices, no caching or batch discounts',
    src: 'OpenAI GPT-6 Astra page (Sep 2026); usagepricing.com Claude Opus 5.5 (22 Sep 2026)', url: 'https://openai.com/index/gpt-6-astra/',
    calc: 'Blend = (3 × input + output) / 4. Claude Opus 5.5 $4/$20 → $8; GPT-6 Astra $10/$50 → $20. Google flagship not verified. $10 sits between the named flagships.' },
  { id: 'AN6', k: 'Pc', name: 'Good-enough price (same blend)', v: '$0.18 per M tokens', status: 'estimate', period: 'Oct 2026 list prices', scope: 'Cheapest current tier from a leading lab that handles routine work',
    src: 'OpenAI Sol/Luna page (updated 29 Sep 2026); BenchLM (16 Oct 2026)', url: 'https://openai.com/index/introducing-gpt-6-sol-and-luna/',
    calc: 'GPT-6 Luna $0.10/$0.50 → $0.20. Context, not a substitute: BenchLM median open-weight list price $0.50 vs $2.00 proprietary (all tiers, not quality-matched).' },
  { id: 'AN7', k: 'G', name: 'Open-weight lag behind the frontier', v: '4.0 months', status: 'estimate', period: 'Average Jan–May 2026', scope: 'Epoch Capabilities Index, best open vs best closed',
    src: 'Epoch AI (29 May 2026); Mozilla State of Open Source AI v1.1 (14 Sep 2026)', url: 'https://epoch.ai/data-insights/open-closed-eci-gap',
    calc: 'Mozilla’s METR-based fit gives 4.4 months (different method). No October point estimate exists; 4.0 is carried forward.', was: '3.5 months' },
  { id: 'AN8', k: 'DC', name: 'Data-centre electricity use', v: '570 TWh a year', status: 'estimate', period: 'Q4 2026, annualised', scope: 'Global data centres',
    src: 'IEA Energy and AI (Apr 2026)', url: 'https://www.iea.org/reports/key-questions-on-energy-and-ai/executive-summary',
    calc: 'Interpolated on IEA’s path: 485 TWh (2025) → 950 TWh (2030 projection). The AI / other split (270 / 300 TWh) is our assumption: AI-focused load triples 2025–2030 (IEA) while other load grows 4% a year.', was: '600 TWh (300/300 split)' },
  { id: 'AN9', k: 'Pp', name: 'US commercial electricity price index', v: '114 (2023 = 100)', status: 'estimate', period: 'Q4 2026', scope: 'US average commercial retail price (EIA)',
    src: 'EIA retail sales data via startbusinessbystate (28 Sep 2026)', url: 'https://startbusinessbystate.com/data-center-electricity-prices-by-state/',
    calc: '13.85¢/kWh for the 12 months to July 2026, +5.9% on a year earlier. Against 12.59¢ in 2023 (EIA Monthly Energy Review, Table 9.8) = 110.0; extended at the latest year’s pace to 114. Context: PJM capacity cleared at its $325/MW-day cap for 2028/29 (14 Jul 2026) — an administered price, not a retail bill.', was: '132 (undefined US-weighted basket)' },
  { id: 'AN10', k: 'GR', name: 'H100 one-year contract rent', v: '$2.80 per GPU-hour', status: 'estimate', period: 'Q4 2026 (judgement)', scope: 'One-year H100 rental contracts',
    src: 'SemiAnalysis (2 Apr 2026)', url: 'https://newsletter.semianalysis.com/p/the-great-gpu-shortage-rental-capacity',
    calc: '$1.70 (Oct 2025) → $2.35 (Mar 2026); $2.80 for Q4 2026 is a judgement kept from v2, about 19% above March and below a straight-line extension (≈$3.40). Different contract terms, shown for context only: Akash marketplace $2.71 (12 Sep 2026); 53-provider on-demand median $3.39 (Oct 2026).' },
  { id: 'AN11', k: 'DR', name: 'DRAM contract price index', v: '693 (Q1 2025 = 100)', status: 'forecast', period: 'Q4 2026', scope: 'Conventional DRAM contract prices',
    src: 'TrendForce (26 Feb, 1 Jun, 7 Sep and 30 Sep 2026)', url: 'https://www.trendforce.com/presscenter/news/20260930-13258.html',
    calc: '115 in Q3 2025 × 1.475 (Q4 2025, reported +45–50%) = 170; × 1.955 (Q1 2026, reported +93–98%) × 1.605 (Q2 forecast +58–63%) × 1.155 (Q3 forecast +13–18%, 7 Sep 2026) × 1.125 (Q4 forecast +10–15%, 30 Sep 2026) = 693.', was: '610 (Q4 2025 step of only +30%; corrected after a source check, 17 Oct 2026)' },
  { id: 'AN12', k: 'LB', name: 'Cheapest 128 GB local AI box', v: '$3,000', status: 'estimate', period: 'Oct 2026', scope: 'Complete system able to run a ~120B-parameter open-weight model (4-bit) interactively',
    src: 'PCWorld (7 Aug 2025 and 13 Jan 2026); Framework blog; NVIDIA marketplace (17 Oct 2026)', url: 'https://www.pcworld.com/article/3031562/framework-raises-prices-yet-again-as-memory-costs-go-up.html',
    calc: 'Cheapest qualifying systems are AMD Ryzen AI Max+ 395 boxes with 128 GB: the Framework Desktop launched at $1,999 (ran a 109B model at 12.6 tokens/s) and cost $2,459 by Jan 2026; Framework raised prices again several times through June 2026 as memory prices surged, without published amounts. About $3,000 for Oct 2026 is our estimate. NVIDIA’s DGX Spark (GB10, 128 GB) lists at $6,950.', was: '$3,000 (earlier source did not support the figure; re-sourced 17 Oct 2026)' },
  { id: 'AN13', k: 'OS', name: 'Open-weight share of all tokens', v: '35%', status: 'assumption', period: 'Q4 2026', scope: 'All tokens served worldwide',
    src: 'No economy-wide measure', url: '', calc: 'Context only: Chinese open-weight models exceeded 45% of OpenRouter tokens in Q2 2026 — one router, not the market.' },
  { id: 'AN14', k: 'ES', name: 'Open-weight share of enterprise LLM use', v: '11%', status: 'survey', period: '2025 (carried to Q4 2026)', scope: 'US enterprise survey',
    src: 'Menlo Ventures (9 Dec 2025)', url: 'https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/', calc: '19% in 2024 → 11% in 2025.', was: 'new series' },
  { id: 'AN15', k: 'TC', name: 'Top-3 share of enterprise LLM API spend', v: '88%', status: 'survey', period: '2025 (carried to Q4 2026)', scope: 'Enterprise LLM API spend (survey estimate)',
    src: 'Menlo Ventures (9 Dec 2025)', url: 'https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/', calc: 'Anthropic 40 + OpenAI 27 + Google 21.', was: '84% (Q4 2026, undated)' },
  { id: 'AN16', k: 'AS', name: 'Specialised agents’ share of enterprise AI spend', v: '18%', status: 'assumption', period: 'Q4 2026', scope: 'Enterprise AI spending',
    src: 'Assumption', url: '', calc: 'Gartner’s “agents in 40% of enterprise apps by end-2026” counts applications, not spending, so it does not support this number.' },
  { id: 'AN17', k: 'LS', name: 'Local and on-prem share of inference', v: '9%', status: 'assumption', period: 'Q4 2026', scope: 'Inference compute', src: 'Assumption', url: '' },
  { id: 'AN18', k: 'GDP', name: 'AI contribution to US real GDP growth', v: '+1.2 pp', status: 'estimate', period: 'Q2 2026 (carried to Q4)', scope: 'Year-on-year real growth',
    src: 'ING (20 Aug 2026); BEA third estimate via Advisor Perspectives (30 Sep 2026)', url: 'https://think.ing.com/opinions/how-much-is-ai-contributing-to-us-economic-growth/',
    calc: 'ING: tech investment net of imports ≈36% of Q2 2026 year-on-year growth; × 2.2% growth = 0.8 pp; plus ING’s wealth effect of 0.44 pp ≈ 1.2 pp. Our construction from ING’s parts, not an ING headline.' },
  { id: 'AN19', k: 'AU', name: 'Realised automation', v: '4.0% of knowledge-work value', status: 'assumption', period: 'Q4 2026', scope: '$40T knowledge-work value pool (assumption)', src: 'Assumption', url: '' },
  { id: 'AN20', k: 'Cs', name: 'Credit-stress index', v: '55 (0–100)', status: 'index', period: 'Q4 2026', scope: 'Judgemental index, not a probability',
    src: 'IMF blog (13 Oct 2026); investinglive (14 Oct 2026); BIS (Mar 2026)', url: 'https://www.imf.org/en/blogs/articles/2026/10/12/global-financial-markets-face-rising-risks-from-ai-bond-yields-and-cyberattacks',
    calc: 'Informed by: CoreWeave bonds yielding ~15%; IMF lists an AI correction among top near-term risks; hyperscaler bond issuance above $100B in 2025.' },
  { id: 'AN21', k: 'PF', name: 'Lab distress index', v: '8 (0–100)', status: 'index', period: 'Q4 2026', scope: 'Model index, not a probability of failure', src: 'Model construct', url: '', was: '“8% failure odds”' },
  { id: 'AN22', k: 'DS', name: 'Debt share of AI build-out financing', v: '0.40', status: 'assumption', period: 'Q4 2026', scope: 'System-wide, incl. leases and project vehicles',
    src: 'BIS (Mar 2026); IMF blog (13 Oct 2026); Morgan Stanley via UBP (16 Sep 2026)', url: 'https://www.bis.org/publications/qr-202603/financing-ai-infrastructure-boom-on-and-off-balance-sheet-borrowing',
    calc: 'Bounded by: hyperscaler bonds >$100B in 2025 (BIS); ~55% of 2026–28 data-centre capex expected from credit (Morgan Stanley); IMF sample of 14 deals ($650B debt, $300B equity — a selected sample, not additive).', was: 'implicit 0.30' },
  { id: 'AN23', k: 'Np', name: 'Labs at frontier parity', v: '12', status: 'assumption', period: 'Q4 2026', scope: 'Labs within one model generation of the frontier', src: 'Assumption', url: '' },
  { id: 'AN24', k: 'S', name: 'Hype index', v: '84 (0–100)', status: 'index', period: 'Q4 2026', scope: 'Model index', src: 'Model construct', url: '' },
  { id: 'AN25', k: 'SN', name: 'Signal-to-noise index', v: '55 (2023 = 100)', status: 'index', period: 'Q4 2026', scope: 'Model index', src: 'Model construct', url: '' },
  { id: 'AN26', k: 'BLD', name: 'US data-centre construction', v: '$97B a year', status: 'estimate', period: 'Q4 2026', scope: 'US private construction put in place, data-centre category (seasonally adjusted annual rate)',
    src: 'US Census Bureau C30 (1 Oct 2026)', url: 'https://www.census.gov/construction/c30/pdf/privsa.pdf',
    calc: '$84.95B in Aug 2026 (+73% on Aug 2025’s $49.05B, preliminary). Both months equal ~11% of annualised Big-4 capex, so the model carries it as 10.8% of Big-4 capex (Q4 2026: 0.108 × $900B).', was: 'new series' }
];
/* Provenance of the shipped starting values (checked on 17 Oct 2026). Weekly releases replace these per anchor
   when a reviewed value arrives: via.type 'api' (official data API), 'ai' (AI-assisted research, approved by a person)
   or 'manual' (edited by the team), with quote, refs and dates. */
const PROV_FIELDS = ['quote', 'refs', 'via', 'reviewed', 'retrieved', 'prev'];
/* further references for the shipped values (the main source is in src/url) */
const ANCHOR_REFS = {
  AN1: [{ title: 'Microsoft FY26 Q4 earnings call', url: 'https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q4', publisher: 'Microsoft', date: '2026-07-29' }, { title: 'Alphabet Q2 2026 earnings call transcript', url: 'https://s206.q4cdn.com/479360582/files/doc_events/2026/Jul/22/2026_Q2_Earnings_Transcript.pdf', publisher: 'Alphabet', date: '2026-07-22' }, { title: 'Meta reports second quarter 2026 results', url: 'https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-Second-Quarter-2026-Results/default.aspx', publisher: 'Meta', date: '2026-07-29' }, { title: 'Amazon Q2 2026 earnings call', url: 'https://www.roic.ai/quote/AMZN/transcripts/2026-year/2-quarter', publisher: 'roic.ai', date: '2026-07-30' }],
  AN2: [{ title: 'How Anthropic’s revenue run-rate topped $65bn', url: 'https://aimagazine.com/news/how-anthropics-revenue-run-rate-topped-us-65bn', publisher: 'AI Magazine (Reuters)', date: '2026-08-18' }],
  AN3: [{ title: 'OpenAI funding round at $852B post-money', url: 'https://openai.com/index/accelerating-the-next-phase-ai/', publisher: 'OpenAI', date: '2026-03-31' }],
  AN5: [{ title: 'Claude Opus 5.5 token pricing', url: 'https://www.usagepricing.com/ai-token-pricing/anthropic/claude-opus-5-5', publisher: 'usagepricing.com', date: '2026-09-22' }],
  AN6: [{ title: 'LLM pricing statistics', url: 'https://benchlm.ai/stats/llm-pricing', publisher: 'BenchLM', date: '2026-10-16' }],
  AN7: [{ title: 'State of Open Source AI v1.1', url: 'https://stateofopensource.ai/', publisher: 'Mozilla', date: '2026-09-14' }],
  AN9: [{ title: 'PJM capacity auction 2028/29 (context)', url: 'https://insidelines.pjm.com/pjm-capacity-auction-procures-138318-mw-of-generation-resources-as-work-continues-to-address-growing-electricity-demand/', publisher: 'PJM', date: '2026-07-14' }],
  AN11: [{ title: 'DRAM contract prices, Q1–Q2 2026', url: 'https://www.trendforce.com/presscenter/news/20260601-13070.html', publisher: 'TrendForce', date: '2026-06-01' }, { title: 'Price rally drives 4Q25 DRAM revenue up 29.4% (Q4 2025 contract prices +45–50%)', url: 'https://www.trendforce.com/presscenter/news/20260226-12937.html', publisher: 'TrendForce', date: '2026-02-26' }, { title: 'DRAM industry revenue rises 59.5% in 2Q26 (3Q26 forecast +13–18%)', url: 'https://www.trendforce.com/presscenter/news/20260907-13219.html', publisher: 'TrendForce', date: '2026-09-07' }],
  AN12: [{ title: 'Framework Desktop review (Ryzen AI Max+ 395, 128 GB from $1,999)', url: 'https://www.pcworld.com/article/2866400/framework-desktop-review.html', publisher: 'PCWorld', date: '2025-08-07' }, { title: 'Updates on memory pricing and navigating the volatile memory market', url: 'https://frame.work/blog/updates-on-memory-pricing-and-navigating-the-volatile-memory-market', publisher: 'Framework' }, { title: 'NVIDIA DGX Spark (marketplace listing, $6,950)', url: 'https://marketplace.nvidia.com/en-us/enterprise/personal-ai-supercomputers/dgx-spark/', publisher: 'NVIDIA', date: '2026-10-17' }],
  AN18: [{ title: 'Q2 2026 GDP third estimate: real GDP at 2.2%', url: 'https://www.advisorperspectives.com/dshort/updates/2026/09/30/q2-gdp-third-estimate-real-gdp-at-2-2', publisher: 'Advisor Perspectives (BEA data)', date: '2026-09-30' }],
  AN20: [{ title: 'Financing the AI infrastructure boom (BIS Quarterly Review)', url: 'https://www.bis.org/publications/qr-202603/financing-ai-infrastructure-boom-on-and-off-balance-sheet-borrowing', publisher: 'BIS', date: '2026-03' }],
  AN22: [{ title: 'Global financial markets face rising risks from AI (IMF blog)', url: 'https://www.imf.org/en/blogs/articles/2026/10/12/global-financial-markets-face-rising-risks-from-ai-bond-yields-and-cyberattacks', publisher: 'IMF', date: '2026-10-13' }]
};
for (const a of ANCHORS) {
  if (ANCHOR_REFS[a.id]) a.refs = ANCHOR_REFS[a.id];
  a.via = a.status === 'assumption' ? { type: 'assumption', name: 'Assumption by the AI Forecast Atlas team' }
    : (a.status === 'index' || a.src === 'Model construct') ? { type: 'model', name: 'Model construct' }
    : { type: 'desk', name: 'AI-assisted desk research, checked against the cited source' };
  a.reviewed = '2026-10-17';
}

/* Sector lens evidence (AECO, AECO software, software & development) — dated context, not model inputs. */
const SECTOR_EVIDENCE = {
  aeco: [
    { t: 'US data-centre construction reached $85B a year in Aug 2026, up 73% in a year (preliminary)', src: 'US Census Bureau, 1 Oct 2026', url: 'https://www.census.gov/construction/c30/pdf/privsa.pdf' },
    { t: 'Shell and core cost ~$11.3M per MW (2026 forecast); AI tech fit-out by tenants can reach $25M per MW', src: 'JLL Data Center Outlook, 5 Jan 2026', url: 'https://www.jll.com/en-us/insights/market-outlook/data-center-outlook.html' },
    { t: 'UK: 74% of architecture practices use AI on at least some projects (31% on most); 57% report positive ROI', src: 'RIBA AI Report 2026, 22 Jul 2026 (self-selected survey)', url: 'https://www.riba.org/media/fecm2pl5/riba-ai-report-2026-final_v3.pdf' },
    { t: 'US/Canada A&E firms: AI adoption 70% (53% a year earlier), but only 38% see measurable business impact', src: 'Deltek Clarity, 12 May 2026', url: 'https://www.deltek.com/en/about/media-center/press-releases/2026/the-latest-deltek-clarity-industry-studies-highlight-ai-challenges' },
    { t: 'Architecture Billings Index 47.2 in Aug 2026: billings still declining', src: 'AIA/Deltek, 23 Sep 2026', url: 'https://www.aia.org/about-aia/press/architecture-firms-continue-face-soft-business-conditions-0' },
    { t: 'US construction needs ~349,000 net new workers in 2026 (456,000 in 2027)', src: 'ABC, 15 Jan 2026 (model estimate)', url: 'https://www.abc.org/wfshortage' }
  ],
  aecosw: [
    { t: 'Autodesk, Inc. revenue +16% (Q2 FY27); AEC data model APIs on the Autodesk® platform move to usage pricing from 6 Oct 2026; the Autodesk® Assistant feature is generally available', src: 'Autodesk, Inc. investor relations, 27 Aug 2026; Autodesk® Platform Services blog, 3 Sep 2026', url: 'https://aps.autodesk.com/blog/data-model-apis-included-subscriptions-plus-flexible-ways-scale' },
    { t: 'Nemetschek’s Bluebeam Max — a premium tier with Claude via MCP — launched 19 May 2026; shares were down about a third year-to-date by end-April on AI-competition fears', src: 'Bluebeam, 19 May 2026; dpa-AFX, 30 Apr 2026', url: 'https://press.bluebeam.com/2026/05/bluebeam-max-launches-globally-bringing-ai-powered-productivity-to-aec-teams-everywhere/' },
    { t: 'Procore prices its five AI agents on credit consumption (21 May 2026); revenue +16% in Q2', src: 'Procore, 21 May and 29 Jul 2026', url: 'https://www.procore.com/press/new-procore-ai-experience-embeds-datagrid-into-procore' },
    { t: 'Bentley (+12.8%) and Trimble (+11%) still sell AI inside existing plans; no usage pricing yet', src: 'Company Q2 2026 results, Aug 2026', url: 'https://investors.bentley.com/news-releases/news-release-details/bentley-systems-announces-second-quarter-2026-results' },
    { t: 'AEC software market ≈ $11–12B (2025–26); publishers’ estimates differ', src: 'Mordor Intelligence, 11 Sep 2026; Grand View, Jun 2026', url: 'https://www.mordorintelligence.com/industry-reports/aec-software-market' }
  ],
  sw: [
    { t: 'US software & services stocks lost ~$830B in six sessions from 28 Jan 2026 (−13%)', src: 'Reuters, 4 Feb 2026', url: 'https://finance.yahoo.com/news/global-software-stocks-hit-anthropic-120659089.html' },
    { t: 'Cloud-software index: Q1 2026 −22%, but +16% year-to-date by 30 Sep', src: 'BVP Nasdaq Emerging Cloud factsheet', url: 'https://indexes.nasdaq.com/docs/FS_EMCLOUDT.pdf' },
    { t: 'GitHub Copilot moved every plan to usage-based billing on 1 Jun 2026; Salesforce Agentforce charges $0.10 per action', src: 'GitHub, 27 Apr 2026; Salesforce, 15 May 2025', url: 'https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/' },
    { t: 'Developers using AI: 66% use coding agents (Claude Code 66%, Copilot 59% of agent users); 73% of them daily', src: 'Stack Overflow Developer Survey, 6 Oct 2026', url: 'https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/' },
    { t: 'Google: 75% of new code is AI-generated and approved by engineers (50% in autumn 2025)', src: 'Google blog, 22 Apr 2026', url: 'https://blog.google/intl/pl-pl/nowosci-produktowe/cloud-next-2026-dynamika-i-innowacje-w-skali-google/' },
    { t: 'US software-development job postings ~27.5% below Feb 2020, but up ~15% since Feb 2025', src: 'Indeed Hiring Lab, 8 Jul 2026', url: 'https://hiringlab.indeed.com/2026/07/08/ai-and-job-postings-from-destruction-to-creation/' }
  ]
};

/* =====================================================================================
   PARAMS — modelling assumptions. Exploratory numbers; none of these is an observation.
   ===================================================================================== */
const PARAMS = {
  revBasis: 1.0,                       // presentation basis of revenue vs the model's gross final-spending basis (OpenAI grossed up)
  capexBasis: 1.0,                     // presentation basis of capex vs economic capex incl. finance leases (lease reclassifications added back)
  pool0: 40000, poolG: 0.035,          // knowledge-work value pool, $B a year, and its nominal growth
  auRateNow: 0.80, auRateLong: 0.30, auFade: 2, auCeil: 40, auCeilMax: 55, auHard: 60, // organisational adoption S-curve (potential work)
  epsLo: 0.5, epsHi: 1.5,              // price elasticity of AI usage, from the “demand response” driver (0 → 0.5, 1 → 1.5)
  workElas: 0.25, workSat: 0.2,        // elasticity of automated-work demand to the cost of a completed task (= workElas × eps), saturating at +22% / −18% (exp ±0.2)
  tauNow: 0.50, tauLong: 0.10, tauFade: 3, // growth of tokens per completed task (reasoning, agents, retries), log per year, fading
  algEff: 0.30, algLong: 0.15,         // algorithmic efficiency: fall in compute per token at constant quality, log per year (today → long run)
  hwPP: 0.28, hwLong: 0.20, techFade: 4, // hardware price-performance gain, log per year (today → long run); fade time of both, years
  accelLife: 16,                       // quarters an accelerator counts toward capacity (4 years)
  prodShare0: 0.55, prodShareMax: 0.85, // share of served compute doing paid productive work today; the most it gets when rationing
  excess0: 0.04,                       // desired compute exceeds available compute by 4% today
  otherLong: 0.0, otherFade: 1.0, otherScar: 0.5, // extra growth of training, R&D and free-tier compute (log/yr): long run, fade time (years), cut per unit of scarcity
  nonAiTWh0: 300, nonAiG: 0.04, gridHeadroom: 0.10, cptG: 0.30, cptLong: 0.20, onsite: 0.35, // power: non-AI load, grid headroom, fleet compute per kWh gain (log/yr, today → long run), on-site generation response
  gridNow: 0.62, gridEnergy: 0.6, gridFade: 3, gridLong: 0.05, // growth of power available for AI = (gridNow − gridEnergy·energy)·e^(−t/gridFade) + gridLong
  mc0: 0.5, mcFloor: 0.08, pcFloor: 0.0003, // markup over unit cost on the good-enough tier (today, most competitive); price floor $ per M tokens at today's power price
  Rf0: 9.6, RfDecline: 0.03,           // frontier / good-enough resource-cost ratio, and its yearly narrowing (distillation)
  markupMin: 1.0, markupMax: 12,       // frontier markup ratio bounds (1.0 = priced at resource cost)
  valueShare0: 0.5, captureCeil: 0.25, // share of AI revenue priced on value (seats, outcomes, platforms); soft ceiling on capture
  maint0: 150, maintT0: 2022.75, maintG: 0.05, // non-discretionary capex: the Big-4's pre-AI level (2022), growing 5% a year
  strandFree: 0.03, strandBrake: 8.0,  // buyers defer chip deliveries once more than 3% of purchased compute is unpowered
  gKmin: -0.5,                         // committed projects: discretionary capex falls at most ~40% a year
  depLife: 5, coc: 0.08,               // capital charge = straight-line depreciation over 5 years + 8% on half the gross base
  cfo0: 700, cfoG: 0.08,               // hyperscaler operating cash flow before borrowing, $B a year
  bankIntercept: 10.25,
  gdpCapex: 0.79, gdpWealth: 0.015, gdpProd: 0.175, // capex: 0.79 ≈ 1.3 (all US AI builders vs Big-4) × 0.6 (domestic share); wealth: ING’s 1.5¢ per $; productivity pass-through
  labShare0: 0.52, labShareMax: 0.6,   // OpenAI + Anthropic share of AI revenue (≈$135B of $260B)
  multLo: 2, multHi: 30,
  /* sector lens (illustrative mappings, not measurements) */
  buildShare: 0.108,                   // US data-centre construction put in place ÷ Big-4 capex (0.110 in Aug 2025, 0.108 in Aug 2026, Census)
  aecoK: 0.6,                          // AECO design & engineering exposure: automated share = 1 − (1 − AU)^k
  devK: 3.1                            // software-development exposure (same form; 4% economy-wide ≈ 12% of development work)
};
const P = PARAMS;

/* ---------------- drivers ---------------- */
const DRIVERS = [
  { k: 'capital', name: 'Investor appetite', lo: 'capital flight', hi: 'euphoria', desc: 'Willingness of equity investors and lenders to keep funding the build-out.' },
  { k: 'rates', name: 'Cost of capital', lo: 'cheap money', hi: 'high yields', desc: 'Interest rates and bond yields; they price every debt-funded data centre.' },
  { k: 'adoption', name: 'Enterprise adoption & ROI', lo: 'stalled pilots', hi: 'broad automation', desc: 'How fast organisations turn AI into completed work and measurable returns.' },
  { k: 'conv', name: 'Open-model catch-up', lo: 'open falls behind', hi: 'no visible gap', desc: 'How fast open-weight and challenger labs match the frontier.' },
  { k: 'brk', name: 'Frontier breakthrough', lo: 'none', hi: 'decisive lead', desc: 'Odds of a step-change (e.g. agents automating AI research) that reopens a big lead.' },
  { k: 'efficiency', name: 'Algorithmic efficiency', lo: 'slow', hi: 'very fast', desc: 'Distillation, sparsity, quantisation: less compute per token at a given capability.' },
  { k: 'hwSupply', name: 'Chip & memory supply', lo: 'shortage', hi: 'glut', desc: 'Fab, HBM and DRAM capacity relative to demand.' },
  { k: 'energy', name: 'Grid & energy constraint', lo: 'abundant', hi: 'power wall', desc: 'How hard power availability and prices limit new data centres.' },
  { k: 'geo', name: 'Geopolitical fragmentation', lo: 'open trade', hi: 'blockade', desc: 'Export controls, rival tech blocs and Taiwan Strait risk.' },
  { k: 'regulation', name: 'Regulation & liability', lo: 'light touch', hi: 'licensing', desc: 'Compliance burden, model licensing, copyright and liability rules.' },
  { k: 'trust', name: 'Security & trust incidents', lo: 'high trust', hi: 'trust crisis', desc: 'AI-enabled attacks, agent failures, fraud and deepfakes.' },
  { k: 'sovereignty', name: 'Sovereignty & privacy demand', lo: 'US clouds fine', hi: 'own the stack', desc: 'Demand for private, on-prem and sovereign AI.' },
  { k: 'platform', name: 'Platform lock-in', lo: 'easy switching', hi: 'deep lock-in', desc: 'Identity, workflow, data, distribution and governance that keep customers on one platform, whatever the model quality.' },
  { k: 'elastic', name: 'Demand response to price', lo: 'weak (ε 0.5)', hi: 'strong (ε 1.5)', desc: 'Price elasticity of AI usage: how much more is used when the price falls (spending rises only above ε = 1).' }
];
const DK = DRIVERS.map(d => d.k);
const BASE = { capital: 0.7, rates: 0.65, adoption: 0.6, conv: 0.55, brk: 0.1, efficiency: 0.55, hwSupply: 0.35, energy: 0.55, geo: 0.35, regulation: 0.35, trust: 0.2, sovereignty: 0.35, platform: 0.6, elastic: 0.5 };
const KT = [2027.5, 2028.5, 2030, 2032, 2035];

/* ---------------- scenarios ---------------- */
const SCENARIOS = [
  {
    key: 'COMM', name: 'The Great Commoditization', short: 'Commoditization', color: '#3987e5',
    thesis: 'Capabilities converge: five commercial and twenty open labs become practically interchangeable. Price, openness and security decide deals, so a price war and a shakeout follow. Because cheaper AI earns less per task, revenue cannot yet pay for the chips already installed and lenders feel the strain; cheaper hardware arrives once new supply lands. Routers erode lock-in and value migrates to specialised agents, data and distribution.',
    first: ['Open-weight gap under 2 months', 'Frontier markup over resource cost near 1×', 'Multi-model routers become default'],
    d: {
      capital: [0.65, 0.5, 0.45, 0.45, 0.45], rates: [0.6, 0.55, 0.5, 0.45, 0.45], adoption: [0.65, 0.7, 0.75, 0.75, 0.75],
      conv: [0.8, 0.9, 0.95, 0.95, 0.95], brk: [0.05, 0.03, 0.02, 0.02, 0.02], efficiency: [0.7, 0.8, 0.8, 0.75, 0.7],
      hwSupply: [0.35, 0.6, 0.8, 0.8, 0.75], energy: [0.6, 0.6, 0.55, 0.5, 0.45], geo: [0.35, 0.35, 0.35, 0.35, 0.35],
      regulation: [0.4, 0.45, 0.45, 0.45, 0.45], trust: [0.25, 0.3, 0.3, 0.25, 0.2], sovereignty: [0.45, 0.55, 0.6, 0.65, 0.65],
      platform: [0.55, 0.5, 0.45, 0.4, 0.4], elastic: [0.5, 0.55, 0.55, 0.55, 0.55]
    },
    imp: [{ t: 2027.25, S: -6 }, { t: 2028, Cs: 6, PF: 6 }],
    ev: [
      [2027, 'Open-weight model ties the frontier on coding and agent benchmarks'],
      [2027.25, 'Flagship API prices cut sharply; rivals match within weeks'],
      [2027.75, 'Enterprises standardise on multi-model routers; switching costs collapse'],
      [2028, 'Two frontier labs marked down 40%; first consolidation deal'],
      [2028.5, 'New memory fabs ramp; workstation prices start to fall'],
      [2029.25, 'AI tokens sold like electricity: metered, interchangeable, cheap'],
      [2030.5, 'Hyperscalers write down early GPU vintages'],
      [2032, 'Margins settle in agents, proprietary data and distribution']
    ]
  },
  {
    key: 'BUST', name: 'Hype Implosion & Credit Event', short: 'Bubble bursts', color: '#d95926',
    thesis: 'Revenue cannot catch a debt-funded capex wave while yields climb. A guidance cut and a failed lab trigger forced selling, private-credit losses and an AI-led US recession. Spending collapses but the installed base still has to be paid for, so stress lingers; idle compute later powers a leaner second wave.',
    first: ['A hyperscaler cuts capex year-on-year', 'AI data-centre ABS deals pulled', 'Credit-stress index above 70'],
    d: {
      capital: [0.45, 0.15, 0.25, 0.4, 0.5], rates: [0.85, 0.75, 0.5, 0.4, 0.4], adoption: [0.45, 0.3, 0.4, 0.5, 0.55],
      conv: [0.65, 0.7, 0.75, 0.8, 0.8], brk: [0.05, 0.02, 0.02, 0.05, 0.05], efficiency: [0.55, 0.55, 0.6, 0.65, 0.65],
      hwSupply: [0.35, 0.85, 0.9, 0.8, 0.7], energy: [0.5, 0.3, 0.25, 0.3, 0.35], geo: [0.35, 0.35, 0.35, 0.35, 0.35],
      regulation: [0.35, 0.45, 0.5, 0.45, 0.45], trust: [0.3, 0.45, 0.4, 0.3, 0.25], sovereignty: [0.35, 0.4, 0.45, 0.45, 0.45],
      platform: [0.6, 0.6, 0.6, 0.6, 0.6], elastic: [0.45, 0.45, 0.45, 0.5, 0.5]
    },
    imp: [{ t: 2027.25, Cs: 8, S: -6 }, { t: 2027.75, Cs: 16, PF: 18, S: -12, Np: -2 }],
    ev: [
      [2027, 'Bond yields spike; two AI data-centre ABS deals are pulled'],
      [2027.25, 'A hyperscaler guides its first year-on-year capex cut; chip stocks −35%'],
      [2027.5, 'Private-credit fund gates redemptions after data-centre loan losses'],
      [2027.75, 'A top-10 AI lab breaches covenants; emergency merger'],
      [2028.25, 'US enters an AI-led recession; equities fall ~40% from peak'],
      [2029.25, 'GPU glut: H100 rents fall below $1 an hour'],
      [2029.5, 'Power prices ease as data-centre demand stalls'],
      [2030.5, 'Cheap stranded compute fuels a leaner second wave of AI apps']
    ]
  },
  {
    key: 'BRKW', name: 'Frontier Breakaway', short: 'Breakaway', color: '#9085e9',
    thesis: 'One or two labs reach a step-change — agents that automate their own research — and the gap widens instead of closing. Pricing power, scarce compute and deep enterprise lock-in follow; open models fall a year behind and regulators move toward licensing. Power and chips, not demand, cap how much work actually gets done.',
    first: ['Open-weight gap widens past 6 months', 'Frontier prices rise, not fall', 'Compute stays sold out'],
    d: {
      capital: [0.85, 0.9, 0.85, 0.8, 0.75], rates: [0.6, 0.6, 0.55, 0.55, 0.5], adoption: [0.7, 0.8, 0.85, 0.9, 0.9],
      conv: [0.4, 0.3, 0.25, 0.25, 0.3], brk: [0.35, 0.7, 0.85, 0.85, 0.8], efficiency: [0.6, 0.7, 0.75, 0.75, 0.7],
      hwSupply: [0.25, 0.3, 0.35, 0.45, 0.5], energy: [0.55, 0.6, 0.6, 0.55, 0.5], geo: [0.4, 0.45, 0.45, 0.45, 0.45],
      regulation: [0.4, 0.5, 0.6, 0.65, 0.65], trust: [0.2, 0.25, 0.3, 0.3, 0.3], sovereignty: [0.35, 0.4, 0.45, 0.5, 0.5],
      platform: [0.65, 0.7, 0.75, 0.75, 0.75], elastic: [0.5, 0.5, 0.5, 0.5, 0.5]
    },
    imp: [{ t: 2027.25, S: 10 }],
    ev: [
      [2027.25, 'A lab shows agents running most of its own model R&D'],
      [2027.75, 'Frontier lead stretches past six months; open labs lose funding'],
      [2028.25, 'Top tier priced as a premium utility; enterprise lock-in deepens'],
      [2029, 'Frontier lead passes a year; antitrust probes target compute concentration'],
      [2030.5, 'Capex passes $2T a year; power, not money, is the limit'],
      [2031, 'Licensing regime for frontier models entrenches incumbents']
    ]
  },
  {
    key: 'SPLT', name: 'Sovereign Splinternet', short: 'Splinter', color: '#c98500',
    thesis: 'Export controls and a Taiwan Strait crisis split AI into rival blocs. Memory prices stay high and new chips stall, while a demand slump leaves existing GPUs idle and cheap to rent; every region rebuilds its own stack, open-weight models become the sovereign default, and AI stays roughly twice as expensive as it needs to be.',
    first: ['New export-control tranche', 'Chip lead times stretch past a year', 'Sovereign clouds favoured in tenders'],
    d: {
      capital: [0.6, 0.45, 0.45, 0.5, 0.5], rates: [0.7, 0.75, 0.65, 0.6, 0.55], adoption: [0.55, 0.45, 0.5, 0.55, 0.6],
      conv: [0.55, 0.55, 0.6, 0.6, 0.6], brk: [0.1, 0.1, 0.1, 0.1, 0.1], efficiency: [0.6, 0.65, 0.7, 0.7, 0.7],
      hwSupply: [0.3, 0.1, 0.2, 0.35, 0.45], energy: [0.6, 0.65, 0.6, 0.55, 0.5], geo: [0.65, 0.95, 0.85, 0.75, 0.7],
      regulation: [0.5, 0.6, 0.6, 0.6, 0.6], trust: [0.3, 0.45, 0.4, 0.35, 0.3], sovereignty: [0.6, 0.85, 0.9, 0.9, 0.9],
      platform: [0.6, 0.65, 0.65, 0.65, 0.65], elastic: [0.45, 0.45, 0.45, 0.45, 0.45]
    },
    imp: [{ t: 2028.5, S: -12, Cs: 8 }],
    ev: [
      [2027.25, 'New export rules split the world into three AI blocs'],
      [2028.5, 'Taiwan Strait blockade halts leading-edge chip supply'],
      [2028.75, 'Memory prices jump again; build-outs stall and idle GPUs flood rental markets'],
      [2029.25, 'EU and Gulf sovereign clouds go live on open-weight stacks'],
      [2030, 'Chinese open models dominate Global South deployments'],
      [2031.5, 'Duplicated regional stacks keep AI costs ~2× higher']
    ]
  },
  {
    key: 'PWR', name: 'The Power Wall', short: 'Power wall', color: '#d55181',
    thesis: 'Electricity, not chips or money, becomes the binding constraint. Interconnect queues and capacity prices stall new campuses; buyers defer chip deliveries and rush on-site generation, compute is rationed to paid work, and the winners are small specialised models that do more per watt, plus regions with cheap firm power.',
    first: ['Capacity auctions hit price caps again', 'Grid queues delay big campuses', 'Data-centre tariffs on households'],
    d: {
      capital: [0.65, 0.6, 0.55, 0.55, 0.55], rates: [0.65, 0.6, 0.55, 0.5, 0.5], adoption: [0.6, 0.6, 0.6, 0.65, 0.7],
      conv: [0.6, 0.7, 0.75, 0.75, 0.75], brk: [0.08, 0.05, 0.05, 0.05, 0.05], efficiency: [0.7, 0.85, 0.9, 0.9, 0.85],
      hwSupply: [0.35, 0.55, 0.65, 0.65, 0.65], energy: [0.85, 0.95, 0.9, 0.8, 0.65], geo: [0.4, 0.4, 0.4, 0.4, 0.4],
      regulation: [0.45, 0.5, 0.5, 0.5, 0.5], trust: [0.2, 0.25, 0.25, 0.25, 0.25], sovereignty: [0.45, 0.55, 0.6, 0.6, 0.6],
      platform: [0.6, 0.6, 0.6, 0.6, 0.6], elastic: [0.45, 0.45, 0.45, 0.45, 0.45]
    },
    imp: [],
    ev: [
      [2027, 'Grid interconnect queues delay a fifth of planned data centres'],
      [2027.5, 'Capacity prices hit their cap again; data-centre tariffs enacted'],
      [2027.75, 'Compute rationing: clouds prioritise paid workloads and their largest customers'],
      [2028.75, 'Small specialised models win on cost per task and per watt'],
      [2029.5, 'Gulf and Nordic regions win the next build-out wave'],
      [2031.5, 'First small-modular-reactor AI campuses come online']
    ]
  },
  {
    key: 'BOOM', name: 'Agentic Productivity Boom', short: 'Agentic boom', color: '#008300',
    thesis: 'Agents reliably finish multi-day work and pricing shifts to outcomes. Usage responds strongly to falling prices, revenue grows into the capital charge on the installed base, and there is no crash. Base models still commoditise, but cheap tokens drive enormous volume (the Jevons effect) and value moves to agents and workflows.',
    first: ['Outcome-based pricing spreads', 'Revenue covers the capital charge', 'Measured productivity growth rises'],
    d: {
      capital: [0.8, 0.8, 0.75, 0.7, 0.65], rates: [0.6, 0.55, 0.5, 0.5, 0.5], adoption: [0.8, 0.9, 0.95, 0.95, 0.95],
      conv: [0.6, 0.7, 0.8, 0.85, 0.85], brk: [0.15, 0.15, 0.1, 0.1, 0.1], efficiency: [0.65, 0.7, 0.75, 0.75, 0.75],
      hwSupply: [0.35, 0.5, 0.7, 0.7, 0.7], energy: [0.5, 0.45, 0.4, 0.4, 0.4], geo: [0.3, 0.3, 0.3, 0.3, 0.3],
      regulation: [0.35, 0.4, 0.45, 0.45, 0.45], trust: [0.15, 0.15, 0.15, 0.15, 0.15], sovereignty: [0.4, 0.45, 0.5, 0.5, 0.5],
      platform: [0.6, 0.6, 0.55, 0.55, 0.55], elastic: [0.6, 0.65, 0.7, 0.7, 0.7]
    },
    imp: [],
    ev: [
      [2027, 'Agents complete multi-day workflows; per-outcome pricing spreads'],
      [2028.25, 'AI revenue run-rate passes $700B'],
      [2028.75, 'Revenue covers the capital charge on the installed base; bubble talk fades'],
      [2030, 'AI adds more than 3 points to US GDP growth'],
      [2030.25, 'Base models commoditise; value shifts to agents and workflows'],
      [2031, 'Labour-market disruption becomes a top political issue']
    ]
  },
  {
    key: 'TRST', name: 'Trust Shock', short: 'Trust shock', color: '#e66767',
    thesis: 'An AI-enabled cyberattack through compromised agents hits thousands of firms. Insurers exclude agent losses, liability rules arrive and adoption barely grows for about three years; with revenue flat and the installed base still to be paid for, credit stress spikes. Demand shifts to verified, local and sovereign deployments, and security becomes the main differentiator.',
    first: ['Major agent supply-chain breach', 'Insurers exclude autonomous agents', 'Audit-trail mandates'],
    d: {
      capital: [0.6, 0.45, 0.55, 0.6, 0.6], rates: [0.65, 0.6, 0.55, 0.5, 0.5], adoption: [0.45, 0.4, 0.55, 0.65, 0.7],
      conv: [0.55, 0.6, 0.65, 0.7, 0.7], brk: [0.08, 0.05, 0.05, 0.08, 0.08], efficiency: [0.6, 0.6, 0.65, 0.7, 0.7],
      hwSupply: [0.35, 0.55, 0.65, 0.65, 0.65], energy: [0.55, 0.5, 0.5, 0.5, 0.45], geo: [0.45, 0.5, 0.45, 0.45, 0.4],
      regulation: [0.55, 0.75, 0.7, 0.65, 0.6], trust: [0.75, 0.6, 0.4, 0.3, 0.25], sovereignty: [0.55, 0.8, 0.85, 0.8, 0.75],
      platform: [0.65, 0.7, 0.7, 0.7, 0.65], elastic: [0.45, 0.45, 0.45, 0.45, 0.45]
    },
    imp: [{ t: 2027.25, S: -15, Cs: 5 }],
    ev: [
      [2027.25, 'Agent supply-chain attack compromises thousands of firms'],
      [2027.5, 'Insurers exclude autonomous-agent losses; adoption pauses'],
      [2028, 'Liability rules require audit trails and human sign-off'],
      [2028.5, 'Buyers shift to verified, local and sovereign deployments'],
      [2029.25, 'Provenance standards start restoring signal-to-noise'],
      [2030.25, 'Security spend doubles; adoption resumes on new rails']
    ]
  },
  {
    key: 'PLAT', name: 'Commodity Models, Concentrated Platforms', short: 'Platforms', color: '#199e70',
    thesis: 'Model capability and model prices converge, but the money does not follow them. Identity, workflow, data, distribution and governance keep switching costs high, so a few cloud and suite platforms bundle cheap models into existing contracts and keep most of the value. Model labs become suppliers on thin margins; open models spread underneath the platforms rather than replacing them.',
    first: ['Model prices fall without matching cuts in application bills', 'AI usage bundled into seat and usage plans', 'Platform migrations stay rare and expensive'],
    d: {
      capital: [0.65, 0.6, 0.55, 0.55, 0.55], rates: [0.6, 0.55, 0.5, 0.5, 0.5], adoption: [0.65, 0.7, 0.75, 0.75, 0.75],
      conv: [0.75, 0.85, 0.9, 0.9, 0.9], brk: [0.05, 0.04, 0.03, 0.03, 0.03], efficiency: [0.65, 0.75, 0.8, 0.75, 0.7],
      hwSupply: [0.35, 0.55, 0.75, 0.75, 0.7], energy: [0.55, 0.55, 0.5, 0.5, 0.45], geo: [0.35, 0.35, 0.35, 0.35, 0.35],
      regulation: [0.4, 0.45, 0.5, 0.5, 0.5], trust: [0.2, 0.25, 0.25, 0.2, 0.2], sovereignty: [0.4, 0.45, 0.45, 0.45, 0.45],
      platform: [0.7, 0.8, 0.85, 0.85, 0.85], elastic: [0.45, 0.45, 0.45, 0.45, 0.45]
    },
    imp: [{ t: 2028.25, PF: 4 }],
    ev: [
      [2027.25, 'Cloud suites bundle frontier-class models into existing seat plans'],
      [2027.75, 'Model API prices fall sharply; application bills barely move'],
      [2028.25, 'Two independent labs become exclusive suppliers to platform vendors'],
      [2029, 'Regulators open inquiries into AI bundling and data portability'],
      [2030.25, 'Open models run inside platforms rather than replacing them'],
      [2032, 'Platform owners, not model makers, hold most AI margins']
    ]
  }
];

/* ---------------- shocks (optional add-ons; none is included in the preset results) ----------------
   d: driver jolts [amount, 'p' (fades; half-life in years) | 's' (permanent, phased in over 6 months), half-life]
   s: one-off jolts to hype (S), credit stress (Cs), lab distress (PF), labs at parity (Np), top-3 share (TC)
   x: direct structural effects — ceil: change in the automation ceiling (points); kappa: multiplier on compute per token */
const SHOCKS = [
  { id: 'rates', name: 'Bond rout / rate spike', t: 2027, desc: 'Yields jump; debt-funded build-outs reprice.', d: { rates: [0.35, 'p', 1.5], capital: [-0.2, 'p', 1] }, s: { Cs: 12, S: -8 } },
  { id: 'slowconv', name: 'Slow organisational conversion', t: 2027, desc: 'Capability keeps improving, but review, integration and rework cap how much work actually gets automated.', d: { adoption: [-0.15, 's'] }, s: {}, x: { ceil: -15 } },
  { id: 'neocloud', name: 'Neocloud credit crunch', t: 2027.25, desc: 'GPU-backed lenders pull back; neoclouds refinance at distressed yields and dump capacity.', d: { rates: [0.15, 'p', 1], capital: [-0.2, 'p', 1], hwSupply: [0.2, 'p', 1.5] }, s: { Cs: 12, S: -6 } },
  { id: 'energy', name: 'Energy price shock', t: 2027.25, desc: 'A gas or LNG crisis or grid failure lifts power prices.', d: { energy: [0.45, 'p', 1.5] }, s: { Cs: 4 } },
  { id: 'moratoria', name: 'Ratepayer revolt & moratoria', t: 2027.5, desc: 'States cap data-centre hook-ups and shift grid costs onto them.', d: { energy: [0.35, 's'], regulation: [0.15, 's'] }, s: { Cs: 6 } },
  { id: 'access', name: 'Export-control access shock', t: 2027.5, desc: 'A government order cuts access to some frontier models for weeks (a three-week precedent occurred in June 2026). An outage, not an insolvency.', d: { geo: [0.3, 'p', 1], sovereignty: [0.35, 's'], trust: [0.1, 'p', 1] }, s: { S: -6, TC: -6 } },
  { id: 'copyright', name: 'Copyright & liability ruling', t: 2027.5, desc: 'Courts restrict training data; providers carry output liability.', d: { regulation: [0.35, 's'], conv: [-0.1, 's'] }, s: { S: -5 } },
  { id: 'weakmon', name: 'Efficiency dividend, weak monetisation', t: 2027.5, desc: 'Useful AI spreads but users keep the gains: usage grows less than prices fall and switching gets easier.', d: { elastic: [-0.35, 's'], platform: [-0.25, 's'], efficiency: [0.15, 's'] }, s: {} },
  { id: 'cyber', name: 'AI-enabled cyber catastrophe', t: 2027.75, desc: 'Compromised agents and model supply chains cause a systemic breach.', d: { trust: [0.6, 'p', 1.5], regulation: [0.3, 's'], sovereignty: [0.3, 's'], adoption: [-0.25, 'p', 1] }, s: { S: -15 } },
  { id: 'china', name: 'China open-weight leapfrog', t: 2027.75, desc: 'Chinese labs reach frontier parity with cheap open weights trained on domestic chips.', d: { conv: [0.3, 's'], brk: [-0.1, 's'], sovereignty: [0.15, 's'], geo: [0.1, 's'], platform: [-0.1, 's'] }, s: { S: -8, TC: -8 } },
  { id: 'default', name: 'Frontier lab default', t: 2028, desc: 'A top lab cannot refinance; customers scramble.', d: { capital: [-0.25, 'p', 1], trust: [0.15, 'p', 1] }, s: { Cs: 18, S: -12, PF: 15, Np: -1, TC: -4 } },
  { id: 'glut', name: 'Memory & chip glut', t: 2028, desc: 'New fabs land as demand cools; DRAM and GPUs flood the market.', d: { hwSupply: [0.45, 'p', 2] }, s: {} },
  { id: 'owr', name: 'Open-weight restrictions', t: 2028, desc: 'Governments restrict publishing frontier-class weights or ban foreign weights in enterprise use.', d: { regulation: [0.35, 's'], conv: [-0.3, 's'], sovereignty: [0.25, 's'], geo: [0.15, 'p', 2] }, s: { S: -4 } },
  { id: 'asic', name: 'GPU moat breaks (custom silicon)', t: 2028, desc: 'Custom accelerators and new architectures take most workloads; GPU margins and rents fall.', d: { hwSupply: [0.35, 'p', 3], efficiency: [0.15, 's'], capital: [-0.15, 'p', 1] }, s: { Cs: 6 } },
  { id: 'effleap', name: 'Efficiency breakthrough (10× less compute)', t: 2028.25, desc: 'A new architecture needs a tenth of the compute per token within a year; prices follow costs.', d: { conv: [0.1, 's'] }, s: { S: 4 }, x: { kappa: 0.1 } },
  { id: 'taiwan', name: 'Taiwan Strait blockade', t: 2028.5, desc: 'Leading-edge chip and memory supply halts for months.', d: { geo: [0.55, 'p', 2], hwSupply: [-0.5, 'p', 1.5], capital: [-0.2, 'p', 1], sovereignty: [0.3, 's'] }, s: { S: -15, Cs: 10 } },
  { id: 'agi', name: 'Autonomous-agent leap', t: 2029, desc: 'Agents that run whole functions unsupervised arrive.', d: { brk: [0.4, 'p', 3], adoption: [0.2, 's'] }, s: { S: 15 } }
];

/* ---------------- driver paths and structural shock effects ---------------- */
function driverPaths(scn, mods) {
  const D = {};
  for (const k of DK) {
    const pts = [[NOW_T, BASE[k]]].concat(KT.map((t, j) => [t, scn.d[k][j]]));
    const off = (mods && mods.offsets && mods.offsets[k]) || 0;
    const arr = new Array(NQ);
    for (let i = 0; i < NQ; i++) {
      const t = tAt(i);
      let v = keyframe(pts, t);
      if (t > NOW_T) {
        v += off * smoothstep((t - NOW_T) / 0.75);
        if (mods && mods.shocks) for (const sh of mods.shocks) {
          const def = SHOCKS.find(s => s.id === sh.id); if (!def || !def.d[k]) continue;
          const [amt, shape, hl] = def.d[k];
          const age = t - sh.t;
          if (age < 0) continue;
          v += shape === 's' ? amt * smoothstep(age / 0.5) : amt * Math.pow(0.5, age / hl);
        }
      }
      arr[i] = clamp(v, 0, 1);
    }
    D[k] = arr;
  }
  return D;
}
function shockFx(mods) {
  const ceil = new Array(NQ).fill(0), lnKap = new Array(NQ).fill(0);
  if (mods && mods.shocks) for (const sh of mods.shocks) {
    const def = SHOCKS.find(s => s.id === sh.id); if (!def || !def.x) continue;
    for (let i = 0; i < NQ; i++) {
      const age = tAt(i) - sh.t; if (age < 0 || tAt(i) <= NOW_T) continue;
      if (def.x.ceil) ceil[i] += def.x.ceil * smoothstep(age / 1.0);
      if (def.x.kappa) lnKap[i] += Math.log(def.x.kappa) * smoothstep(age / 1.0);
    }
  }
  return { ceil, lnKap };
}

/* ---------------- the simulation ---------------- */
const SERIES = Object.keys(HIST);
const EXTRA = ['prem', 'gK', 'gR', 'VC', 'Mult', 'Pavg', 'sf', 'mf', 'AIT', 'cov', 'ST', 'Uf', 'CC', 'ccov', 'B5', 'AUp', 'AUd', 'SV', 'Uopp', 'Ufp', 'STp', 'SVp',
  'CapV', 'CapPow', 'Avail', 'Dsum', 'Dp', 'Do', 'Served', 'Sp', 'kap', 'tau', 'Ctask', 'CtaskI', 'CR', 'CRp', 'eps', 'share', 'mc', 'Rf', 'Kmaint',
  'BLD', 'AUa', 'AUdev', 'seatG', 'seatA', 'seatD', 'PLAT'];

function simulate(scn, mods, opts) {
  opts = opts || {};
  const D = driverPaths(scn, mods);
  const FX = shockFx(mods);
  const o = {};
  for (const k of SERIES.concat(EXTRA)) o[k] = new Array(NQ).fill(NaN);
  // reported figures are converted to the model's economic basis; the conversion is undone for display at the end,
  // so a presentation change (gross ↔ net revenue, finance ↔ operating leases) cannot by itself move the model
  const rb = P.revBasis, kb = P.capexBasis;
  const Kh = t => interp(HIST.K.pts, t, true) / kb;
  for (let i = 0; i <= NOW_I; i++) for (const k of SERIES) {
    const h = HIST[k], t = tAt(i);
    o[k][i] = (h.from && t < h.from - 1e-9) ? NaN : interp(h.pts, t, h.log) / (k === 'R' ? rb : k === 'K' ? kb : 1);
  }

  // capex by quarter, including 5 years before T0 (for the installed base)
  const KOFF = 20;
  const Kq = new Array(NQ + KOFF);
  for (let j = 0; j < KOFF + NOW_I + 1; j++) Kq[j] = Kh(T0 + (j - KOFF) / 4);
  const baseAt = j => { let s = 0; for (let q = mx(0, j - 19); q <= j; q++) s += Kq[q] / 4; return s; };
  const chargeRate = 1 / P.depLife + P.coc * 0.5;

  const N = NOW_I;
  const R0 = o.R[N], W0 = o.AU[N], K0 = o.K[N];
  const VC0 = P.pool0 * W0 / 100, CR0 = R0 / VC0;

  // history-derived extras
  for (let i = 0; i <= N; i++) {
    const t = tAt(i);
    o.prem[i] = o.Pf[i] / o.Pc[i];
    const Kp = i >= 4 ? o.K[i - 4] : Kh(t - 1);
    const Rp = i >= 4 ? o.R[i - 4] : mx(1, interp(HIST.R.pts, t - 1, true) / rb * (t - 1 < T0 ? 0.4 : 1));
    o.gK[i] = ln(o.K[i] / Kp);
    o.gR[i] = ln(o.R[i] / Rp);
    o.VC[i] = P.pool0 * Math.pow(1 + P.poolG, t - NOW_T) * o.AU[i] / 100;
    o.sf[i] = 0.12 + 0.35 * (1 - ex(-o.G[i] / 4)) + 0.015;
    o.Pavg[i] = o.sf[i] * o.Pf[i] + (1 - o.sf[i]) * o.Pc[i];
    o.AIT[i] = o.DC[i] - P.nonAiTWh0 * Math.pow(1 + P.nonAiG, t - NOW_T);
    o.cov[i] = o.R[i] / (1.4 * o.K[i]);
    o.B5[i] = baseAt(i + KOFF);
    o.CC[i] = o.B5[i] * chargeRate;
    o.ccov[i] = o.R[i] / o.CC[i];
    o.ST[i] = 0; o.Uf[i] = o.U[i];
    o.AUp[i] = o.AU[i]; o.AUd[i] = o.AU[i];
    o.SV[i] = 1 / (1 + o.SC[i]);
    o.Uopp[i] = 100 * o.U[i]; o.Ufp[i] = 100 * o.U[i]; o.STp[i] = 0; o.SVp[i] = 100 * o.SV[i];
    o.share[i] = P.labShare0;
    o.Mult[i] = o.VL[i] * 1000 / (P.labShare0 * o.R[i]);
    o.mf[i] = o.prem[i] / P.Rf0;
    o.eps[i] = P.epsLo + (P.epsHi - P.epsLo) * BASE.elastic;
    o.Kmaint[i] = P.maint0 * Math.pow(1 + P.maintG, t - P.maintT0);
    o.CR[i] = o.R[i] / o.VC[i];
  }

  // ---- state at NOW ----
  let K = K0, S = o.S[N], Cs = o.Cs[N], Bs = o.Bs[N], G = o.G[N], Np = o.Np[N];
  let Pc = o.Pc[N], prem = o.prem[N], DR = o.DR[N], LB = o.LB[N], OS = o.OS[N], ES = o.ES[N], LS = o.LS[N], AS = o.AS[N];
  let TC = o.TC[N], PF = o.PF[N], SN = o.SN[N], GDPc = o.GDP[N], GR = o.GR[N], Pp = o.Pp[N];
  let VL = o.VL[N], VN = o.VN[N], DS = o.DS[N];
  let AUp = W0;
  let gK_s = ln(o.K[N] / o.K[N - 4]);
  let gR_s = ln(o.R[N] / o.R[N - 4]);
  const prem0 = prem, AS0 = AS, LS0 = LS, TC0 = TC, Pc0 = Pc, Pp0 = Pp, DR0 = DR, VN0 = VN, PF0 = PF;
  const sf0 = 0.12 + 0.35 * (1 - ex(-G / 4)) + 0.15 * BASE.brk;
  const Pavg0 = sf0 * Pc * prem + (1 - sf0) * Pc;
  const eps0 = P.epsLo + (P.epsHi - P.epsLo) * BASE.elastic;

  // compute capacity: accelerator vintages (index offset OFF so history reaches back accelLife quarters)
  const OFF = P.accelLife, NV = NQ + OFF, L = P.accelLife;
  const buy = new Array(NV).fill(0), fpd = new Array(NV).fill(0);
  for (let j = 0; j < NV; j++) {
    const t = T0 + (j - OFF) / 4;
    if (j - OFF <= NOW_I) { fpd[j] = ex(0.32 * (t - NOW_T)); buy[j] = Kh(t) / 4 * fpd[j]; }
  }
  const capAt = jj => { let s = 0; for (let j = mx(0, jj - L + 1); j <= jj; j++) s += buy[j]; return s; };
  const CapV0 = capAt(N + OFF);
  const gCap0 = ln(CapV0 / capAt(N + OFF - 4));
  const AIT0 = o.AIT[N];
  let GL = AIT0 * (1 + P.gridHeadroom);       // power available for AI, TWh a year
  const cpt0 = CapV0 / AIT0;                   // compute per TWh today (model units)
  const Avail0 = CapV0;                        // not power-bound today
  const Dp0 = P.prodShare0 * Avail0, Do0 = (1 + P.excess0) * Avail0 - Dp0;
  const kW = Dp0 / W0;                         // compute per point of realised work, today
  let scar = P.excess0, strand = 0, U = 1, AIT = AIT0;
  let lnKap = 0, lnTau = 0, lnOther = 0, lnCpt = 0;
  let peakVL = mx(...o.VL.slice(0, N + 1)), peakVN = mx(...o.VN.slice(0, N + 1));
  o.CapV[N] = CapV0; o.CapPow[N] = GL * cpt0; o.Avail[N] = Avail0; o.Dsum[N] = Dp0 + Do0; o.Dp[N] = Dp0; o.Do[N] = Do0;
  o.Served[N] = Avail0; o.Sp[N] = Dp0; o.kap[N] = 1; o.tau[N] = 1; o.Ctask[N] = 1; o.CR[N] = CR0; o.CRp[N] = 100 * CR0; o.mc[N] = P.mc0; o.Rf[N] = P.Rf0;
  o.U[N] = 1; o.SC[N] = scar; o.Uf[N] = 1; o.SV[N] = 1 / (1 + scar); o.SVp[N] = 100 * o.SV[N]; o.Uopp[N] = 100; o.Ufp[N] = 100; o.eps[N] = eps0;

  // ---- behavioural functions (each is offset by a calibration constant so Q4 2026 is reproduced) ----
  const f = {
    S: (d, x) => 16 * Math.tanh(1.3 * (x.gR - 0.45)) + 18 * (d.capital - 0.5) + 25 * d.brk - 35 * mx(0, d.trust - 0.2) - 0.45 * mx(0, x.Cs - 50) + 10 * (ln(x.prem) / ln(prem0) - 1) + 8 * (x.cov - 0.25),
    gK: (d, x) => 0.6 * (d.capital - 0.5) + 0.5 * (x.S - 60) / 40 + 1.2 * (x.U - 0.9) + 0.4 * mn(x.scar, 0.8) * (1 - x.strand) - P.strandBrake * mx(0, x.strand - P.strandFree) + 0.35 * d.brk - 0.35 * (d.rates - 0.5) - 0.9 * mx(0, x.Cs - 60) / 40 - 0.5 * mx(0, d.energy - 0.6) - 0.4 * mx(0, 0.3 - d.hwSupply) - 0.35 * mx(0, ln(x.K / (1.6 * x.R))) - 0.8 * mx(0, ln(x.K / ((1.4 + 2.6 * ex(-(x.t - NOW_T) / 2.5) * (0.4 + 0.8 * d.capital)) * x.R))) + 0.3 * (mn(x.cov, 0.8) - 0.25) - 0.35 * mx(0, d.geo - 0.55),
    r: (d, x) => 1.1 * (d.adoption - 0.6) + 0.35 * d.brk - 0.8 * mx(0, d.trust - 0.25) - 0.5 * mx(0, d.regulation - 0.45) - 0.8 * mx(0, x.Cs - 65) / 30 - 0.3 * mx(0, d.energy - 0.7) - 0.4 * mx(0, d.geo - 0.6),
    b: (d, x) => 0.45 * ln(1 + x.G) + 1.0 * d.brk - 0.09 * (x.Np - 2) + 0.7 * mn(x.scar, 0.6) + 0.4 * (d.regulation - 0.3) - 0.4 * (d.capital - 0.5) + 0.3 * (d.rates - 0.5) - 0.3 * (d.sovereignty - 0.35) + 0.3 * (d.platform - BASE.platform),
    Cs: (d, x) => 120 * x.DS * (1 - mn(1, x.ccov)) + 22 * (d.rates - 0.3) + 30 * mx(x.DD, x.DDn) + 30 * mx(0, 0.75 - x.Uf) + 12 * mx(0, d.geo - 0.5) + 10 * mx(0, d.trust - 0.4) + 12 * (x.S / 100) * (1 - mn(1, x.ccov)) + 0.4 * mx(0, x.PF - PF0),
    Geq: (d) => 0.5 + 6 * Math.pow(1 - d.conv, 1.5) + 14 * d.brk + 1.5 * mx(0, d.geo - 0.5) - 1.0 * mx(0, d.efficiency - 0.6),
    Np: (d, x) => 25 * (1 - ex(-3 / x.G)) * (0.3 + 0.7 * d.conv) - 9 * mx(0, x.Cs - 60) / 40 - 6 * mx(0, d.regulation - 0.5) + 3 * mx(0, d.sovereignty - 0.5),
    TC: (d, x) => 40 * (1 - ex(-x.G / 3)) + 10 * d.brk - 18 * mx(0, d.geo - 0.3) - 14 * (d.sovereignty - 0.35) - 0.6 * (x.Np - 12) + 8 * mx(0, d.regulation - 0.5) + 15 * (d.platform - BASE.platform),
    health: (d, x) => 0.4 * (x.S - 60) / 40 + 0.5 * (x.gR - 0.4) + 0.15 * ln(x.prem / prem0) - 0.7 * (x.Cs - 55) / 30 - 0.012 * (x.Np - 12),
    OS: (d, x) => 55 * (1 - ex(-2.5 / x.G)) * (0.4 + 0.6 * d.conv) + 15 * (d.sovereignty - 0.35) + 12 * mx(0, d.trust - 0.3) - 25 * mx(0, d.regulation - 0.55) - 12 * d.brk + 10 * mx(0, d.geo - 0.5),
    ES: (d, x) => 30 * (1 - ex(-2 / x.G)) * (0.3 + 0.7 * d.conv) + 20 * (d.sovereignty - 0.35) + 10 * mx(0, d.trust - 0.3) - 15 * mx(0, d.regulation - 0.55) - 10 * d.brk - 15 * (d.platform - BASE.platform),
    LS: (d, x) => 32 * clamp(ln(3600 / x.LB) / ln(6), 0, 1) * (1 - ex(-2.5 / x.G)) + 22 * (d.sovereignty - 0.35) + 14 * mx(0, d.trust - 0.3) + 8 * mx(0, d.geo - 0.4) + 6 * mx(0, d.energy - 0.6),
    AS: (d, x) => 35 * (1 - clamp(1 - ex(-x.G / 4) + 0.3 * d.brk, 0, 1)) + 25 * (d.adoption - 0.3) + 15 * mx(0, d.energy - 0.4) + 10 * (d.efficiency - 0.5) + 8 * (d.regulation - 0.3) + 4 * mn(6, x.t - NOW_T),
    SN: (d, x) => -25 * (ln(Pc0 / x.Pc) / ln(10)) - 40 * mx(0, d.trust - 0.2) + 18 * (d.regulation - 0.35) + mn(15, 3 * mx(0, x.t - 2028) * (0.6 + 0.4 * d.regulation)),
    DR: (d, x) => 0.7 * (x.gK - 0.05) - 1.6 * (d.hwSupply - 0.4) + 2.5 * mx(0, d.geo - 0.45) + 0.6 * mn(x.scar, 0.8),
    Mult: (d, x) => 0.7 * (x.gR - 1.0) + ln(mx(5, x.S) / 84) + 0.2 * ln(x.prem / prem0) - 0.9 * (d.rates - 0.65),
    VN: (d, x) => 0.7 * ln(x.K / K0) + 0.3 * (x.gK - 0.45) + 0.4 * ln(mx(5, x.S) / 84) + 0.5 * ln(x.gm / 0.72) - 0.6 * (d.rates - 0.65) + ln(1 - 0.35 * mx(0, d.geo - 0.6)),
    mc: (d, x) => -1.5 * (d.conv - BASE.conv) - 0.04 * (x.Np - 12) + 0.6 * mx(0, d.geo - 0.5)
  };
  const d0 = {}; for (const k of DK) d0[k] = BASE[k];
  const DS0 = DS;
  const CC0 = o.CC[N], ccov0 = R0 / CC0, cov0 = o.cov[N];
  const x0 = { strand: 0, gR: gR_s, gK: gK_s, prem, cov: cov0, ccov: ccov0, Cs, S, U: 1, Uf: 1, scar, K, R: R0, G, Np, DS, DD: 0, DDn: 0, Pc, LB, t: NOW_T, gm: 0.72, PF };
  const c = {
    S: S - f.S(d0, x0), gK: gK_s - f.gK(d0, x0), b: ln(prem / P.Rf0) - f.b(d0, x0), Cs: Cs - f.Cs(d0, x0),
    G: G - f.Geq(d0), Np: Np - f.Np(d0, x0), TC: TC - f.TC(d0, x0), OS: OS - f.OS(d0, x0), ES: ES - f.ES(d0, x0),
    LS: LS - f.LS(d0, x0), AS: AS - f.AS(d0, x0), SN: SN - f.SN(d0, x0), DR: ln(DR) - f.DR(d0, x0),
    Mult: ln(o.Mult[N]) - f.Mult(d0, x0), VN: ln(VN) - f.VN(d0, x0)
  };
  const h0 = f.health(d0, x0);
  const pfK = ln((PF - 2) / (52 - PF)) + 1.0 * h0; // PF = 2 + 50·sigmoid(pfK − health)
  const rDrv0 = f.r(d0, x0);
  // demand calibration: desired compute grows with capacity in the first year, so today's 4% excess neither vanishes nor
  // explodes. The extra growth of training/R&D/free-tier compute closes the gap (documented assumption).
  const AUmax0 = P.auCeil, gPrice0 = -(P.hwPP + P.algEff);
  const wP = Dp0 / (Dp0 + Do0), wO = 1 - wP;
  const gW0 = P.auRateNow * (1 - W0 / AUmax0) + P.workElas * eps0 * (-gPrice0 - P.tauNow);
  const gDp0 = gW0 + P.tauNow - P.algEff;
  const otherNow = opts.otherNow != null ? opts.otherNow : calibOther((gCap0 - wP * gDp0 - wO * (eps0 * -gPrice0 - P.algEff)) / wO);
  // GDP: anchor the first simulated quarter on the observed level; the gap to the formula fades over two years
  const gdp0 = 31000;
  const aic = (vn, vl) => 15 * Math.pow(vn / VN0, 0.5) + 0.5 * vl;
  const gdpRaw = (Kn, Kp, vn, vl, vnp, vlp, vc, vcp, g) => P.gdpCapex * (Kn - Kp) / g * 100 + P.gdpWealth * (aic(vn, vl) - aic(vnp, vlp)) * 1000 / g * 100 + P.gdpProd * (vc - vcp) / g * 100;
  const gdpAdj = o.GDP[N] - gdpRaw(o.K[N], o.K[N - 4], VN, VL, o.VN[N - 4], o.VL[N - 4], o.VC[N], o.VC[N - 4], gdp0);

  const imps = {};
  const addImp = (t, obj) => { const i = idxOf(t); if (i <= N) return; imps[i] = imps[i] || {}; for (const k in obj) if (k !== 't') imps[i][k] = (imps[i][k] || 0) + obj[k]; };
  (scn.imp || []).forEach(m => addImp(m.t, m));
  if (mods && mods.shocks) mods.shocks.forEach(sh => { const def = SHOCKS.find(s => s.id === sh.id); if (def) addImp(sh.t, def.s); });

  let prevDR = DR;

  const stopAt = opts.stop || NQ;
  for (let i = N + 1; i < stopAt; i++) {
    const t = tAt(i), dt = t - NOW_T, d = {};
    for (const k of DK) d[k] = D[k][i];
    const eps = P.epsLo + (P.epsHi - P.epsLo) * d.elastic;
    const R = o.R[i - 1], cov = R / (1.4 * K), ccov = o.ccov[i - 1];
    const x = { gR: gR_s, gK: gK_s, prem, cov, ccov, Cs, S, U, Uf: o.Uf[i - 1], scar, K, R, G, Np, DS, Pc, LB, t, strand, PF };

    // 1. sentiment
    const S_t = clamp(c.S + f.S(d, x), 3, 96);
    S += DT * 1.8 * (S_t - S);
    // 2. capex = non-discretionary floor + discretionary AI build-out (the discretionary part can fall to zero)
    const gK_t = mx(P.gKmin, 0.03 + (c.gK - 0.03) * ex(-dt / 2) + f.gK(d, x));
    gK_s += DT * 2.5 * (gK_t - gK_s);
    const Kmaint = P.maint0 * Math.pow(1 + P.maintG, t - P.maintT0);
    K = mx(Kmaint, K * ex(DT * gK_s));
    Kq[i + KOFF] = K;
    // 3. potential work: the organisational adoption S-curve (falls if the ceiling drops below it)
    const AUmax = clamp(P.auCeil + 10 * (d.brk - 0.1) + 10 * (d.efficiency - 0.55) - 12 * mx(0, d.regulation - 0.4) + 8 * (d.adoption - 0.6) + FX.ceil[i], 5, P.auCeilMax);
    const r = mx(0.02, P.auRateLong + (P.auRateNow - P.auRateLong) * ex(-dt / P.auFade) + f.r(d, x) - rDrv0);
    AUp += DT * r * AUp * (1 - AUp / AUmax);
    AUp = mx(AUp, 0.05);
    // 4. compute per token (efficiency) and tokens per completed task (reasoning, agents, retries)
    const fadeT = ex(-dt / P.techFade);
    lnKap -= DT * (P.algLong + (P.algEff - P.algLong) * fadeT) * (d.efficiency / BASE.efficiency);
    const kap = ex(lnKap + FX.lnKap[i]);
    const gTau = P.tauLong + (P.tauNow - P.tauLong) * ex(-dt / P.tauFade) + 0.2 * (d.adoption - 0.6) + 0.3 * (d.brk - 0.1);
    lnTau += DT * gTau;
    const tau = ex(lnTau);
    // 5. purchased (fleet) and powered capacity
    const hj = P.hwLong + (P.hwPP - P.hwLong) * fadeT + 0.2 * (d.hwSupply - 0.4) - 0.3 * mx(0, d.geo - 0.6);
    const jj = i + OFF;
    fpd[jj] = fpd[jj - 1] * ex(DT * hj);
    buy[jj] = K / 4 * fpd[jj];
    const CapV = capAt(jj);
    GL *= ex(DT * ((P.gridNow - P.gridEnergy * d.energy) * ex(-dt / P.gridFade) + P.gridLong + P.onsite * strand));
    lnCpt += DT * (P.cptLong + (P.cptG - P.cptLong) * fadeT);
    const cpt = cpt0 * ex(lnCpt);
    const CapPow = GL * cpt;
    const Avail = mn(CapV, CapPow);
    strand = CapV > 0 ? mx(0, 1 - CapPow / CapV) : 0;
    // 6. memory and power prices (power uses last quarter's AI load)
    const DR_t = ex(c.DR + f.DR(d, { gK: gK_s, scar }));
    DR += DT * 1.3 * (DR_t - DR);
    const gDR = ln(DR / prevDR) / DT; prevDR = DR;
    const Pp_t = Pp0 * Math.pow(1.025, dt) * Math.pow(mx(1e-6, AIT) / AIT0, 0.15) * (1 + 0.55 * (d.energy - 0.55)) * (1 + 0.25 * mx(0, d.geo - 0.5));
    Pp += DT * 1.5 * (Pp_t - Pp);
    // 7. competition
    const Geq = mx(0.5, c.G + f.Geq(d));
    G += DT * 1.2 * (Geq - G);
    x.G = G;
    const Np_t = mx(1, c.Np + f.Np(d, x));
    Np += DT * 1.2 * (Np_t - Np);
    x.Np = Np;
    // 8. prices: good-enough tier = unit resource cost × (1 + markup); frontier = resource-cost ratio × markup ratio
    const uc = (fpd[N + OFF] / fpd[jj]) * kap * (1 + 1.2 * mn(scar, 1.5)) / (1 + 1.2 * P.excess0) * Math.pow(Pp / Pp0, 0.15) * Math.pow(DR / DR0, 0.10) * (1 + 0.3 * mx(0, d.geo - 0.5)) * (1 + 0.2 * mx(0, d.regulation - 0.4));
    const mc = mx(P.mcFloor, P.mc0 * ex(f.mc(d, x)));
    const Pc_t = mx(P.pcFloor * Pp / Pp0, Pc0 * uc * (1 + mc) / (1 + P.mc0));
    Pc = ex(ln(Pc) + DT * 3 * (ln(Pc_t) - ln(Pc)));
    const Rf = P.Rf0 * ex(0.7 * (d.brk - 0.1)) * ex(-P.RfDecline * dt);
    const Mf = clamp(ex(c.b + f.b(d, x)), P.markupMin, P.markupMax);
    prem = ex(ln(prem) + DT * 2 * (ln(Rf * Mf) - ln(prem)));
    const Pf = Pc * prem;
    const sf = 0.12 + 0.35 * (1 - ex(-G / 4)) + 0.15 * d.brk;
    const Pavg = sf * Pf + (1 - sf) * Pc;
    // 9. work demand and compute demand
    const Ctask = (Pavg / Pavg0) * tau;                                    // cost of a completed task, relative to today
    const wMult = ex(P.workSat * Math.tanh(-P.workElas * eps * ln(Ctask) / P.workSat)); // ≈ Ctask^(−workElas·eps), saturating
    const Wd = mn(P.auHard, AUp * wMult);                                  // automated work wanted after the price response
    const cw = tau * kap;                                                 // compute per unit of work, relative to today
    const Dp = kW * Wd * cw;
    const gOther = clamp(P.otherLong + (otherNow - P.otherLong) * ex(-dt / P.otherFade) + 0.3 * (d.brk - 0.1) + 0.3 * (d.capital - BASE.capital) - 0.6 * mx(0, d.trust - 0.3) - P.otherScar * (mn(scar, 1) - P.excess0), -0.3, 1.5);
    lnOther += DT * gOther;
    const Do = Do0 * ex(lnOther) * Math.pow(Pc / Pc0, -eps) * kap;         // training, R&D and free-tier use, elasticity eps
    const Dsum = Dp + Do;
    // 10. serving: paid productive work first (up to prodShareMax of what is served)
    const Served = mn(Dsum, Avail);
    const Sp = mn(Dp, mx(P.prodShareMax * Served, Served - Do));
    const W = Wd * (Dp > 0 ? Sp / Dp : 1);                                // realised work, % of knowledge-work value
    U = Avail > 0 ? Served / Avail : 0;
    const Uf = CapV > 0 ? Served / CapV : 0;
    scar = clamp(Dsum / mx(1e-9, Avail) - 1, 0, 1.5);
    AIT = Served / cpt;
    const DC = P.nonAiTWh0 * Math.pow(1 + P.nonAiG, dt) + AIT;
    // 11. market shares
    const OS_t = clamp(c.OS + f.OS(d, x), 2, 92); OS += DT * 0.8 * (OS_t - OS);
    const ES_t = clamp(c.ES + f.ES(d, x), 1, 80); ES += DT * 0.6 * (ES_t - ES);
    x.LB = LB;
    const LS_t = clamp(c.LS + f.LS(d, x), 1, 70); LS += DT * 0.6 * (LS_t - LS);
    const AS_t = clamp(c.AS + f.AS(d, x), 2, 85); AS += DT * 0.8 * (AS_t - AS);
    const TC_t = clamp(c.TC + f.TC(d, x), 25, 98); TC += DT * 0.9 * (TC_t - TC);
    // 12. revenue = value of realised work × capture; capture blends cost-priced and value-priced revenue
    const VC = P.pool0 * Math.pow(1 + P.poolG, dt) * W / 100;
    const valuePart = (1 + 0.9 * (AS - AS0) / 100) * ex(0.8 * (d.platform - BASE.platform)) * Math.pow(prem / prem0, 0.1);
    const CRraw = CR0 * ((1 - P.valueShare0) * Ctask + P.valueShare0 * valuePart) * ((1 - LS / 100) / (1 - LS0 / 100)) * (1 - 0.3 * mx(0, d.regulation - 0.5)) * (1 - 0.35 * mx(0, d.geo - 0.4));
    const rr = CRraw / CR0, kc = P.captureCeil / CR0 - 1;
    const CR = CR0 * (rr <= 1 ? rr : 1 + kc * Math.tanh((rr - 1) / kc));  // soft ceiling, smooth at today's capture
    const Rn = VC * CR;
    gR_s += DT * 2 * (ln(Rn / R) / DT - gR_s);
    // 13. local box and compute rent (rent prices the powered fleet, so it follows operating utilisation)
    LB = ex(ln(LB) + DT * (-0.05 - 0.10 * d.efficiency - 0.10 * d.hwSupply + 0.3 * mx(0, d.geo - 0.45) + 0.25 * d.brk) + 0.35 * DT * gDR);
    const GR_t = mx(0.25, o.GR[N] * Math.pow(U, 2.5) * (1 + 1.6 * mn(scar, 0.8)) / (1 + 1.6 * P.excess0) * Math.pow(fpd[N + OFF] / fpd[jj], 0.5) * Math.pow(Pp / Pp0, 0.12) * Math.pow(DR / DR0, 0.12));
    GR += DT * 3 * (GR_t - GR);
    // 14. valuations (post-money equity values; multiple = equity value ÷ the labs' revenue, i.e. labs' share × AI revenue)
    const xs = { gR: gR_s, S, prem, K, gK: gK_s, gm: 0.55 + 0.25 * (U - 0.85) + 0.5 * scar + 0.15 * (1 - d.hwSupply) };
    const Mult = clamp(ex(c.Mult + f.Mult(d, xs)), P.multLo, P.multHi);
    const share = mn(P.labShareMax, P.labShare0 * Math.pow(prem / prem0, 0.15) * (TC / TC0) * (1 - 0.4 * mx(0, d.geo - 0.4)) * ex(-1.5 * (d.platform - BASE.platform)));
    VL += DT * 3 * (Mult * Rn * share / 1000 - VL);
    VN += DT * 3 * (ex(c.VN + f.VN(d, xs)) - VN);
    peakVL = mx(peakVL, VL); peakVN = mx(peakVN, VN);
    // 15. credit: debt share of financing × shortfall of revenue against the capital charge on the installed base
    const B5 = baseAt(i + KOFF), CC = B5 * chargeRate, ccovN = Rn / CC;
    const CF = P.cfo0 * Math.pow(1 + P.cfoG, dt) + 0.5 * Rn;
    const DS_t = clamp(DS0 + 0.35 * ln((K / K0) / (CF / (P.cfo0 + 0.5 * R0))), 0.05, 0.75);
    DS += DT * 1.5 * (DS_t - DS);
    const Cs_t = clamp(c.Cs + f.Cs(d, { DS, ccov: ccovN, DD: 1 - VL / peakVL, DDn: 1 - VN / peakVN, Uf, S, PF }), 3, 99);
    Cs += DT * 2.2 * (Cs_t - Cs);
    Bs = clamp(Bs + DT * 2 * (P.bankIntercept + 0.25 * Cs + 1.8 * mx(0, Cs - 60) - Bs), 0, 99);
    // 16. lab distress index (not a probability) and signal-to-noise
    const h = f.health(d, { S, gR: gR_s, prem, Cs, Np });
    PF += DT * 3 * (2 + 50 * sigmoid(pfK - 1.0 * h) - PF);
    const SN_t = clamp(c.SN + f.SN(d, { Pc, t }), 8, 100);
    SN += DT * 1.2 * (SN_t - SN);
    // one-off jolts (scenario narrative and optional shocks)
    const im = imps[i];
    if (im) { if (im.S) S += im.S; if (im.Cs) Cs += im.Cs; if (im.PF) PF += im.PF; if (im.Np) Np += im.Np; if (im.TC) TC += im.TC; }
    S = clamp(S, 3, 99); Cs = clamp(Cs, 3, 99); PF = clamp(PF, 1, 90); Np = mx(1, Np); TC = clamp(TC, 20, 99);
    // 17. AI contribution to US GDP growth (pp): import-adjusted capex + wealth effect + productivity of realised work
    const gdp = gdp0 * Math.pow(1.04, dt);
    const raw = gdpRaw(K, o.K[i - 4], VN, VL, o.VN[i - 4], o.VL[i - 4], VC, o.VC[i - 4], gdp);
    GDPc += DT * 2.5 * (clamp(raw + gdpAdj * ex(-dt / 2), -4.5, 4.5) - GDPc);

    // write
    o.K[i] = K; o.R[i] = Rn; o.VL[i] = VL; o.VN[i] = VN; o.S[i] = S; o.Cs[i] = Cs; o.Bs[i] = Bs; o.G[i] = G; o.Np[i] = Np;
    o.Pf[i] = Pf; o.Pc[i] = Pc; o.DC[i] = DC; o.Pp[i] = Pp; o.GR[i] = GR; o.DR[i] = DR; o.LB[i] = LB; o.OS[i] = OS; o.ES[i] = ES; o.LS[i] = LS;
    o.AS[i] = AS; o.TC[i] = TC; o.PF[i] = PF; o.SN[i] = SN; o.GDP[i] = GDPc; o.AU[i] = W; o.U[i] = U; o.SC[i] = scar; o.DS[i] = DS;
    o.prem[i] = prem; o.gK[i] = gK_s; o.gR[i] = gR_s; o.VC[i] = VC; o.Mult[i] = Mult; o.Pavg[i] = Pavg; o.sf[i] = sf; o.mf[i] = Mf;
    o.AIT[i] = AIT; o.cov[i] = Rn / (1.4 * K); o.ST[i] = strand; o.Uf[i] = Uf; o.Kmaint[i] = Kmaint;
    o.B5[i] = B5; o.CC[i] = CC; o.ccov[i] = ccovN; o.AUp[i] = AUp; o.AUd[i] = Wd; o.SV[i] = Dsum > 0 ? Served / Dsum : 1;
    o.Uopp[i] = 100 * U; o.Ufp[i] = 100 * Uf; o.STp[i] = 100 * strand; o.SVp[i] = 100 * o.SV[i];
    o.CapV[i] = CapV; o.CapPow[i] = CapPow; o.Avail[i] = Avail; o.Dsum[i] = Dsum; o.Dp[i] = Dp; o.Do[i] = Do; o.Served[i] = Served; o.Sp[i] = Sp;
    o.kap[i] = kap; o.tau[i] = tau; o.Ctask[i] = Ctask; o.CR[i] = CR; o.CRp[i] = 100 * CR; o.eps[i] = eps; o.share[i] = share; o.mc[i] = mc; o.Rf[i] = Rf;
  }
  if (opts.stop) return o;
  sectorSeries(o, D);
  o.drivers = D;
  o.calib = { CR0, otherNow, gCap0, kW, cpt0, CapV0, AIT0, gdpAdj, ccov0, CC0, cov0, mult0: o.Mult[N], c };
  o.pools = profitPools(o);
  o.regime = regimes(o);
  // back to the presentation basis (ratios such as cov, ccov and capture stay on the economic basis)
  if (rb !== 1) o.R = o.R.map(v => v * rb);
  if (kb !== 1) { o.K = o.K.map(v => v * kb); o.Kmaint = o.Kmaint.map(v => v * kb); }
  return o;
}

/* Calibrate the extra growth of training, R&D and free-tier compute so that, with every driver at today's value,
   desired compute still exceeds available compute by the observed 4% in the first simulated quarter (secant search;
   cached until a parameter or anchor changes). */
const calibCache = { key: null, v: 0 };
function calibOther(guess) {
  const key = JSON.stringify(PARAMS) + JSON.stringify(HIST);
  if (calibCache.key === key) return calibCache.v;
  const flat = { key: 'BASE', d: {}, imp: [] };
  for (const k of DK) flat.d[k] = KT.map(() => BASE[k]);
  const gap = v => { const o = simulate(flat, null, { otherNow: v, stop: NOW_I + 2 }); return Math.log(o.Dsum[NOW_I + 1] / o.Avail[NOW_I + 1]) - Math.log(1 + P.excess0); };
  let a = guess, b = guess + 0.2, fa = gap(a), fb = gap(b);
  for (let it = 0; it < 6 && Math.abs(fb) > 1e-10; it++) { const c = b - fb * (b - a) / (fb - fa); a = b; fa = fb; b = c; fb = gap(b); }
  calibCache.key = key; calibCache.v = b;
  return b;
}

/* ---------------- sector lens series (illustrative mappings of model outputs) ---------------- */
function sectorSeries(o, D) {
  const N = NOW_I;
  const expo = (au, k) => 100 * (1 - Math.pow(1 - clamp(au, 0, 99.9) / 100, k));
  for (let i = 0; i < NQ; i++) {
    o.BLD[i] = P.buildShare * o.K[i];
    o.AUa[i] = expo(o.AU[i], P.aecoK);
    o.AUdev[i] = expo(o.AU[i], P.devK);
    o.PLAT[i] = 100 * D.platform[i];
    if (i >= N) o.CtaskI[i] = 100 * o.Ctask[i];
  }
  for (let i = 0; i < NQ; i++) {
    o.seatG[i] = 100 * (1 - o.AU[i] / 100) / (1 - o.AU[N] / 100);
    o.seatA[i] = 100 * (1 - o.AUa[i] / 100) / (1 - o.AUa[N] / 100);
    o.seatD[i] = 100 * (1 - o.AUdev[i] / 100) / (1 - o.AUdev[N] / 100);
  }
}

/* ---------------- illustrative allocation of gross profit along the value chain ----------------
   Not accounting profit: a stylised split of gross margin by layer, floored at zero. */
const LAYERS = ['Chips & memory', 'Power & data centres', 'Cloud & GPU rental', 'Model labs', 'Agents & apps', 'Services & integration'];
function profitPools(o) {
  const out = LAYERS.map(() => new Array(NQ));
  for (let i = 0; i < NQ; i++) {
    const U = o.U[i], sc = o.SC[i], R = o.R[i], K = o.K[i];
    const gmSi = clamp(0.55 + 0.25 * (U - 0.85) + 0.5 * sc + 0.1, 0.25, 0.85);
    const silicon = 0.55 * K * gmSi;
    const power = o.DC[i] * (60 * o.Pp[i] / 100) / 1000 * 0.3 + 0.35 * K * 0.18;
    const cloud = mx(0, 0.45 * R * (0.25 + 0.6 * (U - 0.8) + 0.5 * sc)) + 0.04 * K * mx(0, U - 0.6);
    const mb = o.sf[i] * (o.mf[i] - 1) + (1 - o.sf[i]) * 0.25;
    const models = mx(0, 0.55 * R * (mb / (1 + mb)) - 0.08 * K * (0.5 + 0.5 * mn(1, o.G[i] / 6)));
    const apps = o.VC[i] * (0.03 + 0.10 * o.AS[i] / 100) * 0.25;
    const services = o.VC[i] * 0.015 * (1 + o.LS[i] / 30) * 0.2;
    const v = [silicon, power, cloud, models, apps, services];
    for (let l = 0; l < 6; l++) out[l][i] = mx(0, v[l]);
  }
  return out;
}

/* ---------------- market regime per quarter (model flags, not observed events) ---------------- */
const REGIMES = {
  CREDIT: { label: 'CREDIT-STRESS FLAG', tone: 'crit' }, BUST: { label: 'BUST', tone: 'serious' }, EUPH: { label: 'EUPHORIA', tone: 'warn' },
  CRUNCH: { label: 'COMPUTE CRUNCH', tone: 'warn' }, COMM: { label: 'COMMODITIZATION', tone: 'info' }, BRK: { label: 'BREAKAWAY', tone: 'info' },
  EXP: { label: 'EXPANSION', tone: 'good' }, UTIL: { label: 'UTILITY', tone: 'muted' }, REC: { label: 'RECOVERY', tone: 'good' },
  BUILD: { label: 'BUILD-OUT', tone: 'warn' }, STEADY: { label: 'STEADY', tone: 'muted' },
  SHAKE: { label: 'SHAKEOUT', tone: 'serious' }, GRID: { label: 'POWER-BOUND', tone: 'warn' }
};
const HIST_REGIME = ['BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','BUILD','EUPH','CRUNCH','CRUNCH','EUPH'];
function regimes(o) {
  const out = new Array(NQ); let prev = 'STEADY';
  for (let i = 0; i < NQ; i++) {
    const S = o.S[i], Cs = o.Cs[i], gK = o.gK[i], gR = o.gR[i], prem = o.prem[i], G = o.G[i], cov = o.cov[i], sc = o.SC[i];
    let r;
    const st = o.ST[i] || 0;
    const after = (prev === 'BUST' || prev === 'CREDIT' || prev === 'SHAKE' || prev === 'REC');
    if (i <= NOW_I) r = HIST_REGIME[i];
    else if (Cs >= 70) r = 'CREDIT';
    else if (S < 32) r = 'BUST';
    else if (G > 9) r = 'BRK';
    else if (gR > 0.3 && o.ccov[i] >= 0.9 && S >= 50) r = 'EXP';
    else if (prev === 'BUST' && gK < -0.05) r = 'BUST';
    else if (o.mf[i] < 1.6 && G < 2.6) r = (S < 50 && gK <= 0.02 ? 'UTIL' : 'COMM');
    else if (st > 0.12) r = 'GRID';
    else if (gK < -0.12) r = (prem >= 30 && S < 45) ? 'BUST' : 'SHAKE';
    else if (after && gK > -0.05 && S < 60) r = 'REC';
    else if (sc > 0.15) r = 'CRUNCH';
    else if (S >= 80 && cov < 0.4) r = 'EUPH';
    else if (gK > 0.3 && cov < 0.4) r = 'BUILD';
    else r = 'STEADY';
    out[i] = r; prev = r;
  }
  for (let i = NOW_I + 2; i < NQ - 1; i++) if (out[i] !== out[i - 1] && out[i] !== out[i + 1]) out[i] = out[i - 1];
  return out;
}

/* ---------------- impacts on businesses & regions (hand-set weights; illustrative) ---------------- */
const IMPACT_ROWS = [
  { g: 'Builders', n: 'Frontier labs (closed)', w: { rev: 0.5, val: 0.6, prem: 0.6, credit: -0.4, local: -0.3, open: -0.3, fail: -0.4, plat: -0.3 } },
  { g: 'Builders', n: 'Open-weight labs', w: { open: 0.4, ent: 0.4, local: 0.4, prem: -0.4, credit: -0.3, sov: 0.5, reg: -0.3, plat: -0.2 } },
  { g: 'Builders', n: 'Hyperscale clouds', w: { rev: 0.5, util: 0.5, cap: 0.2, local: -0.5, credit: -0.3, gpu: 0.2, plat: 0.5, idle: -0.3 } },
  { g: 'Builders', n: 'GPU & accelerator makers', w: { cap: 1.0, nv: 0.3, gpu: 0.3, geo: -0.6, local: 0.15 } },
  { g: 'Builders', n: 'Memory makers (HBM, DRAM)', w: { dram: 0.8, cap: 0.6, geo: -0.4, local: 0.2 } },
  { g: 'Builders', n: 'Neoclouds & GPU rental', w: { gpu: 0.9, util: 0.6, credit: -0.8, cap: 0.3, idle: -0.4 } },
  { g: 'Infrastructure & finance', n: 'Data-centre developers', w: { power: 0.7, util: 0.5, credit: -0.7, cap: 0.3, pprice: -0.2, idle: -0.5 } },
  { g: 'Infrastructure & finance', n: 'Utilities & power producers', w: { power: 0.6, pprice: 0.6, credit: -0.2, energy: 0.3 } },
  { g: 'Infrastructure & finance', n: 'Banks & private credit', w: { credit: -1.2, bank: -0.6, cap: 0.15, val: 0.2, idle: -0.3 } },
  { g: 'AECO', n: 'Architecture practices', w: { auto: -0.6, task: -0.3, gdp: 0.35, credit: -0.4, local: 0.1, trust: -0.2, reg: -0.15 } },
  { g: 'AECO', n: 'Engineering consultancies', w: { cap: 0.35, power: 0.3, auto: -0.5, task: -0.3, gdp: 0.3, credit: -0.3, reg: 0.1 } },
  { g: 'AECO', n: 'General contractors', w: { gdp: 0.6, credit: -0.6, cap: 0.25, pprice: -0.2, task: -0.1, auto: 0.1 } },
  { g: 'AECO', n: 'Data-centre & energy builders (EPC, MEP)', w: { cap: 1.0, power: 0.5, energy: 0.3, idle: -0.35, credit: -0.5 } },
  { g: 'AECO', n: 'Building owners & facility operators', w: { pprice: -0.6, task: -0.2, auto: 0.15, gdp: 0.3, credit: -0.4, trust: -0.2 } },
  { g: 'AECO software', n: 'BIM/CAD platform incumbents', w: { plat: 0.7, auto: -0.45, agents: 0.2, task: -0.2, open: -0.2, local: 0.1, gdp: 0.3 } },
  { g: 'AECO software', n: 'Open-source & SDK BIM tooling', w: { open: 0.4, ent: 0.3, task: -0.3, plat: -0.8, sov: 0.3, local: 0.2, agents: 0.2, credit: -0.3, gdp: 0.2 } },
  { g: 'AECO software', n: 'AECO AI-native agent start-ups', w: { agents: 0.8, task: -0.4, plat: -0.5, trust: -0.4, reg: -0.3, open: 0.2, credit: -0.4, gdp: 0.2 } },
  { g: 'AECO software', n: 'Construction-management & field software', w: { gdp: 0.4, auto: -0.2, agents: 0.4, plat: 0.3, credit: -0.3, task: -0.2 } },
  { g: 'Software & services', n: 'Seat-based SaaS', w: { agents: -0.7, auto: -0.6, sn: 0.2, price: 0.3, trust: 0.3, reg: 0.2, plat: 0.8 } },
  { g: 'Software & services', n: 'Usage- and outcome-priced software', w: { agents: 0.6, auto: 0.4, task: -0.3, plat: 0.3, trust: -0.2 } },
  { g: 'Software & services', n: 'Developer tools & coding agents', w: { auto: 0.6, task: -0.5, prem: -0.2, conc: -0.3, open: 0.2, plat: -0.2 } },
  { g: 'Software & services', n: 'Software developers (jobs)', w: { auto: -0.8, gdp: 0.3, task: 0.1, sn: 0.1 } },
  { g: 'Software & services', n: 'Vertical software (legal, health, finance)', w: { agents: 0.5, price: -0.4, local: 0.3, sn: 0.3, trust: 0.2, auto: 0.2, prem: -0.2, plat: 0.2 } },
  { g: 'Software & services', n: 'AI wrappers & vibe-coded apps', w: { price: -0.8, sn: 0.5, prem: -0.3, val: 0.4, credit: -0.3, agents: -0.2, plat: -0.4 } },
  { g: 'Software & services', n: 'Specialised-agent builders', w: { agents: 1.0, price: -0.4, local: 0.2, trust: -0.4, plat: -0.4 } },
  { g: 'Software & services', n: 'IT services & outsourcing', w: { auto: -0.9, local: 0.4, reg: 0.3, agents: 0.2, sov: 0.3 } },
  { g: 'Software & services', n: 'Cybersecurity', w: { trust: 1.0, agents: 0.3, reg: 0.3, geo: 0.3 } },
  { g: 'Software & services', n: 'Devices & edge hardware', w: { local: 0.9, dram: -0.5, geo: -0.3 } },
  { g: 'Users', n: 'Enterprises adopting AI', w: { price: -0.8, auto: 0.5, fail: -0.5, conc: -0.4, trust: -0.5, gdp: 0.3, plat: -0.3, unmet: -0.3 } },
  { g: 'Users', n: 'Knowledge workers', w: { auto: -0.9, pprice: -0.4, gdp: 0.4, bank: -0.3, price: -0.2 } },
  { g: 'Regions', n: 'United States', w: { gdp: 0.9, val: 0.4, nv: 0.3, credit: -0.5, prem: 0.3, pprice: -0.2, plat: 0.2 } },
  { g: 'Regions', n: 'China', w: { open: 0.5, prem: -0.4, geo: -0.4, local: 0.2 } },
  { g: 'Regions', n: 'European Union', w: { price: -0.6, local: 0.4, sov: 0.3, pprice: -0.5, prem: -0.3, reg: -0.2, bank: -0.3, plat: -0.2 } },
  { g: 'Regions', n: 'Switzerland', w: { price: -0.5, local: 0.4, sov: 0.3, pprice: -0.3, auto: 0.2, reg: -0.1, bank: -0.3, prem: -0.2 } },
  { g: 'Regions', n: 'Taiwan & South Korea', w: { cap: 0.8, dram: 0.5, geo: -1.0, nv: 0.3 } },
  { g: 'Regions', n: 'Gulf states', w: { cap: 0.5, pprice: 0.5, power: 0.4, credit: -0.3, sov: 0.3 } },
  { g: 'Regions', n: 'India', w: { auto: -0.6, price: -0.5, local: 0.2, open: 0.2 } }
];
const FEAT_NAMES = { rev: 'AI revenue', val: 'lab valuations', nv: 'chip valuations', prem: 'frontier pricing power', price: 'cost of AI tokens', task: 'cost per completed AI task', credit: 'credit stress', bank: 'bank stress', power: 'data-centre power use', pprice: 'power prices', util: 'compute utilisation', gpu: 'GPU rents', dram: 'memory prices', local: 'local AI share', open: 'open-weight token share', ent: 'enterprise open-weight use', agents: 'specialised agents', conc: 'provider concentration', fail: 'lab distress', sn: 'signal-to-noise', auto: 'automation of work', gdp: 'US growth from AI', trust: 'trust incidents', geo: 'fragmentation', reg: 'regulation', sov: 'sovereignty demand', energy: 'energy constraint', cap: 'AI build-out (capex)', plat: 'platform lock-in', idle: 'unpowered chips', unmet: 'unserved demand' };
function features(o, i) {
  const N = NOW_I, d = o.drivers;
  return {
    cap: ln(o.K[i] / o.K[N]), rev: ln(o.R[i] / o.R[N]) / 1.5, val: ln(o.VL[i] / o.VL[N]) / 1.5, nv: ln(o.VN[i] / o.VN[N]) / 1.5,
    prem: ln(o.prem[i] / o.prem[N]) / 1.5, price: ln(o.Pavg[i] / o.Pavg[N]) / 3, task: ln(o.Ctask[i] / o.Ctask[N]) / 3, credit: (o.Cs[i] - o.Cs[N]) / 40, bank: (o.Bs[i] - o.Bs[N]) / 40,
    power: ln(o.DC[i] / o.DC[N]), pprice: ln(o.Pp[i] / o.Pp[N]) / 0.5, util: (o.U[i] - o.U[N]) / 0.25, gpu: ln(o.GR[i] / o.GR[N]),
    dram: ln(o.DR[i] / o.DR[N]), local: (o.LS[i] - o.LS[N]) / 20, open: (o.OS[i] - o.OS[N]) / 25, ent: (o.ES[i] - o.ES[N]) / 15, agents: (o.AS[i] - o.AS[N]) / 25,
    conc: (o.TC[i] - o.TC[N]) / 20, fail: (o.PF[i] - o.PF[N]) / 20, sn: ln(o.SN[i] / o.SN[N]) / 0.7, auto: ln(o.AU[i] / o.AU[N]) / 2,
    gdp: (o.GDP[i] - o.GDP[N]) / 1.0, trust: d.trust[i] - BASE.trust, geo: d.geo[i] - BASE.geo, reg: d.regulation[i] - BASE.regulation,
    sov: d.sovereignty[i] - BASE.sovereignty, energy: d.energy[i] - BASE.energy, plat: (d.platform[i] - BASE.platform) / 0.4,
    idle: (o.ST[i] - o.ST[N]) / 0.25, unmet: ((1 - o.SV[i]) - (1 - o.SV[N])) / 0.2
  };
}
function impacts(o) {
  const rows = IMPACT_ROWS.map(() => new Array(NQ).fill(0));
  const why = IMPACT_ROWS.map(() => new Array(NQ));
  for (let i = NOW_I; i < NQ; i++) {
    const F = features(o, i);
    IMPACT_ROWS.forEach((row, r) => {
      let s = 0; const parts = [];
      for (const k in row.w) { const v = row.w[k] * F[k]; s += v; parts.push([k, v, F[k]]); }
      rows[r][i] = 100 * Math.tanh(s / 1.6);
      parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      why[r][i] = parts.slice(0, 3).filter(p => Math.abs(p[1]) > 0.02).map(p => ({ f: FEAT_NAMES[p[0]], v: p[1], dir: Math.sign(p[2]) }));
    });
  }
  return { rows, why };
}

/* ---------------- auto-detected events (threshold crossings) ---------------- */
function autoEvents(o) {
  const ev = [];
  const cross = (arr, thr, dir, text, minI) => {
    for (let i = mx(NOW_I + 1, minI || 0); i < NQ; i++) {
      const a = arr(i - 1), b = arr(i);
      if (dir > 0 ? (a < thr && b >= thr) : (a > thr && b <= thr)) { ev.push({ i, text, auto: true }); return; }
    }
  };
  const A = k => i => o[k][i];
  cross(A('Cs'), 70, 1, 'Credit-stress index enters the flag zone (above 70)');
  cross(i => o.K[i] / o.K[i - 4] - 1, 0, -1, 'Big-4 capex shrinks year-on-year');
  cross(A('mf'), 1.5, -1, 'Frontier markup over resource cost falls below 1.5×');
  cross(A('G'), 2, -1, 'Open-weight models come within 2 months of the frontier');
  cross(A('G'), 9, 1, 'Frontier lead stretches past 9 months');
  cross(A('LB'), 1000, -1, 'A box running a ~120B-class open model costs under $1,000');
  cross(A('GR'), 1.5, -1, 'H100 contract rent below $1.50/hr — compute glut');
  cross(A('GR'), 4, 1, 'Compute crunch: H100 contract rent above $4/hr');
  cross(A('PF'), 25, 1, 'Lab distress index passes 25');
  cross(A('GDP'), 0, -1, 'AI turns into a drag on US GDP growth');
  cross(A('ccov'), 1, 1, 'AI revenue covers the capital charge on the installed base');
  cross(A('AS'), 40, 1, 'Specialised agents pass 40% of enterprise AI spend');
  cross(A('OS'), 50, 1, 'Open-weight models pass half of all tokens');
  cross(A('ES'), 25, 1, 'Open-weight models pass a quarter of enterprise use');
  cross(A('DC'), 950, 1, 'Data-centre power passes the IEA 2030 projection (950 TWh)');
  cross(A('LS'), 25, 1, 'A quarter of inference now runs locally or on-prem');
  cross(A('DR'), 300, -1, 'DRAM contract index falls back under 300 (Q1 2025 = 100)');
  cross(A('STp'), 15, 1, 'More than 15% of purchased compute sits unpowered');
  cross(A('SVp'), 85, -1, 'Less than 85% of desired compute can be served');
  return ev;
}

/* ---------------- historical events (sourced; see the evidence ledger and the brief) ---------------- */
const HIST_EVENTS = [
  [2023, 'GPT-4 launches at $30/$60 per million tokens'],
  [2023.5, 'Llama 2 ships with open weights'],
  [2024.5, 'Llama 3.1 405B: first open model to match GPT-4, ~16 months later'],
  [2025, 'DeepSeek R1 claims o1-level results ~4 months after o1-preview; Nvidia falls 17% in a day'],
  [2025.5, 'Nvidia signs a letter of intent to invest up to $100B in OpenAI, paid as each gigawatt is deployed'],
  [2025.75, 'Nvidia becomes the first $5T company'],
  [2025.75, 'DRAM contract prices surge as AI memory crowds out PCs'],
  [2026, '“SaaSpocalypse”: US software & services stocks lose ~$830B in six sessions'],
  [2026, 'Conventional DRAM contract prices jump 93–98% in a quarter'],
  [2026, 'OpenAI raises $122B at an $852B post-money valuation'],
  [2026.25, 'Anthropic Series H at a $965B post-money valuation'],
  [2026.25, 'BofA survey: hyperscaler capex now seen as likeliest source of a credit event'],
  [2026.25, 'Export-control order suspends access to two frontier models for ~3 weeks'],
  [2026.5, 'Big-4 full-year capex guidance sums to $720–745B (company guidance; Platformonomics counts $735–750B)'],
  [2026.5, 'Kimi K3 open-weight model ranks #2–3 on major indices (weights scheduled for 27 Jul)'],
  [2026.5, 'KOSPI falls almost 40% below its June peak (29 Jul), then rallies a record 17.9% in a day'],
  [2026.5, 'API price war: four pricing moves in 17 days, mostly on mid and small tiers'],
  [2026.75, 'OpenAI’s run-rate reported at $50B net; the earlier $70B was a gross-equivalent figure'],
  [2026.75, 'IMF names an AI-driven market correction among three rising financial risks'],
  [2026.75, 'CoreWeave bonds yield ~15%; Nvidia at $5.2T']
];


/* =====================================================================================
   DATA UPDATES (v3.3) — weekly releases revise the Q4 2026 anchors from a dataset file.
   dataset.anchors[ID] = { value (model units), v (display text), status, period, scope, src, url, calc, was,
                           quote, refs: [{ title, url, publisher?, date? }], via: { type, name, model?, check? }, reviewed, retrieved }.
   via.type: 'desk' (desk research) · 'api' (official data API) · 'ai' (AI-assisted web research, human-approved) ·
             'manual' (edited by the team) · 'assumption' · 'model' (model construct).
   value units: the HIST units of the anchor's series (K, R in $B a year; VL, VN in $T; Pf, Pc in $ per M tokens;
   G months; DC TWh; Pp index 2023 = 100; GR $/GPU-hour; DR index Q1 2025 = 100; LB $; shares in %; GDP pp;
   indices 0–100; DS share 0–1; Np count). AN26 (US data-centre construction, $B a year) sets PARAMS.buildShare.
   Returns the list of numeric changes. Call it on a fresh createEngine() instance.
   ===================================================================================== */
function applyData(ds) {
  const changes = [];
  if (!ds || !ds.anchors) return changes;
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  for (const a of ANCHORS) {
    const d = ds.anchors[a.id];
    if (!d) continue;
    if (typeof d.value === 'number' && isFinite(d.value)) {
      if (a.k === 'BLD') {
        const K = interp(HIST.K.pts, NOW_T, true);
        const before = PARAMS.buildShare * K;
        if (!near(before, d.value)) { PARAMS.buildShare = d.value / K; changes.push({ id: a.id, k: a.k, from: before, to: d.value }); }
      } else if (HIST[a.k]) {
        const pts = HIST[a.k].pts, last = pts[pts.length - 1];
        if (Math.abs(last[0] - NOW_T) < 1e-9) {
          if (!near(last[1], d.value)) { changes.push({ id: a.id, k: a.k, from: last[1], to: d.value }); last[1] = d.value; }
        } else {
          changes.push({ id: a.id, k: a.k, from: interp(pts, NOW_T, HIST[a.k].log), to: d.value });
          pts.push([NOW_T, d.value]);
        }
      }
    }
    for (const f of ['v', 'status', 'period', 'scope', 'src', 'url', 'calc', 'was']) if (d[f] != null) a[f] = d[f];
    // provenance (v3.4): supporting quote, extra references, how the value was obtained, review and retrieval dates
    for (const f of PROV_FIELDS) if (d[f] != null) a[f] = typeof d[f] === 'object' ? JSON.parse(JSON.stringify(d[f])) : d[f];
  }
  calibCache.key = null;
  return changes;
}
/* Numeric Q4 2026 value of every anchor, in model units (used to seed and check datasets). */
function anchorValues() {
  const o = {};
  for (const a of ANCHORS) o[a.id] = a.k === 'BLD' ? PARAMS.buildShare * interp(HIST.K.pts, NOW_T, true) : interp(HIST[a.k].pts, NOW_T, HIST[a.k].log);
  return o;
}
const API = { PROV_FIELDS, features, SECTOR_EVIDENCE, VERSION, T0, NQ, NOW_I, NOW_T, DT, tAt, qLabel, idxOf, clamp, DRIVERS, DK, BASE, KT, SCENARIOS, SHOCKS, LAYERS, REGIMES, IMPACT_ROWS, FEAT_NAMES, HIST_EVENTS, HIST, ANCHORS, PARAMS, simulate, impacts, autoEvents, applyData, anchorValues, interp };
return API;
}

export const AICX = createEngine();
export default AICX;
