<?php
/* AI Forecast Atlas release launcher for home.pl: runs every day at 13:00 so the Friday release goes out on time.
   Upload this file to /public_html (the main folder, NOT a subfolder).
   If your AI Forecast Atlas folder is not /public_html/aimonitor, change "aimonitor" below. */
define('AIM_CRON', true);
define('AIM_CRON_SOURCE', 'cron13');
require __DIR__ . '/aimonitor/_private/cron/run.php';
