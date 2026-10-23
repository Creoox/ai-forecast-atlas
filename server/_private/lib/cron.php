<?php
/* AI Forecast Atlas — the scheduler. home.pl runs cron-5min.php (every 5 minutes) and cron-13.php (13:00 daily);
   both call aim_cron_tick(), which decides what is due: the Friday 13:00 release, newsletter batches,
   the daily data review from 06:00, housekeeping. Each call stays well under the host's 60-second limit.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_admin_notify(string $subject, string $text): void
{
    $s = aim_settings();
    $to = trim((string)$s['admin']['email']);
    if ($to === '' || empty($s['newsletter']['notify_admin']) || !aim_mj_ready()) return;
    $html = aim_email_shell('en', '<p style="white-space:pre-line">' . aim_h($text) . '</p>');
    $r = aim_mj_send([aim_mj_message($to, '', $subject, $html, $text, ['CustomCampaign' => 'aimonitor-admin'])]);
    if ($r['ok'] < 1) aim_log('admin', 'notify failed', ['error' => $r['error'] ?? '']);
}
function aim_release_due(DateTimeImmutable $now): bool
{
    $s = aim_settings();
    $wd = (int)($s['site']['release_weekday'] ?? 5);
    [$hh, $mm] = array_map('intval', explode(':', $s['site']['release_time'] ?? '13:00'));
    $dow = (int)$now->format('N');
    if ($dow < $wd) return false;                         // too early in the week
    if ($dow === $wd && (int)$now->format('Hi') < $hh * 100 + $mm) return false;
    return (aim_state()['lastScheduledWeek'] ?? '') !== aim_week_id($now);   // catch up later in the same week if the server missed Friday
}
function aim_daily_due(DateTimeImmutable $now): bool
{
    [$hh, $mm] = array_map('intval', explode(':', aim_settings()['site']['daily_time'] ?? '06:00'));
    if ((int)$now->format('Hi') < $hh * 100 + $mm) return false;
    $run = aim_state()['collect'] ?? [];
    return ($run['date'] ?? '') !== $now->format('Y-m-d') || empty($run['finished']);
}
/** One scheduler step. $budget is the wall-clock time this call may use. */
function aim_cron_tick(string $source = 'cron', float $budget = 45.0): array
{
    @set_time_limit((int)$budget + 30);
    @ignore_user_abort(true);
    $t0 = microtime(true);
    $left = fn() => $budget - (microtime(true) - $t0);
    $st = aim_state();
    $last = $st['lastTick'] ?? null;
    // cron-13.php may skip the one-minute spacing only around 13:00 (it is reachable from the web like any file)
    $nowHi = (int)aim_now()->format('Hi');
    $privileged = in_array($source, ['admin', 'cli'], true) || ($source === 'cron13' && $nowHi >= 1300 && $nowHi < 1310);
    if (!$privileged && $last && time() - strtotime($last) < 45) return ['skipped' => 'ran less than a minute ago'];
    if (!isset($st['lastScheduledWeek'])) {           // first run: the release shipped with the package counts as this week's
        $rel = aim_latest_release();
        if ($rel && preg_match('/^\d{4}-W\d{2}/', (string)$rel['id'], $m)) aim_state_set(['lastScheduledWeek' => $m[0], 'lastRelease' => $rel['id'], 'lastReleaseAt' => $rel['publishedAt'] ?? null]);
    }
    $out = aim_with_lock('tick', function () use ($source, $left, $t0) {
        $now = aim_now();
        $did = [];
        $st = aim_state();
        // a run that started but never finished was stopped by the host: count it so Health can show the real limit
        if (!empty($st['tickStart']) && (empty($st['tickEnd']) || strcmp($st['tickEnd'], $st['tickStart']) < 0) && time() - strtotime($st['tickStart']) > 120) {
            $cut = array_slice(array_merge($st['tickCutoffs'] ?? [], [$st['tickStart']]), -20);
            aim_state_set(['tickCutoffs' => $cut]);
            aim_log('cron', 'previous run was stopped before it finished', ['started' => $st['tickStart']]);
        }
        aim_state_set(['lastTick' => aim_iso($now), 'lastTickSource' => $source, 'tickStart' => aim_iso($now)]);
        if (aim_release_due($now)) $did['release'] = aim_publish_scheduled();
        if ($left() > 12 && aim_nl_current()) $did['newsletter'] = aim_nl_tick($left() - 5);
        $st = aim_state();
        if ($left() > 8 && ($st['housekeeping'] ?? '') !== $now->format('Y-m-d')) { $did['housekeeping'] = aim_housekeeping(); aim_state_set(['housekeeping' => $now->format('Y-m-d')]); }
        if ($left() > 15 && aim_daily_due($now)) $did['collect'] = aim_collect_tick($left() - 5);
        $ms = (int)round((microtime(true) - $t0) * 1000);
        $st = aim_state();
        aim_state_set(['tickEnd' => aim_iso(), 'tickMs' => $ms, 'tickMaxMs' => max($ms, (int)($st['tickMaxMs'] ?? 0))]);
        return $did;
    }, false);
    if ($out === null) return ['busy' => true];
    return $out;
}
/** Daily clean-up: rate-limit counters, old logs and locks, and the deletion periods promised in the privacy notice. */
function aim_housekeeping(): array
{
    $n = 0;
    $old = fn(string $f, int $days) => @filemtime($f) !== false && filemtime($f) < time() - $days * 86400;
    foreach (glob(aim_storage('rl/*.php')) ?: [] as $f) if ($old($f, 2)) { @unlink($f); $n++; }
    foreach (glob(aim_storage('locks/*.lock')) ?: [] as $f) if ($old($f, 2)) { @unlink($f); $n++; }
    foreach (glob(aim_storage('logs/*.php')) ?: [] as $f) if ($old($f, 400)) { @unlink($f); $n++; }
    foreach (glob(aim_storage('newsletter/intro-*.php')) ?: [] as $f) if ($old($f, 120)) { @unlink($f); $n++; }
    foreach (glob(aim_storage('*.tmp*')) ?: [] as $f) if ($old($f, 1)) { @unlink($f); $n++; }
    foreach (glob(aim_storage('*/*.tmp*')) ?: [] as $f) if ($old($f, 1)) { @unlink($f); $n++; }
    // privacy notice: consent and unsubscription records are kept three years, suggestions 24 months
    $y = (int)aim_now()->format('Y');
    $limit = gmdate('c', time() - 3 * 365 * 86400);
    foreach (glob(aim_storage('consent/*.php')) ?: [] as $f) {
        if (!preg_match('/(\d{4})\.php$/', $f, $m)) continue;
        if ((int)$m[1] < $y - 3) { @unlink($f); $n++; continue; }
        if ((int)$m[1] === $y - 3) {   // the year that is partly older than three years: drop only the old lines
            $rel = 'consent/' . $m[1];
            $rows = aim_store_lines($rel);
            $keep = array_values(array_filter($rows, fn($r) => strcmp(gmdate('c', strtotime((string)($r['t'] ?? '1970-01-01'))), $limit) >= 0));
            if (count($keep) < count($rows)) {
                aim_with_lock('append_' . md5($rel), function () use ($rel, $keep) { aim_write(aim_store_path($rel), AIM_GUARD . implode('', array_map(fn($r) => aim_json_encode($r) . "\n", $keep)), 0600); });
                $n += count($rows) - count($keep);
            }
        }
    }
    $before = count(aim_suppressed_set());
    if ($before) aim_store_update('suppress', fn($s) => array_filter(is_array($s) ? $s : [], fn($t) => strcmp((string)$t, $limit) >= 0), []);
    $n += max(0, $before - count(aim_suppressed_set()));
    $cutoff = aim_now()->modify('first day of this month')->modify('-23 months')->format('Y-m');   // a month's file goes once its last entry is 24 months old
    foreach (glob(aim_storage('feedback/*.php')) ?: [] as $f) if (preg_match('/(\d{4}-\d{2})\.php$/', $f, $m) && strcmp($m[1], $cutoff) < 0) { @unlink($f); $n++; }
    // newsletter sends never keep addresses once they are finished, stopped or replaced
    foreach (glob(aim_storage('newsletter/queue-*.php')) ?: [] as $f) {
        $q = aim_store_read('newsletter/' . basename($f, '.php'));
        if (is_array($q) && !empty($q['recipients']) && (!empty($q['done']) || $old($f, 14))) { $q['recipients'] = []; $q['done'] = true; aim_store_write('newsletter/' . basename($f, '.php'), $q); $n++; }
    }
    // retry unsubscribes that Mailjet did not accept at the time (the local suppression list already blocks sending)
    $retry = aim_store_lines('unsub-retry');
    if ($retry && aim_mj_list_ready()) {
        $left = [];
        foreach ($retry as $r) { $x = aim_mj_manage((string)$r['e'], '', 'unsub'); if (!$x['ok']) $left[] = $r; }
        @unlink(aim_store_path('unsub-retry'));
        foreach ($left as $r) aim_store_append('unsub-retry', $r);
    }
    if (function_exists('aim_xwatch_prune')) $n += aim_xwatch_prune();   // also writes data/xwatch.json after an update installed without it
    $n += aim_upload_prune();   // incomplete browser uploads expire after 24 hours
    return ['removed' => $n, 'unsubRetried' => count($retry)];
}
