<?php
/* AI Forecast Atlas — a small read-only MCP server (Streamable HTTP, JSON responses) so AI assistants can read
   the official data: measures, scenarios, releases, series, signposts and impacts. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

const AIM_MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

function aim_mcp_tools(): array
{
    $scn = ['type' => 'string', 'description' => 'Scenario key: COMM, BUST, BRKW, SPLT, PWR, BOOM, TRST or PLAT', 'enum' => ['COMM', 'BUST', 'BRKW', 'SPLT', 'PWR', 'BOOM', 'TRST', 'PLAT']];
    $ro = ['readOnlyHint' => true, 'openWorldHint' => false];
    return [
        ['name' => 'list_metrics', 'title' => 'List measures', 'description' => 'All measures with key, name, unit and group (A capital & markets, B models & pricing, C compute & energy, D market structure, E macro & work, S sector series).', 'inputSchema' => ['type' => 'object', 'properties' => (object)[]], 'annotations' => $ro],
        ['name' => 'list_scenarios', 'title' => 'List scenarios', 'description' => 'The eight scenarios with key, name and thesis, and the fourteen drivers.', 'inputSchema' => ['type' => 'object', 'properties' => (object)[]], 'annotations' => $ro],
        ['name' => 'get_release', 'title' => 'Get a weekly release', 'description' => 'Summary of a weekly release: what changed in the data, how the scenarios moved, headline numbers per scenario at Q4 2026/2027/2028/2030/2035.', 'inputSchema' => ['type' => 'object', 'properties' => ['release' => ['type' => 'string', 'description' => 'Release id like 2026-W43, or "latest" (default)']]], 'annotations' => $ro],
        ['name' => 'list_releases', 'title' => 'List releases', 'description' => 'Every weekly release with date and summary, newest first.', 'inputSchema' => ['type' => 'object', 'properties' => ['limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 200]]], 'annotations' => $ro],
        ['name' => 'get_series', 'title' => 'Get quarterly series', 'description' => 'Quarterly values (2023–2035) of one or more measures in one scenario. History until Q4 2026 is shared by all scenarios.', 'inputSchema' => ['type' => 'object', 'properties' => ['scenario' => $scn, 'metrics' => ['type' => 'array', 'items' => ['type' => 'string'], 'description' => 'Measure keys, e.g. ["K","R","Pf"]'], 'from' => ['type' => 'string', 'description' => 'First quarter, e.g. "Q1 2027"'], 'to' => ['type' => 'string', 'description' => 'Last quarter, e.g. "Q4 2030"'], 'release' => ['type' => 'string']], 'required' => ['scenario', 'metrics']], 'annotations' => $ro],
        ['name' => 'explain_metric', 'title' => 'Explain a measure', 'description' => 'Definition, unit, how the history was compiled (with sources), the model formula behind the scenario paths, and the sourced starting value (status, period, source, link, quote, derivation) of one measure.', 'inputSchema' => ['type' => 'object', 'properties' => ['metric' => ['type' => 'string']], 'required' => ['metric']], 'annotations' => $ro],
        ['name' => 'get_sources', 'title' => 'Sources of the data', 'description' => 'Every starting value (evidence ledger) with its source, link, quote, further references, how it entered the data (official interface, AI-assisted research with second opinion, desk research, assumption) and review date. Filter by measure key or ledger id.', 'inputSchema' => ['type' => 'object', 'properties' => ['metric' => ['type' => 'string', 'description' => 'Measure key, e.g. "K"'], 'id' => ['type' => 'string', 'description' => 'Ledger id, e.g. "AN1"']]], 'annotations' => $ro],
        ['name' => 'get_signposts', 'title' => 'Early-warning signposts', 'description' => 'For each warning threshold, the first quarter each scenario crosses it.', 'inputSchema' => ['type' => 'object', 'properties' => (object)[]], 'annotations' => $ro],
        ['name' => 'get_xwatch', 'title' => 'X watch', 'description' => 'Posts on X that the AI Forecast Atlas editor is watching: found by Grok (xAI) with its X search, labelled for credibility and impact, approved by a person. Signals, not data — they do not change the model. Each item has a summary, why it matters, the post links and the linked measures.', 'inputSchema' => ['type' => 'object', 'properties' => ['topic' => ['type' => 'string', 'description' => 'Optional topic: markets, models, compute, structure, work, aeco, aecosw or dev'], 'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 40]]], 'annotations' => $ro],
        ['name' => 'get_impacts', 'title' => 'Who gains and who loses', 'description' => 'Impact scores (−100 loses most … +100 gains most, versus Q4 2026) for 37 business groups and regions in one scenario and year.', 'inputSchema' => ['type' => 'object', 'properties' => ['scenario' => $scn, 'year' => ['type' => 'integer', 'minimum' => 2027, 'maximum' => 2035]], 'required' => ['scenario']], 'annotations' => $ro],
    ];
}
function aim_mcp_dir(?string $release): string
{
    if ($release && $release !== 'latest' && aim_valid_release_id($release) && is_dir(aim_public('data/releases/' . $release))) return aim_public('data/releases/' . $release);
    return aim_public('data/latest');
}
function aim_mcp_call(string $name, array $args)
{
    $credit = 'Source: AI Forecast Atlas by Creoox AG (aiforecastatlas.com), CC BY 4.0. A scenario model, not a forecast.';
    switch ($name) {
        case 'list_metrics': return (aim_read_json(aim_public('data/latest/metrics.json'), []) ?: []) + ['credit' => $credit];
        case 'list_scenarios': return (aim_read_json(aim_public('data/latest/scenarios.json'), []) ?: []) + ['credit' => $credit];
        case 'list_releases': return ['releases' => array_slice(aim_releases_index()['releases'], 0, max(1, min(200, (int)($args['limit'] ?? 20)))), 'credit' => $credit];
        case 'get_release':
            $r = aim_read_json(aim_mcp_dir($args['release'] ?? null) . '/release.json', null);
            if (!$r) throw new InvalidArgumentException('Release not found.');
            return array_intersect_key($r, array_flip(['id', 'publishedAt', 'asOf', 'next', 'engine', 'summary', 'changes', 'highlights', 'headline', 'regimes', 'impacts2030', 'carryForward', 'licence'])) + ['credit' => $credit];
        case 'get_series':
            $sk = strtoupper((string)($args['scenario'] ?? ''));
            if (!preg_match('/^[A-Z]{3,5}$/', $sk)) throw new InvalidArgumentException('Unknown scenario.');
            $s = aim_read_json(aim_mcp_dir($args['release'] ?? null) . '/series/' . $sk . '.json', null);
            if (!$s) throw new InvalidArgumentException('Unknown scenario.');
            $q = $s['quarters']; $i0 = 0; $i1 = count($q) - 1;
            if (!empty($args['from']) && ($p = array_search($args['from'], $q, true)) !== false) $i0 = $p;
            if (!empty($args['to']) && ($p = array_search($args['to'], $q, true)) !== false) $i1 = $p;
            $out = ['release' => $s['release'], 'scenario' => $s['scenario'], 'quarters' => array_slice($q, $i0, $i1 - $i0 + 1), 'history_until' => $s['history_until'], 'values' => []];
            foreach (array_slice((array)($args['metrics'] ?? []), 0, 20) as $k) if (isset($s['metrics'][$k])) $out['values'][$k] = array_slice($s['metrics'][$k], $i0, $i1 - $i0 + 1);
            if (!$out['values']) throw new InvalidArgumentException('No known measures; call list_metrics.');
            return $out + ['credit' => $credit];
        case 'explain_metric':
            $k = (string)($args['metric'] ?? '');
            $m = (aim_read_json(aim_public('data/latest/metrics.json'), []) ?: [])['metrics'][$k] ?? null;
            if (!$m) throw new InvalidArgumentException('Unknown measure; call list_metrics.');
            $anchor = null;
            foreach ((aim_read_json(aim_public('data/latest/dataset.json'), []) ?: [])['anchors'] ?? [] as $id => $a) if (($a['metric'] ?? '') === $k) $anchor = ['id' => $id] + $a;
            $method = (aim_read_json(aim_public('assets/methods.json'), []) ?: [])['metrics'][$k] ?? null;
            return ['metric' => $k] + $m + ['method' => $method, 'startingValue' => $anchor, 'credit' => $credit];
        case 'get_sources':
            $ds = aim_read_json(aim_public('data/latest/dataset.json'), []) ?: [];
            $want = (string)($args['metric'] ?? ''); $wantId = strtoupper((string)($args['id'] ?? ''));
            $rows = [];
            foreach (($ds['anchors'] ?? []) as $id => $a) {
                if ($want !== '' && ($a['metric'] ?? '') !== $want) continue;
                if ($wantId !== '' && $id !== $wantId) continue;
                $rows[] = ['id' => $id] + array_intersect_key($a, array_flip(['metric', 'name', 'v', 'value', 'status', 'period', 'scope', 'src', 'url', 'quote', 'refs', 'calc', 'via', 'retrieved', 'reviewed', 'was']));
            }
            if (!$rows) throw new InvalidArgumentException('No matching starting value; call get_sources without arguments for the full list.');
            return ['asOf' => $ds['asOf'] ?? null, 'sources' => $rows, 'note' => 'History before Q4 2026 and the model formulas are described per measure by explain_metric.', 'credit' => $credit];
        case 'get_xwatch':
            $j = aim_read_json(aim_public('data/xwatch.json'), []) ?: [];
            $items = is_array($j['items'] ?? null) ? $j['items'] : [];
            $topic = (string)($args['topic'] ?? '');
            if ($topic !== '') $items = array_values(array_filter($items, fn($x) => in_array($topic, (array)($x['topics'] ?? []), true)));
            return ['updated' => $j['updated'] ?? null, 'about' => $j['about'] ?? '', 'items' => array_slice($items, 0, max(1, min(40, (int)($args['limit'] ?? 10)))), 'credit' => $credit];
        case 'get_signposts':
            $r = aim_read_json(aim_public('data/latest/release.json'), []) ?: [];
            return ['release' => $r['id'] ?? null, 'signposts' => $r['signposts'] ?? [], 'credit' => $credit];
        case 'get_impacts':
            $sk = strtoupper((string)($args['scenario'] ?? ''));
            if (!preg_match('/^[A-Z]{3,5}$/', $sk)) throw new InvalidArgumentException('Unknown scenario.');
            $f = aim_read_json(aim_public('data/latest/impacts/' . $sk . '.json'), null);
            if (!$f) throw new InvalidArgumentException('Unknown scenario.');
            $y = (string)max(2027, min(2035, (int)($args['year'] ?? 2030)));
            $rows = array_map(fn($r) => ['group' => $r['group'], 'name' => $r['name'], 'score' => $r['scores'][$y] ?? null], $f['rows']);
            usort($rows, fn($a, $b) => ($b['score'] ?? 0) <=> ($a['score'] ?? 0));
            return ['release' => $f['release'], 'scenario' => $f['scenario'], 'year' => (int)$y, 'scale' => $f['scale'], 'rows' => $rows, 'credit' => $credit];
    }
    throw new InvalidArgumentException('Unknown tool.');
}
function aim_mcp_handle_one(array $m): ?array
{
    $id = $m['id'] ?? null;
    $method = (string)($m['method'] ?? '');
    $ok = fn($result) => ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    $err = fn(int $code, string $msg) => ['jsonrpc' => '2.0', 'id' => $id, 'error' => ['code' => $code, 'message' => $msg]];
    if (!array_key_exists('id', $m)) return null;   // notification: no response
    switch ($method) {
        case 'initialize':
            $want = (string)($m['params']['protocolVersion'] ?? '');
            return $ok(['protocolVersion' => in_array($want, AIM_MCP_VERSIONS, true) ? $want : AIM_MCP_VERSIONS[0], 'capabilities' => ['tools' => ['listChanged' => false]],
                'serverInfo' => ['name' => 'ai-forecast-atlas', 'title' => 'AI Forecast Atlas (Creoox AG)', 'version' => AIM_VERSION],
                'instructions' => 'Read-only access to AI Forecast Atlas, a weekly-updated scenario model of AI commoditization (2023–2035, eight scenarios). Start with list_metrics and get_release. Values are scenario paths, not forecasts. Credit “AI Forecast Atlas by Creoox AG”, CC BY 4.0.']);
        case 'ping': return $ok((object)[]);
        case 'tools/list': return $ok(['tools' => aim_mcp_tools()]);
        case 'tools/call':
            $name = (string)($m['params']['name'] ?? '');
            $args = is_array($m['params']['arguments'] ?? null) ? $m['params']['arguments'] : [];
            try {
                $res = aim_mcp_call($name, $args);
                return $ok(['content' => [['type' => 'text', 'text' => aim_json_encode($res)]], 'structuredContent' => $res, 'isError' => false]);
            } catch (InvalidArgumentException $e) {
                return $ok(['content' => [['type' => 'text', 'text' => $e->getMessage()]], 'isError' => true]);
            }
        case 'resources/list': return $ok(['resources' => []]);
        case 'prompts/list': return $ok(['prompts' => []]);
    }
    return $err(-32601, 'Method not found');
}
function aim_handle_mcp(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization');
    header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
    $method = aim_method();
    if ($method === 'OPTIONS') { http_response_code(204); return; }
    if ($method !== 'POST') { http_response_code(405); header('Allow: POST'); header('Content-Type: application/json'); echo '{"error":"Use POST (Streamable HTTP, JSON responses)."}'; return; }
    if (!aim_rate_ok('mcp', aim_ip_hash(), 300, 3600)) { aim_json_out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32000, 'message' => 'Rate limit, try later.']], 429); return; }
    $raw = file_get_contents('php://input', false, null, 0, 200000);
    $msg = json_decode((string)$raw, true);
    if (!is_array($msg)) { aim_json_out(['jsonrpc' => '2.0', 'id' => null, 'error' => ['code' => -32700, 'message' => 'Parse error']], 400); return; }
    $isBatch = array_keys($msg) === range(0, count($msg) - 1);
    $replies = [];
    foreach ($isBatch ? $msg : [$msg] as $m) { if (!is_array($m)) continue; $r = aim_mcp_handle_one($m); if ($r !== null) $replies[] = $r; }
    if (!$replies) { http_response_code(202); return; }
    aim_json_out($isBatch ? $replies : $replies[0]);
}
