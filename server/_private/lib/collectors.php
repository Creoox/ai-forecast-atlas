<?php
/* AI Forecast Atlas — daily data review. Official sources (OpenRouter prices, EIA power prices, SEC EDGAR capex,
   Epoch AI capability index) and AI-assisted web research produce candidates for the review queue; nothing
   reaches the public data until it is approved and released. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_sources(): array { return aim_cfg('sources'); }
function aim_base(string $k): string { return rtrim((string)(aim_settings()['sources']['bases'][$k] ?? ''), '/'); }

/** Display text for an anchor value, in the style of the evidence ledger. */
function aim_anchor_text(string $metric, float $v): string
{
    $n = fn($x, $d) => number_format($x, $d, '.', ',');
    switch ($metric) {
        case 'K': case 'R': case 'BLD': return '$' . $n(round($v), 0) . 'B a year';
        case 'VL': case 'VN': return '$' . $n($v, $v >= 10 ? 1 : 2) . 'T';
        case 'Pf': case 'Pc': return '$' . ($v >= 10 ? $n($v, 0) : ($v >= 1 ? $n($v, 2) : $n($v, 2))) . ' per M tokens';
        case 'G': return $n($v, 1) . ' months';
        case 'DC': return $n(round($v), 0) . ' TWh a year';
        case 'Pp': return $n(round($v), 0) . ' (2023 = 100)';
        case 'GR': return '$' . $n($v, 2) . ' per GPU-hour';
        case 'DR': return $n(round($v), 0) . ' (Q1 2025 = 100)';
        case 'LB': return '$' . $n(round($v), 0);
        case 'GDP': return ($v >= 0 ? '+' : '−') . $n(abs($v), 1) . ' pp';
        case 'AU': return $n($v, 1) . '% of knowledge-work value';
        case 'Cs': case 'PF': case 'S': return $n(round($v), 0) . ' (0–100)';
        case 'SN': return $n(round($v), 0) . ' (2023 = 100)';
        case 'DS': return $n($v, 2);
        case 'Np': return $n(round($v), 0);
        default: return $n($v, $v < 10 ? 1 : 0) . '%';
    }
}
function aim_anchor_for_metric(array $ds, string $metric): ?string
{
    foreach (($ds['anchors'] ?? []) as $id => $a) if (($a['metric'] ?? '') === $metric) return $id;
    return null;
}

/* ---------- OpenRouter: frontier and good-enough token prices ---------- */
function aim_collect_openrouter(array $ds): array
{
    $cfg = aim_sources()['openrouter'] ?? [];
    $r = aim_http('GET', aim_base('openrouter') . '/models', ['timeout' => 30]);
    if (!is_array($r['json']['data'] ?? null)) return ['ok' => false, 'error' => aim_http_problem($r)];
    $models = $r['json']['data'];
    $pick = function (array $patterns) use ($models) {
        $out = [];
        foreach ($patterns as $rx) {
            $best = null;
            foreach ($models as $m) {
                if (!preg_match('#' . $rx . '#i', (string)($m['id'] ?? ''))) continue;
                $pi = (float)($m['pricing']['prompt'] ?? 0); $po = (float)($m['pricing']['completion'] ?? 0);
                if ($pi <= 0 || $po <= 0) continue;
                if (!$best || (int)($m['created'] ?? 0) > (int)($best['created'] ?? 0)) $best = $m;
            }
            if ($best) $out[] = ['id' => $best['id'], 'in' => (float)$best['pricing']['prompt'] * 1e6, 'out' => (float)$best['pricing']['completion'] * 1e6, 'blend' => round((3 * (float)$best['pricing']['prompt'] + (float)$best['pricing']['completion']) / 4 * 1e6, 4)];
        }
        return $out;
    };
    $agg = function (array $xs, string $rule) {
        if (!$xs) return null;
        $v = array_column($xs, 'blend'); sort($v);
        if ($rule === 'min') return $v[0];
        $n = count($v);
        return $n % 2 ? $v[intdiv($n, 2)] : ($v[$n / 2 - 1] + $v[$n / 2]) / 2;
    };
    $front = $pick($cfg['frontier'] ?? []); $good = $pick($cfg['goodEnough'] ?? []);
    $res = ['ok' => true, 'candidates' => [], 'observations' => []];
    $today = aim_now()->format('j M Y');
    foreach ([['Pf', $front, $cfg['frontierRule'] ?? 'median', 'Median'], ['Pc', $good, $cfg['goodEnoughRule'] ?? 'min', 'Lowest']] as [$metric, $set, $rule, $word]) {
        $val = $agg($set, $rule);
        if ($val === null) continue;
        $list = implode('; ', array_map(fn($x) => $x['id'] . ' $' . rtrim(rtrim(number_format($x['in'], 3, '.', ''), '0'), '.') . '/$' . rtrim(rtrim(number_format($x['out'], 3, '.', ''), '0'), '.') . ' → $' . rtrim(rtrim(number_format($x['blend'], 3, '.', ''), '0'), '.'), $set));
        $res['observations'][] = ['metric' => $metric, 'value' => round($val, 4), 'text' => aim_anchor_text($metric, $val), 'source' => 'OpenRouter models API', 'date' => aim_now()->format('Y-m-d'), 'detail' => $list];
        $aid = aim_anchor_for_metric($ds, $metric);
        if (!$aid) continue;
        $cur = (float)($ds['anchors'][$aid]['value'] ?? 0);
        if ($cur > 0 && abs($val / $cur - 1) < (float)($cfg['minChange'] ?? 0.05)) continue;
        $res['candidates'][] = ['source' => 'openrouter', 'anchor' => $aid, 'metric' => $metric, 'kind' => 'value',
            'proposed' => ['value' => round($val, 4), 'v' => aim_anchor_text($metric, $val), 'status' => 'estimate', 'period' => aim_now()->format('M Y') . ' list prices (OpenRouter)',
                'src' => 'OpenRouter models API (' . $today . ')', 'url' => 'https://openrouter.ai/models', 'calc' => 'Blend = (3 × input + output) / 4. ' . $word . ' of: ' . $list . '.',
                'refs' => [['title' => 'OpenRouter models API (machine-readable list prices)', 'url' => 'https://openrouter.ai/api/v1/models']], 'retrieved' => aim_now()->format('Y-m-d'),
                'via' => ['type' => 'api', 'name' => 'OpenRouter models API, read automatically by the daily check']],
            'note' => 'Computed from list prices; check that the basket still matches the tier definition.'];
    }
    return $res;
}

/* ---------- EIA: US commercial electricity price index ---------- */
function aim_collect_eia(array $ds): array
{
    $key = (string)aim_settings()['sources']['eia_key'];
    if ($key === '') return ['ok' => false, 'skipped' => 'EIA key not set'];
    $cfg = aim_sources()['eia'] ?? [];
    $url = aim_base('eia') . '/v2/electricity/retail-sales/data/?api_key=' . rawurlencode($key) . '&frequency=monthly&data[]=price&facets[sectorid][]=COM&facets[stateid][]=US&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=36';
    $r = aim_http('GET', $url, ['timeout' => 30]);
    $rows = $r['json']['response']['data'] ?? null;
    if (!is_array($rows) || count($rows) < 24) return ['ok' => false, 'error' => aim_http_problem($r)];
    $pts = [];
    foreach ($rows as $row) if (isset($row['period'], $row['price']) && is_numeric($row['price'])) $pts[$row['period']] = (float)$row['price'];
    krsort($pts);
    $vals = array_values($pts); $periods = array_keys($pts);
    if (count($vals) < 24) return ['ok' => false, 'error' => 'not enough months'];
    $ttm = array_sum(array_slice($vals, 0, 12)) / 12;
    $prev = array_sum(array_slice($vals, 12, 12)) / 12;
    $yoy = $ttm / $prev - 1;
    $base = (float)($cfg['base2023'] ?? 12.59);
    $idx = $ttm / $base * 100;
    $latest = new DateTimeImmutable($periods[0] . '-15');
    $mid = $latest->modify('-5 months');
    $target = new DateTimeImmutable('2026-11-15');
    $months = ($target->getTimestamp() - $mid->getTimestamp()) / (30.44 * 86400);
    $proj = $idx * pow(1 + $yoy, $months / 12);
    $res = ['ok' => true, 'candidates' => [], 'observations' => [['metric' => 'Pp', 'value' => round($vals[0], 2), 'text' => number_format($vals[0], 2) . '¢/kWh (' . $periods[0] . ')', 'source' => 'U.S. EIA retail sales, commercial, US', 'date' => $periods[0]]]];
    $aid = aim_anchor_for_metric($ds, 'Pp');
    if ($aid && abs($proj - (float)$ds['anchors'][$aid]['value']) >= (float)($cfg['minChange'] ?? 1)) {
        $res['candidates'][] = ['source' => 'eia', 'anchor' => $aid, 'metric' => 'Pp', 'kind' => 'value',
            'proposed' => ['value' => round($proj, 1), 'v' => aim_anchor_text('Pp', $proj), 'status' => 'estimate', 'period' => 'Q4 2026',
                'src' => 'U.S. EIA retail sales data, commercial sector (' . $periods[0] . ')', 'url' => 'https://www.eia.gov/electricity/data/browser/',
                'calc' => number_format($ttm, 2) . '¢/kWh for the 12 months to ' . $periods[0] . ', ' . sprintf('%+.1f', $yoy * 100) . '% on a year earlier. Against 12.59¢ in 2023 = ' . number_format($idx, 1) . '; extended at that pace to Q4 2026 = ' . number_format($proj, 1) . '.',
                'refs' => [['title' => 'U.S. EIA Open Data (API v2, electricity retail sales)', 'url' => 'https://www.eia.gov/opendata/'], ['title' => 'EIA Electric Power Monthly', 'url' => 'https://www.eia.gov/electricity/monthly/']], 'retrieved' => aim_now()->format('Y-m-d'),
                'via' => ['type' => 'api', 'name' => 'U.S. EIA Open Data API v2, read automatically by the daily check']],
            'note' => 'Automatic method; the previous value used the same approach.'];
    }
    return $res;
}

/* ---------- SEC EDGAR: Big-4 quarterly capex (evidence for the capex anchor) ---------- */
function aim_edgar_quarters(array $facts): array
{
    $byKey = [];
    foreach ($facts as $f) {
        if (!isset($f['start'], $f['end'], $f['val'])) continue;
        if (!preg_match('/^10-[QK]/', (string)($f['form'] ?? ''))) continue;
        $k = $f['start'] . '|' . $f['end'];
        if (!isset($byKey[$k]) || strcmp((string)$f['filed'], (string)$byKey[$k]['filed']) > 0) $byKey[$k] = $f;
    }
    $q = [];
    $days = fn($a, $b) => (strtotime($b) - strtotime($a)) / 86400;
    foreach ($byKey as $f) { $d = $days($f['start'], $f['end']); if ($d >= 80 && $d <= 100) $q[$f['end']] = (float)$f['val']; }
    foreach ($byKey as $f) {
        $d = $days($f['start'], $f['end']);
        if ($d < 150 || $d > 380 || isset($q[$f['end']])) continue;
        $best = null;
        foreach ($byKey as $g) {
            if ($g['start'] !== $f['start'] || strcmp($g['end'], $f['end']) >= 0) continue;
            $gap = $days($g['end'], $f['end']);
            if ($gap >= 80 && $gap <= 100 && (!$best || strcmp($g['end'], $best['end']) > 0)) $best = $g;
        }
        if ($best) $q[$f['end']] = (float)$f['val'] - (float)$best['val'];
    }
    ksort($q);
    return $q;
}
function aim_collect_edgar(array $ds): array
{
    $cfg = aim_sources()['edgar'] ?? [];
    $ua = (string)aim_settings()['sources']['sec_user_agent'];
    $get = function (string $cik, string $tag) use ($ua) {
        $r = aim_http('GET', aim_base('sec') . '/api/xbrl/companyconcept/CIK' . $cik . '/us-gaap/' . $tag . '.json', ['ua' => $ua, 'timeout' => 30]);
        usleep(150000);
        return is_array($r['json']) ? ($r['json']['units']['USD'] ?? []) : null;
    };
    $perCo = []; $lease = []; $refs = [];
    foreach ($cfg['companies'] ?? [] as $co) {
        $facts = null;
        foreach ($co['tags'] as $tag) { $facts = $get($co['cik'], $tag); if ($facts) { $refs[] = ['title' => $co['name'] . ': ' . $tag . ' (SEC EDGAR XBRL)', 'url' => 'https://data.sec.gov/api/xbrl/companyconcept/CIK' . $co['cik'] . '/us-gaap/' . $tag . '.json']; break; } }
        if (!$facts) return ['ok' => false, 'error' => 'EDGAR: no capex data for ' . $co['name']];
        $perCo[$co['name']] = aim_edgar_quarters($facts);
        $lf = !empty($cfg['leaseTag']) ? $get($co['cik'], $cfg['leaseTag']) : null;
        $lease[$co['name']] = $lf ? aim_edgar_quarters($lf) : [];
    }
    $qOf = fn(string $end) => substr($end, 0, 4) . '-Q' . (int)ceil((int)substr($end, 5, 2) / 3);
    $tot = [];
    foreach ($perCo as $name => $qs) foreach ($qs as $end => $v) { $cq = $qOf($end); $tot[$cq]['capex'][$name] = $v; }
    foreach ($lease as $name => $qs) foreach ($qs as $end => $v) { $cq = $qOf($end); if (isset($tot[$cq])) $tot[$cq]['lease'][$name] = $v; }
    krsort($tot);
    $latest = null;
    foreach ($tot as $cq => $d) if (count($d['capex'] ?? []) === count($perCo)) { $latest = $cq; break; }
    if (!$latest) return ['ok' => false, 'error' => 'no complete quarter'];
    $capex = array_sum($tot[$latest]['capex']) / 1e9;
    $leases = array_sum($tot[$latest]['lease'] ?? []) / 1e9;
    $parts = implode(', ', array_map(fn($n, $v) => $n . ' $' . number_format($v / 1e9, 1) . 'B', array_keys($tot[$latest]['capex']), $tot[$latest]['capex']));
    $txt = $latest . ': capex $' . number_format($capex, 1) . 'B (' . $parts . ')' . ($leases > 0 ? ' plus finance-lease principal $' . number_format($leases, 1) . 'B' : '') . '; annualised ≈ $' . number_format(($capex + $leases) * 4, 0) . 'B a year.';
    $res = ['ok' => true, 'candidates' => [], 'observations' => [['metric' => 'K', 'value' => round(($capex + $leases) * 4, 1), 'text' => $txt, 'source' => 'SEC EDGAR XBRL', 'date' => $latest]]];
    $st = aim_state();
    $aid = aim_anchor_for_metric($ds, 'K');
    if ($aid && ($st['edgarQuarter'] ?? '') !== $latest) {
        $res['candidates'][] = ['source' => 'edgar', 'anchor' => $aid, 'metric' => 'K', 'kind' => 'evidence', 'evidence' => $txt,
            'proposed' => ['value' => null, 'src' => 'SEC EDGAR company filings (' . $latest . ')', 'url' => 'https://www.sec.gov/edgar/search/', 'calc' => $txt, 'refs' => array_slice($refs, 0, 6), 'retrieved' => aim_now()->format('Y-m-d'),
                'via' => ['type' => 'api', 'name' => 'SEC EDGAR XBRL company-concept API, read automatically by the daily check']],
            'note' => 'New quarterly filings. The capex anchor is a Q4 2026 exit-rate estimate, so decide whether this changes it; enter a value if it does.'];
        aim_state_set(['edgarQuarter' => $latest]);
    }
    return $res;
}

/* ---------- Epoch AI: open-weight lag behind the frontier ---------- */
function aim_collect_epoch(array $ds): array
{
    $cfg = aim_sources()['epoch'] ?? [];
    $r = aim_http('GET', aim_base('epoch') . ($cfg['path'] ?? '/data/eci_scores.csv'), ['timeout' => 40, 'follow' => true]);
    if ($r['status'] !== 200 || strlen($r['body']) < 100) return ['ok' => false, 'error' => aim_http_problem($r)];
    $fh = fopen('php://temp', 'w+'); fwrite($fh, $r['body']); rewind($fh);
    $head = fgetcsv($fh, 0, ',', '"', '\\');
    if (!$head) return ['ok' => false, 'error' => 'empty CSV'];
    $col = array_flip(array_map('trim', $head));
    foreach (['eci', 'date'] as $need) if (!isset($col[$need])) return ['ok' => false, 'error' => 'CSV columns changed'];
    $rows = [];
    while (($row = fgetcsv($fh, 0, ',', '"', '\\')) !== false) {
        $e = $row[$col['eci']] ?? ''; $d = $row[$col['date']] ?? '';
        if (!is_numeric($e) || !preg_match('/^\d{4}-\d{2}-\d{2}/', $d)) continue;
        $acc = strtolower(($row[$col['Accessibility group'] ?? -1] ?? '') . ' ' . ($row[$col['Model accessibility'] ?? -1] ?? ''));
        $rows[] = ['e' => (float)$e, 't' => strtotime(substr($d, 0, 10)), 'open' => str_contains($acc, 'open'), 'name' => $row[$col['Display name'] ?? ($col['Model'] ?? 0)] ?? ''];
    }
    fclose($fh);
    if (count($rows) < 20) return ['ok' => false, 'error' => 'too few rows'];
    usort($rows, fn($a, $b) => $a['t'] <=> $b['t']);
    $bestOpen = -INF; $lags = [];
    foreach ($rows as $o) {
        if (!$o['open'] || $o['e'] <= $bestOpen) continue;
        $bestOpen = $o['e'];
        $first = null;
        foreach ($rows as $c) if (!$c['open'] && $c['e'] >= $o['e']) { $first = $c['t']; break; }
        $lags[] = ['t' => $o['t'], 'lag' => $first !== null && $first < $o['t'] ? ($o['t'] - $first) / (30.44 * 86400) : 0.0, 'name' => $o['name']];
    }
    if (!$lags) return ['ok' => false, 'error' => 'no open-weight records'];
    $since = strtotime('-' . (int)($cfg['windowMonths'] ?? 6) . ' months', aim_now()->getTimestamp());
    $recent = array_values(array_filter($lags, fn($x) => $x['t'] >= $since));
    $use = $recent ?: [end($lags)];
    $avg = array_sum(array_column($use, 'lag')) / count($use);
    $names = implode(', ', array_map(fn($x) => $x['name'] . ' (' . number_format($x['lag'], 1) . ' mo, ' . date('M Y', $x['t']) . ')', array_slice($use, -5))) . (count($use) > 5 ? ' and ' . (count($use) - 5) . ' earlier' : '');
    $res = ['ok' => true, 'candidates' => [], 'observations' => [['metric' => 'G', 'value' => round($avg, 1), 'text' => number_format($avg, 1) . ' months (Epoch Capabilities Index)', 'source' => 'Epoch AI (CC BY 4.0)', 'date' => aim_now()->format('Y-m-d'), 'detail' => $names]]];
    $aid = aim_anchor_for_metric($ds, 'G');
    if ($aid && abs($avg - (float)$ds['anchors'][$aid]['value']) >= (float)($cfg['minChange'] ?? 0.3)) {
        $res['candidates'][] = ['source' => 'epoch', 'anchor' => $aid, 'metric' => 'G', 'kind' => 'value',
            'proposed' => ['value' => round($avg, 1), 'v' => aim_anchor_text('G', $avg), 'status' => 'estimate', 'period' => ($recent ? 'Average of the last ' . (int)($cfg['windowMonths'] ?? 6) . ' months' : 'Latest open-weight record') . ' to ' . aim_now()->format('M Y'),
                'src' => 'Epoch AI, Epoch Capabilities Index (' . aim_now()->format('j M Y') . ')', 'url' => 'https://epoch.ai/eci', 'calc' => 'Months between a closed model first reaching a capability score and the open-weight model that matched it: ' . $names . '. Epoch AI data, CC BY 4.0.',
                'refs' => [['title' => 'Epoch AI: Epoch Capabilities Index scores (CSV download)', 'url' => 'https://epoch.ai/data/eci_scores.csv']], 'retrieved' => aim_now()->format('Y-m-d'),
                'via' => ['type' => 'api', 'name' => 'Epoch AI data download, read automatically by the daily check']],
            'note' => 'Method differs slightly from the published Epoch insight; compare before approving.'];
    }
    return $res;
}

/* ---------- AI research panel ----------
   Each research question goes to every agent that is switched on (OpenAI, Anthropic, Google Gemini, xAI Grok,
   DeepSeek). An answer names its source page and quotes it, or is marked as the model's own knowledge. The answers
   are combined by weighted median: the published value is one agent's actual answer (the lead), so its source
   supports it exactly; the other answers are kept with the value. A person approves every value. */
/* A scheduler run may use 50 seconds (home.pl stops requests after about 60). An AI answer awaited inside a run
   gets at most this long, and starts only when at least this long plus a margin is left. */
const AIM_AI_SYNC_TIMEOUT = 30;
function aim_research_due(): array
{
    $dow = (int)aim_now()->format('N');
    return array_values(array_filter(aim_sources()['research'] ?? [], fn($t) => (int)($t['day'] ?? 0) === $dow));
}
function aim_research_target(string $aid): ?array
{
    foreach (aim_sources()['research'] ?? [] as $x) if (($x['anchor'] ?? '') === $aid) return $x;
    return null;
}
/** Why research cannot run now (or null if it can). The monthly budget covers the whole panel and X watch. */
function aim_research_blocked(): ?string
{
    $s = aim_settings();
    if (empty($s['sources']['research_enabled'])) return 'research switched off';
    if (!aim_panel_agents()) return 'no research agent ready (add a key under AI agents)';
    if (aim_usage_research('month') >= (float)$s['sources']['research_budget_usd_month']) return 'monthly research budget used';
    return null;
}
/** The research request of one agent for one target (an aim_llm() query). */
function aim_research_query(array $t, array $ds, array $agent): ?array
{
    $a = $ds['anchors'][$t['anchor']] ?? null;
    if (!$a) return null;
    $since = (string)($ds['asOf'] ?? '2026-10-17');
    $rules = 'Prefer primary sources: company filings and announcements, official statistics, the original publisher. A figure taken from a page comes with that page and an exact quote from it. If no page supports a figure but you know it from your own training or observations, you may still give it: set "basis" to "knowledge", leave the source fields empty, say what date your knowledge refers to and explain how you know it — it will be published labelled as AI knowledge. Never invent a source link or a quote. If you have neither a source nor reliable knowledge, say so. You are one of several independent AI agents asked the same question; answer on your own. Answer with one JSON object only.';
    $system = $agent['search']
        ? 'You are a careful research assistant for AI Forecast Atlas (Creoox AG). Use web search. ' . $rules
        : 'You are a careful research assistant for AI Forecast Atlas (Creoox AG). You have no web access in this request: answer from your own training knowledge and observations only, with "basis": "knowledge" and empty source fields, and say what date your knowledge refers to. If your knowledge is not newer than the current value, answer {"found": false, "reason": "..."}. Never invent a source link or a quote. Answer with one JSON object only.';
    $user = "Measure: " . ($a['name'] ?? $t['anchor']) . "\nScope: " . ($a['scope'] ?? '') . "\nWhat to find: " . $t['ask']
        . "\nCurrent value in our dataset: " . ($a['v'] ?? '') . ' (' . ($a['period'] ?? '') . '; source: ' . ($a['src'] ?? '') . ")\nLook for information published after " . $since . ' that is newer or better than the current value.'
        . "\nReply with JSON: {\"found\": true|false, \"value\": number in " . $t['unit'] . " or null, \"display\": \"short text with unit\", \"period\": \"period the figure covers\", \"published\": \"YYYY-MM-DD\", \"source_title\": \"title of the page the figure is from\", \"publisher\": \"organisation that published it\", \"source_url\": \"https://... (the exact page)\", \"quote\": \"exact supporting quote from that page, max 300 characters\", \"method\": \"how the value was derived from the source, max 300 characters\", \"components\": [\"optional parts with dates\"], \"supporting\": [{\"title\": \"...\", \"url\": \"https://...\"}] (up to 3 other pages that confirm it), \"basis\": \"source\" or \"knowledge\", \"knowledge_note\": \"only for basis knowledge: what you know, from when, and how (max 300 characters)\", \"as_of\": \"YYYY-MM-DD the figure or your knowledge refers to\", \"confidence\": \"high|medium|low\"}. If nothing newer or better exists: {\"found\": false, \"reason\": \"...\"}.";
    return aim_agent_query($agent, ['system' => $system, 'messages' => [['role' => 'user', 'content' => $user]], 'search' => $agent['search'], 'domains' => $t['domains'] ?? [], 'timeout' => AIM_AI_SYNC_TIMEOUT, 'max_searches' => 3, 'max_turns' => 3]);
}
/** Normalise one agent's answer (result of aim_llm or aim_llm_bg_poll). */
function aim_research_answer(array $t, array $r): array
{
    $o = ['ok' => !empty($r['ok']), 'error' => $r['ok'] ? null : (string)($r['error'] ?? 'no answer'), 'found' => false, 'provider' => (string)($r['provider'] ?? ''), 'model' => (string)($r['model'] ?? ''), 'cost' => round((float)($r['cost'] ?? 0), 6)];
    if (!$o['ok']) return $o;
    $j = aim_extract_json((string)$r['text']);
    if (!is_array($j)) return ['ok' => false, 'error' => 'answer was not JSON'] + $o;
    $isFound = ($j['found'] ?? false) === true || ($j['found'] ?? '') === 'true';   // "false" as a string is not found
    if (!$isFound) return $o + ['reason' => aim_str($j['reason'] ?? 'nothing newer', 300)];
    $raw = $j['value'] ?? null;
    $val = is_numeric($raw) && is_finite((float)$raw) ? (float)$raw : null;   // 1e400 decodes to INF, which cannot be stored
    $flags = [];
    if ($val !== null && (($t['min'] ?? null) !== null && $val < $t['min'] || ($t['max'] ?? null) !== null && $val > $t['max'])) $flags[] = 'outside the plausible range';
    // Google Search grounding returns redirect links (vertexaisearch.cloud.google.com/grounding-api-redirect/…) titled with the domain
    $host = fn($u) => strtolower((string)preg_replace('/^www\./', '', (string)parse_url((string)$u, PHP_URL_HOST)));
    $redirect = fn($u) => $host($u) === 'vertexaisearch.cloud.google.com';
    $noWeb = empty(aim_provider_catalog()[$o['provider']]['search']);   // e.g. DeepSeek: no web search, so it can only answer from knowledge
    $url = aim_str($j['source_url'] ?? '', 500);
    if ($url !== '' && !aim_url_ok($url)) $url = '';
    $late = [];
    if ($url !== '' && $noWeb) { $late[] = 'this agent has no web access: the link it named was not checked and is not used'; $url = ''; }
    if ($url !== '' && $redirect($url)) { $late[] = 'the agent gave a Google redirect link instead of the page — open the pages it used and enter the real page address'; $url = ''; }
    $knowledge = $noWeb || (($j['basis'] ?? '') === 'knowledge' && $url === '');
    $sources = is_array($r['sources'] ?? null) ? $r['sources'] : [];
    if ($knowledge) $flags[] = 'AI knowledge without a published source — it will be labelled “AI knowledge” (model and date named)';
    elseif ($url === '') $flags[] = 'no valid source link — add one, or approve it as AI knowledge';
    foreach ($late as $x) $flags[] = $x;
    $hit = false;
    foreach ($sources as $src) {
        if ($url === '') break;
        if (rtrim((string)$src['url'], '/') === rtrim($url, '/')) $hit = true;
        elseif ($redirect($src['url']) && strtolower((string)preg_replace('/^www\./', '', trim((string)($src['title'] ?? '')))) === $host($url)) $hit = true;
    }
    if ($url !== '' && $sources && !$hit) $flags[] = 'source link not among the pages the search returned';
    $quote = aim_str($j['quote'] ?? '', 300);
    if ($quote === '' && !$knowledge) $flags[] = 'no supporting quote';
    // further references: pages the model named as confirming, then the pages the web search returned
    $refs = [];
    $addRef = function ($u, $title) use (&$refs, $url, $redirect) {
        $u = aim_str($u, 500);
        if (!aim_url_ok($u) || $redirect($u) || rtrim($u, '/') === rtrim($url, '/') || count($refs) >= 6) return;   // redirect links are not stable public references
        foreach ($refs as $x) if (rtrim($x['url'], '/') === rtrim($u, '/')) return;
        $refs[] = ['title' => aim_line($title ?: (parse_url($u, PHP_URL_HOST) ?: $u), 160), 'url' => $u];
    };
    if (!$knowledge) {   // a knowledge answer has no pages: links it names were not read, and the search pages did not support it
        foreach (array_slice(is_array($j['supporting'] ?? null) ? $j['supporting'] : [], 0, 3) as $x) if (is_array($x)) $addRef($x['url'] ?? '', $x['title'] ?? '');
        foreach ($sources as $x) $addRef($x['url'] ?? '', $x['title'] ?? '');
    }
    return array_merge($o, [
        'found' => true, 'value' => $val, 'display' => aim_line($j['display'] ?? '', 200), 'period' => aim_line($j['period'] ?? '', 120),
        'published' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($j['published'] ?? '')) ? (string)$j['published'] : '',
        'title' => aim_line($j['source_title'] ?? '', 160), 'publisher' => aim_line($j['publisher'] ?? '', 80), 'url' => $url, 'quote' => $quote,
        'method' => aim_str($j['method'] ?? '', 400), 'components' => array_slice(array_map(fn($x) => aim_line(is_scalar($x) ? (string)$x : '', 160), is_array($j['components'] ?? null) ? $j['components'] : []), 0, 8),
        'refs' => $refs, 'basis' => $knowledge ? 'knowledge' : 'source', 'note' => aim_str($j['knowledge_note'] ?? '', 300),
        'as_of' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($j['as_of'] ?? '')) ? (string)$j['as_of'] : '',
        'confidence' => in_array($j['confidence'] ?? '', ['high', 'medium', 'low'], true) ? $j['confidence'] : '', 'flags' => $flags,
        'searchSources' => array_slice($sources, 0, 8),
    ]);
}
/** The "proposed" record of a review candidate, built from one agent's answer. */
function aim_panel_proposal(string $metric, string $kind, array $ans): array
{
    $knowledge = ($ans['basis'] ?? '') === 'knowledge';
    $who = aim_provider_label((string)$ans['provider']) . ' ' . $ans['model'];
    $src = trim(($ans['publisher'] !== '' && stripos($ans['title'], $ans['publisher']) === false ? $ans['publisher'] . ': ' : '') . $ans['title'] . ($ans['published'] !== '' ? ' (' . $ans['published'] . ')' : ''));
    if ($knowledge) $src = 'AI model knowledge: ' . $who . ' (' . aim_now()->format('j M Y') . ($ans['as_of'] !== '' ? '; refers to ' . $ans['as_of'] : '') . ')';
    $val = $ans['value'] ?? null;
    return ['value' => $val, 'v' => $val !== null && $kind === 'value' ? aim_anchor_text($metric, (float)$val) : null, 'status' => $knowledge ? 'ai-knowledge' : 'estimate', 'period' => $ans['period'],
        'src' => $src, 'url' => $ans['url'], 'calc' => trim($ans['method'] . ($knowledge && $ans['note'] !== '' ? ' ' . $ans['note'] : '')), 'quote' => $knowledge ? $ans['note'] : $ans['quote'],
        'refs' => $ans['refs'], 'retrieved' => aim_now()->format('Y-m-d'),
        'via' => $knowledge ? ['type' => 'ai-knowledge', 'name' => 'AI model knowledge (no specific source)', 'model' => $who] : ['type' => 'ai', 'name' => 'AI-assisted web research', 'model' => $who]];
}
/** Effective weight of an answer in the consensus: the agent's weight, times the knowledge factor for answers without a source. */
function aim_panel_weight(array $ans, int $w): float
{
    $kf = max(0.0, min(1.0, (float)(aim_settings()['ai']['panel']['knowledge_factor'] ?? 0.5)));
    $sourced = ($ans['basis'] ?? '') === 'source' && ($ans['url'] ?? '') !== '';   // an answer without a usable link counts like knowledge
    return $w * ($sourced ? 1.0 : $kf);
}
/** Half-width of the agreement band: the tolerance times the value, but at least the tolerance times a tenth of the plausible range (values near zero). */
function aim_panel_band(?float $value, float $tol, float $scale): float
{
    return $tol * max(abs((float)$value), $scale, 1e-9);
}
function aim_panel_scale(?array $t): float
{
    return 0.1 * max(abs((float)($t['min'] ?? 0)), abs((float)($t['max'] ?? 0)));
}
/** Weighted median of [['v' => value, 'w' => weight], ...]: the lowest value at which half of the weight is reached (always an actual answer). */
function aim_weighted_median(array $xs): ?float
{
    $xs = array_values(array_filter($xs, fn($x) => $x['w'] > 0));
    if (!$xs) return null;
    usort($xs, fn($a, $b) => $a['v'] <=> $b['v']);
    $total = array_sum(array_column($xs, 'w'));
    $cum = 0.0;
    foreach ($xs as $x) { $cum += $x['w']; if ($cum >= $total / 2 - 1e-12) return (float)$x['v']; }
    return (float)end($xs)['v'];
}
/**
 * Public summary of the panel for the published value $value (what readers see next to the value): who answered,
 * with which value and source, whether each answer agrees with $value, and the agreement share by weight.
 * $answers: agent id => normalised answer (plus 'w', the agent's weight at the time). $lead: agent id or ''.
 */
function aim_panel_public(array $answers, string $lead, ?float $value, string $metric, int $asked, float $scale = 0.0): array
{
    $tol = max(0.01, min(1.0, (float)(aim_settings()['ai']['panel']['tolerance'] ?? 0.10)));
    $band = aim_panel_band($value, $tol, $scale);
    $members = []; $vals = []; $wIn = 0.0; $wAll = 0.0;
    foreach ($answers as $id => $ans) {
        if (empty($ans['ok'])) continue;
        $m = ['agent' => aim_provider_label((string)($ans['provider'] ?: $id)), 'model' => (string)$ans['model'], 'w' => (int)($ans['w'] ?? 0)];
        if (empty($ans['found'])) { $members[] = $m + ['v' => '', 'value' => null, 'basis' => 'source', 'none' => aim_str($ans['reason'] ?? 'nothing newer', 160)]; continue; }
        $v = $ans['value'];
        $m['v'] = $v !== null ? aim_anchor_text($metric, (float)$v) : aim_line($ans['display'] ?? '', 120);
        $m['value'] = $v;
        $m['basis'] = $ans['basis'];
        if ($ans['basis'] === 'source' && aim_url_ok((string)$ans['url'])) { $m['url'] = $ans['url']; $t = $ans['title'] !== '' ? $ans['title'] : $ans['publisher']; if ($t !== '') $m['title'] = aim_line($t, 120); }
        if ($ans['basis'] === 'knowledge' && ($ans['note'] ?? '') !== '') $m['note'] = aim_str($ans['note'], 300);
        if ($v !== null && $value !== null && !in_array('outside the plausible range', $ans['flags'] ?? [], true)) {
            $m['agrees'] = abs($v - $value) <= $band;
            $vals[] = $v;
            $ew = aim_panel_weight($ans, (int)($ans['w'] ?? 0));
            $wAll += $ew; if ($m['agrees']) $wIn += $ew;
        }
        if ($id === $lead) $m['lead'] = true;
        $members[] = $m;
    }
    $answered = count(array_filter($answers, fn($x) => !empty($x['ok'])));
    $p = ['rule' => 'weighted median', 'asked' => $asked, 'answered' => $answered, 'tol' => $tol];
    if ($wAll > 0) $p['agree'] = round($wIn / $wAll, 2);
    if (count($vals) >= 2) { $p['lo'] = min($vals); $p['hi'] = max($vals); }
    $p['members'] = $members;
    return $p;
}
/** Combine the answers of all agents for one target into one review candidate (or none). */
function aim_panel_merge(array $t, array $ds, array $answers, int $asked): array
{
    $a = $ds['anchors'][$t['anchor']] ?? [];
    $metric = (string)($a['metric'] ?? '');
    $ok = array_filter($answers, fn($x) => !empty($x['ok']));
    if (!$ok) return ['ok' => false, 'error' => 'no agent answered: ' . implode('; ', array_map(fn($id, $x) => aim_provider_label($id) . ' ' . ($x['error'] ?? 'failed'), array_keys($answers), $answers))];
    $found = array_filter($ok, fn($x) => !empty($x['found']));
    if (!$found) return ['ok' => true, 'candidates' => [], 'note' => 'nothing newer (' . count($ok) . ' agent' . (count($ok) > 1 ? 's' : '') . ' answered)'];
    // the consensus: weighted median of the numeric answers in the plausible range
    $xs = [];
    foreach ($found as $id => $x) if ($x['value'] !== null && !in_array('outside the plausible range', $x['flags'], true)) $xs[$id] = ['v' => (float)$x['value'], 'w' => aim_panel_weight($x, (int)($x['w'] ?? 0))];
    $cons = aim_weighted_median($xs);
    if ($cons === null && $xs) $cons = aim_weighted_median(array_map(fn($x) => ['v' => $x['v'], 'w' => 1.0], $xs));   // every weight is 0: plain median, the reviewer decides
    // the lead: the answer that is the consensus (sources before knowledge, then weight); without numbers the best found answer
    $rank = fn($id, $x) => [($x['basis'] === 'source' && $x['url'] !== '' ? 1 : 0), aim_panel_weight($x, (int)($x['w'] ?? 0)), ['high' => 3, 'medium' => 2, 'low' => 1][$x['confidence']] ?? 0, -array_search($id, AIM_AGENTS, true)];
    $lead = ''; $best = null;
    foreach ($found as $id => $x) {
        if ($cons !== null && ($x['value'] === null || abs((float)$x['value'] - $cons) > 1e-9 * max(1.0, abs($cons)))) continue;
        $r = $rank($id, $x);
        if ($best === null || $r > $best) { $best = $r; $lead = $id; }
    }
    $L = $found[$lead];
    $p = aim_panel_proposal($metric, (string)$t['kind'], $L);
    $scale = aim_panel_scale($t);
    $panel = aim_panel_public($answers, $lead, $cons, $metric, $asked, $scale);
    $p['via']['name'] = 'AI research panel (' . $panel['answered'] . ' of ' . $asked . ' agent' . ($asked > 1 ? 's' : '') . ' answered)';
    $p['via']['panel'] = $panel;
    $flags = $L['flags'];
    if (isset($panel['lo'], $panel['hi']) && $cons !== null && ($panel['hi'] - $panel['lo']) > 2 * aim_panel_band($cons, $panel['tol'], $scale)) $flags[] = 'agents disagree: answers range from ' . aim_anchor_text($metric, $panel['lo']) . ' to ' . aim_anchor_text($metric, $panel['hi']) . ' — compare the answers below';
    if (count($found) === 1 && $asked > 1) $flags[] = 'only one agent found something newer';
    $fail = array_diff_key($answers, $ok);
    if ($fail) $flags[] = count($fail) . ' agent' . (count($fail) > 1 ? 's' : '') . ' gave no answer (' . implode(', ', array_map('aim_provider_label', array_keys($fail))) . ')';
    $ev = [];
    foreach ($found as $id => $x) $ev[] = aim_provider_label($id) . ': ' . trim(($x['display'] !== '' ? $x['display'] : ($x['value'] !== null ? aim_anchor_text($metric, (float)$x['value']) : '')) . ($x['period'] !== '' ? ' (' . $x['period'] . ')' : '') . ($x['basis'] === 'knowledge' ? ' [AI knowledge]' : ($x['quote'] !== '' ? ' — “' . mb_substr($x['quote'], 0, 160) . '”' : '')));
    $comp = $L['components'] ? ' Components: ' . aim_str(implode('; ', $L['components']), 400) : '';
    $cost = array_sum(array_map(fn($x) => (float)($x['cost'] ?? 0), $answers));
    $cand = ['source' => 'research', 'anchor' => $t['anchor'], 'metric' => $metric, 'kind' => $t['kind'] === 'value' && $cons !== null ? 'value' : 'evidence',
        'evidence' => aim_str(implode(' · ', $ev) . $comp, 1400), 'proposed' => $p, 'confidence' => $L['confidence'], 'flags' => array_values(array_unique($flags)),
        'searchSources' => $L['searchSources'] ?? [],
        'panel' => ['consensus' => $cons, 'lead' => $lead, 'asked' => $asked, 'answers' => $answers,
            'proposals' => array_map(fn($x) => aim_panel_proposal($metric, (string)$t['kind'], $x), $found),   // what "Use this answer" fills in on the review card
            'summary' => array_diff_key($panel, ['members' => 1])],
        'ai' => ['provider' => $L['provider'], 'model' => $L['model'], 'cost' => round($cost, 6)]];
    return ['ok' => true, 'candidates' => [$cand], 'note' => count($found) . ' of ' . $asked . ' agents found something; lead ' . aim_provider_label($lead)];
}
function aim_provider_label(string $p): string
{
    $l = aim_provider_catalog()[$p]['label'] ?? $p;
    return preg_replace('/\s*\(.*\)$/', '', $l);
}
