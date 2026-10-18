<?php
/* AI Forecast Atlas — simple server-rendered pages (subscription steps, privacy, imprint). Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_page(string $title, string $body, string $lang = 'en', int $status = 200, bool $noindex = true): void
{
    $s = aim_settings();
    if (!headers_sent()) {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: same-origin');
        header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'");
    }
    $home = aim_h($s['site']['url']);
    echo '<!doctype html><html lang="' . aim_h($lang) . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
    if ($noindex) echo '<meta name="robots" content="noindex">';
    echo '<title>' . aim_h($title) . ' · AI Forecast Atlas</title><link rel="icon" href="' . $home . 'favicon.svg" type="image/svg+xml"><style>'
        . ':root{--bg:#f3f2ed;--panel:#fff;--ink:#17171a;--ink2:#43413c;--ink3:#66635b;--rule:#dfdcd2;--accent:#9c5500;--accent-ink:#fff;--ok:#1b7a39;--err:#c0261f;color-scheme:light}'
        . '@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--panel:#141416;--ink:#f1efe8;--ink2:#c9c6bc;--ink3:#8f8c83;--rule:#2a2a2e;--accent:#f5a524;--accent-ink:#141414;--ok:#4cc97a;--err:#f47b74;color-scheme:dark}}'
        . 'body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}'
        . '.w{max-width:680px;margin:0 auto;padding:28px max(16px,env(safe-area-inset-left,0px)) 40px max(16px,env(safe-area-inset-right,0px))}'
        . 'header{display:flex;align-items:center;gap:10px;margin-bottom:18px}header .k{background:var(--accent);color:var(--accent-ink);font:700 12px/1 ui-monospace,Menlo,Consolas,monospace;padding:5px 7px 4px;border-radius:2px;letter-spacing:.06em}'
        . 'header a{color:var(--ink);text-decoration:none;font-weight:700;letter-spacing:.02em}'
        . '.card{background:var(--panel);border:1px solid var(--rule);border-radius:3px;padding:22px 22px 18px}h1{font-size:22px;margin:0 0 10px;text-wrap:balance}h2{font-size:16px;margin:22px 0 6px}'
        . 'p,li{color:var(--ink2);max-width:65ch}a{color:var(--accent)}.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);border:0;border-radius:2px;padding:10px 16px;font:600 14px/1.2 inherit;cursor:pointer;text-decoration:none}'
        . '.btn.ghost{background:none;color:var(--ink2);border:1px solid var(--rule)}label{display:flex;gap:8px;align-items:flex-start;margin:6px 0;color:var(--ink2)}select,input[type=email],input[type=password],input[type=text]{font:inherit;padding:8px;border:1px solid var(--rule);border-radius:2px;background:var(--bg);color:var(--ink)}'
        . '.ok{color:var(--ok)}.err{color:var(--err)}.note{font-size:13px;color:var(--ink3)}footer{margin-top:18px;font-size:12.5px;color:var(--ink3)}footer a{color:var(--ink3)}'
        . '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 14px}code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px}'
        . '</style></head><body><div class="w"><header><span class="k">AICX</span><a href="' . $home . '">AI Forecast Atlas</a><span class="note">' . aim_h(aim_t('by', $lang)) . '</span></header>'
        . '<main class="card">' . $body . '</main>'
        . '<footer><a href="' . $home . '">' . aim_h(aim_t('back', $lang)) . '</a> · <a href="' . $home . 'privacy.php">Privacy</a> · <a href="' . $home . 'imprint.php">Imprint</a></footer></div></body></html>';
}
