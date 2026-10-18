<?php
/* AI Forecast Atlas — one interface to several AI providers (OpenAI, Anthropic, Google Gemini, xAI, DeepSeek, Mistral,
   Perplexity, OpenRouter), the research panel of five agents with weights, role routing (chat, writer), streaming,
   web and X search sources,
   token usage and cost tracking. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

/** Provider catalogue: API style, whether web search is available, label, and suggested models. */
function aim_provider_catalog(): array
{
    return [
        'openai' => ['label' => 'OpenAI', 'api' => 'responses', 'search' => true, 'models' => ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'], 'keys_url' => 'https://platform.openai.com/api-keys'],
        'anthropic' => ['label' => 'Anthropic (Claude)', 'api' => 'messages', 'search' => true, 'models' => ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], 'keys_url' => 'https://platform.claude.com/'],
        'gemini' => ['label' => 'Google Gemini', 'api' => 'gemini', 'search' => true, 'models' => ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-flash-lite'], 'keys_url' => 'https://aistudio.google.com/app/apikey'],
        'xai' => ['label' => 'xAI (Grok)', 'api' => 'responses', 'search' => true, 'models' => ['grok-4.3', 'grok-4.7'], 'keys_url' => 'https://console.x.ai/'],
        'deepseek' => ['label' => 'DeepSeek', 'api' => 'chat', 'search' => false, 'models' => ['deepseek-flash', 'deepseek-v4-pro'], 'keys_url' => 'https://platform.deepseek.com/'],
        'mistral' => ['label' => 'Mistral', 'api' => 'chat', 'search' => false, 'models' => ['mistral-small-latest', 'mistral-large-latest'], 'keys_url' => 'https://console.mistral.ai/'],
        'perplexity' => ['label' => 'Perplexity', 'api' => 'responses', 'search' => true, 'models' => ['preset:fast', 'preset:medium'], 'keys_url' => 'https://www.perplexity.ai/settings/api'],
        'openrouter' => ['label' => 'OpenRouter (many models, one key)', 'api' => 'chat', 'search' => true, 'models' => ['openai/gpt-6-luna', 'anthropic/claude-haiku-5-5', 'google/gemini-3.8-flash'], 'keys_url' => 'https://openrouter.ai/keys'],
    ];
}
/** List prices in USD per million tokens [input, output] and per web search call (checked 17 Oct 2026). Unknown models use the conservative default. */
function aim_price(string $provider, string $model): array
{
    $over = aim_settings()['ai']['prices'][$provider . ':' . $model] ?? null;
    if (is_array($over) && count($over) >= 2) return [(float)$over[0], (float)$over[1], (float)($over[2] ?? 0.01)];
    $t = [
        'openai:gpt-6-luna' => [0.10, 0.50, 0.01], 'openai:gpt-6.1-sol' => [2, 10, 0.01], 'openai:gpt-6-astra' => [10, 50, 0.01],
        'anthropic:claude-haiku-5-5' => [0.10, 0.50, 0.01], 'anthropic:claude-sonnet-5-5' => [2, 10, 0.01], 'anthropic:claude-opus-5-5' => [4, 20, 0.01], 'anthropic:claude-fable-5-1' => [10, 50, 0.01],
        'gemini:gemini-3.8-flash' => [0.75, 3.75, 0.014], 'gemini:gemini-4-argon' => [4, 20, 0.014], 'gemini:gemini-3.1-flash-lite' => [0.25, 1.50, 0.014],
        'xai:grok-4.7' => [2, 6, 0.005], 'xai:grok-4.3' => [1.25, 2.50, 0.005],
        'deepseek:deepseek-flash' => [0.30, 1.20, 0], 'deepseek:deepseek-v4-pro' => [1.32, 3.96, 0], 'mistral:mistral-small-latest' => [0.15, 0.60, 0],
        'gemini:gemini-3.1-pro-preview' => [2, 12, 0.014], 'gemini:gemini-3-flash-preview' => [0.50, 3, 0.014], 'xai:grok-4.6' => [2, 6, 0.005],
        'openrouter:openai/gpt-6-luna' => [0.10, 0.50, 0.007],
    ];
    return $t[$provider . ':' . $model] ?? [2.0, 10.0, 0.01];
}
function aim_provider_key(string $provider): string { return (string)(aim_settings()['ai']['providers'][$provider]['key'] ?? ''); }
/** Resolve a role (chat, writer; research and crosscheck are the single-provider roles of 1.0) to provider, model and options; null if not configured. */
function aim_role(string $role): ?array
{
    $s = aim_settings();
    $r = $s['ai']['roles'][$role] ?? null;
    if (!$r || empty($r['provider']) || empty($r['model'])) return null;
    // visitors' messages never go to DeepSeek: it processes data in China without a data processing agreement
    if ($role === 'chat' && ($r['provider'] === 'deepseek' || stripos((string)$r['model'], 'deepseek') !== false)) return null;
    if (aim_provider_key($r['provider']) === '') return null;
    return $r + ['role' => $role];
}
function aim_role_available(string $role): bool { return aim_role($role) !== null; }

/* ---------- the research panel: five AI agents with weights ---------- */
const AIM_AGENTS = ['openai', 'anthropic', 'gemini', 'xai', 'deepseek'];
/** All agents with their settings and state: id => [label, provider, model, weight, enabled, research, ready, search, ...]. */
function aim_agents(): array
{
    $s = aim_settings();
    $cat = aim_provider_catalog();
    $out = [];
    foreach (AIM_AGENTS as $id) {
        $a = $s['ai']['agents'][$id] ?? [];
        $model = trim((string)($a['model'] ?? ''));
        $hasKey = aim_provider_key($id) !== '';
        $out[$id] = [
            'id' => $id, 'provider' => $id, 'label' => aim_provider_label($id), 'model' => $model,
            'weight' => max(0, min(10, (int)($a['weight'] ?? 1))), 'enabled' => !empty($a['enabled']), 'research' => !empty($a['research']),
            'effort' => (string)($a['effort'] ?? ''), 'max_output' => max(300, (int)($a['max_output'] ?? 1600)),
            'hasKey' => $hasKey, 'search' => !empty($cat[$id]['search']), 'ready' => !empty($a['enabled']) && $hasKey && $model !== '',
        ];
    }
    return $out;
}
/** Agents that take part in today's research panel (switched on, research task, key and model set), in the fixed order. */
function aim_panel_agents(): array
{
    return array_values(array_filter(aim_agents(), fn($a) => $a['ready'] && $a['research']));
}
/** An aim_llm() query for one agent; costs are booked under "agent:<id>". */
function aim_agent_query(array $agent, array $q): array
{
    return $q + ['provider' => $agent['provider'], 'model' => $agent['model'], 'max_output' => $agent['max_output'], 'effort' => $agent['effort'] !== '' ? $agent['effort'] : 'low', 'usage_role' => 'agent:' . $agent['id'],
        'xai_effort' => $agent['provider'] === 'xai' && (bool)preg_match('/^grok-4\.(3|20)(\b|-)/', $agent['model'])];   // grok-4.3 and 4.20 take a reasoning effort (low = faster)
}
/** Remember each agent's last result for the admin page. */
function aim_agent_status(string $id, array $r, string $task): void
{
    aim_store_update('agents/status', function ($m) use ($id, $r, $task) {
        $m = is_array($m) ? $m : [];
        $x = $m[$id] ?? [];
        $x['last'] = aim_iso(); $x['task'] = $task; $x['ok'] = !empty($r['ok']);
        if (!empty($r['ok'])) $x['lastOk'] = aim_iso(); else { $x['lastError'] = aim_iso(); $x['error'] = aim_str((string)($r['error'] ?? 'failed'), 200); }
        $m[$id] = $x;
        return $m;
    }, []);
}
function aim_spec(string $s): ?array
{
    if (strpos($s, ':') === false) return null;
    [$p, $m] = explode(':', $s, 2);
    if (aim_provider_key($p) === '' || $p === 'deepseek' || stripos($m, 'deepseek') !== false) return null;   // used for the chat fallback: never DeepSeek (see aim_role)
    return ['provider' => $p, 'model' => $m];
}

/* ---------- usage and budgets ----------
   Every call books an estimated cost before it starts and corrects it to the real cost when the answer arrives.
   If the host stops the script in between, the estimate stays booked, so budgets can never be bypassed. */
function aim_usage_add(string $role, float $cost, array $usage, int $calls = 1): void
{
    $day = aim_now()->format('Y-m-d');
    aim_store_update('usage/' . substr($day, 0, 7), function ($u) use ($day, $role, $cost, $usage, $calls) {
        $u = is_array($u) ? $u : [];
        $d = $u[$day][$role] ?? ['calls' => 0, 'cost' => 0.0, 'in' => 0, 'out' => 0, 'search' => 0];
        $d['calls'] += $calls; $d['cost'] = round(max(0.0, $d['cost'] + $cost), 6);
        $d['in'] += (int)($usage['in'] ?? 0); $d['out'] += (int)($usage['out'] ?? 0); $d['search'] += (int)($usage['searches'] ?? 0);
        $u[$day][$role] = $d;
        return $u;
    });
}
function aim_usage_cost(string $role, string $period = 'day'): float
{
    $now = aim_now();
    $u = aim_store_read('usage/' . $now->format('Y-m'), []);
    if ($period === 'day') return (float)($u[$now->format('Y-m-d')][$role]['cost'] ?? 0);
    $t = 0.0;
    foreach ($u as $day => $roles) $t += (float)($roles[$role]['cost'] ?? 0);
    return $t;
}
/** Cost of the research work this month or today: all panel agents, X watch and the 1.0 research roles. */
function aim_usage_research(string $period = 'month'): float
{
    $now = aim_now();
    $u = aim_store_read('usage/' . $now->format('Y-m'), []) ?: [];
    $t = 0.0;
    foreach ($u as $day => $roles) {
        if ($period === 'day' && $day !== $now->format('Y-m-d')) continue;
        if (!is_array($roles)) continue;
        foreach ($roles as $r => $d) if (str_starts_with((string)$r, 'agent:') || in_array($r, ['xwatch', 'research', 'crosscheck'], true)) $t += (float)($d['cost'] ?? 0);
    }
    return $t;
}
/** Upper estimate of a call's cost: the prompt, the full output allowance and, with web search, search content and three searches. */
function aim_llm_estimate(string $provider, string $model, array $q, float $tokenFactor = 1.0): float
{
    [$pi, $po, $ps] = aim_price($provider, $model);
    $chars = strlen((string)($q['system'] ?? ''));
    foreach (($q['messages'] ?? []) as $m) $chars += strlen((string)($m['content'] ?? ''));
    $in = $chars / 3.5 + (!empty($q['search']) ? 12000 : 0);
    $out = max(200, (int)($q['max_output'] ?? 900));
    return round(($in * $pi + $out * $po) / 1e6 * $tokenFactor + (!empty($q['search']) ? 3 * $ps : 0) + (!empty($q['xsearch']) ? 0.40 : 0), 6);   // X search: about 60 posts and profiles
}

/* ---------- SSE parsing shared by the streaming adapters ---------- */
function aim_sse_feeder(callable $onEvent, ?callable $abortIf = null): callable
{
    $buf = '';
    return function (string $chunk) use (&$buf, $onEvent, $abortIf) {
        if ($abortIf && $abortIf()) return false;   // stop reading: curl closes the connection and the provider stops generating
        $buf .= str_replace("\r\n", "\n", $chunk);
        while (($p = strpos($buf, "\n\n")) !== false) {
            $block = substr($buf, 0, $p); $buf = substr($buf, $p + 2);
            $ev = ''; $data = [];
            foreach (explode("\n", $block) as $line) {
                if (str_starts_with($line, 'event:')) $ev = trim(substr($line, 6));
                elseif (str_starts_with($line, 'data:')) $data[] = ltrim(substr($line, 5), ' ');
            }
            if (!$data) continue;
            $raw = implode("\n", $data);
            if ($raw === '[DONE]') { $onEvent('done', null); continue; }
            $j = json_decode($raw, true);
            $onEvent($ev, is_array($j) ? $j : $raw);
        }
        return null;
    };
}
function aim_add_source(array &$sources, $url, $title): void
{
    $url = (string)$url;
    if (!preg_match('#^https?://#i', $url)) return;
    foreach ($sources as $s) if ($s['url'] === $url) return;
    if (count($sources) < 30) $sources[] = ['url' => $url, 'title' => aim_str($title ?: parse_url($url, PHP_URL_HOST), 200)];
}

/**
 * Call a model.
 * $q = ['role' => 'chat'] or ['provider' => 'openai', 'model' => 'gpt-6-luna'],
 *      'system' => string, 'messages' => [['role' => 'user'|'assistant', 'content' => string], ...],
 *      'max_output' => int, 'effort' => 'low'|..., 'search' => bool, 'domains' => [..], 'on_delta' => callable(string), 'timeout' => int,
 *      'abort_if' => callable(): bool (streaming only: stop when it returns true), 'usage_role' => role to account the cost to (defaults to 'role')
 * Returns ['ok', 'text', 'sources', 'usage' => ['in','out','searches'], 'cost', 'provider', 'model', 'error', 'aborted'].
 */
function aim_llm(array $q): array
{
    $q = aim_llm_resolve($q);
    if ($q === null) return ['ok' => false, 'text' => '', 'sources' => [], 'usage' => [], 'cost' => 0, 'provider' => '', 'model' => '', 'error' => 'not_configured', 'aborted' => false];
    $p = (string)($q['provider'] ?? ''); $model = (string)($q['model'] ?? '');
    $cat = aim_provider_catalog()[$p] ?? null;
    $key = aim_provider_key($p);
    $out = ['ok' => false, 'text' => '', 'sources' => [], 'usage' => ['in' => 0, 'out' => 0, 'searches' => 0], 'cost' => 0.0, 'provider' => $p, 'model' => $model, 'error' => null, 'aborted' => false];
    if (!$cat || $key === '' || $model === '') { $out['error'] = 'not_configured'; return $out; }
    $base = rtrim((string)(aim_settings()['ai']['providers'][$p]['base'] ?? ''), '/');
    $q['search'] = !empty($q['search']) && $cat['search'];
    $acct = (string)($q['usage_role'] ?? ($q['role'] ?? ''));
    $est = aim_llm_estimate($p, $model, $q);
    if ($acct !== '') aim_usage_add($acct, $est, [], 1);
    $aborted = false;
    if (isset($q['abort_if'])) { $f = $q['abort_if']; $q['abort_if'] = function () use ($f, &$aborted) { if (!$aborted && $f()) $aborted = true; return $aborted; }; }
    try {
        if ($cat['api'] === 'responses') $out = aim_llm_responses($p, $base, $key, $model, $q, $out);
        elseif ($cat['api'] === 'messages') $out = aim_llm_anthropic($base, $key, $model, $q, $out);
        elseif ($cat['api'] === 'gemini') $out = aim_llm_gemini($base, $key, $model, $q, $out);
        else $out = aim_llm_chat($p, $base, $key, $model, $q, $out);
    } catch (Throwable $e) {
        $out['error'] = 'exception: ' . $e->getMessage();
    }
    $out['aborted'] = $aborted;
    $out['cost'] = aim_llm_cost($p, $model, $out['usage']);
    $out['ok'] = $out['error'] === null && trim($out['text']) !== '';
    if ($out['error'] === null && !$out['ok']) $out['error'] = $aborted ? 'aborted' : 'empty answer';
    // correct the booking: the real cost when the provider reported usage, nothing when it refused the request (HTTP 4xx);
    // otherwise (stream cut, timeout, no usage reported) the estimate stays booked
    if ($acct !== '') {
        $reported = !$aborted && ($out['usage']['in'] > 0 || $out['usage']['out'] > 0);
        $refused = !$aborted && !$reported && $out['error'] !== null && (bool)preg_match('/^(HTTP 4\d\d|not_configured)/', (string)$out['error']);
        if ($reported || $refused) aim_usage_add($acct, $out['cost'] - $est, $out['usage'], 0);
        else $out['cost'] = $est;
    }
    if (!$out['ok'] && !$aborted) aim_log('ai', 'call failed', ['provider' => $p, 'model' => $model, 'error' => $out['error']]);
    return $out;
}
/** Fill provider, model and limits from a role. Null when the role is not configured. */
function aim_llm_resolve(array $q): ?array
{
    if (!isset($q['role'])) return $q;
    $r = aim_role($q['role']);
    if (!$r) return null;
    return $q + ['provider' => $r['provider'], 'model' => $r['model'], 'max_output' => (int)($r['max_output'] ?? 900), 'effort' => $r['effort'] ?? 'low'];
}
function aim_llm_cost(string $p, string $model, array $usage): float
{
    if (isset($usage['usd']) && is_numeric($usage['usd'])) return round((float)$usage['usd'], 6);   // the provider reported the exact cost
    [$pi, $po, $ps] = aim_price($p, $model);
    $f = isset($usage['factor']) && is_numeric($usage['factor']) ? (float)$usage['factor'] : 1.0;   // batch discount on tokens (searches cost the same)
    return round(((int)($usage['in'] ?? 0) * $pi + (int)($usage['out'] ?? 0) * $po) / 1e6 * $f + (int)($usage['searches'] ?? 0) * $ps, 6);
}

/* ---------- background mode (OpenAI Responses): start now, collect the answer on a later scheduler run ----------
   Keeps every scheduler run short on hosts that stop scripts after about a minute. */
function aim_llm_bg_supported(array $q): bool
{
    $q = aim_llm_resolve($q);
    return $q !== null && in_array($q['provider'] ?? '', ['openai', 'anthropic'], true) && !empty(aim_settings()['ai']['background']);
}
/** Same scheme, host and port: the API key is only ever sent to the provider's own address. */
function aim_same_origin(string $a, string $b): bool
{
    $x = parse_url($a); $y = parse_url($b);
    return is_array($x) && is_array($y) && strtolower($x['scheme'] ?? '') === strtolower($y['scheme'] ?? '') && strtolower($x['host'] ?? '') === strtolower($y['host'] ?? '') && ($x['port'] ?? null) === ($y['port'] ?? null);
}
/** Start a background response. Returns ['ok', 'job' => [...]] or ['ok' => false, 'error']. The estimated cost is booked now. */
function aim_llm_bg_start(array $q): array
{
    $q = aim_llm_resolve($q);
    if ($q === null) return ['ok' => false, 'error' => 'not_configured'];
    $p = (string)$q['provider']; $model = (string)$q['model'];
    $key = aim_provider_key($p);
    $base = rtrim((string)(aim_settings()['ai']['providers'][$p]['base'] ?? ''), '/');
    $q['search'] = !empty($q['search']);
    unset($q['on_delta']);
    $acct = (string)($q['usage_role'] ?? ($q['role'] ?? ''));
    $batch = $p === 'anthropic';
    $est = aim_llm_estimate($p, $model, $q, $batch ? 0.5 : 1.0);   // the batch discount applies to tokens only, as in aim_llm_cost()
    if ($acct !== '') aim_usage_add($acct, $est, [], 1);
    $cid = 'aim-' . substr(aim_rand(8), 0, 16);
    if ($batch)   // Claude: a message batch with one request (half price; most finish within the hour)
        $r = aim_http('POST', $base . '/messages/batches', ['json' => ['requests' => [['custom_id' => $cid, 'params' => aim_anthropic_body($model, $q, false)]]], 'headers' => aim_anthropic_headers($key) + ['Accept' => 'application/json'], 'timeout' => 25]);
    else
        $r = aim_http('POST', $base . '/responses', ['json' => aim_responses_body($p, $model, $q, false) + ['background' => true, 'store' => true], 'headers' => ['Authorization' => 'Bearer ' . $key, 'Accept' => 'application/json'], 'timeout' => 25]);
    $id = (string)($r['json']['id'] ?? '');
    if ($r['status'] >= 400 || $id === '') {
        if ($acct !== '') aim_usage_add($acct, -$est, [], 0);   // nothing was started
        $err = aim_http_problem($r);
        aim_log('ai', 'background start failed', ['provider' => $p, 'model' => $model, 'error' => $err]);
        return ['ok' => false, 'error' => $err];
    }
    return ['ok' => true, 'job' => ['id' => $id, 'provider' => $p, 'model' => $model, 'acct' => $acct, 'est' => $est, 'started' => time(), 'status' => (string)($r['json']['status'] ?? ($r['json']['processing_status'] ?? 'queued'))]
        + ($batch ? ['kind' => 'batch', 'cid' => $cid, 'maxAge' => 4 * 3600] : [])];
}
/** Cancel a background response (best effort; used when a day's run is restarted). */
function aim_llm_bg_cancel(array $job): void
{
    $p = (string)($job['provider'] ?? '');
    $key = aim_provider_key($p);
    if ($key === '' || empty($job['id'])) return;
    $base = rtrim((string)(aim_settings()['ai']['providers'][$p]['base'] ?? ''), '/');
    if (($job['kind'] ?? '') === 'batch') aim_http('POST', $base . '/messages/batches/' . rawurlencode((string)$job['id']) . '/cancel', ['headers' => aim_anthropic_headers($key), 'json' => (object)[], 'timeout' => 5]);
    else aim_http('POST', $base . '/responses/' . rawurlencode((string)$job['id']) . '/cancel', ['headers' => ['Authorization' => 'Bearer ' . $key], 'json' => (object)[], 'timeout' => 5]);
}
/**
 * Poll a Claude message batch; same return values as aim_llm_bg_poll().
 * Two requests are needed (status, then results). Each is capped to the time left before $deadline; when too little
 * time is left for the download, or the download fails for a passing reason (timeout, network, 408/429/5xx), the result
 * address is returned with 'pending' so the caller keeps the job and downloads the answer on a later run.
 */
function aim_llm_batch_poll(array $job, string $base, string $key, int $maxAge, array $out, float $deadline): array
{
    $h = aim_anthropic_headers($key) + ['Accept' => 'application/json'];
    $tl = fn(int $cap) => (int)max(3, min($cap, floor($deadline - microtime(true) - 1)));
    $url = (string)($job['results_url'] ?? '');
    if ($url === '') {
        $r = aim_http('GET', $base . '/messages/batches/' . rawurlencode((string)$job['id']), ['headers' => $h, 'timeout' => $tl(20)]);
        $st = (string)($r['json']['processing_status'] ?? '');
        // a transport error (timeout, cut-off body) counts as unreachable even when the status line said 200
        if (!empty($r['error']) || $st === 'in_progress' || $st === 'canceling' || in_array($r['status'], [0, 408, 429], true) || $r['status'] >= 500) {
            if (time() - (int)$job['started'] < $maxAge) return ['pending' => true, 'status' => empty($r['error']) ? ($st ?: 'unreachable') : 'unreachable'];
            aim_http('POST', $base . '/messages/batches/' . rawurlencode((string)$job['id']) . '/cancel', ['headers' => $h, 'json' => (object)[], 'timeout' => $tl(5)]);
            $out['error'] = 'no answer after ' . round($maxAge / 60) . ' minutes (cancelled)';
            return $out;
        }
        if ($st !== 'ended') { $out['error'] = $st !== '' ? 'batch ' . $st : aim_http_problem($r); return $out; }
        $url = (string)($r['json']['results_url'] ?? '');
        if ($deadline - microtime(true) < 8) return ['pending' => true, 'status' => 'ended', 'results_url' => $url];   // download on the next run
    }
    // checked before every download, also for a saved address: the key goes only to the provider's current address
    if (!aim_same_origin($url, $base)) { $out['error'] = 'unexpected results address'; return $out; }
    $res = aim_http('GET', $url, ['headers' => $h, 'timeout' => $tl(20)]);
    if ($res['status'] !== 200 || !empty($res['error'])) {   // a body cut off after "200" is a failed download too
        $err = aim_http_problem($res);
        // the answer exists: keep trying passing failures for a while (results stay available for 29 days)
        if (aim_http_transient($err) && time() - (int)$job['started'] < $maxAge + 6 * 3600) return ['pending' => true, 'status' => 'download retry', 'results_url' => $url];
        $out['error'] = $err;
        return $out;
    }
    foreach (explode("\n", (string)$res['body']) as $line) {
        $j = json_decode(trim($line), true);
        if (!is_array($j) || ($j['custom_id'] ?? '') !== ($job['cid'] ?? '')) continue;
        $type = (string)($j['result']['type'] ?? '');
        if ($type === 'succeeded' && is_array($j['result']['message'] ?? null)) return aim_anthropic_parse($j['result']['message'], $out);
        $out['error'] = 'batch request ' . ($type ?: 'failed') . (($m = $j['result']['error']['error']['message'] ?? ($j['result']['error']['message'] ?? '')) !== '' ? ': ' . $m : '');
        return $out;
    }
    $out['error'] = 'batch result missing';
    return $out;
}
/**
 * Check a background response. Returns ['pending' => true] while it runs, otherwise the same result array as aim_llm()
 * (and corrects the booked cost). Jobs older than $maxAge seconds are cancelled and reported as failed. Requests end before
 * $deadline (Unix time); a pending result may carry 'results_url', which the caller stores in the job.
 */
function aim_llm_bg_poll(array $job, int $maxAge = 1800, ?float $deadline = null): array
{
    $deadline = $deadline ?? microtime(true) + 45;
    $p = (string)$job['provider']; $model = (string)$job['model'];
    $key = aim_provider_key($p);
    $base = rtrim((string)(aim_settings()['ai']['providers'][$p]['base'] ?? ''), '/');
    $out = ['ok' => false, 'text' => '', 'sources' => [], 'usage' => ['in' => 0, 'out' => 0, 'searches' => 0], 'cost' => 0.0, 'provider' => $p, 'model' => $model, 'error' => null, 'aborted' => false];
    $maxAge = (int)($job['maxAge'] ?? $maxAge);
    if (($job['kind'] ?? '') === 'batch') {
        $out['usage']['factor'] = 0.5;   // batch prices are half the list price
        $out = aim_llm_batch_poll($job, $base, $key, $maxAge, $out, $deadline);
        if (!empty($out['pending'])) return $out;
        $out['usage']['factor'] = 0.5;
    } else {
    $headers = ['Authorization' => 'Bearer ' . $key, 'Accept' => 'application/json'];
    $r = aim_http('GET', $base . '/responses/' . rawurlencode((string)$job['id']), ['headers' => $headers, 'timeout' => (int)max(3, min(20, floor($deadline - microtime(true) - 1)))]);
    $st = (string)($r['json']['status'] ?? '');
    if (!empty($r['error']) || in_array($st, ['queued', 'in_progress'], true) || in_array($r['status'], [0, 408, 429], true) || $r['status'] >= 500) {
        if (time() - (int)$job['started'] < $maxAge) return ['pending' => true, 'status' => $st ?: 'unreachable'];
        aim_http('POST', $base . '/responses/' . rawurlencode((string)$job['id']) . '/cancel', ['headers' => $headers, 'json' => (object)[], 'timeout' => 5]);
        $out['error'] = 'no answer after ' . round($maxAge / 60) . ' minutes (cancelled)';
    } elseif (!is_array($r['json'])) {
        $out['error'] = aim_http_problem($r);
    } else {
        $out = aim_responses_parse($r['json'], $out);
        if ($st !== 'completed') $out['error'] = (string)($r['json']['error']['message'] ?? ('response ' . ($st ?: 'failed')));
    }
    }
    $out['cost'] = aim_llm_cost($p, $model, $out['usage']);
    $out['ok'] = $out['error'] === null && trim($out['text']) !== '';
    if ($out['error'] === null && !$out['ok']) $out['error'] = 'empty answer';
    $acct = (string)($job['acct'] ?? '');
    $known = $out['usage']['in'] > 0 || $out['usage']['out'] > 0;
    $first = true;   // the correction is booked once per job, even if this run is stopped before the caller saves its state
    aim_store_update('usage/bg-settled', function ($m) use ($job, &$first) {
        $m = is_array($m) ? $m : [];
        if (isset($m[$job['id']])) { $first = false; return $m; }
        $m[$job['id']] = time();
        foreach ($m as $k => $t) if ($t < time() - 14 * 86400) unset($m[$k]);
        return $m;
    }, []);
    if ($acct !== '' && $known && $first) aim_usage_add($acct, $out['cost'] - (float)$job['est'], $out['usage'], 0);
    elseif (!$known) $out['cost'] = (float)$job['est'];
    if (!$out['ok']) aim_log('ai', 'background call failed', ['provider' => $p, 'model' => $model, 'error' => $out['error']]);
    return $out;
}

/* OpenAI Responses API (also xAI /responses and Perplexity /responses) */
function aim_responses_body(string $p, string $model, array $q, bool $stream): array
{
    $input = array_map(fn($m) => ['role' => $m['role'], 'content' => (string)$m['content']], $q['messages'] ?? []);
    // xAI takes the instructions as a system message; OpenAI and Perplexity have the "instructions" field
    if ($p === 'xai' && !empty($q['system'])) array_unshift($input, ['role' => 'system', 'content' => (string)$q['system']]);
    $body = ['input' => $input, 'stream' => $stream];
    if (str_starts_with($model, 'preset:')) $body['preset'] = substr($model, 7); else $body['model'] = $model;
    if (!empty($q['system']) && $p !== 'xai') $body['instructions'] = $q['system'];
    if (!empty($q['max_output'])) $body['max_output_tokens'] = (int)$q['max_output'];
    if ($p === 'openai' && !empty($q['effort'])) $body['reasoning'] = ['effort' => $q['effort']];
    $tools = [];
    if (!empty($q['search'])) {
        $tool = ['type' => 'web_search'];
        if ($p === 'openai' && !empty($q['domains'])) $tool['filters'] = ['allowed_domains' => array_values(array_slice($q['domains'], 0, 100))];
        if ($p === 'xai' && !empty($q['domains'])) $tool['filters'] = ['allowed_domains' => array_values(array_slice($q['domains'], 0, 5))];
        $tools[] = $tool;
        if ($p === 'openai') $body['include'] = ['web_search_call.action.sources'];
    }
    // X search (xAI only): posts on X, optionally limited to some accounts and a date range
    if ($p === 'xai' && is_array($q['xsearch'] ?? null)) {
        $x = ['type' => 'x_search'];
        if (!empty($q['xsearch']['allowed_x_handles'])) $x['allowed_x_handles'] = array_values(array_slice($q['xsearch']['allowed_x_handles'], 0, 20));   // one of the two, at most 20
        elseif (!empty($q['xsearch']['excluded_x_handles'])) $x['excluded_x_handles'] = array_values(array_slice($q['xsearch']['excluded_x_handles'], 0, 20));
        foreach (['from_date', 'to_date'] as $k) if (!empty($q['xsearch'][$k])) $x[$k] = (string)$q['xsearch'][$k];
        $tools[] = $x;
    }
    if ($tools) $body['tools'] = $tools;
    if ($p === 'xai') {
        if ($tools && !empty($q['max_turns'])) $body['max_turns'] = (int)$q['max_turns'];
        if ($tools) $body['include'] = ['no_inline_citations'];   // otherwise "[[1]](url)" markers are written into the answer text (and into JSON)
        $body['store'] = false;
        if (in_array($q['effort'] ?? '', ['none', 'low', 'medium', 'high'], true) && !empty($q['xai_effort'])) $body['reasoning'] = ['effort' => $q['effort']];
    }
    return $body;
}
/** Usage, web sources and (unless $textToo is false) the answer text of a complete Responses API object. */
function aim_responses_parse(array $resp, array $out, bool $textToo = true): array
{
    $u = $resp['usage'] ?? [];
    $out['usage']['in'] = (int)($u['input_tokens'] ?? $out['usage']['in']);
    $out['usage']['out'] = (int)($u['output_tokens'] ?? $out['usage']['out']);
    $searches = 0; $text = '';
    foreach (($resp['output'] ?? []) as $item) {
        $t = (string)($item['type'] ?? '');
        $isSearch = in_array($t, ['web_search_call', 'x_search_call'], true) || ($t === 'custom_tool_call' && preg_match('/search/', (string)($item['name'] ?? '')));
        if ($isSearch) $searches++;
        if ($t === 'message') foreach (($item['content'] ?? []) as $c) {
            if (in_array($c['type'] ?? '', ['output_text', 'text'], true)) $text .= (string)($c['text'] ?? '');
            foreach (($c['annotations'] ?? []) as $a) if (($a['type'] ?? '') === 'url_citation') aim_add_source($out['sources'], $a['url'] ?? '', ctype_digit((string)($a['title'] ?? '')) ? '' : ($a['title'] ?? ''));   // xAI: the title is the citation number
        }
        if ($isSearch) foreach (($item['action']['sources'] ?? []) as $s) aim_add_source($out['sources'], $s['url'] ?? '', $s['title'] ?? '');
        if (isset($item['results']) && is_array($item['results'])) foreach ($item['results'] as $r) aim_add_source($out['sources'], $r['url'] ?? '', $r['title'] ?? '');
    }
    // xAI also lists every page and post it used as a top-level "citations" array (URLs or objects)
    foreach ((is_array($resp['citations'] ?? null) ? $resp['citations'] : []) as $c) aim_add_source($out['sources'], is_array($c) ? ($c['url'] ?? '') : $c, is_array($c) ? ($c['title'] ?? '') : '');
    $tu = $u['server_side_tool_usage_details'] ?? ($u['server_side_tool_usage'] ?? null);
    if (is_array($tu)) { $n = 0; foreach ($tu as $k => $v) if (is_numeric($v) && stripos((string)$k, 'search') !== false) $n += (int)$v; $searches = max($searches, $n); }
    $out['usage']['searches'] = max($out['usage']['searches'], $searches);
    if (isset($u['cost_in_usd_ticks']) && is_numeric($u['cost_in_usd_ticks'])) $out['usage']['usd'] = round((float)$u['cost_in_usd_ticks'] / 1e10, 6);   // xAI reports the exact cost (10^10 ticks = $1)
    if ($textToo) $out['text'] = isset($resp['output_text']) && is_string($resp['output_text']) ? $resp['output_text'] : $text;
    return $out;
}
function aim_llm_responses(string $p, string $base, string $key, string $model, array $q, array $out): array
{
    $stream = isset($q['on_delta']);
    $body = aim_responses_body($p, $model, $q, $stream);
    $headers = ['Authorization' => 'Bearer ' . $key, 'Accept' => $stream ? 'text/event-stream' : 'application/json'];
    if ($stream) {
        $cb = $q['on_delta'];
        $feeder = aim_sse_feeder(function ($ev, $d) use (&$out, $cb) {
            if (!is_array($d)) return;
            $type = $d['type'] ?? $ev;
            if ($type === 'response.output_text.delta' && isset($d['delta'])) { $out['text'] .= $d['delta']; $cb((string)$d['delta']); }
            elseif ($type === 'response.output_text.annotation.added') { $a = $d['annotation'] ?? []; if (($a['type'] ?? '') === 'url_citation') aim_add_source($out['sources'], $a['url'] ?? '', $a['title'] ?? ''); }
            elseif ($type === 'response.completed' || $type === 'response.incomplete') { if (is_array($d['response'] ?? null)) $out = aim_responses_parse($d['response'], $out, false); }
            elseif ($type === 'response.failed') $out['error'] = (string)($d['response']['error']['message'] ?? 'provider failed');
            elseif ($type === 'error') $out['error'] = (string)($d['message'] ?? ($d['error']['message'] ?? 'provider error'));
        }, $q['abort_if'] ?? null);
        $r = aim_http('POST', $base . '/responses', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55), 'on_chunk' => $feeder]);
        if ($r['status'] >= 400 && $out['text'] === '') { $j = json_decode($r['body'], true); $r['json'] = $j; $out['error'] = aim_http_problem($r); }
        elseif ($r['error'] && $out['text'] === '') $out['error'] = $r['error'];
        return $out;
    }
    $r = aim_http('POST', $base . '/responses', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55)]);
    if ($r['status'] >= 400 || !is_array($r['json'])) { $out['error'] = aim_http_problem($r); return $out; }
    return aim_responses_parse($r['json'], $out);
}

/* Anthropic Messages API (also used for Message Batches, the background mode for Claude) */
function aim_anthropic_headers(string $key): array { return ['x-api-key' => $key, 'anthropic-version' => '2023-06-01']; }
function aim_anthropic_body(string $model, array $q, bool $stream): array
{
    $msgs = array_map(fn($m) => ['role' => $m['role'] === 'assistant' ? 'assistant' : 'user', 'content' => (string)$m['content']], $q['messages'] ?? []);
    $body = ['model' => $model, 'max_tokens' => (int)($q['max_output'] ?? 900), 'messages' => $msgs];
    if ($stream) $body['stream'] = true;
    if (!empty($q['system'])) $body['system'] = $q['system'];
    if (!empty($q['search'])) { $tool = ['type' => 'web_search_20250305', 'name' => 'web_search', 'max_uses' => max(1, min(10, (int)($q['max_searches'] ?? 5)))]; if (!empty($q['domains'])) $tool['allowed_domains'] = array_values($q['domains']); $body['tools'] = [$tool]; }
    return $body;
}
/** Text, cited pages, searched pages and usage of a complete Messages API response. */
function aim_anthropic_parse(array $msg, array $out): array
{
    foreach (($msg['content'] ?? []) as $b) {
        $t = $b['type'] ?? '';
        if ($t === 'text') { $out['text'] .= (string)($b['text'] ?? ''); foreach (($b['citations'] ?? []) as $c) aim_add_source($out['sources'], $c['url'] ?? '', $c['title'] ?? ''); }
        elseif ($t === 'web_search_tool_result' && is_array($b['content'] ?? null)) foreach ($b['content'] as $x) if (($x['type'] ?? '') === 'web_search_result') aim_add_source($out['sources'], $x['url'] ?? '', $x['title'] ?? '');
    }
    $u = $msg['usage'] ?? [];
    $out['usage'] = ['in' => (int)($u['input_tokens'] ?? 0) + (int)($u['cache_read_input_tokens'] ?? 0) + (int)($u['cache_creation_input_tokens'] ?? 0), 'out' => (int)($u['output_tokens'] ?? 0), 'searches' => (int)($u['server_tool_use']['web_search_requests'] ?? 0)] + array_intersect_key($out['usage'], ['factor' => 1]);
    if (($msg['stop_reason'] ?? '') === 'pause_turn' && trim($out['text']) === '') $out['error'] = 'the model paused before answering (too many searches)';
    return $out;
}
function aim_llm_anthropic(string $base, string $key, string $model, array $q, array $out): array
{
    $stream = isset($q['on_delta']);
    $body = aim_anthropic_body($model, $q, $stream);
    $headers = aim_anthropic_headers($key);
    if ($stream) {
        $cb = $q['on_delta'];
        $feeder = aim_sse_feeder(function ($ev, $d) use (&$out, $cb) {
            if (!is_array($d)) return;
            $type = $d['type'] ?? $ev;
            if ($type === 'content_block_delta') {
                $dl = $d['delta'] ?? [];
                if (($dl['type'] ?? '') === 'text_delta') { $out['text'] .= (string)$dl['text']; $cb((string)$dl['text']); }
                elseif (($dl['type'] ?? '') === 'citations_delta') { $c = $dl['citation'] ?? []; aim_add_source($out['sources'], $c['url'] ?? '', $c['title'] ?? ''); }
            } elseif ($type === 'message_start') $out['usage']['in'] = (int)($d['message']['usage']['input_tokens'] ?? 0);
            elseif ($type === 'message_delta') { $out['usage']['out'] = (int)($d['usage']['output_tokens'] ?? $out['usage']['out']); $out['usage']['searches'] = (int)($d['usage']['server_tool_use']['web_search_requests'] ?? $out['usage']['searches']); }
            elseif ($type === 'error') $out['error'] = (string)($d['error']['message'] ?? 'provider error');
        }, $q['abort_if'] ?? null);
        $r = aim_http('POST', $base . '/messages', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55), 'on_chunk' => $feeder]);
        if ($r['status'] >= 400 && $out['text'] === '') { $r['json'] = json_decode($r['body'], true); $out['error'] = aim_http_problem($r); }
        elseif ($r['error'] && $out['text'] === '') $out['error'] = $r['error'];
        return $out;
    }
    $r = aim_http('POST', $base . '/messages', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55)]);
    if ($r['status'] >= 400 || !is_array($r['json'])) { $out['error'] = aim_http_problem($r); return $out; }
    return aim_anthropic_parse($r['json'], $out);
}

/* Google Gemini generateContent (stable; the newer Interactions API is optional) */
function aim_llm_gemini(string $base, string $key, string $model, array $q, array $out): array
{
    $stream = isset($q['on_delta']);
    $contents = array_map(fn($m) => ['role' => $m['role'] === 'assistant' ? 'model' : 'user', 'parts' => [['text' => (string)$m['content']]]], $q['messages'] ?? []);
    $body = ['contents' => $contents, 'generationConfig' => ['maxOutputTokens' => (int)($q['max_output'] ?? 900)]];
    if (!empty($q['system'])) $body['system_instruction'] = ['parts' => [['text' => $q['system']]]];
    if ($q['search']) $body['tools'] = [['google_search' => (object)[]]];
    $headers = ['x-goog-api-key' => $key];
    $take = function ($j) use (&$out) {
        if (!is_array($j)) return '';
        $t = '';
        foreach (($j['candidates'][0]['content']['parts'] ?? []) as $part) $t .= (string)($part['text'] ?? '');
        $gm = $j['candidates'][0]['groundingMetadata'] ?? [];
        foreach (($gm['groundingChunks'] ?? []) as $c) aim_add_source($out['sources'], $c['web']['uri'] ?? '', $c['web']['title'] ?? '');
        if (!empty($gm['webSearchQueries'])) $out['usage']['searches'] = max($out['usage']['searches'], count($gm['webSearchQueries']));
        $u = $j['usageMetadata'] ?? [];
        if ($u) { $out['usage']['in'] = (int)($u['promptTokenCount'] ?? 0); $out['usage']['out'] = (int)($u['candidatesTokenCount'] ?? 0) + (int)($u['thoughtsTokenCount'] ?? 0); }
        return $t;
    };
    $url = $base . '/models/' . rawurlencode($model) . ($stream ? ':streamGenerateContent?alt=sse' : ':generateContent');
    if ($stream) {
        $cb = $q['on_delta'];
        $feeder = aim_sse_feeder(function ($ev, $d) use (&$out, $cb, $take) {
            if (!is_array($d)) return;
            if (isset($d['error'])) { $out['error'] = (string)($d['error']['message'] ?? 'provider error'); return; }
            $t = $take($d); if ($t !== '') { $out['text'] .= $t; $cb($t); }
        }, $q['abort_if'] ?? null);
        $r = aim_http('POST', $url, ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55), 'on_chunk' => $feeder]);
        if ($r['status'] >= 400 && $out['text'] === '') { $r['json'] = json_decode($r['body'], true); $out['error'] = aim_http_problem($r); }
        elseif ($r['error'] && $out['text'] === '') $out['error'] = $r['error'];
        return $out;
    }
    $r = aim_http('POST', $url, ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55)]);
    if ($r['status'] >= 400 || !is_array($r['json'])) { $out['error'] = aim_http_problem($r); return $out; }
    $out['text'] = $take($r['json']);
    return $out;
}

/* OpenAI-compatible Chat Completions (DeepSeek, Mistral, OpenRouter) */
function aim_llm_chat(string $p, string $base, string $key, string $model, array $q, array $out): array
{
    $stream = isset($q['on_delta']);
    $msgs = [];
    if (!empty($q['system'])) $msgs[] = ['role' => 'system', 'content' => $q['system']];
    foreach (($q['messages'] ?? []) as $m) $msgs[] = ['role' => $m['role'] === 'assistant' ? 'assistant' : 'user', 'content' => (string)$m['content']];
    $body = ['model' => $model, 'messages' => $msgs, 'max_tokens' => (int)($q['max_output'] ?? 900), 'stream' => $stream];
    if ($stream && $p !== 'mistral') $body['stream_options'] = ['include_usage' => true];
    if ($p === 'deepseek' && !in_array($q['effort'] ?? '', ['medium', 'high'], true)) $body['thinking'] = ['type' => 'disabled'];   // DeepSeek thinks by default, which is slow
    if ($q['search'] && $p === 'openrouter') $body['tools'] = [['type' => 'openrouter:web_search']];
    $headers = ['Authorization' => 'Bearer ' . $key];
    if ($p === 'openrouter') { $headers['HTTP-Referer'] = aim_settings()['site']['url']; $headers['X-OpenRouter-Title'] = 'AI Forecast Atlas'; }
    if ($stream) {
        $cb = $q['on_delta'];
        $feeder = aim_sse_feeder(function ($ev, $d) use (&$out, $cb) {
            if (!is_array($d)) return;
            if (isset($d['error'])) { $out['error'] = (string)($d['error']['message'] ?? 'provider error'); return; }
            $t = $d['choices'][0]['delta']['content'] ?? null;
            if (is_string($t) && $t !== '') { $out['text'] .= $t; $cb($t); }
            foreach (($d['choices'][0]['delta']['annotations'] ?? []) as $a) aim_add_source($out['sources'], $a['url_citation']['url'] ?? ($a['url'] ?? ''), $a['url_citation']['title'] ?? ($a['title'] ?? ''));
            if (isset($d['usage'])) { $out['usage']['in'] = (int)($d['usage']['prompt_tokens'] ?? 0); $out['usage']['out'] = (int)($d['usage']['completion_tokens'] ?? 0); }
        }, $q['abort_if'] ?? null);
        $r = aim_http('POST', $base . '/chat/completions', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55), 'on_chunk' => $feeder]);
        if ($r['status'] >= 400 && $out['text'] === '') { $r['json'] = json_decode($r['body'], true); $out['error'] = aim_http_problem($r); }
        elseif ($r['error'] && $out['text'] === '') $out['error'] = $r['error'];
        return $out;
    }
    $r = aim_http('POST', $base . '/chat/completions', ['json' => $body, 'headers' => $headers, 'timeout' => (int)($q['timeout'] ?? 55)]);
    if ($r['status'] >= 400 || !is_array($r['json'])) { $out['error'] = aim_http_problem($r); return $out; }
    $msg = $r['json']['choices'][0]['message'] ?? [];
    $out['text'] = (string)($msg['content'] ?? '');
    foreach (($msg['annotations'] ?? []) as $a) aim_add_source($out['sources'], $a['url_citation']['url'] ?? ($a['url'] ?? ''), $a['url_citation']['title'] ?? ($a['title'] ?? ''));
    $u = $r['json']['usage'] ?? [];
    $out['usage'] = ['in' => (int)($u['prompt_tokens'] ?? 0), 'out' => (int)($u['completion_tokens'] ?? 0), 'searches' => $q['search'] ? 1 : 0];
    return $out;
}

/** Pull the first JSON object or array out of a model answer (tolerates code fences and a sentence around it). */
function aim_extract_json(string $text)
{
    $t = trim($text);
    if (preg_match('/```(?:json)?\s*(.+?)```/s', $t, $m)) $t = trim($m[1]);
    $j = json_decode($t, true);
    if ($j !== null) return $j;
    $a = strpos($t, '{'); $b = strrpos($t, '}');
    if ($a !== false && $b > $a) { $j = json_decode(substr($t, $a, $b - $a + 1), true); if ($j !== null) return $j; }
    $a = strpos($t, '['); $b = strrpos($t, ']');
    if ($a !== false && $b > $a) { $j = json_decode(substr($t, $a, $b - $a + 1), true); if ($j !== null) return $j; }
    return null;
}
/** Small connectivity test for the admin page. */
function aim_llm_test(string $provider, string $model): array
{
    $r = aim_llm(['provider' => $provider, 'model' => $model, 'system' => 'Reply with exactly: OK', 'messages' => [['role' => 'user', 'content' => 'Say OK.']], 'max_output' => 30, 'effort' => 'low', 'timeout' => 30]);
    return ['ok' => $r['ok'], 'text' => mb_substr($r['text'], 0, 80), 'error' => $r['error'], 'cost' => $r['cost']];
}
