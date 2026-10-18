<?php
/* AI Forecast Atlas — signed tokens, rate limits, Turnstile, admin login and CSRF. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_secret(): string
{
    $s = aim_settings();
    if (strlen((string)$s['secret']) < 32) $s = aim_ensure_secrets();
    return (string)$s['secret'];
}
/** Signed, tamper-proof token: base64url(json) . "." . base64url(hmac). $ttl seconds (0 = no expiry). */
function aim_sign(array $payload, int $ttl = 0): string
{
    if ($ttl > 0) $payload['x'] = time() + $ttl;
    $body = aim_b64u_enc(aim_json_encode($payload));
    return $body . '.' . aim_b64u_enc(hash_hmac('sha256', $body, aim_secret(), true));
}
function aim_verify(string $token, ?string $kind = null): ?array
{
    $p = strpos($token, '.');
    if ($p === false || strlen($token) > 4000) return null;
    $body = substr($token, 0, $p);
    $sig = aim_b64u_dec(substr($token, $p + 1));
    if (!hash_equals(hash_hmac('sha256', $body, aim_secret(), true), $sig)) return null;
    $data = json_decode(aim_b64u_dec($body), true);
    if (!is_array($data)) return null;
    if (isset($data['x']) && time() > (int)$data['x']) return null;
    if ($kind !== null && ($data['k'] ?? '') !== $kind) return null;
    return $data;
}
/** Visitor IP as a keyed hash that changes every month (never stored in clear). */
function aim_ip_hash(?string $ip = null): string
{
    return substr(hash_hmac('sha256', ($ip ?? aim_client_ip()) . '|' . gmdate('Y-m'), aim_secret()), 0, 20);
}
/** Fixed-window counter. Returns true if this hit is allowed. */
function aim_rate_ok(string $bucket, string $who, int $limit, int $window): bool
{
    if ($limit <= 0) return true;
    $slot = intdiv(time(), $window);
    $rel = 'rl/' . preg_replace('/[^a-z0-9_-]/i', '', $bucket) . '-' . $window . '-' . $slot;
    $allowed = true;
    aim_store_update($rel, function ($c) use ($who, $limit, &$allowed) {
        $c = is_array($c) ? $c : [];
        $n = (int)($c[$who] ?? 0);
        if ($n >= $limit) { $allowed = false; return $c; }
        $c[$who] = $n + 1;
        return $c;
    });
    return $allowed;
}
function aim_turnstile_enabled(): bool
{
    $s = aim_settings();
    return $s['turnstile']['site_key'] !== '' && $s['turnstile']['secret'] !== '';
}
function aim_turnstile_verify(string $token): bool
{
    if (!aim_turnstile_enabled()) return true;
    if ($token === '' || strlen($token) > 2048) return false;
    $s = aim_settings();
    $r = aim_http('POST', rtrim($s['sources']['bases']['turnstile'], '/') . '/turnstile/v0/siteverify', ['form' => ['secret' => $s['turnstile']['secret'], 'response' => $token, 'remoteip' => aim_client_ip()], 'timeout' => 10]);
    return is_array($r['json']) && !empty($r['json']['success']);
}
/** Visitor session for chat and feedback after one Turnstile check (1 hour, bound to the IP hash). */
function aim_visitor_session_ok(string $session): bool
{
    $d = $session !== '' ? aim_verify($session, 'v') : null;
    return $d !== null && ($d['ip'] ?? '') === aim_ip_hash();
}
function aim_visitor_session_new(): string { return aim_sign(['k' => 'v', 'ip' => aim_ip_hash()], 3600); }
/** Check bot protection for an API request. Returns [ok, newSessionOrEmpty]. */
function aim_bot_check(array $in): array
{
    if (!aim_turnstile_enabled()) return [true, ''];
    $sess = (string)($in['session'] ?? '');
    if (aim_visitor_session_ok($sess)) return [true, ''];
    if (aim_turnstile_verify((string)($in['turnstile'] ?? ''))) return [true, aim_visitor_session_new()];
    return [false, ''];
}

/* ---------- admin login: password hash in its own guarded file, signed cookie, CSRF header ---------- */
function aim_admin_record(): array { return aim_store_read('admin', []) ?: []; }
function aim_admin_has_password(): bool { $a = aim_admin_record(); return !empty($a['hash']); }
function aim_admin_set_password(string $pw): void
{
    aim_store_write('admin', ['hash' => password_hash($pw, PASSWORD_DEFAULT), 'changed' => aim_iso(), 'v' => aim_rand(4)]);
}
function aim_setup_key(): string
{
    $rel = 'setup-key';
    $f = aim_store_path($rel);
    if (is_file($f)) {
        $lines = file($f, FILE_IGNORE_NEW_LINES) ?: [];
        $k = trim((string)end($lines));
        if (strlen($k) >= 20) return $k;
    }
    $k = implode('-', str_split(aim_rand(12), 6));
    aim_write($f, AIM_GUARD . "AI Forecast Atlas setup key. Copy the line below into the setup page, then this file is deleted automatically.\n" . $k . "\n", 0600);
    return $k;
}
function aim_setup_key_check(string $given): bool
{
    $f = aim_store_path('setup-key');
    if (!is_file($f)) return false;
    return hash_equals(aim_setup_key(), trim($given));
}
function aim_setup_done(): void { @unlink(aim_store_path('setup-key')); }
const AIM_ADMIN_COOKIE = 'aim_admin';
function aim_cookie_secure(): bool { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'); }
function aim_admin_login(string $pw): bool
{
    $a = aim_admin_record();
    if (empty($a['hash']) || !password_verify($pw, $a['hash'])) return false;
    $tok = aim_sign(['k' => 'admin', 'v' => $a['v'] ?? ''], 12 * 3600);
    setcookie(AIM_ADMIN_COOKIE, $tok, ['expires' => time() + 12 * 3600, 'path' => '/', 'secure' => aim_cookie_secure(), 'httponly' => true, 'samesite' => 'Strict']);
    $_COOKIE[AIM_ADMIN_COOKIE] = $tok;
    return true;
}
function aim_admin_logout(): void
{
    setcookie(AIM_ADMIN_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'secure' => aim_cookie_secure(), 'httponly' => true, 'samesite' => 'Strict']);
}
function aim_admin_ok(): bool
{
    $tok = (string)($_COOKIE[AIM_ADMIN_COOKIE] ?? '');
    $d = $tok !== '' ? aim_verify($tok, 'admin') : null;
    if (!$d) return false;
    $a = aim_admin_record();
    return ($d['v'] ?? '') === ($a['v'] ?? '');
}
/**
 * The admin works only on the site's own address (Settings → Site), so its login cookie is never set for another
 * host that serves the same folder (for example creoox.com/aimonitor/ or the server's technical address).
 * First-run setup works from any address.
 */
function aim_admin_host_ok(): bool
{
    if (aim_is_cli() || !aim_admin_has_password()) return true;
    $u = parse_url((string)aim_settings()['site']['url']);
    $want = strtolower(($u['host'] ?? '') . (isset($u['port']) ? ':' . $u['port'] : ''));
    $have = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($want === '' || $have === '') return true;
    $strip = fn(string $h) => (string)preg_replace('/:(80|443)$/', '', $h);
    return $strip($have) === $strip($want);
}
function aim_csrf(): string { return hash_hmac('sha256', 'csrf|' . ($_COOKIE[AIM_ADMIN_COOKIE] ?? ''), aim_secret()); }
function aim_csrf_ok(): bool
{
    $h = (string)($_SERVER['HTTP_X_AIM_CSRF'] ?? '');
    return $h !== '' && hash_equals(aim_csrf(), $h);
}
