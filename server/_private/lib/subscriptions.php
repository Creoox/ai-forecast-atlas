<?php
/* AI Forecast Atlas — newsletter sign-up with double opt-in, preferences and one-click unsubscribe.
   Contacts live in the Mailjet list; this server keeps only a consent log. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_categories(): array { return aim_cfg('newsletter')['categories'] ?? []; }
function aim_clean_categories($cats): array
{
    $valid = array_column(aim_categories(), 'id');
    $out = ['summary'];
    foreach ((array)$cats as $c) { $c = (string)$c; if (in_array($c, $valid, true) && !in_array($c, $out, true)) $out[] = $c; }
    return $out;
}
function aim_clean_freq($f): string { return in_array($f, ['weekly', 'monthly'], true) ? $f : 'weekly'; }
function aim_valid_email(string $e): bool { return strlen($e) <= 254 && filter_var($e, FILTER_VALIDATE_EMAIL) !== false; }
function aim_member_token(string $email): string { return aim_sign(['k' => 'm', 'e' => strtolower($email)]); }
function aim_site_url(string $path = ''): string { return rtrim(aim_settings()['site']['url'], '/') . '/' . ltrim($path, '/'); }
function aim_prefs_url(string $email): string { return aim_site_url('api/prefs.php?t=' . rawurlencode(aim_member_token($email))); }
function aim_unsub_url(string $email): string { return aim_site_url('api/unsub.php?t=' . rawurlencode(aim_member_token($email))); }
function aim_consent_log(string $email, string $action, array $extra = []): void
{
    aim_store_append('consent/' . aim_now()->format('Y'), ['t' => aim_iso(), 'e' => strtolower($email), 'a' => $action, 'v' => AIM_CONSENT_VERSION, 'ip' => aim_ip_hash()] + $extra);
}
/* Local suppression list: an unsubscribe is honoured here even if the Mailjet call fails. */
function aim_suppress_key(string $email): string { return substr(hash_hmac('sha256', strtolower(trim($email)), aim_secret()), 0, 24); }
function aim_suppress(string $email, bool $on): void
{
    aim_store_update('suppress', function ($s) use ($email, $on) { $s = is_array($s) ? $s : []; $k = aim_suppress_key($email); if ($on) $s[$k] = gmdate('c'); else unset($s[$k]); return $s; });
}
function aim_suppressed_set(): array { return aim_store_read('suppress', []) ?: []; }
function aim_cat_labels(array $cats, string $lang): array
{
    $out = [];
    foreach (aim_categories() as $c) if (in_array($c['id'], $cats, true)) $out[] = $c['label'][$lang] ?? $c['label']['en'];
    return $out;
}

/* ---------- emails ---------- */
function aim_email_shell(string $lang, string $inner, string $preheader = ''): string
{
    $s = aim_settings();
    $addr = trim($s['site']['company'] . ($s['site']['address'] !== '' ? ', ' . preg_replace('/\s*\n\s*/', ', ', trim($s['site']['address'])) : ''));
    return '<!doctype html><html lang="' . aim_h($lang) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>AI Forecast Atlas</title></head>'
        . '<body style="margin:0;background:#f3f2ed;color:#17171a;font:15px/1.55 Arial,Helvetica,sans-serif">'
        . ($preheader !== '' ? '<div style="display:none;max-height:0;overflow:hidden">' . aim_h($preheader) . '</div>' : '')
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2ed"><tr><td align="center" style="padding:20px 12px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #dfdcd2">'
        . '<tr><td style="padding:16px 22px;border-bottom:3px solid #9c5500"><span style="background:#9c5500;color:#ffffff;font:700 12px/1 Menlo,Consolas,monospace;padding:4px 6px;letter-spacing:.06em">AICX</span> <b style="font-size:16px;letter-spacing:.02em">AI Forecast Atlas</b> <span style="color:#66635b;font-size:12px">' . aim_h(aim_t('by', $lang)) . '</span></td></tr>'
        . '<tr><td style="padding:18px 22px 8px">' . $inner . '</td></tr>'
        . '<tr><td style="padding:12px 22px 18px;color:#66635b;font-size:12px;border-top:1px solid #dfdcd2">' . aim_h($addr) . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}
function aim_send_confirmation(string $email, string $name, string $lang, string $freq, array $cats): array
{
    $tok = aim_sign(['k' => 'c', 'e' => strtolower($email), 'n' => $name, 'l' => $lang, 'f' => $freq, 'c' => $cats], 7 * 86400);
    $url = aim_site_url('api/confirm.php?t=' . rawurlencode($tok));
    $topics = implode(', ', aim_cat_labels($cats, $lang));
    $inner = '<h1 style="font-size:20px;margin:0 0 10px">' . aim_h(aim_t('page_confirm_title', $lang)) . '</h1>'
        . '<p style="margin:0 0 14px;color:#43413c">' . aim_h(aim_t('confirm_intro', $lang)) . '</p>'
        . '<p style="margin:0 0 16px"><a href="' . aim_h($url) . '" style="display:inline-block;background:#9c5500;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:2px;font-weight:bold">' . aim_h(aim_t('confirm_button', $lang)) . '</a></p>'
        . '<p style="margin:0 0 6px;color:#43413c;font-size:13px"><b>' . aim_h(aim_t('your_topics', $lang)) . ':</b> ' . aim_h($topics) . '</p>'
        . '<p style="margin:0 0 6px;color:#66635b;font-size:12.5px">' . aim_h(aim_t('confirm_ignore', $lang)) . '</p>';
    $text = aim_t('confirm_intro', $lang) . "\n\n" . aim_t('confirm_button', $lang) . ":\n" . $url . "\n\n" . aim_t('your_topics', $lang) . ': ' . $topics . "\n\n" . aim_t('confirm_ignore', $lang) . "\n";
    $msg = aim_mj_message($email, $name, aim_t('confirm_subject', $lang), aim_email_shell($lang, $inner, aim_t('confirm_subject', $lang)), $text, ['CustomCampaign' => 'aimonitor-confirm']);
    return aim_mj_send([$msg]);
}

/* ---------- endpoints ---------- */
function aim_handle_subscribe(): void
{
    if (aim_method() !== 'POST') { aim_error('method', 'Use POST.', 405); return; }
    $s = aim_settings();
    $in = aim_input_json(20000);
    if (aim_str($in['website'] ?? '', 200) !== '') { aim_json_out(['ok' => true]); return; }   // honeypot: pretend success
    if (empty($s['newsletter']['enabled']) || !aim_mj_list_ready()) { aim_error('disabled', 'The newsletter is not open yet. Please check back soon.', 503); return; }
    $email = strtolower(aim_str($in['email'] ?? '', 254));
    if (!aim_valid_email($email)) { aim_error('email', 'Please enter a valid email address.', 400); return; }
    if (empty($in['consent'])) { aim_error('consent', 'Please tick the consent box.', 400); return; }
    $who = aim_ip_hash();
    if (!aim_rate_ok('sub-ip', $who, 6, 3600) || !aim_rate_ok('sub-mail', substr(hash('sha256', $email), 0, 20), 3, 86400)) { aim_error('rate_limited', 'Too many sign-up attempts. Please try again later.', 429); return; }
    if (aim_turnstile_enabled() && !aim_turnstile_verify((string)($in['turnstile'] ?? ''))) { aim_error('turnstile', 'Please complete the check and try again.', 403); return; }
    $lang = aim_lang($in['lang'] ?? 'en');
    $r = aim_send_confirmation($email, aim_line($in['name'] ?? '', 80), $lang, aim_clean_freq($in['frequency'] ?? 'weekly'), aim_clean_categories($in['categories'] ?? []));
    if ($r['ok'] < 1) { aim_log('newsletter', 'confirmation not sent', ['error' => $r['error'] ?? ($r['failed'][0][1] ?? '')]); aim_error('send', 'We could not send the confirmation email. Please try again later.', 502); return; }
    aim_json_out(['ok' => true]);
}
function aim_handle_confirm(): void
{
    $tok = (string)($_GET['t'] ?? $_POST['t'] ?? '');
    $d = aim_verify($tok, 'c');
    $lang = aim_lang($d['l'] ?? ($_GET['l'] ?? 'en'));
    if (!$d || !aim_valid_email((string)($d['e'] ?? ''))) { aim_page(aim_t('page_invalid_title', $lang), '<h1>' . aim_h(aim_t('page_invalid_title', $lang)) . '</h1><p>' . aim_h(aim_t('page_invalid_text', $lang)) . '</p>', $lang, 400); return; }
    if (aim_method() !== 'POST') {
        $body = '<h1>' . aim_h(aim_t('page_confirm_title', $lang)) . '</h1><p>' . aim_h(aim_t('page_confirm_text', $lang)) . ' <b>' . aim_h($d['e']) . '</b>.</p>'
            . '<p class="note">' . aim_h(aim_t('your_topics', $lang)) . ': ' . aim_h(implode(', ', aim_cat_labels($d['c'] ?? ['summary'], $lang))) . '</p>'
            . '<form method="post" action="confirm.php"><input type="hidden" name="t" value="' . aim_h($tok) . '"><button class="btn" type="submit">' . aim_h(aim_t('confirm_button', $lang)) . '</button></form>';
        aim_page(aim_t('page_confirm_title', $lang), $body, $lang);
        return;
    }
    $props = ['aim_lang' => $lang, 'aim_freq' => aim_clean_freq($d['f'] ?? 'weekly'), 'aim_cats' => implode(',', aim_clean_categories($d['c'] ?? [])), 'aim_consent_at' => gmdate('Y-m-d\TH:i:s\Z'), 'aim_consent_ver' => AIM_CONSENT_VERSION, 'aim_source' => 'web'];
    $r = aim_mj_manage($d['e'], aim_line($d['n'] ?? '', 80), 'addforce', $props);
    if (!$r['ok']) {   // usually the subscriber fields do not exist yet in Mailjet: create them and try once more
        $p = aim_mj_ensure_properties();
        if (!empty($p['ok'])) $r = aim_mj_manage($d['e'], aim_line($d['n'] ?? '', 80), 'addforce', $props);
    }
    if (!$r['ok']) { aim_log('newsletter', 'subscribe failed', ['error' => $r['error']]); aim_page('AI Forecast Atlas', '<h1>AI Forecast Atlas</h1><p class="err">' . aim_h(aim_t('page_error_text', $lang)) . '</p>', $lang, 502); return; }
    aim_consent_log($d['e'], 'subscribe', ['f' => $props['aim_freq'], 'c' => $props['aim_cats'], 'l' => $lang]);
    aim_suppress($d['e'], false);
    $body = '<h1>' . aim_h(aim_t('page_subscribed_title', $lang)) . '</h1><p class="ok">' . aim_h(aim_t('page_subscribed_text', $lang)) . '</p>'
        . '<p><a class="btn ghost" href="' . aim_h(aim_prefs_url($d['e'])) . '">' . aim_h(aim_t('nl_prefs', $lang)) . '</a></p>';
    aim_page(aim_t('page_subscribed_title', $lang), $body, $lang);
}
function aim_prefs_form(string $tok, string $email, array $props, string $lang, string $msg = ''): string
{
    $cats = array_filter(explode(',', (string)($props['aim_cats'] ?? 'summary')));
    $freq = aim_clean_freq($props['aim_freq'] ?? 'weekly');
    $h = '<h1>' . aim_h(aim_t('prefs_title', $lang)) . '</h1><p class="note">' . aim_h($email) . '</p>' . $msg
        . '<form method="post" action="prefs.php"><input type="hidden" name="t" value="' . aim_h($tok) . '">'
        . '<h2>' . aim_h(aim_t('prefs_lang', $lang)) . '</h2><select name="lang">';
    foreach (aim_cfg('newsletter')['languages'] ?? [] as $L) $h .= '<option value="' . aim_h($L['id']) . '"' . ($L['id'] === $lang ? ' selected' : '') . '>' . aim_h($L['name']) . '</option>';
    $h .= '</select><h2>' . aim_h(aim_t('prefs_freq', $lang)) . '</h2>';
    foreach (aim_cfg('newsletter')['frequencies'] ?? [] as $F) $h .= '<label><input type="radio" name="frequency" value="' . aim_h($F['id']) . '"' . ($F['id'] === $freq ? ' checked' : '') . '> ' . aim_h($F['label'][$lang] ?? $F['label']['en']) . '</label>';
    $h .= '<h2>' . aim_h(aim_t('your_topics', $lang)) . '</h2><div class="grid">';
    foreach (aim_categories() as $c) {
        $on = !empty($c['always']) || in_array($c['id'], $cats, true);
        $h .= '<label title="' . aim_h($c['desc'][$lang] ?? $c['desc']['en'] ?? '') . '"><input type="checkbox" name="cats[]" value="' . aim_h($c['id']) . '"' . ($on ? ' checked' : '') . (!empty($c['always']) ? ' disabled' : '') . '> ' . aim_h($c['label'][$lang] ?? $c['label']['en']) . '</label>';
    }
    $h .= '</div><p><button class="btn" type="submit">' . aim_h(aim_t('prefs_save', $lang)) . '</button></p></form>'
        . '<p class="note"><a href="unsub.php?t=' . aim_h(rawurlencode($tok)) . '">' . aim_h(aim_t('nl_unsub', $lang)) . '</a></p>';
    return $h;
}
function aim_handle_prefs(): void
{
    $tok = (string)($_GET['t'] ?? $_POST['t'] ?? '');
    $d = aim_verify($tok, 'm');
    $lang = aim_lang($_POST['lang'] ?? ($_GET['l'] ?? 'en'));
    if (!$d) { aim_page(aim_t('page_invalid_title', $lang), '<h1>' . aim_h(aim_t('page_invalid_title', $lang)) . '</h1><p>' . aim_h(aim_t('page_invalid_text', $lang)) . '</p>', $lang, 400); return; }
    $email = (string)$d['e'];
    if (aim_method() === 'POST') {
        $props = ['aim_lang' => $lang, 'aim_freq' => aim_clean_freq($_POST['frequency'] ?? 'weekly'), 'aim_cats' => implode(',', aim_clean_categories($_POST['cats'] ?? []))];
        $r = aim_mj_manage($email, '', 'addnoforce', $props);
        aim_consent_log($email, 'preferences', ['f' => $props['aim_freq'], 'c' => $props['aim_cats'], 'l' => $lang]);
        $msg = $r['ok'] ? '<p class="ok">' . aim_h(aim_t('prefs_saved', $lang)) . '</p>' : '<p class="err">' . aim_h(aim_t('page_error_text', $lang)) . '</p>';
        aim_page(aim_t('prefs_title', $lang), aim_prefs_form($tok, $email, $props, $lang, $msg), $lang);
        return;
    }
    $c = aim_mj_list_ready() ? aim_mj_contact($email) : null;
    if ($c === null) {   // never show defaults that would overwrite the subscriber's real choices
        aim_page(aim_t('prefs_title', $lang), '<h1>' . aim_h(aim_t('prefs_title', $lang)) . '</h1><p class="err">' . aim_h(aim_t('prefs_unavailable', $lang)) . '</p><p class="note"><a href="unsub.php?t=' . aim_h(rawurlencode($tok)) . '">' . aim_h(aim_t('nl_unsub', $lang)) . '</a></p>', $lang, 503);
        return;
    }
    $props = $c['props'] ?? [];
    $lang = aim_lang($props['aim_lang'] ?? $lang);
    aim_page(aim_t('prefs_title', $lang), aim_prefs_form($tok, $email, $props, $lang), $lang);
}
function aim_handle_unsub(): void
{
    $tok = (string)($_GET['t'] ?? $_POST['t'] ?? '');
    $d = aim_verify($tok, 'm');
    $lang = aim_lang($_GET['l'] ?? 'en');
    if (!$d) { aim_page(aim_t('page_invalid_title', $lang), '<h1>' . aim_h(aim_t('page_invalid_title', $lang)) . '</h1><p>' . aim_h(aim_t('page_invalid_text', $lang)) . '</p>', $lang, 400); return; }
    $email = (string)$d['e'];
    if (aim_method() === 'POST') {
        $r = aim_mj_list_ready() ? aim_mj_manage($email, '', 'unsub') : ['ok' => false, 'error' => 'not configured'];
        aim_consent_log($email, 'unsubscribe', ['oneclick' => isset($_POST['List-Unsubscribe']) ? 1 : 0]);
        aim_suppress($email, true);
        if (!$r['ok']) aim_log('newsletter', 'unsubscribe failed — retried by cron', ['error' => $r['error']]);
        if (!$r['ok']) aim_store_append('unsub-retry', ['e' => $email, 't' => aim_iso()]);
        aim_page(aim_t('unsub_title', $lang), '<h1>' . aim_h(aim_t('unsub_title', $lang)) . '</h1><p class="ok">' . aim_h(aim_t('unsub_done', $lang)) . '</p>', $lang);
        return;
    }
    $body = '<h1>' . aim_h(aim_t('unsub_title', $lang)) . '</h1><p>' . aim_h(aim_t('unsub_text', $lang)) . ' <b>' . aim_h($email) . '</b>?</p>'
        . '<form method="post" action="unsub.php"><input type="hidden" name="t" value="' . aim_h($tok) . '"><button class="btn" type="submit">' . aim_h(aim_t('unsub_button', $lang)) . '</button></form>'
        . '<p class="note"><a href="prefs.php?t=' . aim_h(rawurlencode($tok)) . '">' . aim_h(aim_t('or_change', $lang)) . '</a></p>';
    aim_page(aim_t('unsub_title', $lang), $body, $lang);
}
