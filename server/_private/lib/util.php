<?php
/* AI Forecast Atlas — shared helpers (files, JSON, time, responses). PHP 8.0+.
   Copyright (C) 2026 Creoox AG. Licence: Business Source License 1.1 (see LICENSE). */

const AIM_VERSION = '1.2.0';
const AIM_TZ = 'Europe/Zurich';

/* mbstring is usual but not guaranteed on shared hosting: minimal UTF-8 fallbacks */
if (!function_exists('mb_substr')) {
    function mb_substr($s, $start, $len = null, $enc = null) { $a = preg_split('//u', (string)$s, -1, PREG_SPLIT_NO_EMPTY) ?: []; return implode('', array_slice($a, $start, $len)); }
}
if (!function_exists('mb_strlen')) {
    function mb_strlen($s, $enc = null) { return (int)preg_match_all('/./us', (string)$s); }
}
if (!function_exists('mb_strtolower')) {
    function mb_strtolower($s, $enc = null) { return strtolower((string)$s); }
}

/** Private folder (code, settings, storage). */
function aim_storage(string $rel = ''): string
{
    $base = AIM_PRIVATE . '/storage';
    return $rel === '' ? $base : $base . '/' . ltrim($rel, '/');
}
/** Web root of the site (where index.html lives). */
function aim_public(string $rel = ''): string
{
    $base = defined('AIM_ROOT') ? AIM_ROOT : dirname(AIM_PRIVATE);
    return $rel === '' ? $base : $base . '/' . ltrim($rel, '/');
}
/* Private data is stored as PHP files that stop at once if anyone requests them over the web,
   so nothing leaks even where the server ignores the folder's .htaccess protection. */
const AIM_GUARD = "<?php http_response_code(404); exit; ?>\n";
function aim_store_path(string $rel): string { return aim_storage($rel . '.php'); }
function aim_store_read(string $rel, $default = null)
{
    $f = aim_store_path($rel);
    if (!is_file($f)) return $default;
    $raw = @file_get_contents($f);
    if ($raw === false) return $default;
    if (str_starts_with($raw, AIM_GUARD)) $raw = substr($raw, strlen(AIM_GUARD));
    $v = json_decode($raw, true);
    return $v === null ? $default : $v;
}
function aim_store_write(string $rel, $data): void
{
    $json = aim_json_encode($data);
    if (!is_string($json)) throw new RuntimeException('Cannot encode ' . $rel . ': ' . json_last_error_msg());   // never replace a file with nothing
    aim_write(aim_store_path($rel), AIM_GUARD . $json . "\n", 0600);
}
function aim_store_update(string $rel, callable $fn, $default = [])
{
    return aim_with_lock('store_' . md5($rel), function () use ($rel, $fn, $default) {
        $next = $fn(aim_store_read($rel, $default));
        aim_store_write($rel, $next);
        return $next;
    });
}
/** Append one JSON line to a guarded log-style file (feedback, events). */
function aim_store_append(string $rel, array $row): void
{
    $f = aim_store_path($rel);
    aim_mkdir(dirname($f));
    aim_with_lock('append_' . md5($rel), function () use ($f, $row) {
        if (!is_file($f)) { @file_put_contents($f, AIM_GUARD, LOCK_EX); @chmod($f, 0600); }
        @file_put_contents($f, aim_json_encode($row) . "\n", FILE_APPEND | LOCK_EX);
    });
}
function aim_store_lines(string $rel): array
{
    $f = aim_store_path($rel);
    if (!is_file($f)) return [];
    $out = [];
    foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $i => $line) {
        if ($i === 0 && str_starts_with($line, '<?php')) continue;
        $v = json_decode($line, true);
        if (is_array($v)) $out[] = $v;
    }
    return $out;
}
function aim_mkdir(string $dir): void
{
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        throw new RuntimeException('Cannot create folder: ' . $dir);
    }
}
/** Write a file atomically (temp file + rename) so readers never see half a file. */
function aim_write(string $path, string $data, int $mode = 0644): void
{
    aim_mkdir(dirname($path));
    $tmp = $path . '.tmp' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $data, LOCK_EX) === false) {
        throw new RuntimeException('Cannot write: ' . $path);
    }
    @chmod($tmp, $mode);
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        throw new RuntimeException('Cannot replace: ' . $path);
    }
}
function aim_read_json(string $path, $default = null)
{
    if (!is_file($path)) return $default;
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') return $default;
    $v = json_decode($raw, true);
    return $v === null && trim($raw) !== 'null' ? $default : $v;
}
function aim_write_json(string $path, $data, bool $pretty = false): void
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;
    if ($pretty) $flags |= JSON_PRETTY_PRINT;
    $json = json_encode($data, $flags);
    if (!is_string($json)) throw new RuntimeException('Cannot encode ' . basename($path) . ': ' . json_last_error_msg());
    aim_write($path, $json . "\n");
}
function aim_json_encode($data, bool $pretty = false): string
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION;
    if ($pretty) $flags |= JSON_PRETTY_PRINT;
    $j = json_encode($data, $flags);
    // fail loudly (INF, NAN, broken text): a silent "" would be written over a data file
    if ($j === false) throw new RuntimeException('JSON encoding failed: ' . json_last_error_msg());
    return $j;
}
/** Run $fn while holding an exclusive lock named $name; returns null if the lock is busy and $wait is false. */
function aim_with_lock(string $name, callable $fn, bool $wait = true)
{
    aim_mkdir(aim_storage('locks'));
    $path = aim_storage('locks/' . preg_replace('/[^a-z0-9_-]/i', '_', $name) . '.lock');
    $fh = fopen($path, 'c');
    if (!$fh) return $fn();
    @touch($path);   // housekeeping removes only lock files unused for two days
    if (!flock($fh, $wait ? LOCK_EX : LOCK_EX | LOCK_NB)) { fclose($fh); return null; }
    try { return $fn(); } finally { flock($fh, LOCK_UN); fclose($fh); }
}
/** Read-modify-write a JSON file under a lock. */
function aim_update_json(string $path, callable $fn, $default = [])
{
    return aim_with_lock('json_' . md5($path), function () use ($path, $fn, $default) {
        $cur = aim_read_json($path, $default);
        $next = $fn($cur);
        aim_write_json($path, $next);
        return $next;
    });
}
function aim_now(): DateTimeImmutable
{
    if (isset($GLOBALS['AIM_FAKE_NOW'])) return new DateTimeImmutable($GLOBALS['AIM_FAKE_NOW'], new DateTimeZone(AIM_TZ));
    if (PHP_SAPI === 'cli' && ($f = getenv('AIM_FAKE_NOW'))) return new DateTimeImmutable($f, new DateTimeZone(AIM_TZ));   // tests only
    return new DateTimeImmutable('now', new DateTimeZone(AIM_TZ));
}
function aim_iso(?DateTimeInterface $d = null): string
{
    return ($d ?? aim_now())->format('Y-m-d\TH:i:sP');
}
/** ISO week id (e.g. 2026-W43) of a date. */
function aim_week_id(DateTimeInterface $d): string
{
    return $d->format('o') . '-W' . $d->format('W');
}
/** Next release time: the coming Friday 13:00 Swiss time (strictly after $from). */
function aim_next_release(?DateTimeImmutable $from = null): DateTimeImmutable
{
    $s = aim_settings();
    $from = $from ?? aim_now();
    $wd = (int)($s['site']['release_weekday'] ?? 5);
    [$hh, $mm] = array_map('intval', explode(':', $s['site']['release_time'] ?? '13:00'));
    $d = $from->setTime($hh, $mm);
    for ($i = 0; $i < 8; $i++) {
        $c = $d->modify('+' . $i . ' day');
        if ((int)$c->format('N') === $wd && $c > $from) return $c;
    }
    return $d->modify('+7 day');
}
function aim_b64u_enc(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function aim_b64u_dec(string $s): string { $r = base64_decode(strtr($s, '-_', '+/'), true); return $r === false ? '' : $r; }
function aim_rand(int $bytes = 16): string { return bin2hex(random_bytes($bytes)); }
function aim_h(?string $s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function aim_str($v, int $max = 2000): string
{
    $s = is_scalar($v) ? (string)$v : '';
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    return mb_substr(trim($s), 0, $max);
}
/** One-line text (names, titles): like aim_str, with line breaks and tabs turned into spaces. */
function aim_line($v, int $max = 200): string
{
    return aim_str(preg_replace('/[\r\n\t]+/', ' ', is_scalar($v) ? (string)$v : '') ?? '', $max);
}
/** Only absolute http(s) links are accepted anywhere a link is shown to visitors. */
function aim_url_ok(string $u): bool
{
    return strlen($u) <= 2000 && (bool)preg_match('#^https?://[^\s<>"\']+$#i', $u) && filter_var($u, FILTER_VALIDATE_URL) !== false;
}
function aim_client_ip(): string
{
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    // Behind the host's own proxy REMOTE_ADDR is a private address. The proxy appends the address it saw to
    // X-Forwarded-For, so the right-most public entry is the real client; entries further left are whatever
    // the client sent and cannot be trusted.
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        foreach (array_reverse(explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR'])) as $cand) {
            $cand = trim($cand);
            if (filter_var($cand, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return $cand;
        }
    }
    return $ip;
}
function aim_log(string $channel, string $msg, array $ctx = []): void
{
    try {
        aim_store_append('logs/' . preg_replace('/[^a-z0-9_-]/i', '', $channel) . '-' . aim_now()->format('Y-m'), ['t' => aim_iso(), 'msg' => $msg] + ($ctx ? ['ctx' => $ctx] : []));
    } catch (Throwable $e) { /* logging must never break a request */ }
}
/* ---------- HTTP responses ---------- */
function aim_json_out($data, int $status = 200, array $headers = []): void
{
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        foreach ($headers as $k => $v) header($k . ': ' . $v);
    }
    echo aim_json_encode($data);
}
function aim_error(string $code, string $message, int $status = 400): void
{
    aim_json_out(['ok' => false, 'error' => ['code' => $code, 'message' => $message]], $status);
}
function aim_input_json(int $max = 2000000): array
{
    $raw = file_get_contents('php://input', false, null, 0, $max + 1);
    if ($raw === false || strlen($raw) > $max) return [];
    $v = json_decode($raw, true);
    return is_array($v) ? $v : [];
}
function aim_method(): string { return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'); }
function aim_is_cli(): bool { return PHP_SAPI === 'cli'; }
