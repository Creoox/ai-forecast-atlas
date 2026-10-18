<?php
/* AI Forecast Atlas scheduler launcher for home.pl.
   Upload this file to /public_html (the main folder, NOT a subfolder). home.pl runs it every 5 minutes.
   If your AI Forecast Atlas folder is not /public_html/aimonitor, change "aimonitor" below. */
define('AIM_CRON', true);
require __DIR__ . '/aimonitor/_private/cron/run.php';
