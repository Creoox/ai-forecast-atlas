<?php
/* AI Forecast Atlas scheduler entry. Called by the launcher files cron-5min.php / cron-13.php in /public_html,
   or from a shell: php run.php. Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
if (!defined('AIM_CRON') && PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (PHP_VERSION_ID < 80000) {   // leave a note for the admin page: the main site's PHP runs the launcher files
    @file_put_contents(dirname(__DIR__) . '/storage/cron-php.php', "<?php exit; ?>\n" . PHP_VERSION . "\n" . date('c') . "\n");
    exit;
}
require_once dirname(__DIR__, 2) . '/aim-config.php';
require_once AIM_PRIVATE . '/lib/bootstrap.php';
$aim_result = aim_cron_tick(PHP_SAPI === 'cli' ? 'cli' : (defined('AIM_CRON_SOURCE') ? AIM_CRON_SOURCE : 'cron'), 50);
if (PHP_SAPI === 'cli') echo json_encode($aim_result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
