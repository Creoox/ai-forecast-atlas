<?php
/* AI Forecast Atlas — X watch. On the scan days Grok (xAI) searches posts on X with its x_search tool for news that matters
   to the monitor, from credible accounts and from accounts with heavy impact on X, and labels credibility and impact.
   The findings wait in Admin → X watch; only approved items are published (data/xwatch.json, the weekly release and
   the newsletter). They are signals, not data: they never change the model. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

const AIM_XW_POST_RX = '~^https?://(?:www\.|mobile\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,15})/status(?:es)?/(\d{5,25})(?:[/?#].*)?$~i';
const AIM_XW_KINDS = ['official', 'executive', 'journalist', 'media', 'analyst', 'researcher', 'influencer', 'other'];
const AIM_XW_TOPICS = ['markets', 'models', 'compute', 'structure', 'work', 'aeco', 'aecosw', 'dev'];

function aim_xwatch_cfg(): array { return aim_settings()['xwatch']; }
/** The agent that scans X (xAI with its model, or the X watch model if set); null when it cannot run. */
function aim_xwatch_agent(): ?array
{
    $c = aim_xwatch_cfg();
    $a = aim_agents()[$c['agent'] ?? 'xai'] ?? null;
    if (!$a || $a['provider'] !== 'xai' || !$a['hasKey']) return null;
    $m = trim((string)($c['model'] ?? ''));
    if ($m !== '') $a['model'] = $m;
    return $a['model'] !== '' ? $a : null;
}
/** Handles from a text box: one per line or separated by commas/spaces, without "@". */
function aim_xwatch_handles(string $s): array
{
    $out = [];
    foreach (preg_split('/[\s,;]+/', $s) ?: [] as $h) { $h = ltrim(trim($h), '@'); if (preg_match('/^[A-Za-z0-9_]{1,15}$/', $h)) $out[strtolower($h)] = $h; }
    return array_values($out);
}
function aim_xwatch_due(): bool
{
    $c = aim_xwatch_cfg();
    if (empty($c['enabled']) || !aim_xwatch_agent()) return false;
    $days = array_map('intval', preg_split('/[\s,]+/', (string)($c['days'] ?? '')) ?: []);
    return in_array((int)aim_now()->format('N'), $days, true);
}
/** Normalise a post link to https://x.com/<handle>/status/<id>; '' if it is not a post link. */
function aim_xwatch_post_url(string $u): string
{
    return preg_match(AIM_XW_POST_RX, trim($u), $m) ? 'https://x.com/' . $m[1] . '/status/' . $m[2] : '';
}
function aim_xwatch_status_id(string $u): string { return preg_match(AIM_XW_POST_RX, $u, $m) ? $m[2] : ''; }

/** The request to Grok: posts of the last hours on the monitor's topics, as JSON. */
function aim_xwatch_query(array $agent): array
{
    $c = aim_xwatch_cfg();
    $hours = max(6, min(168, (int)($c['lookback_hours'] ?? 36)));
    $max = max(1, min(12, (int)($c['max_items'] ?? 6)));
    $now = aim_now();
    $from = $now->modify('-' . $hours . ' hours');
    $last = (string)(aim_state()['xwatchLastScan'] ?? '');   // no gap after days without a scan (e.g. the weekend)
    if ($last !== '') { $l = new DateTimeImmutable($last); if ($l < $from && $l > $now->modify('-7 days')) $from = $l; }
    $list = aim_xwatch_handles((string)($c['handles'] ?? ''));
    $excl = aim_xwatch_handles((string)($c['exclude'] ?? ''));
    $ds = aim_working_dataset();
    $anchors = [];
    foreach (($ds['anchors'] ?? []) as $id => $a) $anchors[] = $id . ' ' . ($a['name'] ?? '') . ' [' . ($a['metric'] ?? '') . ']';
    $cats = [];
    foreach ((aim_cfg('newsletter')['categories'] ?? []) as $cat) if (in_array($cat['id'], AIM_XW_TOPICS, true)) $cats[] = $cat['id'] . ' = ' . ($cat['desc']['en'] ?? $cat['label']['en'] ?? '');
    $system = 'You are the X (Twitter) news scout of AI Forecast Atlas (aiforecastatlas.com by Creoox AG), a public dashboard about AI becoming a commodity: AI capital spending, AI revenue and valuations, token prices and open-weight models, chips, memory, GPU rents, data-centre power, market structure, AI and work, and AI in architecture, engineering, construction and operations (AECO) and in software development. '
        . 'Use the x_search tool to find posts on X from the period given below that matter for these topics, and web search to check them against other sources. '
        . 'Prefer credible sources: official accounts of companies, institutions and regulators; executives speaking for their company; established news organisations and journalists covering the beat; recognised analysts and researchers. '
        . 'Also include posts with heavy impact on X (very high reach or engagement, widely quoted or reposted) even when the author is less established, and label their credibility honestly. '
        . 'Never invent posts, handles, numbers or links: use only post URLs that the x_search tool returned. Skip memes, advertising, giveaways, duplicates and posts without substance. Answer with one JSON object only.';
    $user = 'Period: ' . $from->format('Y-m-d H:i') . ' to ' . $now->format('Y-m-d H:i') . ' (Europe/Zurich).'
        . ($list ? "\nPreferred accounts (watch list, not exclusive): @" . implode(', @', $list) . '.' : '')
        . ($excl ? "\nIgnore these accounts: @" . implode(', @', $excl) . '.' : '')
        . "\nTopic ids: " . implode('; ', $cats) . '.'
        . "\nEvidence ledger ids you may link when a post is about one of these measures: " . implode('; ', array_slice($anchors, 0, 40)) . '.'
        . "\nReturn at most " . $max . ' items, the most important first: {"items": [{"title": "factual headline, max 110 characters", "summary": "what was said, with numbers and dates, max 400 characters", "why": "why it matters for the monitor, max 300 characters", "topics": ["topic ids"], "anchors": ["ledger ids, optional"], "direction": "up|down|mixed|none (for the linked measure)", "posts": [{"url": "https://x.com/<handle>/status/<id>", "handle": "...", "name": "display name", "kind": "official|executive|journalist|media|analyst|researcher|influencer|other", "posted": "YYYY-MM-DD"}], "corroboration": [{"title": "...", "url": "https://... (other pages confirming it)"}], "credibility": "high|medium|low|unverified", "credibility_note": "why, max 160 characters", "impact": "high|medium|low", "impact_note": "reach and engagement on X, who amplified it, max 160 characters"}]}. If nothing relevant was posted: {"items": []}.';
    $xs = ['from_date' => $from->format('Y-m-d'), 'to_date' => $now->modify('+1 day')->format('Y-m-d')];   // to_date is exclusive
    if ($excl) $xs['excluded_x_handles'] = $excl;
    return aim_agent_query($agent, ['system' => $system, 'messages' => [['role' => 'user', 'content' => $user]], 'search' => true, 'xsearch' => $xs, 'max_output' => 2500, 'max_turns' => 4, 'usage_role' => 'xwatch', 'timeout' => 38]);
}

/** Validate Grok's answer into review items (pending). Returns ['ok', 'items', 'error'?]. */
function aim_xwatch_parse(array $r, array $agent): array
{
    if (empty($r['ok'])) return ['ok' => false, 'error' => (string)($r['error'] ?? 'no answer')];
    $j = aim_extract_json((string)$r['text']);
    if (is_array($j) && isset($j[0]) && !isset($j['items'])) $j = ['items' => $j];   // a bare list of items
    if (!is_array($j) || !is_array($j['items'] ?? null)) return ['ok' => false, 'error' => 'answer was not JSON'];
    $returned = []; $pages = [];
    foreach (($r['sources'] ?? []) as $s) { $u = (string)($s['url'] ?? ''); $id = aim_xwatch_status_id($u); if ($id !== '') $returned[$id] = true; elseif ($u !== '') $pages[rtrim($u, '/')] = true; }
    $ds = aim_working_dataset();
    $metricKeys = array_keys((aim_read_json(aim_public('data/latest/metrics.json'), []) ?: [])['metrics'] ?? []);
    $known = aim_xwatch_known_posts();
    $enum = fn($v, array $ok, string $def) => in_array($v, $ok, true) ? $v : $def;
    $items = [];
    $max = max(1, min(12, (int)(aim_xwatch_cfg()['max_items'] ?? 6)));
    foreach (array_slice($j['items'], 0, $max + 4) as $x) {
        if (!is_array($x)) continue;
        $title = aim_line($x['title'] ?? '', 110);
        if ($title === '') continue;
        $posts = []; $flags = [];
        foreach (array_slice(is_array($x['posts'] ?? null) ? $x['posts'] : [], 0, 4) as $p) {
            if (!is_array($p)) continue;
            $u = aim_xwatch_post_url((string)($p['url'] ?? ''));
            if ($u === '') continue;
            $handle = explode('/', substr($u, 14))[0];
            $posts[] = ['url' => $u, 'handle' => $handle, 'name' => aim_line($p['name'] ?? '', 80), 'kind' => $enum($p['kind'] ?? '', AIM_XW_KINDS, 'other'),
                'posted' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)($p['posted'] ?? '')) ? (string)$p['posted'] : ''];
        }
        if (!$posts) continue;                                      // an item without a valid post link is not an X watch item
        $ids = array_map(fn($p) => aim_xwatch_status_id($p['url']), $posts);
        if (!array_diff($ids, array_keys($known))) continue;         // already suggested or published
        $unseen = array_filter($ids, fn($id) => !isset($returned[$id]));
        if ($returned && $unseen) $flags[] = count($unseen) === count($ids) ? 'none of the post links were among the posts the search returned — open them before approving' : 'a post link was not among the posts the search returned — open it before approving';
        if (!$returned) $flags[] = 'the search did not report which posts it read — open the post links before approving';
        $refs = [];
        foreach (array_slice(is_array($x['corroboration'] ?? null) ? $x['corroboration'] : [], 0, 3) as $c) {
            if (!is_array($c)) continue;
            $u = aim_str($c['url'] ?? '', 500);
            if (aim_url_ok($u) && aim_xwatch_post_url($u) === '') $refs[] = ['title' => aim_line($c['title'] ?? '', 160) ?: (parse_url($u, PHP_URL_HOST) ?: $u), 'url' => $u];
        }
        $unread = array_filter($refs, fn($c) => !isset($pages[rtrim($c['url'], '/')]));
        if ($unread) $flags[] = count($unread) === count($refs) ? 'the confirming pages were not among the pages the search returned — open them, or untick them before approving' : 'a confirming page was not among the pages the search returned — open it, or untick it before approving';
        $cred = $enum($x['credibility'] ?? '', ['high', 'medium', 'low', 'unverified'], 'unverified');
        if (in_array($cred, ['low', 'unverified'], true) && !$refs) $flags[] = 'no corroborating page';
        $items[] = [
            'title' => $title, 'summary' => aim_str($x['summary'] ?? '', 400), 'why' => aim_str($x['why'] ?? '', 300),
            'topics' => array_values(array_intersect(array_map('strval', is_array($x['topics'] ?? null) ? $x['topics'] : []), AIM_XW_TOPICS)),
            'anchors' => array_values(array_filter(array_map('strval', is_array($x['anchors'] ?? null) ? $x['anchors'] : []), fn($a) => isset($ds['anchors'][$a]))),
            'metrics' => [], 'direction' => $enum($x['direction'] ?? '', ['up', 'down', 'mixed', 'none'], 'none'),
            'posts' => $posts, 'refs' => $refs, 'credibility' => $cred, 'credNote' => aim_line($x['credibility_note'] ?? '', 160),
            'impact' => $enum($x['impact'] ?? '', ['high', 'medium', 'low'], 'medium'), 'impactNote' => aim_line($x['impact_note'] ?? '', 160), 'flags' => $flags,
        ];
        $last = count($items) - 1;
        foreach ($items[$last]['anchors'] as $a) { $m = (string)($ds['anchors'][$a]['metric'] ?? ''); if ($m !== '' && in_array($m, $metricKeys, true) && !in_array($m, $items[$last]['metrics'], true)) $items[$last]['metrics'][] = $m; }
        foreach ($ids as $id) $known[$id] = true;
        if (count($items) >= $max) break;
    }
    $via = ['type' => 'x', 'name' => 'Grok X search, reviewed by the editor', 'model' => aim_provider_label('xai') . ' ' . $agent['model']];
    $now = aim_now();
    foreach ($items as $i => $it) $items[$i] += ['id' => 'p' . $now->format('YmdHis') . '-' . $i . substr(aim_rand(2), 0, 3), 'created' => aim_iso(), 'date' => $now->format('Y-m-d'), 'via' => $via, 'ai' => ['provider' => 'xai', 'model' => $agent['model'], 'cost' => round((float)($r['cost'] ?? 0), 6)]];
    return ['ok' => true, 'items' => $items];
}
/** Status ids of posts already waiting or published in the last 45 days (so the same post is not suggested twice). */
function aim_xwatch_known_posts(): array
{
    $k = [];
    $since = aim_now()->modify('-45 days')->format('Y-m-d');
    foreach (array_merge(aim_xwatch_open(), aim_xwatch_approved(), aim_store_read('xwatch/rejected', []) ?: []) as $it) {
        if (strcmp((string)($it['date'] ?? ''), $since) < 0) continue;
        foreach (($it['posts'] ?? []) as $p) { $id = aim_xwatch_status_id((string)($p['url'] ?? '')); if ($id !== '') $k[$id] = true; }
    }
    return $k;
}
function aim_xwatch_open(): array { return aim_store_read('xwatch/open', []) ?: []; }
function aim_xwatch_approved(): array { return aim_store_read('xwatch/approved', []) ?: []; }
function aim_xwatch_add(array $items): int
{
    if (!$items) return 0;
    $added = 0;
    aim_store_update('xwatch/open', function ($open) use ($items, &$added) {
        $open = is_array($open) ? $open : [];
        $known = aim_xwatch_known_posts();
        foreach ($open as $it) foreach (($it['posts'] ?? []) as $p) $known[aim_xwatch_status_id((string)($p['url'] ?? ''))] = true;
        foreach ($items as $it) {
            $ids = array_filter(array_map(fn($p) => aim_xwatch_status_id((string)($p['url'] ?? '')), $it['posts'] ?? []));
            if (!$ids || !array_diff($ids, array_keys($known))) continue;   // another scan queued the same post meanwhile
            foreach ($ids as $id) $known[$id] = true;
            $open[] = $it; $added++;
        }
        return array_values($open);
    }, []);
    return $added;
}

/**
 * The "xwatch" step of the daily run. Returns the step result, or null to come back on a later run
 * (background answer pending, or no time / AI call left in this run).
 */
function aim_xwatch_step(array &$run, callable $left, bool &$aiUsed, callable $begin, callable $save): ?array
{
    $agent = aim_xwatch_agent();
    if (!$agent) return ['ok' => false, 'skipped' => 'X watch needs the xAI key'];
    if (isset($run['jobs']['xwatch'])) {
        if ($left() < 25) return null;
        $res = aim_llm_bg_poll($run['jobs']['xwatch'], 1800, microtime(true) + $left() - 2);
        if (!empty($res['pending'])) {
            if (!empty($res['results_url'])) { $run['jobs']['xwatch']['results_url'] = $res['results_url']; $save(); }
            return null;
        }
        unset($run['jobs']['xwatch']);
    } else {
        $s = aim_settings();   // X watch has its own switch (aim_xwatch_due); it shares the research budget
        if (aim_usage_research('month') >= (float)$s['sources']['research_budget_usd_month']) return ['ok' => false, 'skipped' => 'monthly research budget used'];
        $q = aim_xwatch_query($agent);
        if (aim_llm_bg_supported($q) && empty($run['nobg'][$agent['provider']])) {
            if ($left() < 30) return null;
            $begin('xwatch');
            $b = aim_llm_bg_start($q);
            if ($b['ok']) { $run['jobs']['xwatch'] = $b['job']; $run['steps']['xwatch']['state'] = 'waiting'; $save(); return null; }
            $res = ['ok' => false, 'error' => $b['error']];
        } else {
            if ($aiUsed || $left() < 30) return null;
            $q['timeout'] = (int)max(20, min(38, $left() - 2));
            $begin('xwatch'); $aiUsed = true;
            $res = aim_llm($q);
            // one more try on a later run when the search took too long or the provider was busy (408, 429, 5xx, network)
            if (!$res['ok'] && aim_http_transient((string)$res['error']) && (int)($run['steps']['xwatch']['n'] ?? 1) < AIM_AI_TRIES) {
                $run['steps']['xwatch']['state'] = 'retry'; $save();
                aim_agent_status($agent['id'], $res, 'xwatch');
                return null;
            }
        }
    }
    $p = aim_xwatch_parse($res, $agent);
    aim_agent_status($agent['id'], $p['ok'] ? ['ok' => true] : $p, 'xwatch');
    if (!$p['ok']) return ['ok' => false, 'error' => $p['error']];
    $n = aim_xwatch_add($p['items']);
    aim_state_set(['xwatchLastScan' => aim_iso()]);
    $run['xwatchNew'] = (int)($run['xwatchNew'] ?? 0) + $n;
    return ['ok' => true, 'note' => $n ? $n . ' post' . ($n > 1 ? 's' : '') . ' to review' : 'nothing new on X'];
}

/** "Scan X now" in the admin page: one search, outside the daily run (same budget). */
function aim_xwatch_scan_now(): array
{
    $agent = aim_xwatch_agent();
    if (!$agent) return ['ok' => false, 'error' => 'Add the xAI key and model under AI agents first.'];
    $s = aim_settings();
    if (aim_usage_research('month') >= (float)$s['sources']['research_budget_usd_month']) return ['ok' => false, 'error' => 'The monthly research budget is used up (Settings → Data sources).'];
    $r = aim_with_lock('xwatch-scan', function () use ($agent) {
        @set_time_limit(70);
        $q = aim_xwatch_query($agent);
        $q['timeout'] = 45;
        $p = aim_xwatch_parse(aim_llm($q), $agent);
        aim_agent_status($agent['id'], $p['ok'] ? ['ok' => true] : $p, 'xwatch');
        if (!$p['ok']) return ['ok' => false, 'error' => 'X search failed: ' . $p['error']];
        $n = aim_xwatch_add($p['items']);
        aim_state_set(['xwatchLastScan' => aim_iso()]);
        return ['ok' => true, 'added' => $n];
    }, false);
    return $r ?? ['ok' => false, 'error' => 'A scan is already running.'];
}
/** Approve (with optional edits) or reject a waiting item. */
function aim_xwatch_decide(string $id, string $action, array $edit = []): array
{
    $result = ['ok' => false, 'error' => 'not found'];
    aim_store_update('xwatch/open', function ($open) use ($id, $action, $edit, &$result) {
        $open = is_array($open) ? $open : [];
        foreach ($open as $i => $it) {
            if (($it['id'] ?? '') !== $id) continue;
            if ($action === 'approve') {
                $before = $it;
                foreach (['title' => 110, 'credNote' => 160, 'impactNote' => 160] as $f => $n) if (isset($edit[$f]) && is_scalar($edit[$f])) $it[$f] = aim_line((string)$edit[$f], $n);
                foreach (['summary' => 400, 'why' => 300] as $f => $n) if (isset($edit[$f]) && is_scalar($edit[$f])) $it[$f] = aim_str((string)$edit[$f], $n);
                if (isset($edit['credibility']) && in_array($edit['credibility'], ['high', 'medium', 'low', 'unverified'], true)) $it['credibility'] = $edit['credibility'];
                if (isset($edit['impact']) && in_array($edit['impact'], ['high', 'medium', 'low'], true)) $it['impact'] = $edit['impact'];
                if (isset($edit['topics']) && is_array($edit['topics'])) { $tp = array_values(array_intersect(array_map('strval', $edit['topics']), AIM_XW_TOPICS)); sort($tp); $was = $it['topics'] ?? []; sort($was); if ($tp !== $was) $it['topics'] = $tp; }
                if (isset($edit['direction']) && in_array($edit['direction'], ['up', 'down', 'mixed', 'none'], true)) $it['direction'] = $edit['direction'];
                // the editor can only remove what the model suggested (posts, confirming pages, ledger links), never add new links
                $keep = fn(string $f, array $list, string $key) => isset($edit[$f]) && is_array($edit[$f]) ? array_values(array_filter($list, fn($x) => is_array($x) && in_array((string)($x[$key] ?? ''), array_map('strval', $edit[$f]), true))) : $list;
                $it['posts'] = $keep('keepPosts', $it['posts'] ?? [], 'url');
                $it['refs'] = $keep('keepRefs', $it['refs'] ?? [], 'url');
                if (isset($edit['keepAnchors']) && is_array($edit['keepAnchors'])) {
                    $ds = aim_working_dataset();
                    $it['anchors'] = array_values(array_intersect($it['anchors'] ?? [], array_map('strval', $edit['keepAnchors'])));
                    $it['metrics'] = array_values(array_unique(array_filter(array_map(fn($a) => (string)($ds['anchors'][$a]['metric'] ?? ''), $it['anchors']))));
                }
                if (!$it['posts']) { $result = ['ok' => false, 'error' => 'Keep at least one post, or reject the item.']; return $open; }
                if (trim((string)$it['title']) === '') { $result = ['ok' => false, 'error' => 'Give the item a title.']; return $open; }
                $seq = 0;
                aim_store_update('xwatch/seq', function ($n) use (&$seq) { $seq = (int)$n + 1; return $seq; }, 0);
                $pub = array_intersect_key($it, array_flip(['date', 'title', 'summary', 'why', 'topics', 'metrics', 'anchors', 'direction', 'credibility', 'credNote', 'impact', 'impactNote', 'posts', 'refs', 'via']));
                $pub = ['id' => 'X' . $seq] + $pub + ['reviewed' => aim_now()->format('Y-m-d'), 'approvedAt' => aim_iso()];
                $changed = [];
                foreach (['title', 'summary', 'why', 'credibility', 'impact', 'credNote', 'impactNote', 'topics', 'direction', 'posts', 'refs', 'anchors'] as $f) if (($before[$f] ?? null) !== ($it[$f] ?? null)) $changed[] = $f;
                if ($changed) $pub['edited'] = true;
                aim_store_update('xwatch/approved', fn($a) => array_values(array_merge([$pub], is_array($a) ? $a : [])), []);
                aim_log('xwatch', 'approved', ['id' => $pub['id'], 'edited' => $changed]);   // ids only: logs are kept longer than X content may be
                $result = ['ok' => true, 'id' => $pub['id']];
            } else {
                aim_store_update('xwatch/rejected', function ($r) use ($it) {
                    $r = is_array($r) ? $r : [];
                    $r[] = ['date' => $it['date'] ?? '', 'posts' => $it['posts'] ?? [], 'title' => $it['title'] ?? ''];
                    return array_slice($r, -300);
                }, []);
                aim_log('xwatch', 'rejected', ['id' => (string)($it['id'] ?? '')]);   // no title: rejected content must be gone after 45 days
                $result = ['ok' => true];
            }
            unset($open[$i]);
            return array_values($open);
        }
        return $open;
    }, []);
    if (!empty($result['ok']) && $action === 'approve') aim_xwatch_publish();
    return $result;
}
/** Take a published item off the site (it stays in the weekly releases that already carry it). */
function aim_xwatch_withdraw(string $pubId): array
{
    if (!preg_match('/^X\d{1,6}$/', $pubId)) return ['ok' => false, 'error' => 'Use the id of the item, like X12.'];
    $found = false;
    aim_store_update('xwatch/approved', function ($a) use ($pubId, &$found) {
        $a = is_array($a) ? $a : [];
        $n = count($a);
        $a = array_values(array_filter($a, fn($x) => ($x['id'] ?? '') !== $pubId));
        $found = count($a) < $n;
        return $a;
    }, []);
    $releases = aim_xwatch_scrub($pubId);
    if (!$found && !$releases) return ['ok' => false, 'error' => 'No published item ' . $pubId . '.'];
    aim_log('xwatch', 'withdrawn', ['id' => $pubId, 'releases' => $releases]);
    aim_xwatch_publish();
    return ['ok' => true, 'releases' => $releases];
}
/** Remove an item from every published release (data, release page, latest copy) and rebuild the feeds. Returns the number of releases changed. */
function aim_xwatch_scrub(string $pubId): int
{
    return (int)aim_with_lock('publish', function () use ($pubId) {
        $n = 0;
        $drop = function (array $rel) use ($pubId): ?array {
            if (empty($rel['xwatch']) || !is_array($rel['xwatch'])) return null;
            $keep = array_values(array_filter($rel['xwatch'], fn($x) => ($x['id'] ?? '') !== $pubId));
            if (count($keep) === count($rel['xwatch'])) return null;
            $rel['xwatch'] = $keep;
            return $rel;
        };
        foreach (glob(aim_public('data/releases/*/release.json')) ?: [] as $f) {
            $rel = $drop(aim_read_json($f, []) ?: []);
            if ($rel === null) continue;
            aim_write_json($f, $rel, true);
            $dir = dirname($f);
            $files = array_values(array_filter(array_keys(aim_read_tree($dir)), fn($x) => $x !== 'index.html'));
            aim_discovery_write_release($rel, $files);
            $n++;
        }
        $lf = aim_public('data/latest/release.json');
        $lat = $drop(aim_read_json($lf, []) ?: []);
        if ($lat !== null) {
            aim_write_json($lf, $lat, true);
            aim_write(aim_public('data/latest/release.js'), "window.AIMONITOR_DATA = " . aim_json_encode(['release' => aim_release_lite($lat), 'dataset' => aim_read_json(aim_public('data/latest/dataset.json'), []) ?: []]) . ";\n");
        }
        if ($n) {
            aim_write_feeds();
            $published = aim_discovery_latest();
            if ($published) aim_discovery_indexes($published);
        }
        return $n;
    });
}
/** Public items: approved within keep_days, newest first, at most 40. */
function aim_xwatch_public_items(): array
{
    $keep = max(3, min(365, (int)(aim_xwatch_cfg()['keep_days'] ?? 30)));
    $since = aim_now()->modify('-' . $keep . ' days')->format('Y-m-d');
    $items = array_values(array_filter(aim_xwatch_approved(), fn($x) => strcmp((string)($x['reviewed'] ?? $x['date'] ?? ''), $since) >= 0));
    usort($items, fn($a, $b) => strcmp((string)($b['approvedAt'] ?? ''), (string)($a['approvedAt'] ?? '')));
    return array_map(fn($x) => array_diff_key($x, ['approvedAt' => 1]), array_slice($items, 0, 40));
}
function aim_xwatch_publish(): void
{
    aim_write_json(aim_public('data/xwatch.json'), [
        'schema' => 'aimonitor.xwatch/1', 'updated' => aim_iso(),
        'about' => 'Posts on X that the AI Forecast Atlas editor is watching: found by Grok (xAI) with its X search, labelled for credibility and impact, approved by a person. Signals, not data: they do not change the model.',
        'licence' => 'Texts CC BY 4.0 (AI Forecast Atlas by Creoox AG); the posts belong to their authors.',
        'items' => aim_xwatch_public_items(),
    ], true);
}
/** Items approved after $sinceIso (for the weekly release), newest first, at most $max. */
function aim_xwatch_since(?string $sinceIso, int $max = 8): array
{
    $items = array_filter(aim_xwatch_approved(), fn($x) => $sinceIso === null || strcmp((string)($x['approvedAt'] ?? ''), $sinceIso) > 0);
    usort($items, fn($a, $b) => strcmp((string)($b['approvedAt'] ?? ''), (string)($a['approvedAt'] ?? '')));
    return array_map(fn($x) => array_diff_key($x, ['approvedAt' => 1]), array_slice(array_values($items), 0, $max));
}
/** Housekeeping: drop waiting items older than 14 days and approved items older than 400 days. */
function aim_xwatch_prune(): int
{
    $n = 0;
    $cut = function (string $rel, int $days) use (&$n) {
        $old = aim_now()->modify('-' . $days . ' days')->format('Y-m-d');
        aim_store_update($rel, function ($o) use ($old, &$n) { $o = is_array($o) ? $o : []; $k = array_values(array_filter($o, fn($x) => strcmp((string)($x['date'] ?? ''), $old) >= 0)); $n += count($o) - count($k); return $k; }, []);
    };
    $cut('xwatch/open', 14);        // not reviewed within two weeks
    $cut('xwatch/rejected', 45);    // kept only so that the same post is not suggested again
    $cut('xwatch/approved', 400);   // working copy, so an item can still be withdrawn from old releases
    // the public list follows the keep period every day, not only when something is approved
    $f = aim_public('data/xwatch.json');
    $now = array_column(aim_xwatch_public_items(), 'id');
    $pub = array_column((aim_read_json($f, []) ?: [])['items'] ?? [], 'id');
    if (!is_file($f) || $now !== $pub) aim_xwatch_publish();
    return $n;
}
