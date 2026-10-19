<?php
/* AI Forecast Atlas — settings: defaults merged with _private/storage/settings.php (written by the admin page as a
   guarded JSON file: opening it over the web returns 404 and nothing else; it is read as data, never executed,
   so no PHP opcode cache can serve an old copy). Secrets live only there. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */

function aim_defaults(): array
{
    return [
        'site' => [
            'url' => 'https://aiforecastatlas.com/', 'name' => 'AI Forecast Atlas', 'company' => 'Creoox AG',
            // imprint fields: empty here; the operator's details come from config/operator.json (see aim_defaults_site())
            'legal_form' => '', 'address' => '', 'postal' => '', 'uid' => '', 'vat' => '', 'email' => '', 'phone' => '', 'repo_url' => '', 'default_theme' => 'dark',
            'company_url' => '', 'company_logo_url' => '', 'linkedin_url' => '', 'team_location' => '', 'xeokit_url' => '',
            'beacon_token' => '', 'release_weekday' => 5, 'release_time' => '13:00', 'daily_time' => '06:00',
            'eu_representative' => '', 'dpo' => '', 'represented_by' => '', 'register' => '', 'authority' => '', 'imprint_extra' => '',
        ],
        'admin' => ['password_hash' => '', 'email' => '', 'ingest_secret' => '', 'cron_key' => ''],
        'secret' => '',
        'ai' => [
            'providers' => [
                'openai' => ['key' => '', 'base' => 'https://api.openai.com/v1'],
                'anthropic' => ['key' => '', 'base' => 'https://api.anthropic.com/v1'],
                'gemini' => ['key' => '', 'base' => 'https://generativelanguage.googleapis.com/v1beta'],
                'xai' => ['key' => '', 'base' => 'https://api.x.ai/v1'],
                'deepseek' => ['key' => '', 'base' => 'https://api.deepseek.com'],
                'mistral' => ['key' => '', 'base' => 'https://api.mistral.ai/v1'],
                'perplexity' => ['key' => '', 'base' => 'https://api.perplexity.ai/v1'],
                'openrouter' => ['key' => '', 'base' => 'https://openrouter.ai/api/v1'],
            ],
            'roles' => [
                'chat' => ['provider' => 'openai', 'model' => 'gpt-6-luna', 'effort' => 'low', 'max_output' => 900],
                'research' => ['provider' => 'openai', 'model' => 'gpt-6.1-sol', 'effort' => 'medium', 'max_output' => 1600],   // 1.0 (single researcher); 1.1 uses the agents panel
                'crosscheck' => ['provider' => '', 'model' => '', 'effort' => 'low', 'max_output' => 1200],                       // 1.0 second opinion; replaced by the panel
                'writer' => ['provider' => 'openai', 'model' => 'gpt-6-luna', 'effort' => 'low', 'max_output' => 700],
            ],
            // the research panel: every daily research question goes to each agent that is switched on and has a key;
            // answers are combined by weighted median (weight 0 = shown to the reviewer, not counted)
            'agents' => [
                'openai' => ['enabled' => true, 'research' => true, 'model' => 'gpt-6.1-sol', 'weight' => 3, 'effort' => 'medium', 'max_output' => 1600],
                'anthropic' => ['enabled' => true, 'research' => true, 'model' => 'claude-sonnet-5-5', 'weight' => 3, 'effort' => '', 'max_output' => 1600],
                'gemini' => ['enabled' => true, 'research' => true, 'model' => 'gemini-3.8-flash', 'weight' => 2, 'effort' => '', 'max_output' => 1600],
                'xai' => ['enabled' => true, 'research' => true, 'model' => 'grok-4.3', 'weight' => 2, 'effort' => '', 'max_output' => 1600],
                'deepseek' => ['enabled' => true, 'research' => true, 'model' => 'deepseek-v4-pro', 'weight' => 1, 'effort' => '', 'max_output' => 1200],
            ],
            'panel' => ['knowledge_factor' => 0.5, 'tolerance' => 0.10],
            'fallback_chat' => '',
            'prices' => [],
            'background' => true,   // long OpenAI research calls run in background mode and are collected on later scheduler runs
        ],
        // X watch: Grok (xAI) scans posts on X on the scan days; the editor approves what is published
        'xwatch' => [
            'enabled' => true, 'agent' => 'xai', 'model' => '', 'days' => '1,2,3,4,5', 'lookback_hours' => 36, 'max_items' => 6,
            'handles' => "OpenAI\nAnthropicAI\nGoogleDeepMind\nnvidia\nMicrosoft\nAMD\nMicron_Tech\nReuters\nbusiness\nFT\nWSJ\nEpochAIResearch\nSemiAnalysis_",
            'exclude' => '', 'keep_days' => 30,
        ],
        'chat' => ['enabled' => true, 'daily_budget_usd' => 3.0, 'per_ip_hour' => 20, 'per_ip_day' => 60, 'max_input_chars' => 2000, 'label' => 'OpenAI', 'max_concurrent' => 2],
        'turnstile' => ['site_key' => '', 'secret' => ''],
        'mailjet' => [
            'public_key' => '', 'private_key' => '', 'list_id' => '', 'from_email' => '', 'from_name' => 'AI Forecast Atlas',
            'reply_to' => '', 'sandbox' => false, 'daily_limit' => 200, 'base' => 'https://api.mailjet.com',
        ],
        'newsletter' => ['enabled' => true, 'test_recipients' => '', 'notify_admin' => true],
        'sources' => [
            'sec_user_agent' => 'Creoox AG aimonitor@creoox.com', 'eia_key' => '', 'research_enabled' => true,
            'research_budget_usd_month' => 25.0, 'auto_approve_api' => false,   // the budget covers the whole research panel and X watch
            'bases' => [
                'sec' => 'https://data.sec.gov', 'eia' => 'https://api.eia.gov', 'openrouter' => 'https://openrouter.ai/api/v1',
                'epoch' => 'https://epoch.ai', 'turnstile' => 'https://challenges.cloudflare.com',
            ],
        ],
    ];
}
/** Defaults with the operator's public details (config/operator.json) filled into the site block: the code itself names no operator. */
function aim_defaults_full(): array
{
    $d = aim_defaults();
    $operator = aim_cfg('operator')['site'] ?? [];
    foreach ($operator as $k => $v) if (array_key_exists($k, $d['site']) && is_string($v)) $d['site'][$k] = $v;
    // Update packages preserve operator.json. Fill these new public fields only for the known original operator.
    if (($operator['company'] ?? '') === 'Creoox AG' && ($operator['email'] ?? '') === 'contact@creoox.com') {
        foreach (['company_url' => 'https://creoox.com', 'company_logo_url' => 'https://creoox.com/wp-content/uploads/2024/02/creoox_logo-01-300x76.png', 'linkedin_url' => 'https://www.linkedin.com/company/creoox/posts/?feedView=all', 'team_location' => 'Lausanne, Switzerland', 'xeokit_url' => 'https://xeokit.io'] as $k => $v) {
            if (!array_key_exists($k, $operator)) $d['site'][$k] = $v;
        }
    }
    return $d;
}
function aim_settings_file(): string { return aim_storage('settings.php'); }
function aim_merge(array $base, array $over): array
{
    foreach ($over as $k => $v) {
        if (is_array($v) && isset($base[$k]) && is_array($base[$k]) && array_keys($base[$k]) !== range(0, count($base[$k]) - 1)) $base[$k] = aim_merge($base[$k], $v);
        else $base[$k] = $v;
    }
    return $base;
}
function aim_settings(bool $reload = false): array
{
    static $cache = null;
    if ($cache !== null && !$reload) return $cache;
    $saved = aim_store_read('settings', null);
    $f = aim_settings_file();
    if (!is_array($saved) && is_file($f)) {
        // settings written by a pre-release (PHP array file): read it once, then it is rewritten in the guarded format
        $head = (string)@file_get_contents($f, false, null, 0, 64);
        if (str_starts_with($head, "<?php\n/* AI Forecast Atlas settings")) { $v = include $f; if (is_array($v)) { $saved = $v; aim_store_write('settings', $v); } }
    }
    $saved = is_array($saved) ? $saved : [];
    if (defined('AIM_SETTINGS_OVERRIDE') && is_array(AIM_SETTINGS_OVERRIDE)) $saved = aim_merge($saved, AIM_SETTINGS_OVERRIDE);
    $defaults = aim_defaults_full();
    $cache = aim_merge($defaults, $saved);
    if ($cache['site']['company'] !== $defaults['site']['company']) {
        foreach (['company_url', 'company_logo_url', 'linkedin_url', 'team_location', 'xeokit_url'] as $k) {
            if (!array_key_exists($k, $saved['site'] ?? [])) $cache['site'][$k] = '';
        }
    }
    return $cache;
}
/** Persist settings (the whole array, as a guarded JSON file readable only by PHP). */
function aim_save_settings(array $s): void
{
    aim_mkdir(aim_storage());
    aim_store_write('settings', $s);
    aim_settings(true);
}
/** First run: create the HMAC secret and the cron key. */
function aim_ensure_secrets(): array
{
    $s = aim_settings();
    $changed = false;
    if (strlen((string)$s['secret']) < 32) { $s['secret'] = aim_rand(32); $changed = true; }
    if (strlen((string)$s['admin']['cron_key']) < 16) { $s['admin']['cron_key'] = aim_rand(16); $changed = true; }
    if (strlen((string)$s['admin']['ingest_secret']) < 32) { $s['admin']['ingest_secret'] = aim_rand(32); $changed = true; }
    if ($changed) aim_save_settings($s);
    return aim_settings();
}
/** Settings as shown in the admin page: secrets replaced by a mask that keeps the last 4 characters. */
function aim_settings_masked(): array
{
    $s = aim_settings();
    $mask = function ($v) { $v = (string)$v; return $v === '' ? '' : '••••' . substr($v, -4); };
    foreach ($s['ai']['providers'] as $k => $p) $s['ai']['providers'][$k]['key'] = $mask($p['key']);
    $s['turnstile']['secret'] = $mask($s['turnstile']['secret']);
    $s['mailjet']['private_key'] = $mask($s['mailjet']['private_key']);
    $s['sources']['eia_key'] = $mask($s['sources']['eia_key']);
    $s['admin']['password_hash'] = $s['admin']['password_hash'] ? 'set' : '';
    unset($s['secret'], $s['admin']['ingest_secret'], $s['admin']['cron_key']);
    return $s;
}
/** Paths of settings that hold secrets: an empty value or the mask in an update means "keep". */
function aim_secret_paths(): array
{
    $p = ['turnstile.secret', 'mailjet.private_key', 'sources.eia_key'];
    foreach (array_keys(aim_defaults()['ai']['providers']) as $k) $p[] = 'ai.providers.' . $k . '.key';
    return $p;
}
function aim_get_path(array $a, string $path)
{
    foreach (explode('.', $path) as $k) { if (!is_array($a) || !array_key_exists($k, $a)) return null; $a = $a[$k]; }
    return $a;
}
function aim_set_path(array &$a, string $path, $v): void
{
    $ref = &$a;
    foreach (explode('.', $path) as $k) { if (!isset($ref[$k]) || !is_array($ref[$k])) $ref[$k] = $ref[$k] ?? []; $ref = &$ref[$k]; }
    $ref = $v;
}
/** Apply an update from the admin page; only known keys of the defaults are accepted. */
function aim_apply_settings_update(array $update): array
{
    $s = aim_settings();
    if (isset($update['site']['company']) && trim((string)$update['site']['company']) !== $s['site']['company']) {
        foreach (['company_url', 'company_logo_url', 'linkedin_url', 'team_location', 'xeokit_url'] as $k) {
            if (!array_key_exists($k, $update['site'])) $s['site'][$k] = '';
        }
    }
    $defaults = aim_defaults();
    $secret = array_flip(aim_secret_paths());
    $walk = function (array $upd, string $prefix) use (&$walk, &$s, $defaults, $secret) {
        foreach ($upd as $k => $v) {
            $path = $prefix === '' ? (string)$k : $prefix . '.' . $k;
            $def = aim_get_path($defaults, $path);
            if ($def === null && !str_starts_with($path, 'ai.prices')) continue;
            if (is_array($v) && is_array($def) && array_keys($def) !== range(0, count($def) - 1)) { $walk($v, $path); continue; }
            if (isset($secret[$path])) { $v = trim((string)$v); if ($v === '__clear__') { aim_set_path($s, $path, ''); continue; } if ($v === '' || str_starts_with($v, '••••')) continue; aim_set_path($s, $path, $v); continue; }
            if (is_bool($def)) $v = (bool)$v;
            elseif (is_int($def)) $v = (int)$v;
            elseif (is_float($def)) $v = (float)$v;
            elseif (is_string($def)) $v = trim((string)$v);
            aim_set_path($s, $path, $v);
        }
    };
    $walk($update, '');
    aim_save_settings($s);
    return aim_settings();
}
/** Public runtime settings for the dashboard (data/site-config.js). Never contains secrets. */
function aim_public_config(): array
{
    $s = aim_settings();
    $chatOk = $s['chat']['enabled'] && aim_role_available('chat');
    $nlOk = $s['newsletter']['enabled'] && $s['mailjet']['public_key'] !== '' && $s['mailjet']['private_key'] !== '' && $s['mailjet']['list_id'] !== '' && $s['mailjet']['from_email'] !== '';
    return [
        'siteUrl' => $s['site']['url'], 'company' => $s['site']['company'], 'repoUrl' => $s['site']['repo_url'],
        'contactEmail' => $s['site']['email'], 'turnstileSiteKey' => $s['turnstile']['site_key'],
        'chatAbout' => aim_chat_about(),
        'chatEnabled' => $chatOk, 'chatProviderLabel' => $s['chat']['label'] ?: 'OpenAI', 'newsletterEnabled' => $nlOk,
        'beaconToken' => $s['site']['beacon_token'], 'defaultTheme' => $s['site']['default_theme'],
        'privacyUrl' => 'privacy.php', 'imprintUrl' => 'imprint.php',
    ];
}
function aim_write_site_config(): void
{
    aim_write(aim_public('data/site-config.js'), "window.AIMONITOR_SITE = " . aim_json_encode(aim_public_config()) . ";\n");
}
