<?php
/* AI Forecast Atlas — outgoing HTTPS requests (curl, with a stream fallback). Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

/**
 * aim_http('POST', $url, ['json' => [...], 'headers' => ['Authorization' => 'Bearer x'], 'timeout' => 30,
 *          'basic' => [$user, $pass], 'on_chunk' => fn(string $chunk) => bool|null])
 * Returns ['status', 'headers', 'body', 'json', 'error', 'ms'].
 * With on_chunk the body is passed through as it arrives (for streaming) and also kept up to 2 MB.
 */
function aim_http(string $method, string $url, array $o = []): array
{
    $headers = [];
    foreach (($o['headers'] ?? []) as $k => $v) $headers[] = is_int($k) ? $v : $k . ': ' . $v;
    $body = null;
    if (array_key_exists('json', $o)) { $body = aim_json_encode($o['json']); $headers[] = 'Content-Type: application/json'; }
    elseif (isset($o['form'])) { $body = http_build_query($o['form']); $headers[] = 'Content-Type: application/x-www-form-urlencoded'; }
    elseif (isset($o['body'])) { $body = (string)$o['body']; }
    if (!preg_grep('/^user-agent:/i', $headers)) $headers[] = 'User-Agent: ' . ($o['ua'] ?? ('AIMonitor/' . AIM_VERSION . ' (+https://aiforecastatlas.com)'));
    $t0 = microtime(true);
    $res = ['status' => 0, 'headers' => [], 'body' => '', 'json' => null, 'error' => null, 'ms' => 0];
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $respHeaders = [];
        $kept = '';
        $onChunk = $o['on_chunk'] ?? null;
        $opts = [
            CURLOPT_CUSTOMREQUEST => strtoupper($method),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => (int)($o['timeout'] ?? 30),
            CURLOPT_CONNECTTIMEOUT => (int)($o['connect_timeout'] ?? 10),
            CURLOPT_FOLLOWLOCATION => !empty($o['follow']),
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_ENCODING => '',
            CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$respHeaders) {
                $p = strpos($line, ':');
                if ($p !== false) $respHeaders[strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
                return strlen($line);
            },
            CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$kept, $onChunk) {
                if (strlen($kept) < 2000000) $kept .= $chunk;
                if ($onChunk) { $r = $onChunk($chunk); if ($r === false) return 0; }
                return strlen($chunk);
            },
        ];
        if ($body !== null) $opts[CURLOPT_POSTFIELDS] = $body;
        if (isset($o['basic'])) { $opts[CURLOPT_HTTPAUTH] = CURLAUTH_BASIC; $opts[CURLOPT_USERPWD] = $o['basic'][0] . ':' . $o['basic'][1]; }
        curl_setopt_array($ch, $opts);
        $ok = curl_exec($ch);
        $res['status'] = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($ok === false && !($onChunk && curl_errno($ch) === CURLE_WRITE_ERROR)) $res['error'] = 'network: ' . (curl_error($ch) ?: 'request failed');
        curl_close($ch);
        $res['headers'] = $respHeaders;
        $res['body'] = $kept;
    } else {
        $ctx = stream_context_create(['http' => ['method' => strtoupper($method), 'header' => implode("\r\n", $headers) . (isset($o['basic']) ? "\r\nAuthorization: Basic " . base64_encode($o['basic'][0] . ':' . $o['basic'][1]) : ''), 'content' => $body ?? '', 'timeout' => (int)($o['timeout'] ?? 30), 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) $res['error'] = 'network: request failed';
        $res['body'] = (string)$raw;
        foreach (($http_response_header ?? []) as $i => $line) {
            if ($i === 0 && preg_match('/\s(\d{3})\s?/', $line, $m)) $res['status'] = (int)$m[1];
            elseif (($p = strpos($line, ':')) !== false) $res['headers'][strtolower(trim(substr($line, 0, $p)))] = trim(substr($line, $p + 1));
        }
        if (!empty($o['on_chunk']) && $res['body'] !== '') ($o['on_chunk'])($res['body']);
    }
    $res['ms'] = (int)round((microtime(true) - $t0) * 1000);
    $ct = $res['headers']['content-type'] ?? '';
    if ($res['body'] !== '' && (str_contains($ct, 'json') || in_array($res['body'][0] ?? '', ['{', '['], true))) {
        $j = json_decode($res['body'], true);
        if ($j !== null) $res['json'] = $j;
    }
    return $res;
}
/** Short description of a failed response for logs and admin messages (never includes keys). */
/** True for failures worth another try later: timeouts, network errors, 408/409/425/429 and 5xx answers. */
function aim_http_transient(?string $err): bool
{
    return $err !== null && $err !== '' && (bool)preg_match('/timed? ?out|timeout|^network: |^HTTP (0|408|409|425|429|5\d\d)\b/i', $err);
}
function aim_http_problem(array $r): string
{
    if ($r['error']) return $r['error'];
    $msg = '';
    if (is_array($r['json'])) {
        $e = $r['json']['error'] ?? $r['json']['ErrorMessage'] ?? $r['json']['message'] ?? $r['json']['Messages'][0]['Errors'][0]['ErrorMessage'] ?? null;
        if (is_array($e)) $e = $e['message'] ?? json_encode($e);
        if ($e) $msg = (string)$e;
    }
    return 'HTTP ' . $r['status'] . ($msg ? ': ' . mb_substr($msg, 0, 300) : '');
}
