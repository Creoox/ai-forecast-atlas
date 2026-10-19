<?php
/* AI Forecast Atlas — admin API (used by admin/index.php) and the signed ingest endpoint for optional automation.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_health(bool $deep = false): array
{
    $c = [];
    $add = function (string $name, bool $ok, string $info = '', string $level = 'error') use (&$c) { $c[] = ['name' => $name, 'ok' => $ok, 'info' => $info, 'level' => $ok ? 'ok' : $level]; };
    $add('PHP version', PHP_VERSION_ID >= 80000, PHP_VERSION . ' (8.0 or newer needed; 8.2 recommended)');
    foreach (['curl' => 'outgoing connections', 'json' => 'data files', 'mbstring' => 'text handling (a fallback is built in)', 'openssl' => 'HTTPS'] as $ext => $why) $add('PHP extension ' . $ext, extension_loaded($ext), $why, $ext === 'mbstring' ? 'warn' : 'error');
    $add('Server software', true, (string)($_SERVER['SERVER_SOFTWARE'] ?? 'unknown'));
    $w = aim_storage();
    $probe = $w . '/.write-test';
    $ok = @file_put_contents($probe, 'x') !== false; @unlink($probe);
    $add('Storage folder writable', $ok, $w);
    $okPub = @file_put_contents(aim_public('data/.write-test'), 'x') !== false; @unlink(aim_public('data/.write-test'));
    $add('Public data folder writable', $okPub, aim_public('data'));
    $add('Time zone', true, aim_now()->format('Y-m-d H:i T') . ' (server default: ' . date_default_timezone_get() . ')');
    $st = aim_state();
    $age = isset($st['lastTick']) ? time() - strtotime($st['lastTick']) : null;
    $add('Scheduler (cron) running', $age !== null && $age < 900, $age === null ? 'never ran — upload cron-5min.php (see the guide)' : 'last run ' . round($age / 60) . ' min ago (' . ($st['lastTickSource'] ?? '') . ')', 'warn');
    $cuts = array_filter($st['tickCutoffs'] ?? [], fn($t) => strtotime($t) > time() - 7 * 86400);
    $add('Scheduler runs finish in time', !$cuts, $cuts ? count($cuts) . ' run(s) in the last 7 days were stopped by the host before they finished (longest complete run ' . round((int)($st['tickMaxMs'] ?? 0) / 1000) . ' s). The data check retries each step at most twice; if this continues, use the external cron option.' : (isset($st['tickMaxMs']) ? 'longest run ' . round((int)$st['tickMaxMs'] / 1000) . ' s' : 'no run yet'), 'warn');
    $cp = AIM_PRIVATE . '/storage/cron-php.php';
    if (is_file($cp) && filemtime($cp) > time() - 86400) { $l = file($cp, FILE_IGNORE_NEW_LINES) ?: []; $add('PHP version of the scheduler files', false, 'cron-5min.php ran with PHP ' . ($l[1] ?? '?') . ' (the main site\'s version), which is too old. Use the external cron option shown under Scheduler (guide, step 8).', 'warn'); }
    $add('Admin password', aim_admin_has_password(), aim_admin_has_password() ? 'set' : 'not set');
    $s = aim_settings();
    $add('Chat assistant', aim_role_available('chat'), aim_role_available('chat') ? ($s['ai']['roles']['chat']['provider'] . ' · ' . $s['ai']['roles']['chat']['model']) : 'add an OpenAI key (or another provider) in Settings', 'warn');
    $panel = aim_panel_agents();
    $add('AI research panel', count($panel) > 0, $panel ? count($panel) . ' of ' . count(AIM_AGENTS) . ' agents ready: ' . implode(', ', array_map(fn($a) => $a['label'] . ' (' . $a['model'] . ', weight ' . $a['weight'] . ')', $panel)) : 'add the API keys of the agents under AI agents', 'warn');
    $xa = aim_xwatch_agent();
    $add('X watch (Grok)', !empty($s['xwatch']['enabled']) && $xa !== null, empty($s['xwatch']['enabled']) ? 'switched off' : ($xa ? 'scans X on days ' . $s['xwatch']['days'] . ' with ' . $xa['model'] : 'add the xAI key under AI agents'), 'warn');
    $add('Mailjet newsletter', aim_mj_list_ready(), aim_mj_list_ready() ? 'list ' . $s['mailjet']['list_id'] . ', sender ' . $s['mailjet']['from_email'] : 'add Mailjet keys, list ID and sender in Settings', 'warn');
    $add('Bot protection (Turnstile)', aim_turnstile_enabled(), aim_turnstile_enabled() ? 'on' : 'optional — recommended once the site is public', 'warn');
    $add('EIA key', $s['sources']['eia_key'] !== '', $s['sources']['eia_key'] !== '' ? 'set' : 'optional, free — enables the power-price check', 'warn');
    $add('Company details for imprint', $s['site']['address'] !== '' && $s['site']['email'] !== '', $s['site']['address'] !== '' ? 'set' : 'add address and email in Settings → Site', 'warn');
    $host = strtolower((string)parse_url((string)$s['site']['url'], PHP_URL_HOST));
    if ($s['site']['company'] === 'Creoox AG' && $host !== '' && !preg_match('/(^|\.)creoox\.com$|^127\.0\.0\.1$|^localhost$/', $host)) $add('Imprint names the operator of this site', false, 'the imprint still names Creoox AG; if you run your own copy, enter your details in Settings → Site and company (or in config/operator.json)', 'warn');
    if ($deep) {
        $site = rtrim($s['site']['url'], '/') . '/';
        $r = aim_http('GET', $site . '_private/config/newsletter.json', ['timeout' => 8]);
        $add('Private folder blocked from the web', $r['status'] !== 200, $r['status'] ? 'HTTP ' . $r['status'] . ' for ' . $site . '_private/…' : 'could not test (' . ($r['error'] ?? '') . ')', 'warn');
        foreach (['OpenAI' => 'https://api.openai.com/v1/models', 'Mailjet' => 'https://api.mailjet.com/v3/REST/contactslist', 'SEC EDGAR' => 'https://data.sec.gov/api/xbrl/companyconcept/CIK0000789019/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json', 'OpenRouter' => 'https://openrouter.ai/api/v1/models', 'Epoch AI' => 'https://epoch.ai/data/eci_scores.csv'] as $n => $u) {
            $t = aim_http('GET', $u, ['timeout' => 10, 'ua' => (string)$s['sources']['sec_user_agent']]);
            $add('Outgoing HTTPS: ' . $n, $t['status'] > 0, $t['status'] > 0 ? 'reached (HTTP ' . $t['status'] . ', ' . $t['ms'] . ' ms)' : 'blocked or down: ' . ($t['error'] ?? ''), 'warn');
        }
    }
    return $c;
}
function aim_admin_state(): array
{
    $s = aim_settings();
    $st = aim_state();
    $q = aim_nl_current();
    $fb = aim_store_lines('feedback/' . aim_now()->format('Y-m'));
    $usage = [];
    foreach (['chat', 'writer'] as $r) $usage[$r] = ['today' => aim_usage_cost($r), 'month' => aim_usage_cost($r, 'month')];
    $usage['research'] = ['today' => aim_usage_research('day'), 'month' => aim_usage_research('month')];
    $agentUse = [];
    foreach (AIM_AGENTS as $id) $agentUse[$id] = ['today' => aim_usage_cost('agent:' . $id), 'month' => aim_usage_cost('agent:' . $id, 'month')];
    $agentUse['xwatch'] = ['today' => aim_usage_cost('xwatch'), 'month' => aim_usage_cost('xwatch', 'month')];
    $staged = [];
    foreach (aim_staged_ids() as $id) $staged[] = (aim_store_read('staged/' . $id . '-meta') ?: []) + ['id' => $id];
    $site = rtrim($s['site']['url'], '/') . '/';
    return [
        'ok' => true, 'version' => AIM_VERSION, 'now' => aim_iso(), 'nextRelease' => aim_iso(aim_next_release()),
        'settings' => aim_settings_masked(), 'providers' => aim_provider_catalog(), 'categories' => aim_categories(), 'languages' => aim_cfg('newsletter')['languages'] ?? [],
        'state' => array_intersect_key($st, array_flip(['lastRelease', 'lastReleaseAt', 'lastReleaseSource', 'lastTick', 'lastTickSource', 'lastCollectAt', 'collect', 'lastScheduledWeek', 'edgarQuarter', 'tickMs', 'tickMaxMs', 'tickCutoffs', 'lastMonthlyEdition'])),
        'releases' => array_slice(aim_releases_index()['releases'], 0, 12), 'staged' => $staged,
        'candidates' => aim_candidates(), 'workingDiff' => aim_working_diff(), 'observations' => aim_store_read('observations', []) ?: [],
        'newsletter' => $q ? array_diff_key($q, ['recipients' => 1]) : null, 'sentToday' => aim_nl_sent_today(),
        'feedbackNew' => count(array_filter($fb, fn($x) => ($x['status'] ?? '') === 'new')), 'usage' => $usage, 'agentUsage' => $agentUse,
        'agents' => array_values(aim_agents()), 'agentStatus' => aim_store_read('agents/status', []) ?: [], 'xwatchReady' => aim_xwatch_agent() !== null,
        'xwatchOpen' => aim_xwatch_open(), 'xwatchPublished' => aim_xwatch_public_items(), 'answersToday' => aim_collect_answers(),
        'cron' => ['url' => $site . 'api/cron.php?key=' . $s['admin']['cron_key'], 'privatePath' => AIM_PRIVATE],
        'ingest' => ['url' => $site . 'api/ingest.php', 'secret' => $s['admin']['ingest_secret']],
        'health' => aim_health(false),
    ];
}
function aim_feedback_list(int $months = 3): array
{
    $out = [];
    for ($i = 0; $i < $months; $i++) {
        $m = aim_now()->modify('first day of this month')->modify('-' . $i . ' month')->format('Y-m');
        $rows = aim_store_lines('feedback/' . $m);
        $marks = aim_store_read('feedback/marks', []) ?: [];
        foreach ($rows as $r) { if (isset($marks[$r['id']])) $r['status'] = $marks[$r['id']]; $out[] = $r; }
    }
    usort($out, fn($a, $b) => strcmp($b['t'], $a['t']));
    return $out;
}

/* Actions that only read may use GET; everything that changes something needs POST with the CSRF header. */
const AIM_ADMIN_READ = ['state', 'health', 'working', 'feedback', 'logs', 'newsletter-preview'];
const AIM_ADMIN_WRITE = ['logout', 'password', 'settings', 'test-provider', 'mailjet-setup', 'newsletter-test', 'newsletter-stop', 'candidate', 'working-edit', 'working-reset', 'stage', 'unstage', 'publish-now', 'regenerate_public_pages', 'collect-now', 'cron-now', 'feedback-mark', 'xwatch', 'xwatch-withdraw', 'xwatch-scan'];
function aim_handle_admin(): void
{
    $a = (string)($_GET['a'] ?? '');
    $post = aim_method() === 'POST';
    if (!aim_admin_host_ok()) { aim_error('host', 'Open the admin page at ' . aim_site_url('admin/') . ' (the site address set in Settings).', 403); return; }
    $in = $post ? aim_input_payload(12000000) : [];
    // first-run setup and login need no session
    if ($a === 'setup' && $post) {
        if (aim_admin_has_password()) { aim_error('done', 'Setup is already complete.', 409); return; }
        if (!aim_rate_ok('setup', aim_ip_hash(), 10, 3600)) { aim_error('rate_limited', 'Too many attempts. Wait an hour.', 429); return; }
        if (!aim_setup_key_check((string)($in['setupKey'] ?? ''))) { aim_error('key', 'The setup key is not correct. Open _private/storage/setup-key.php on your server and copy the key from it.', 403); return; }
        $pw = (string)($in['password'] ?? '');
        if (strlen($pw) < 12) { aim_error('weak', 'Use at least 12 characters for the admin password.', 400); return; }
        aim_ensure_secrets();
        aim_admin_set_password($pw);
        if (!empty($in['email']) && aim_valid_email((string)$in['email'])) aim_apply_settings_update(['admin' => ['email' => (string)$in['email']]]);
        if (!empty($in['siteUrl']) && preg_match('#^https?://#', (string)$in['siteUrl'])) aim_apply_settings_update(['site' => ['url' => rtrim((string)$in['siteUrl'], '/') . '/']]);
        aim_setup_done();
        aim_write_site_config();
        aim_admin_login($pw);
        aim_json_out(['ok' => true]);
        return;
    }
    if ($a === 'login' && $post) {
        if (!aim_rate_ok('login', aim_ip_hash(), 6, 900)) { aim_error('rate_limited', 'Too many attempts. Wait 15 minutes.', 429); return; }
        if (!aim_admin_login((string)($in['password'] ?? ''))) { usleep(400000); aim_error('login', 'Wrong password.', 403); return; }
        aim_json_out(['ok' => true]);
        return;
    }
    if (!aim_admin_ok()) { aim_error('auth', 'Please log in.', 401); return; }
    if (in_array($a, AIM_ADMIN_WRITE, true)) {
        if (!$post) { header('Allow: POST'); aim_error('method', 'Use POST.', 405); return; }
        if (!aim_csrf_ok()) { aim_error('csrf', 'Session expired. Reload the page.', 403); return; }
    } elseif (in_array($a, AIM_ADMIN_READ, true)) {
        if ($post && !aim_csrf_ok()) { aim_error('csrf', 'Session expired. Reload the page.', 403); return; }
    } else { aim_error('unknown', 'Unknown action.', 404); return; }
    switch ($a) {
        case 'logout': aim_admin_logout(); aim_json_out(['ok' => true]); return;
        case 'state': aim_json_out(aim_admin_state()); return;
        case 'health': aim_json_out(['ok' => true, 'checks' => aim_health(true)]); return;
        case 'password':
            if (!password_verify((string)($in['current'] ?? ''), aim_admin_record()['hash'] ?? '')) { aim_error('login', 'The current password is wrong.', 403); return; }
            if (strlen((string)($in['new'] ?? '')) < 12) { aim_error('weak', 'Use at least 12 characters.', 400); return; }
            aim_admin_set_password((string)$in['new']); aim_admin_login((string)$in['new']); aim_json_out(['ok' => true]); return;
        case 'settings':
            $newUrl = $in['settings']['site']['url'] ?? null;
            if (is_string($newUrl) && trim($newUrl) !== '') {
                $u = parse_url(trim($newUrl));
                $host = strtolower(($u['host'] ?? '') . (isset($u['port']) ? ':' . $u['port'] : ''));
                $here = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
                $strip = fn(string $h) => (string)preg_replace('/:(80|443)$/', '', $h);
                if (!preg_match('#^https?://#i', trim($newUrl)) || $host === '') { aim_error('site_url', 'The site address must look like https://aiforecastatlas.com/', 400); return; }
                if ($here !== '' && $strip($host) !== $strip($here)) { aim_error('site_url', 'The site address (' . $host . ') differs from the address you are using now (' . $here . '). The admin page only works at the site address, so open the admin page at the new address first, or correct the typo.', 400); return; }
            }
            $before = aim_settings()['mailjet'];
            aim_apply_settings_update(is_array($in['settings'] ?? null) ? $in['settings'] : []);
            aim_write_site_config();
            $mj = null;
            $after = aim_settings()['mailjet'];
            if (aim_mj_ready() && ($before['public_key'] !== $after['public_key'] || $before['private_key'] !== $after['private_key'] || empty(aim_state()['mjPropsOk']))) {
                $mj = aim_mj_ensure_properties();   // the subscriber fields must exist before the first confirmation
                if (!empty($mj['ok'])) aim_state_set(['mjPropsOk' => aim_iso()]);
            }
            aim_json_out(['ok' => true, 'settings' => aim_settings_masked(), 'mailjet' => $mj]); return;
        case 'test-provider': aim_json_out(aim_llm_test((string)($in['provider'] ?? ''), (string)($in['model'] ?? ''))); return;
        case 'mailjet-setup':
            if (!aim_mj_ready()) { aim_error('mailjet', 'Enter the Mailjet API key, secret key and sender first.', 400); return; }
            $p = aim_mj_ensure_properties();
            if (!empty($p['ok'])) aim_state_set(['mjPropsOk' => aim_iso()]);
            $l = aim_mj('GET', '/v3/REST/contactslist/' . rawurlencode((string)aim_settings()['mailjet']['list_id']));
            $sender = aim_mj('GET', '/v3/REST/sender?Email=' . rawurlencode((string)aim_settings()['mailjet']['from_email']));
            aim_json_out(['ok' => !empty($p['ok']) && $l['status'] === 200, 'properties' => $p, 'list' => $l['status'] === 200 ? ($l['json']['Data'][0]['Name'] ?? 'ok') : aim_http_problem($l), 'sender' => $sender['json']['Data'][0]['Status'] ?? aim_http_problem($sender)]); return;
        case 'newsletter-preview':
            header('Content-Type: text/html; charset=utf-8');
            header("Content-Security-Policy: sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline'");
            header('X-Content-Type-Options: nosniff');
            echo aim_nl_preview((string)($_GET['lang'] ?? 'en'), explode(',', (string)($_GET['cats'] ?? 'summary')), (string)($_GET['edition'] ?? 'weekly')); return;
        case 'newsletter-test': aim_json_out(aim_nl_test(preg_split('/[\s,;]+/', (string)($in['emails'] ?? '')), (string)($in['lang'] ?? 'en'), (array)($in['cats'] ?? ['summary']), (string)($in['edition'] ?? 'weekly'))); return;
        case 'newsletter-stop':
            $q = aim_nl_current(); if ($q) { $q['done'] = true; $q['stopped'] = aim_iso(); $q['recipients'] = []; aim_store_write('newsletter/queue-' . $q['id'], $q); }
            aim_json_out(['ok' => true]); return;
        case 'candidate': aim_json_out(aim_candidate_decide((string)($in['id'] ?? ''), ($in['action'] ?? '') === 'approve' ? 'approve' : 'reject', is_array($in['edit'] ?? null) ? $in['edit'] : [])); return;
        case 'working': aim_json_out(['ok' => true, 'working' => aim_working_dataset(), 'published' => aim_published_dataset(), 'diff' => aim_working_diff(), 'latest' => aim_latest_release()]); return;
        case 'working-edit': aim_json_out(aim_working_edit((string)($in['anchor'] ?? ''), is_array($in['fields'] ?? null) ? $in['fields'] : [])); return;
        case 'working-reset': aim_working_reset(); aim_json_out(['ok' => true]); return;
        case 'stage':
            $files = [];
            foreach ((array)($in['files'] ?? []) as $p => $b64) $files[(string)$p] = (string)base64_decode((string)$b64, true);
            aim_json_out(aim_stage((string)($in['id'] ?? ''), $files, 'admin')); return;
        case 'unstage': aim_unstage((string)($in['id'] ?? '')); aim_json_out(['ok' => true]); return;
        case 'publish-now': aim_json_out(aim_publish_now((string)($in['id'] ?? ''))); return;
        case 'regenerate_public_pages':
            if (!aim_discovery_origin_ok()) { aim_error('origin', 'Open this action from the site\'s own admin page.', 403); return; }
            aim_json_out(aim_discovery_refresh(isset($in['cursor']) ? (string)$in['cursor'] : null, (int)($in['limit'] ?? 20))); return;
        case 'collect-now': aim_json_out(['ok' => true, 'result' => aim_collect_tick(40, !empty($in['restart']))]); return;
        case 'xwatch': aim_json_out(aim_xwatch_decide((string)($in['id'] ?? ''), ($in['action'] ?? '') === 'approve' ? 'approve' : 'reject', is_array($in['edit'] ?? null) ? $in['edit'] : [])); return;
        case 'xwatch-withdraw': aim_json_out(aim_xwatch_withdraw((string)($in['id'] ?? ''))); return;
        case 'xwatch-scan': aim_json_out(aim_xwatch_scan_now()); return;
        case 'cron-now': aim_json_out(['ok' => true, 'result' => aim_cron_tick('admin', 40)]); return;
        case 'feedback': aim_json_out(['ok' => true, 'items' => aim_feedback_list()]); return;
        case 'feedback-mark':
            $id = (string)($in['id'] ?? ''); $stt = in_array($in['status'] ?? '', ['new', 'planned', 'done', 'declined'], true) ? $in['status'] : 'done';
            aim_store_update('feedback/marks', function ($m) use ($id, $stt) { $m = is_array($m) ? $m : []; $m[$id] = $stt; return $m; }, []);
            aim_json_out(['ok' => true]); return;
        case 'logs':
            $ch = preg_replace('/[^a-z]/', '', (string)($_GET['ch'] ?? 'release'));
            aim_json_out(['ok' => true, 'lines' => array_slice(array_reverse(aim_store_lines('logs/' . $ch . '-' . aim_now()->format('Y-m'))), 0, 200)]); return;
    }
    aim_error('unknown', 'Unknown action.', 404);
}

/* ---------- signed automation endpoint (GitHub Actions or a computer running tools/release.mjs) ---------- */
function aim_handle_ingest(): void
{
    $s = aim_settings();
    $secret = (string)$s['admin']['ingest_secret'];
    $raw = (string)file_get_contents('php://input', false, null, 0, 16000000);
    $ts = (int)($_SERVER['HTTP_X_AIM_TIME'] ?? 0);
    $sig = (string)($_SERVER['HTTP_X_AIM_SIGNATURE'] ?? '');
    $act = (string)($_GET['a'] ?? 'state');
    $expect = 'sha256=' . hash_hmac('sha256', $ts . '.' . $act . '.' . $raw, $secret);
    if (strlen($secret) < 32 || abs(time() - $ts) > 600 || !hash_equals($expect, $sig)) { aim_error('auth', 'Bad signature.', 401); return; }
    if ($act === 'state') { aim_json_out(['ok' => true, 'working' => aim_working_dataset(), 'latest' => aim_latest_release(), 'published' => aim_published_dataset(), 'nextRelease' => aim_iso(aim_next_release()), 'nextId' => aim_week_id(aim_next_release())]); return; }
    if ($act === 'stage') {
        $in = json_decode($raw, true) ?: [];
        $files = [];
        foreach ((array)($in['files'] ?? []) as $p => $b64) $files[(string)$p] = (string)base64_decode((string)$b64, true);
        aim_json_out(aim_stage((string)($in['id'] ?? ''), $files, 'automation'));
        return;
    }
    aim_error('unknown', 'Unknown action.', 404);
}
