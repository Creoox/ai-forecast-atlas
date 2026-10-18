<?php
/* AI Forecast Atlas — server check before setup. Works on old PHP too, so it can tell you what to change.
   It locks itself once the admin password is set. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
error_reporting(0);
$root = __DIR__;
$private = $root . '/_private';
if (is_file($root . '/aim-config.php')) { include $root . '/aim-config.php'; if (defined('AIM_PRIVATE')) $private = AIM_PRIVATE; }
$locked = is_file($private . '/storage/admin.php');
if (isset($_GET['stream']) && !$locked) {
    @ini_set('zlib.output_compression', '0'); @ini_set('output_buffering', '0');
    while (ob_get_level() > 0) @ob_end_flush();
    header('Content-Type: text/event-stream'); header('Cache-Control: no-cache, no-transform'); header('X-Accel-Buffering: no');
    echo ':' . str_repeat(' ', 2048) . "\n\n"; flush();
    for ($i = 1; $i <= 4; $i++) { echo "data: " . $i . "\n\n"; flush(); sleep(1); }
    exit;
}
function row($name, $ok, $info, $warn = false) { echo '<tr><td>' . htmlspecialchars($name) . '</td><td class="' . ($ok ? 'ok' : ($warn ? 'warn' : 'err')) . '">' . ($ok ? 'OK' : ($warn ? 'CHECK' : 'PROBLEM')) . '</td><td>' . htmlspecialchars($info) . '</td></tr>'; }
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AI Forecast Atlas server check</title>
<style>:root{color-scheme:light dark}body{margin:0;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f3f2ed;color:#17171a}@media (prefers-color-scheme:dark){body{background:#0b0b0c;color:#f1efe8}td{border-color:#2a2a2e!important}}main{max-width:900px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-left,0px)) 40px max(16px,env(safe-area-inset-right,0px))}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #dfdcd2;padding:6px 8px;vertical-align:top}.ok{color:#1b7a39;font-weight:700}.err{color:#c0261f;font-weight:700}.warn{color:#9a6500;font-weight:700}.tw{overflow-x:auto}a{color:#9c5500}button{font:inherit;padding:6px 12px}</style></head><body><main>
<h1>AI Forecast Atlas — server check</h1>
<?php if ($locked): ?>
<p>Setup is complete, so this page is locked. Open the <a href="admin/">admin page</a> and look at <b>Overview → Health</b>.</p>
<?php else: ?>
<p>This page checks that your hosting can run AI Forecast Atlas. Fix every <span class="err">PROBLEM</span>; <span class="warn">CHECK</span> lines are worth a look. Then open the <a href="admin/">admin page</a> to finish the setup.</p>
<div class="tw"><table>
<?php
row('PHP version', PHP_VERSION_ID >= 80000, PHP_VERSION . (PHP_VERSION_ID >= 80000 ? '' : ' — AI Forecast Atlas needs PHP 8.0 or newer. See the guide, step "PHP version".'));
row('PHP version (recommended 8.2 or newer)', PHP_VERSION_ID >= 80200, PHP_VERSION, true);
row('Web server', true, isset($_SERVER['SERVER_SOFTWARE']) ? $_SERVER['SERVER_SOFTWARE'] : 'unknown');
row('PHP mode', true, PHP_SAPI);
foreach (array('curl' => 'needed for AI, Mailjet and data sources', 'json' => 'needed', 'openssl' => 'needed for HTTPS', 'mbstring' => 'recommended (a fallback exists)', 'zip' => 'optional', 'intl' => 'optional') as $e => $why) row('Extension ' . $e, extension_loaded($e), $why, in_array($e, array('mbstring', 'zip', 'intl'), true));
row('memory_limit', true, ini_get('memory_limit'));
row('max_execution_time', true, ini_get('max_execution_time') . ' s');
row('post_max_size', true, ini_get('post_max_size'));
row('Server time', true, date('Y-m-d H:i:s') . ' ' . date_default_timezone_get());
row('Private folder found', is_dir($private . '/lib'), $private);
$sw = is_dir($private . '/storage') || @mkdir($private . '/storage', 0755, true);
$wok = $sw && @file_put_contents($private . '/storage/.t', 'x') !== false; @unlink($private . '/storage/.t');
row('Private storage writable', $wok, $private . '/storage');
$dok = @file_put_contents($root . '/data/.t', 'x') !== false; @unlink($root . '/data/.t');
row('Public data folder writable', $dok, $root . '/data');
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
row('This page was opened over HTTPS', $https, $https ? 'yes' : 'no — install the SSL certificate (guide, step "SSL")', true);
if (function_exists('curl_init')) {
    foreach (array('OpenAI' => 'https://api.openai.com/v1/models', 'Mailjet' => 'https://api.mailjet.com/v3/REST/contactslist', 'SEC EDGAR' => 'https://data.sec.gov/api/xbrl/companyconcept/CIK0000789019/us-gaap/PaymentsToAcquirePropertyPlantAndEquipment.json', 'OpenRouter' => 'https://openrouter.ai/api/v1/models', 'Epoch AI' => 'https://epoch.ai/data/eci_scores.csv', 'Cloudflare Turnstile' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify') as $n => $u) {
        $ch = curl_init($u);
        curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_NOBODY => false, CURLOPT_TIMEOUT => 10, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_USERAGENT => 'Creoox AG aimonitor@creoox.com', CURLOPT_RANGE => '0-200'));
        curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $err = curl_error($ch); $t = round(curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000); curl_close($ch);
        row('Outgoing HTTPS: ' . $n, $code > 0, $code > 0 ? 'reached (HTTP ' . $code . ', ' . $t . ' ms) — any answer means the connection works' : 'blocked: ' . $err);
    }
}
?>
</table></div>
<h2>Live answers (streaming)</h2>
<p>The assistant shows answers while they are written if the server passes data through immediately. <button id="st" type="button">Test streaming</button> <span id="sr"></span></p>
<script>
document.getElementById('st').onclick = async function () {
  const out = document.getElementById('sr'); out.textContent = 'testing…';
  const t0 = performance.now(); const times = [];
  try {
    const r = await fetch('check.php?stream=1', { cache: 'no-store' }); const rd = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); const n = (buf.match(/data: \d/g) || []).length; while (times.length < n) times.push(Math.round(performance.now() - t0)); }
    const spread = times.length > 1 ? times[times.length - 1] - times[0] : 0;
    out.innerHTML = spread > 1500 ? '<span class="ok">OK</span> — parts arrived one by one (' + times.join(', ') + ' ms).' : '<span class="warn">CHECK</span> — the server buffers the answer (' + times.join(', ') + ' ms). The assistant still works; answers appear in one piece.';
  } catch (e) { out.textContent = 'test failed: ' + e; }
};
</script>
<p><b>Next:</b> open the <a href="admin/">admin page</a>. You will need the setup key from the file <code>_private/storage/setup-key.php</code> (created when you open the admin page).</p>
<?php endif; ?>
</main></body></html>
