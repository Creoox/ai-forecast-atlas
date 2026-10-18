#!/usr/bin/env python3
"""ONE-TIME conversion (already done; engine/engine.mjs is now the source of truth and has later edits).

Converted the AICX v3 engine (browser/CommonJS IIFE) into an ES module factory.

Produces engine/engine.mjs:
  export function createEngine() { ...v3 engine body...; return API; }
  export const AICX = createEngine();

Changes made on the way (engine v3.3):
  * every call to createEngine() returns an independent instance (own HIST, ANCHORS, PARAMS, caches),
    so the weekly release can apply new anchor data without touching the shared instance;
  * the calibration cache key covers all of HIST (it covered only K, R and DC);
  * applyData(dataset) updates Q4 2026 anchor values and ledger text from a dataset file.
"""
import re, sys, pathlib

src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/aicx/engine.js').read_text(encoding='utf-8')
out_path = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else 'engine/engine.mjs')

head, sep, body = src.partition("(function (root) {\n'use strict';\n")
assert sep, 'IIFE header not found'
tail_marker = "if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.AICX = API;\n})(typeof window !== 'undefined' ? window : globalThis);"
assert tail_marker in body, 'IIFE footer not found'
body = body.replace(tail_marker, '')

# version
body = body.replace("const VERSION = 'v3 · 17 Oct 2026';", "const VERSION = 'v3.3 · 17 Oct 2026';")
# calibration cache covers every history series
old_key = "const key = JSON.stringify(PARAMS) + JSON.stringify(HIST.K.pts) + JSON.stringify(HIST.R.pts) + JSON.stringify(HIST.DC.pts);"
assert old_key in body
body = body.replace(old_key, "const key = JSON.stringify(PARAMS) + JSON.stringify(HIST);")

api_line = re.search(r"^const API = \{.*\};$", body, re.M)
assert api_line, 'API line not found'
apply_fn = r'''
/* =====================================================================================
   DATA UPDATES (v3.3) — weekly releases revise the Q4 2026 anchors from a dataset file.
   dataset.anchors[ID] = { value (model units), v (display text), status, period, scope, src, url, calc, was }.
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
'''
new_api = api_line.group(0).replace("simulate, impacts, autoEvents };", "simulate, impacts, autoEvents, applyData, anchorValues, interp };")
assert new_api != api_line.group(0), 'API object did not match expected tail'
body = body.replace(api_line.group(0), apply_fn + new_api + "\nreturn API;")

header = head.rstrip() + '\n' + '''/* ES module build (v3.3): createEngine() returns an independent engine instance. The browser bundle strips the
   "export" keywords and sets window.AICX = createEngine(). Licence: Business Source License 1.1 (see LICENSE). */
'''
module = header + "export function createEngine() {\n'use strict';\n" + body.rstrip() + "\n}\n\nexport const AICX = createEngine();\nexport default AICX;\n"
out_path.write_text(module, encoding='utf-8')
print('wrote', out_path, len(module), 'bytes')
