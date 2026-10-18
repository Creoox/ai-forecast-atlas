<?php
/* AI Forecast Atlas — admin page shell (first-run setup, login, then the admin app in admin.js).
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
require __DIR__ . '/../aim-config.php';
require AIM_PRIVATE . '/lib/bootstrap.php';
aim_ensure_secrets();
if (!aim_admin_host_ok()) {   // only on the site's own address, so the login cookie is never set for another host
    header('Location: ' . aim_site_url('admin/'), true, 302);
    exit;
}
$mode = aim_admin_has_password() ? (aim_admin_ok() ? 'app' : 'login') : 'setup';
if ($mode === 'setup') aim_setup_key();
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'");
$v = AIM_VERSION . '-' . substr(md5((string)@filemtime(__DIR__ . '/admin.js')), 0, 6);
?><!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta name="aim-mode" content="<?= aim_h($mode) ?>"><meta name="aim-csrf" content="<?= aim_h($mode === 'app' ? aim_csrf() : '') ?>">
<title>AI Forecast Atlas admin</title><link rel="icon" href="../favicon.svg" type="image/svg+xml">
<style>
:root { --bg: #f3f2ed; --panel: #ffffff; --panel2: #f7f6f2; --ink: #17171a; --ink2: #43413c; --ink3: #66635b; --rule: #dfdcd2; --rule2: #c8c4b7; --a: #9c5500; --ai: #ffffff; --ok: #1b7a39; --warn: #8f6200; --err: #c0261f; --info: #2a62b2; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b0b0c; --panel: #141416; --panel2: #1a1a1d; --ink: #f1efe8; --ink2: #c9c6bc; --ink3: #8f8c83; --rule: #2a2a2e; --rule2: #3a3a40; --a: #f5a524; --ai: #141414; --ok: #4cc97a; --warn: #e2b04a; --err: #f47b74; --info: #7cb6ff; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
header.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--panel); border-bottom: 2px solid var(--a); display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px max(16px, env(safe-area-inset-right, 0px)) 8px max(16px, env(safe-area-inset-left, 0px)); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); background: var(--panel); z-index: 10; }
.k { background: var(--a); color: var(--ai); font: 700 11px/1 ui-monospace, Menlo, Consolas, monospace; padding: 4px 6px 3px; border-radius: 2px; letter-spacing: .06em; }
header .t { font-weight: 700; }
nav.tabs { display: flex; gap: 2px; flex-wrap: wrap; }
nav.tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 6px 10px; color: var(--ink2); font: inherit; cursor: pointer; }
nav.tabs button[aria-current="page"] { color: var(--ink); border-bottom-color: var(--a); font-weight: 600; }
.sp { flex: 1; }
main { max-width: 1180px; margin: 0 auto; padding-block: 18px 60px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
h1 { font-size: 20px; margin: 0 0 12px; } h2 { font-size: 16px; margin: 22px 0 8px; } h3 { font-size: 14px; margin: 14px 0 6px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--rule); border-radius: 3px; padding: 12px 14px; min-width: 0; }
.card .lbl { font: 600 10.5px/1.3 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
.card .big { font-size: 20px; font-weight: 700; margin: 2px 0; }
.muted { color: var(--ink3); } .small { font-size: 12.5px; }
.ok { color: var(--ok); } .warn { color: var(--warn); } .err { color: var(--err); }
.btn { display: inline-flex; align-items: center; gap: 6px; background: var(--panel2); color: var(--ink); border: 1px solid var(--rule2); border-radius: 2px; padding: 6px 11px; font: inherit; cursor: pointer; text-decoration: none; min-height: 32px; }
.btn:hover { border-color: var(--a); } .btn.primary { background: var(--a); color: var(--ai); border-color: var(--a); font-weight: 600; } .btn.danger { color: var(--err); }
.btn:disabled { opacity: .55; cursor: default; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; } th { font-size: 12px; color: var(--ink3); font-weight: 600; }
.tw { overflow-x: auto; }
label.f { display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; color: var(--ink2); min-width: 0; }
input[type=text], input[type=password], input[type=email], input[type=number], input[type=url], select, textarea { font: inherit; background: var(--panel2); color: var(--ink); border: 1px solid var(--rule2); border-radius: 2px; padding: 6px 8px; min-width: 0; width: 100%; }
textarea { min-height: 70px; resize: vertical; }
input:focus, select:focus, textarea:focus, .btn:focus-visible { outline: 2px solid var(--a); outline-offset: 1px; }
.fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 14px; }
.badge { display: inline-block; font: 600 10.5px/1 ui-monospace, Menlo, Consolas, monospace; padding: 3px 6px 2px; border: 1px solid var(--rule2); border-radius: 2px; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; }
.badge.a { border-color: var(--a); color: var(--a); }
.msg { margin: 8px 0; } .note { font-size: 12.5px; color: var(--ink3); max-width: 80ch; }
.cand { border-left: 3px solid var(--a); }
.flags span { color: var(--warn); font-size: 12.5px; margin-right: 10px; }
iframe.preview { width: 100%; height: 640px; border: 1px solid var(--rule); background: #fff; }
.center { max-width: 460px; margin: 8vh auto; }
code, .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.toast { position: fixed; z-index: 20; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px)); background: var(--panel); border: 1px solid var(--a); padding: 8px 14px; border-radius: 3px; box-shadow: 0 8px 24px rgba(0,0,0,.25); max-width: calc(100vw - 32px); }
details > summary { cursor: pointer; color: var(--ink2); }
a { color: var(--a); }
@media (max-width: 640px) { header.top { gap: 6px; } nav.tabs button { padding: 6px 7px; } }
</style></head>
<body><div id="app" aria-live="polite"><main><p>Loading…</p></main></div>
<script type="module" src="admin.js?v=<?= aim_h($v) ?>"></script>
</body></html>
