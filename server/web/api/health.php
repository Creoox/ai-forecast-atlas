<?php
/* AI Forecast Atlas — public health check (no details). Copyright (C) 2026 Creoox AG. Business Source License 1.1 (see LICENSE). */
require __DIR__ . '/../aim-config.php';
require AIM_PRIVATE . '/lib/bootstrap.php';
$st = aim_state();
aim_json_out(['ok' => true, 'version' => AIM_VERSION, 'release' => $st['lastRelease'] ?? null, 'time' => aim_iso()]);
