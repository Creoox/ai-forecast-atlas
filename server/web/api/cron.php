<?php
/* AI Forecast Atlas — scheduler over HTTP for external cron services: api/cron.php?key=<key from the admin page>.
   Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
require __DIR__ . '/../aim-config.php';
require AIM_PRIVATE . '/lib/bootstrap.php';
$k = (string)($_GET['key'] ?? '');
$s = aim_settings();
if (strlen($s['admin']['cron_key']) < 16 || !hash_equals($s['admin']['cron_key'], $k)) { aim_error('auth', 'Bad key.', 403); exit; }
aim_json_out(['ok' => true, 'result' => aim_cron_tick('http', 45)]);
