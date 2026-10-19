<?php
/* AI Forecast Atlas — the newsletter: one email per subscriber after each Friday release (or a monthly edition on the
   first Friday), built from the release data in the reader's language with only the topics they chose.
   Sent through Mailjet in batches of 50 across several cron runs. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_nl_ready(): bool { $s = aim_settings(); return !empty($s['newsletter']['enabled']) && aim_mj_list_ready(); }
/** The first newsletter sent in a calendar month is the monthly edition (monthly readers get only that one). */
function aim_nl_edition(array $rel): string
{
    try { $d = (new DateTimeImmutable($rel['publishedAt'] ?? 'now'))->setTimezone(new DateTimeZone(AIM_TZ)); } catch (Throwable $e) { return 'weekly'; }
    return (aim_state()['lastMonthlyEdition'] ?? '') === $d->format('Y-m') ? 'weekly' : 'monthly';
}
/** Called after every publish. An unfinished earlier send is closed (and its address list dropped). */
function aim_nl_queue(array $rel): void
{
    if (!aim_nl_ready() || !empty($rel['base'])) return;
    $id = (string)$rel['id'];
    if (aim_store_read('newsletter/queue-' . $id)) return;
    $cur = aim_nl_current();
    $inherit = false;
    if ($cur && $cur['id'] !== $id) {
        $cur['done'] = true; $cur['replaced'] = $id; $cur['recipients'] = []; $cur['finished'] = aim_iso();
        aim_store_write('newsletter/queue-' . $cur['id'], $cur);
        $inherit = ($cur['edition'] ?? '') === 'monthly';   // monthly readers not reached yet get the next release instead
        aim_log('newsletter', 'unfinished send closed by a newer release', ['id' => $cur['id'], 'sent' => $cur['sent'] ?? 0, 'of' => $cur['total'] ?? 0, 'next' => $id]);
        if (function_exists('aim_admin_notify')) aim_admin_notify('AI Forecast Atlas: newsletter ' . $cur['id'] . ' was not finished', 'Release ' . $id . ' was published before the newsletter for ' . $cur['id'] . ' reached everyone (' . ($cur['sent'] ?? 0) . ' of ' . ($cur['total'] ?? '?') . ' sent). The new release goes to all weekly subscribers' . ($inherit ? ' and, as the monthly edition, to monthly subscribers too (some of them may get two emails this month)' : '') . '. If this happens often, raise the daily sending limit (Mailjet plan) in Settings.' . "\n");
    }
    $edition = $inherit ? 'monthly' : aim_nl_edition($rel);
    if ($edition === 'monthly') {
        try { $m = (new DateTimeImmutable($rel['publishedAt'] ?? 'now'))->setTimezone(new DateTimeZone(AIM_TZ))->format('Y-m'); } catch (Throwable $e) { $m = aim_now()->format('Y-m'); }
        aim_state_set(['lastMonthlyEdition' => $m]);
    }
    aim_store_write('newsletter/queue-' . $id, ['id' => $id, 'created' => aim_iso(), 'edition' => $edition, 'phase' => 'audience', 'cursor' => 0, 'sent' => 0, 'failed' => 0, 'skipped' => 0, 'fails' => 0, 'done' => false, 'recipients' => []]);
    aim_state_set(['newsletterQueue' => $id]);
}
function aim_nl_current(): ?array
{
    $id = aim_state()['newsletterQueue'] ?? '';
    if ($id === '') return null;
    $q = aim_store_read('newsletter/queue-' . $id);
    return is_array($q) && empty($q['done']) ? $q : null;
}
/** Emails sent today through Mailjet (newsletter, confirmations, admin notes): counted against the daily limit. */
function aim_nl_sent_today(): int
{
    $u = aim_store_read('newsletter/sent-' . aim_now()->format('Y-m'), []) ?: [];
    return (int)($u[aim_now()->format('Y-m-d')] ?? 0);
}
function aim_nl_count_sent(int $n): void
{
    if ($n <= 0) return;
    $day = aim_now()->format('Y-m-d');
    aim_store_update('newsletter/sent-' . aim_now()->format('Y-m'), function ($u) use ($day, $n) { $u = is_array($u) ? $u : []; $u[$day] = (int)($u[$day] ?? 0) + $n; return $u; });
}
/** Room left today for newsletter batches: the plan's daily limit minus a reserve for confirmation emails. */
function aim_nl_room(): int
{
    $limit = (int)aim_settings()['mailjet']['daily_limit'];
    if ($limit <= 0) return PHP_INT_MAX;
    $reserve = max(10, (int)ceil($limit * 0.1));
    return max(0, $limit - $reserve - aim_nl_sent_today());
}
/** One step of the current send; returns a short status. Never runs longer than $budget seconds. */
function aim_nl_tick(float $budget): array
{
    $q = aim_nl_current();
    if (!$q) return ['idle' => true];
    $t0 = microtime(true);
    $id = $q['id'];
    $save = function () use (&$q, $id) { aim_store_write('newsletter/queue-' . $id, $q); };
    if (!empty($q['pausedUntil']) && time() < strtotime($q['pausedUntil'])) return ['paused' => 'until ' . $q['pausedUntil']];
    $rel = aim_read_json(aim_public('data/releases/' . $id . '/release.json'), null);
    if (!$rel) { $q['done'] = true; $q['error'] = 'release missing'; $q['recipients'] = []; $save(); return ['error' => 'release missing']; }
    if ($q['phase'] === 'audience') {
        try { $aud = aim_mj_audience(); } catch (Throwable $e) { aim_log('newsletter', 'audience failed', ['error' => $e->getMessage()]); return ['error' => 'audience: ' . $e->getMessage()]; }
        $supp = aim_suppressed_set();
        $rcp = [];
        foreach ($aud as $a) {
            if (isset($supp[aim_suppress_key($a['e'])])) continue;
            $freq = aim_clean_freq($a['p']['aim_freq'] ?? 'weekly');
            if ($freq === 'monthly' && $q['edition'] !== 'monthly') continue;
            $rcp[] = ['e' => $a['e'], 'n' => aim_line($a['n'] ?? '', 80), 'l' => aim_lang($a['p']['aim_lang'] ?? 'en'), 'c' => aim_clean_categories(explode(',', (string)($a['p']['aim_cats'] ?? 'summary'))), 'f' => $freq];
        }
        $q['recipients'] = $rcp; $q['phase'] = 'intro'; $q['total'] = count($rcp);
        $q['langs'] = array_values(array_unique(array_column($rcp, 'l')));
        $save();
        aim_log('newsletter', 'audience ready', ['id' => $id, 'total' => count($rcp)]);
    }
    if ($q['phase'] === 'intro') {
        // write the AI intros first, one language per scheduler run, so no send waits for an AI answer
        $needAi = aim_role_available('writer') && count($rel['changes'] ?? []) > 0;
        foreach ($q['langs'] ?? [] as $lang) {
            if (!$needAi) { aim_nl_intro($rel, $lang, false); continue; }
            if (is_array(aim_store_read('newsletter/intro-' . $id . '-' . $lang))) continue;
            $tries = (int)($q['introTries'][$lang] ?? 0);
            if ($tries >= 1 || microtime(true) - $t0 > 3 || $budget < 38) {
                if ($tries >= 1) aim_nl_intro($rel, $lang, false);   // the earlier attempt was cut off: use the standard intro
                else return ['writing' => $lang];
                continue;
            }
            $q['introTries'][$lang] = $tries + 1; $save();
            aim_nl_intro($rel, $lang, true);
            return ['intro' => $lang];
        }
        $q['phase'] = 'send'; $save();
    }
    $supp = aim_suppressed_set();   // checked again for every run: someone may have unsubscribed during a long send
    $composed = [];
    if (!empty($q['inflight'])) {
        // the previous run was stopped while Mailjet was sending: the batch may have gone out, so it is not sent again
        $to = (int)$q['inflight']['to'];
        aim_log('newsletter', 'batch outcome unknown (run stopped during the send); not repeated', ['id' => $id, 'from' => $q['cursor'], 'to' => $to]);
        $q['uncertain'] = (int)($q['uncertain'] ?? 0) + max(0, $to - $q['cursor']);
        $q['cursor'] = max($q['cursor'], $to);
        unset($q['inflight']); $save();
    }
    while ($q['cursor'] < count($q['recipients']) && $budget - (microtime(true) - $t0) >= 25) {
        $room = min(50, aim_nl_room());
        if ($room <= 0) { $save(); return ['paused' => 'daily limit']; }
        $batch = array_slice($q['recipients'], $q['cursor'], $room);
        $msgs = []; $skip = 0;
        foreach ($batch as $k => $r) {
            if (isset($supp[aim_suppress_key($r['e'])])) { $skip++; continue; }
            $key = $r['l'] . '|' . implode(',', $r['c']);
            if (!isset($composed[$key])) $composed[$key] = aim_nl_compose($rel, $r['l'], $r['c'], $q['edition']);
            [$subj, $html, $text] = $composed[$key];
            $prefs = aim_prefs_url($r['e']); $unsub = aim_unsub_url($r['e']);
            $msgs[] = aim_mj_message($r['e'], $r['n'], $subj, str_replace(['{{PREFS}}', '{{UNSUB}}'], [aim_h($prefs), aim_h($unsub)], $html), str_replace(['{{PREFS}}', '{{UNSUB}}'], [$prefs, $unsub], $text), [
                'CustomCampaign' => 'aimonitor-' . $id, 'CustomID' => 'nl-' . $id . '-' . ($q['cursor'] + $k),
                'Headers' => ['List-Unsubscribe' => '<' . $unsub . '>', 'List-Unsubscribe-Post' => 'List-Unsubscribe=One-Click'],
            ]);
        }
        if ($msgs) { $q['inflight'] = ['to' => $q['cursor'] + count($batch), 'at' => aim_iso()]; $save(); }
        $res = $msgs ? aim_mj_send($msgs, 20) : ['ok' => 0, 'failed' => [], 'error' => null];
        unset($q['inflight']);
        if ($msgs && $res['ok'] === 0 && ($res['error'] || count($res['failed']) === count($msgs))) {
            // the whole batch was refused (quota, outage, bad sender): keep the cursor and try again later
            $q['fails'] = (int)($q['fails'] ?? 0) + 1;
            $why = $res['error'] ?: ($res['failed'][0][1] ?? 'refused');
            aim_log('newsletter', 'batch refused', ['id' => $id, 'error' => $why, 'attempt' => $q['fails']]);
            if ($q['fails'] >= 3) {
                $q['pausedUntil'] = aim_iso(aim_now()->modify('+1 day')->setTime(6, 0)); $q['fails'] = 0;
                if (function_exists('aim_admin_notify')) aim_admin_notify('AI Forecast Atlas: newsletter ' . $id . ' paused', 'Mailjet refused three batches in a row (' . $why . '). Sending resumes tomorrow at 06:00. Check the Mailjet account (sender, plan limit) and Admin → Newsletter.' . "\n");
            }
            $save();
            return ['error' => $why];
        }
        $q['fails'] = 0;
        $q['cursor'] += count($batch); $q['sent'] += $res['ok']; $q['failed'] += count($res['failed']); $q['skipped'] = (int)($q['skipped'] ?? 0) + $skip;
        if ($res['failed']) aim_log('newsletter', 'some messages failed', ['id' => $id, 'n' => count($res['failed'])]);
        $save();
    }
    if ($q['cursor'] >= count($q['recipients'])) {
        $q['done'] = true; $q['finished'] = aim_iso(); $q['recipients'] = []; // do not keep addresses after sending
        $save();
        aim_log('newsletter', 'sent', ['id' => $id, 'sent' => $q['sent'], 'failed' => $q['failed'], 'skipped' => $q['skipped'] ?? 0]);
        return ['done' => true, 'sent' => $q['sent'], 'failed' => $q['failed']];
    }
    return ['sending' => true, 'sent' => $q['sent'], 'of' => $q['total'] ?? 0];
}

/* ---------- composition ---------- */
function aim_nl_scn(array $rel, string $key, string $lang): array
{
    foreach ($rel['scenarios'] ?? [] as $s) if ($s['key'] === $key) return aim_scenario_name($s, $lang);
    return [$key, $key];
}
function aim_nl_facts(array $rel): array
{
    return [
        'release' => $rel['id'] ?? '', 'published' => $rel['publishedAt'] ?? '', 'dataTo' => $rel['asOf'] ?? '', 'carryForward' => !empty($rel['carryForward']), 'base' => !empty($rel['base']),
        'changes' => array_map(fn($c) => ['measure' => $c['name'] ?? '', 'was' => $c['fromText'] ?? '', 'now' => $c['toText'] ?? '', 'source' => $c['src'] ?? ''], $rel['changes'] ?? []),
        'moves' => array_map(fn($m) => ['scenario' => $m['scenario'], 'measure' => $m['metric'], 'q4_2030_was' => $m['fromText'] ?? '', 'q4_2030_now' => $m['toText'] ?? ''], array_slice($rel['moves'] ?? [], 0, 6)),
        'summary' => $rel['summary'] ?? '',
    ];
}
/** Numbers in a text must all appear in the facts (guards against invented figures). */
function aim_numbers_ok(string $text, string $facts): bool
{
    $norm = fn(string $s) => preg_replace('/[\s\x{00a0}\x{202f}]/u', '', str_replace(',', '.', $s));
    $f = $norm($facts);
    preg_match_all('/\d+(?:[.,]\d+)*/u', $text, $m);
    foreach ($m[0] as $n) {
        $n = $norm($n);
        if (strlen(str_replace('.', '', $n)) <= 1) continue;                    // single digits are fine
        if (preg_match('/^20[2-3]\d$/', $n)) continue;                         // years
        if (str_contains($f, $n) || str_contains($f, rtrim(rtrim($n, '0'), '.'))) continue;
        return false;
    }
    return true;
}
function aim_nl_intro(array $rel, string $lang, bool $allowAi = true): string
{
    $id = (string)($rel['id'] ?? '');
    $cached = aim_store_read('newsletter/intro-' . $id . '-' . $lang);
    if (is_array($cached) && isset($cached['text'])) return (string)$cached['text'];
    $n = count($rel['changes'] ?? []);
    $fallback = !empty($rel['base']) ? aim_t('nl_intro_base', $lang) : ($n ? aim_t('nl_intro_changes', $lang, ['n' => $n]) : aim_t('nl_no_changes', $lang));
    $text = $fallback;
    if ($allowAi && aim_role_available('writer') && $n > 0) {
        $facts = aim_json_encode(aim_nl_facts($rel));
        $names = ['en' => 'English', 'de' => 'German (Swiss usage: write “ss” instead of “ß”)', 'fr' => 'French', 'pl' => 'Polish'];
        $r = aim_llm(['role' => 'writer', 'system' => 'You write the opening paragraph of the AI Forecast Atlas newsletter (Creoox AG) in ' . ($names[$lang] ?? 'English') . '. 2 to 4 sentences, plain and neutral, no hype, no investment advice. Use only the facts given; never add numbers that are not in the facts. Write “Autodesk®” only as an adjective and never in possessive form. Output plain text only.', 'messages' => [['role' => 'user', 'content' => 'Facts (JSON): ' . $facts]], 'max_output' => 400, 'timeout' => 30]);
        $cand = trim(preg_replace('/\s+/', ' ', $r['text'] ?? ''));
        if ($r['ok'] && mb_strlen($cand) > 40 && mb_strlen($cand) < 1200 && aim_numbers_ok($cand, $facts)) $text = $cand;
        elseif ($r['ok']) aim_log('newsletter', 'intro rejected (numbers check)', ['id' => $id, 'lang' => $lang]);
    }
    aim_store_write('newsletter/intro-' . $id . '-' . $lang, ['text' => $text, 'at' => aim_iso()]);
    return $text;
}
function aim_nl_table(array $head, array $rows): string
{
    $h = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;margin:4px 0 10px">';
    $h .= '<tr>';
    foreach ($head as $i => $c) $h .= '<td style="padding:5px 6px;border-bottom:2px solid #dfdcd2;color:#66635b;font-size:11.5px;' . ($i > 0 ? 'text-align:right' : '') . '">' . aim_h($c) . '</td>';
    $h .= '</tr>';
    foreach ($rows as $r) {
        $h .= '<tr>';
        foreach ($r as $i => $c) $h .= '<td style="padding:5px 6px;border-bottom:1px solid #eeece6;vertical-align:top;' . ($i > 0 ? 'text-align:right;white-space:nowrap' : '') . '">' . (is_array($c) ? $c[0] : aim_h((string)$c)) . '</td>';
        $h .= '</tr>';
    }
    return $h . '</table>';
}
function aim_nl_h2(string $t): string { return '<h2 style="font-size:16px;margin:22px 0 6px;color:#17171a;border-top:1px solid #dfdcd2;padding-top:14px">' . aim_h($t) . '</h2>'; }
/** [subject, html, text] for one language, set of topics and edition. Links use {{PREFS}} and {{UNSUB}} placeholders. */
function aim_nl_compose(array $rel, string $lang, array $cats, string $edition, bool $test = false): array
{
    $s = aim_settings();
    $site = rtrim($s['site']['url'], '/') . '/';
    $n = count($rel['changes'] ?? []);
    $headline = !empty($rel['carryForward']) || $n === 0 ? aim_t('nl_subject_none', $lang) : ($n === 1 ? aim_t('nl_subject_one', $lang) : aim_t('nl_subject_changes', $lang, ['n' => $n]));
    $subject = ($test ? '[' . aim_t('nl_test', $lang) . '] ' : '') . aim_t('nl_subject', $lang, ['id' => $rel['id'], 'headline' => $headline]);
    $T = [];   // text version lines
    $edLabel = aim_t($edition === 'monthly' ? 'nl_monthly' : 'nl_weekly', $lang);
    $meta = $edLabel . ' ' . $rel['id'] . ' · ' . aim_t('nl_published', $lang) . ' ' . aim_date_l($rel['publishedAt'] ?? aim_iso(), $lang, true) . (!empty($rel['asOf']) ? ' · ' . aim_t('nl_data_to', $lang) . ' ' . aim_date_l($rel['asOf'] . 'T12:00:00Z', $lang) : '');
    $intro = aim_nl_intro($rel, $lang);
    $h = '<p style="margin:0 0 4px;color:#9c5500;font:700 11px/1.4 Menlo,Consolas,monospace;letter-spacing:.06em;text-transform:uppercase">' . aim_h($meta) . '</p>'
        . '<p style="margin:8px 0 14px;font-size:15px">' . aim_h($intro) . '</p>'
        . '<p style="margin:0 0 6px"><a href="' . aim_h($site) . '" style="display:inline-block;background:#9c5500;color:#ffffff;text-decoration:none;padding:9px 15px;border-radius:2px;font-weight:bold">' . aim_h(aim_t('nl_open', $lang)) . '</a></p>';
    $T[] = $meta; $T[] = ''; $T[] = $intro; $T[] = aim_t('nl_open', $lang) . ': ' . $site; $T[] = '';
    // What changed
    $h .= aim_nl_h2(aim_t('nl_changes', $lang)); $T[] = '== ' . aim_t('nl_changes', $lang);
    if ($n === 0) { $h .= '<p style="color:#43413c">' . aim_h(aim_t('nl_no_changes', $lang)) . '</p>'; $T[] = aim_t('nl_no_changes', $lang); }
    else {
        $rows = [];
        foreach ($rel['changes'] as $c) {
            $metric = (string)($c['metric'] ?? '');
            $was = is_numeric($c['from'] ?? null) && $metric ? aim_fmt($metric, $c['from'], $lang) : (string)($c['fromText'] ?? '');
            $now = is_numeric($c['to'] ?? null) && $metric ? aim_fmt($metric, $c['to'], $lang) : (string)($c['toText'] ?? '');
            $name = aim_metric_name($metric, $lang, (string)($c['name'] ?? $c['id']));
            $rows[] = [$name, $was, $now];
            $T[] = '- ' . $name . ': ' . $was . ' → ' . $now . (!empty($c['src']) ? ' (' . $c['src'] . ')' : '');
        }
        $h .= aim_nl_table([aim_t('nl_measure', $lang), aim_t('nl_was', $lang), aim_t('nl_now', $lang)], $rows);
        // where each new value comes from, and how it entered the data
        $h .= '<p style="color:#43413c;font-size:13px;margin:8px 0 2px"><b>' . aim_h(aim_t('nl_sources', $lang)) . '</b></p><ul style="margin:0;padding-left:18px;color:#43413c;font-size:13px">';
        $T[] = ''; $T[] = aim_t('nl_sources', $lang) . ':';
        foreach ($rel['changes'] as $c) {
            $name = aim_metric_name((string)($c['metric'] ?? ''), $lang, (string)($c['name'] ?? $c['id']));
            $via = aim_nl_via_label($c, $lang);
            $link = !empty($c['url']) && aim_url_ok((string)$c['url']) ? (string)$c['url'] : '';
            $h .= '<li>' . aim_h($name) . ': ' . ($link !== '' ? '<a href="' . aim_h($link) . '" style="color:#9c5500">' . aim_h((string)($c['src'] ?? '') ?: aim_t('nl_source', $lang)) . '</a>' : aim_h((string)($c['src'] ?? ''))) . ($via !== '' ? ' · ' . aim_h($via) : '')
                . (!empty($c['id']) ? ' · <a href="' . aim_h($site . '#src-' . $c['id']) . '" style="color:#66635b">' . aim_h((string)$c['id']) . '</a>' : '') . '</li>';
            $T[] = '- ' . $name . ': ' . ($c['src'] ?? '') . ($link !== '' ? ' ' . $link : '') . ($via !== '' ? ' (' . $via . ')' : '');
        }
        $h .= '</ul><p style="font-size:13px;margin:6px 0 0"><a href="' . aim_h($site . '#sources') . '" style="color:#9c5500">' . aim_h(aim_t('nl_all_sources', $lang)) . '</a></p>';
        $T[] = aim_t('nl_all_sources', $lang) . ': ' . $site . '#sources';
    }
    // How the scenarios moved
    if (!empty($rel['moves'])) {
        $h .= aim_nl_h2(aim_t('nl_moves', $lang)); $T[] = ''; $T[] = '== ' . aim_t('nl_moves', $lang);
        $rows = [];
        $per = [];
        foreach ($rel['moves'] as $m) {
            if (count($rows) >= 6 || ($per[$m['metric']] ?? 0) >= 2) continue;
            $per[$m['metric']] = ($per[$m['metric']] ?? 0) + 1;
            $sn = aim_nl_scn($rel, $m['scenario'], $lang)[1];
            $mn = aim_metric_name($m['metric'], $lang, $m['metric']);
            $rows[] = [$sn . ' · ' . $mn, aim_fmt($m['metric'], $m['from'], $lang), aim_fmt($m['metric'], $m['to'], $lang)];
            $T[] = '- ' . $sn . ' · ' . $mn . ': ' . aim_fmt($m['metric'], $m['from'], $lang) . ' → ' . aim_fmt($m['metric'], $m['to'], $lang);
        }
        $h .= aim_nl_table([aim_t('nl_scenario', $lang) . ' · ' . aim_t('nl_measure', $lang), aim_t('nl_was', $lang), aim_t('nl_now', $lang)], $rows);
    }
    // X watch: posts the editor approved this week (signals, not data), matched to the reader's topics
    $xw = is_array($rel['xwatch'] ?? null) ? $rel['xwatch'] : [];
    if ($edition === 'monthly' && function_exists('aim_xwatch_since')) {   // the monthly edition covers the whole month
        $seen = array_column($xw, 'id');
        foreach (aim_xwatch_since(aim_now()->modify('-31 days')->format('c'), 30) as $x) if (!in_array($x['id'] ?? '', $seen, true)) $xw[] = $x;
    }
    $mine = array_values(array_diff($cats, ['summary', 'signals', 'method']));
    if ($mine) $xw = array_values(array_filter($xw, fn($x) => array_intersect($mine, is_array($x['topics'] ?? null) ? $x['topics'] : [])));
    $rankX = ['high' => 0, 'medium' => 1, 'low' => 2];
    usort($xw, fn($a, $b) => [($rankX[$a['impact'] ?? ''] ?? 3), ($rankX[$a['credibility'] ?? ''] ?? 3)] <=> [($rankX[$b['impact'] ?? ''] ?? 3), ($rankX[$b['credibility'] ?? ''] ?? 3)]);   // the most important first
    if ($xw) {
        $lvl = fn($v) => aim_t('nl_lvl_' . (in_array($v, ['high', 'medium', 'low', 'unverified'], true) ? $v : 'medium'), $lang);
        $h .= aim_nl_h2(aim_t('nl_xwatch', $lang)) . '<p style="color:#43413c;font-size:13px;margin:0 0 4px">' . aim_h(aim_t('nl_xwatch_note', $lang) . ($lang !== 'en' ? ' ' . aim_t('nl_in_english', $lang) : '')) . '</p><ul style="margin:0;padding-left:18px;color:#43413c;font-size:13px">';
        $T[] = ''; $T[] = '== ' . aim_t('nl_xwatch', $lang); $T[] = aim_t('nl_xwatch_note', $lang);
        foreach (array_slice($xw, 0, 4) as $x) {
            $posts = array_values(array_filter(is_array($x['posts'] ?? null) ? $x['posts'] : [], fn($p) => aim_url_ok((string)($p['url'] ?? ''))));
            $links = implode(' · ', array_map(fn($p) => '<a href="' . aim_h($p['url']) . '" style="color:#9c5500">@' . aim_h((string)($p['handle'] ?? '')) . '</a>', array_slice($posts, 0, 3)));
            $label = aim_t('nl_cred', $lang) . ' ' . $lvl($x['credibility'] ?? '') . ' · ' . aim_t('nl_impact', $lang) . ' ' . $lvl($x['impact'] ?? '');
            $h .= '<li style="margin:0 0 6px"><b>' . aim_h((string)($x['title'] ?? '')) . '</b> <span style="color:#66635b">(' . aim_h($label) . ')</span><br>' . aim_h((string)($x['summary'] ?? '')) . ($links !== '' ? ' ' . $links : '')
                . (!empty($x['id']) ? ' · <a href="' . aim_h($site . '#x-' . $x['id']) . '" style="color:#66635b">' . aim_h((string)$x['id']) . '</a>' : '') . '</li>';
            $T[] = '- ' . ($x['title'] ?? '') . ' (' . $label . '): ' . ($x['summary'] ?? '') . ' ' . implode(' ', array_map(fn($p) => $p['url'], array_slice($posts, 0, 3)));
        }
        $h .= '</ul>';
    }
    // Topic sections
    $catDefs = [];
    foreach (aim_categories() as $c) $catDefs[$c['id']] = $c;
    $H = $rel['headline'] ?? [];
    $hi = array_search('Q4 2030', $H['horizons'] ?? [], true);
    $metricName = function (string $k) use ($rel, $lang) { return aim_metric_name($k, $lang, aim_metric_en($k)); };
    foreach ($cats as $cid) {
        if ($cid === 'summary' || !isset($catDefs[$cid])) continue;
        $c = $catDefs[$cid];
        $label = $c['label'][$lang] ?? $c['label']['en'];
        $h .= aim_nl_h2($label); $T[] = ''; $T[] = '== ' . $label;
        if (!empty($c['metrics']) && $hi !== false) {
            $rows = [];
            foreach ($c['metrics'] as $k) {
                $vals = []; $today = null;
                foreach (($H['scenarios'] ?? []) as $sk => $mv) { if (!isset($mv[$k])) continue; $vals[$sk] = $mv[$k][$hi]; $today = $mv[$k][0]; }
                if (!$vals) continue;
                asort($vals);
                $lo = array_key_first($vals); $hiK = array_key_last($vals);
                $range = aim_fmt($k, $vals[$lo], $lang) . ' (' . aim_nl_scn($rel, $lo, $lang)[1] . ') … ' . aim_fmt($k, $vals[$hiK], $lang) . ' (' . aim_nl_scn($rel, $hiK, $lang)[1] . ')';
                $rows[] = [$metricName($k), aim_fmt($k, $today, $lang), $range];
                $T[] = '- ' . $metricName($k) . ': ' . aim_t('nl_today', $lang) . ' ' . aim_fmt($k, $today, $lang) . '; ' . aim_t('nl_range_head', $lang) . ': ' . $range;
            }
            if ($rows) $h .= aim_nl_table([aim_t('nl_measure', $lang), aim_t('nl_today', $lang), aim_t('nl_range_head', $lang)], $rows);
        }
        if (!empty($c['lens']) && isset($rel['sectors'][$c['lens']])) {
            $sec = $rel['sectors'][$c['lens']];
            $h .= '<p style="color:#43413c;font-size:13px;margin:6px 0 2px">' . aim_h(aim_t('nl_sector_intro', $lang)) . '</p>';
            $rows = [];
            foreach ($sec['rows'] as $row) {
                $sc = $row; unset($sc['name']);
                asort($sc);
                $lo = array_key_first($sc); $hiK = array_key_last($sc);
                $fmtS = fn($v) => ($v > 0 ? '+' : ($v < 0 ? '−' : '')) . abs((int)$v);
                $rowName = $lang === 'en' ? $row['name'] : (aim_cfg('i18n')['impactRows'][$row['name']][$lang] ?? $row['name']);
                $rows[] = [$rowName, $fmtS($sc['COMM'] ?? 0), $fmtS($sc[$lo]) . ' (' . aim_nl_scn($rel, $lo, $lang)[1] . ') … ' . $fmtS($sc[$hiK]) . ' (' . aim_nl_scn($rel, $hiK, $lang)[1] . ')'];
                $T[] = '- ' . $rowName . ': ' . aim_nl_scn($rel, 'COMM', $lang)[1] . ' ' . $fmtS($sc['COMM'] ?? 0);
            }
            $h .= aim_nl_table(['', aim_nl_scn($rel, 'COMM', $lang)[1], aim_t('nl_range', $lang)], $rows);
            $ev = $rel['evidence'][$c['lens']] ?? [];
            if ($ev) {
                $h .= '<p style="color:#43413c;font-size:13px;margin:8px 0 2px"><b>' . aim_h(aim_t('nl_evidence', $lang)) . '</b> ' . aim_h(aim_t('nl_in_english', $lang)) . '</p><ul style="margin:0;padding-left:18px;color:#43413c;font-size:13px">';
                foreach (array_slice($ev, 0, 5) as $e) $h .= '<li>' . aim_h($e['t']) . (!empty($e['url']) ? ' <a href="' . aim_h($e['url']) . '" style="color:#9c5500">' . aim_h($e['src'] ?? 'source') . '</a>' : '') . '</li>';
                $h .= '</ul>';
            }
        }
        if ($cid === 'signals') {
            $h .= '<p style="color:#43413c;font-size:13px;margin:6px 0 2px">' . aim_h(aim_t('nl_signals_intro', $lang)) . '</p>';
            $rows = [];
            foreach ($rel['signposts'] ?? [] as $sp) {
                $hits = [];
                foreach ($sp['first'] as $sk => $q) if ($q) $hits[] = aim_nl_scn($rel, $sk, $lang)[1] . ' ' . ($q === 'today' ? aim_t('nl_today_hit', $lang) : aim_quarter($q, $lang));
                $name = $lang === 'en' ? $sp['name'] : (aim_cfg('i18n')['signposts'][$sp['id']][$lang] ?? $sp['name']);
                $rows[] = [$name, ['<span style="white-space:normal">' . aim_h($hits ? implode(' · ', $hits) : aim_t('nl_never', $lang)) . '</span>']];
                $T[] = '- ' . $name . ': ' . ($hits ? implode(' · ', $hits) : aim_t('nl_never', $lang));
            }
            $h .= aim_nl_table([aim_t('nl_signal', $lang), aim_t('nl_first_hits', $lang)], $rows);
        }
        if ($cid === 'method') {
            $h .= '<p style="color:#43413c;font-size:13px;margin:6px 0 2px">' . aim_h(aim_t('nl_method_intro', $lang)) . '</p>';
            if (!$n) $h .= '<p style="color:#43413c">' . aim_h(aim_t('nl_no_changes', $lang)) . '</p>';
            else {
                $h .= '<ul style="margin:0;padding-left:18px;color:#43413c;font-size:13px">';
                foreach ($rel['changes'] as $ch) {
                    $h .= '<li><b>' . aim_h(aim_metric_name((string)($ch['metric'] ?? ''), $lang, (string)($ch['name'] ?? ''))) . '</b>: ' . aim_h(($ch['toText'] ?? '') . ' · ' . ($ch['status'] ?? '') . ' · ' . ($ch['period'] ?? '')) . (!empty($ch['url']) ? ' · <a href="' . aim_h($ch['url']) . '" style="color:#9c5500">' . aim_h($ch['src'] ?: aim_t('nl_source', $lang)) . '</a>' : ' · ' . aim_h($ch['src'] ?? '')) . '</li>';
                    $T[] = '- ' . ($ch['name'] ?? '') . ': ' . ($ch['toText'] ?? '') . ' (' . ($ch['status'] ?? '') . ', ' . ($ch['period'] ?? '') . ') ' . ($ch['url'] ?? '');
                }
                $h .= '</ul>';
            }
        }
    }
    if ($edition === 'monthly') {
        $month = aim_now()->modify('-31 days');
        $list = array_filter(aim_releases_index()['releases'], fn($e) => strtotime($e['publishedAt']) >= $month->getTimestamp());
        if (count($list) > 1) {
            $h .= aim_nl_h2(aim_t('nl_month_list', $lang)); $T[] = ''; $T[] = '== ' . aim_t('nl_month_list', $lang);
            $h .= '<ul style="margin:0;padding-left:18px;color:#43413c;font-size:13px">';
            foreach ($list as $e) { $h .= '<li><a href="' . aim_h($site . 'data/releases/' . $e['id'] . '/') . '" style="color:#9c5500">' . aim_h($e['id']) . '</a>: ' . aim_h($e['summary']) . '</li>'; $T[] = '- ' . $e['id'] . ': ' . $e['summary']; }
            $h .= '</ul>';
        }
    }
    $foot = '<p style="margin:22px 0 4px;color:#66635b;font-size:12px">' . aim_h(aim_t('nl_why', $lang)) . ' <a href="{{PREFS}}" style="color:#66635b">' . aim_h(aim_t('nl_prefs', $lang)) . '</a> · <a href="{{UNSUB}}" style="color:#66635b">' . aim_h(aim_t('nl_unsub', $lang)) . '</a></p>'
        . '<p style="margin:0 0 4px;color:#66635b;font-size:12px">' . aim_h(aim_t('nl_disclaimer', $lang)) . ' ' . aim_h(aim_t('nl_ai_note', $lang)) . '</p>'
        . '<p style="margin:0;color:#8a877e;font-size:11px">Autodesk is a registered trademark of Autodesk, Inc. All other names are trademarks of their respective holders. No affiliation or endorsement is implied.</p>';
    $contact = implode(' · ', array_filter([$s['site']['company'], $s['site']['email'], $s['site']['phone']], fn($v) => $v !== ''));
    if ($contact !== '') $foot .= '<p style="margin:8px 0 0;color:#66635b;font-size:12px">' . aim_h($contact) . '</p>';
    $T[] = ''; $T[] = aim_t('nl_why', $lang); $T[] = aim_t('nl_prefs', $lang) . ': {{PREFS}}'; $T[] = aim_t('nl_unsub', $lang) . ': {{UNSUB}}'; $T[] = aim_t('nl_disclaimer', $lang);
    if ($contact !== '') $T[] = $contact;
    return [$subject, aim_email_shell($lang, $h . $foot, $intro), implode("\n", $T) . "\n"];
}
/** Short note on how a changed value entered the data (official interface, AI research reviewed by the team, …). */
function aim_nl_via_label(array $c, string $lang): string
{
    $via = is_array($c['via'] ?? null) ? $c['via'] : [];
    $type = (string)($via['type'] ?? '');
    $key = ['api' => 'nl_via_api', 'ai' => 'nl_via_ai', 'ai-knowledge' => 'nl_via_aik', 'manual' => 'nl_via_manual', 'desk' => 'nl_via_desk'][$type] ?? '';
    if ($key === '') return '';
    $out = aim_t($key, $lang);
    $p = is_array($via['panel'] ?? null) ? $via['panel'] : null;
    if ($p && in_array($type, ['ai', 'ai-knowledge'], true)) {
        $out = aim_t('nl_via_panel', $lang, ['n' => (int)($p['answered'] ?? 0), 'm' => (int)($p['asked'] ?? 0)]);
        if (preg_match('/value/', (string)($via['edited'] ?? ''))) $out .= ' · ' . aim_t('nl_edited', $lang);
        if ($type === 'ai-knowledge') $out .= ' · ' . aim_t('nl_via_aik', $lang);
        $nums = array_filter(is_array($p['members'] ?? null) ? $p['members'] : [], fn($m) => is_array($m) && array_key_exists('agrees', $m));
        if (count($nums) > 1) $out .= ', ' . aim_t('nl_panel_agree', $lang, ['a' => count(array_filter($nums, fn($m) => !empty($m['agrees']))), 'b' => count($nums)]);
        return $out;
    }
    if (!empty($via['model']) && $type === 'ai-knowledge') $out .= ' (' . $via['model'] . ')';
    if (in_array($type, ['ai', 'ai-knowledge'], true) && is_array($via['check'] ?? null) && array_key_exists('agree', $via['check'])) $out .= ', ' . aim_t(!empty($via['check']['agree']) ? 'nl_check_agree' : 'nl_check_disagree', $lang);
    return $out;
}
function aim_metric_en(string $k): string
{
    static $m = null;
    if ($m === null) { $j = aim_read_json(aim_public('data/latest/metrics.json'), []); $m = []; foreach (($j['metrics'] ?? []) as $kk => $v) $m[$kk] = $v['name']; }
    return $m[$k] ?? $k;
}
/** Send the latest release to the test addresses (admin page). */
function aim_nl_test(array $emails, string $lang, array $cats, string $edition = 'weekly'): array
{
    $rel = aim_latest_release();
    if (!$rel) return ['ok' => false, 'error' => 'No release yet.'];
    [$subj, $html, $text] = aim_nl_compose($rel, aim_lang($lang), aim_clean_categories($cats), $edition, true);
    $msgs = [];
    foreach ($emails as $e) {
        $e = trim($e); if (!aim_valid_email($e)) continue;
        $p = aim_prefs_url($e); $u = aim_unsub_url($e);
        $msgs[] = aim_mj_message($e, '', $subj, str_replace(['{{PREFS}}', '{{UNSUB}}'], [aim_h($p), aim_h($u)], $html), str_replace(['{{PREFS}}', '{{UNSUB}}'], [$p, $u], $text), ['CustomCampaign' => 'aimonitor-test']);
    }
    if (!$msgs) return ['ok' => false, 'error' => 'No valid test address.'];
    $r = aim_mj_send($msgs);
    return ['ok' => $r['ok'] > 0, 'sent' => $r['ok'], 'error' => $r['error'] ?? ($r['failed'][0][1] ?? null)];
}
/** HTML preview for the admin page. */
function aim_nl_preview(string $lang, array $cats, string $edition = 'weekly'): string
{
    $rel = aim_latest_release();
    if (!$rel) return '<p>No release yet.</p>';
    [$subj, $html] = aim_nl_compose($rel, aim_lang($lang), aim_clean_categories($cats), $edition, true);
    return str_replace(['{{PREFS}}', '{{UNSUB}}'], ['#', '#'], $html);
}
